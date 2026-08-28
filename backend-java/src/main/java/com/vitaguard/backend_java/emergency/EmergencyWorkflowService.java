package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.*;
import com.vitaguard.backend_java.user.FamilyNotificationService;
import com.vitaguard.backend_java.medical.MedicalProfile;
import com.vitaguard.backend_java.medical.MedicalProfileRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import com.vitaguard.backend_java.medical.RiskResult;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

@Service
@Transactional
public class EmergencyWorkflowService {

    private final EmergencyRequestRepository emergencyRepository;
    private final EmergencyEventRepository eventRepository;
    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final HospitalRecommendationService recommendationService;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final FamilyNotificationService familyNotificationService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MedicalProfileRepository medicalProfileRepository;

    public EmergencyWorkflowService(
            EmergencyRequestRepository emergencyRepository,
            EmergencyEventRepository eventRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            HospitalRecommendationService recommendationService,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            FamilyNotificationService familyNotificationService,
            SimpMessagingTemplate messagingTemplate,
            MedicalProfileRepository medicalProfileRepository
    ) {
        this.emergencyRepository = emergencyRepository;
        this.eventRepository = eventRepository;
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.recommendationService = recommendationService;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.familyNotificationService = familyNotificationService;
        this.messagingTemplate = messagingTemplate;
        this.medicalProfileRepository = medicalProfileRepository;
    }

    public EmergencyRequest initiateAutomaticEmergency(String patientUid, Double hr, Double spo2, Double temp, Double lat, Double lng, RiskResult risk) {
        // Step 1: DETECTED
        EmergencyRequest request = new EmergencyRequest();
        request.setPatientUid(patientUid);
        request.setLatitude(lat != null ? lat : 12.9716);
        request.setLongitude(lng != null ? lng : 77.5946);
        request.setSymptoms("Automated Triage");
        request.setSymptomDescription("AI Alert: " + risk.getExplanation());
        request.setRiskScore(risk.getRiskScore());
        request.setSeverity(risk.getSeverity());
        request.setDetectedVitals(String.format("HR: %.0f, SpO2: %.0f, Temp: %.1f", hr, spo2, temp));
        request.setCreatedAt(LocalDateTime.now());
        request.setStatus("DETECTED");
        emergencyRepository.save(request);

        logEvent(request.getId(), "DETECTED", "Abnormal vitals detected: " + request.getDetectedVitals() + " (Risk Score: " + risk.getRiskScore() + ")");

        // Step 2: Classify department
        String department = classifyDepartment(patientUid);
        request.setRequiredDepartment(department);

        // Step 3: Rank & Assign Hospital
        List<HospitalRecommendation> recommendations = recommendationService.getRecommendations(request.getLatitude(), request.getLongitude(), department);
        if (!recommendations.isEmpty()) {
            HospitalRecommendation bestRec = recommendations.get(0);
            Hospital hospital = bestRec.getHospital();
            request.setHospitalId(hospital.getId());
            request.setStatus("HOSPITAL_ASSIGNED");
            emergencyRepository.save(request);

            // Consume hospital capacity
            hospital.setAvailableBeds(Math.max(0, hospital.getAvailableBeds() - 1));
            hospitalRepository.save(hospital);

            logEvent(request.getId(), "HOSPITAL_ASSIGNED", "Hospital assigned: " + hospital.getName() + " (" + bestRec.getReason() + ")");
        } else {
            logEvent(request.getId(), "HOSPITAL_ASSIGNED", "No suitable hospital found.");
        }

        // Step 4: Assign Doctor
        assignDoctor(request);

        // Step 5: Family member notifications
        familyNotificationService.sendFamilyNotification(
                request,
                request.getDetectedVitals(),
                "Awaiting Dispatch",
                "TBD"
        );
        logEvent(request.getId(), "FAMILY_NOTIFIED", "Family members notified of emergency status.");

        // Step 6: Dispatch Ambulance
        dispatchAmbulance(request);

        // Broadcast workflow update
        broadcastWorkflowUpdate(request);

        return request;
    }

    public void dispatchAmbulance(EmergencyRequest request) {
        request.setStatus("AMBULANCE_REQUESTED");
        emergencyRepository.save(request);
        logEvent(request.getId(), "AMBULANCE_REQUESTED", "Emergency ambulance request raised.");

        // Find nearest available ambulance
        List<Ambulance> availableAmbulances = ambulanceRepository.findByStatus("available");
        if (availableAmbulances.isEmpty()) {
            logEvent(request.getId(), "AMBULANCE_REQUESTED", "No available ambulance nearby. Dispatch queued.");
            broadcastWorkflowUpdate(request);
            return;
        }

        Ambulance nearest = null;
        double minDistance = Double.MAX_VALUE;
        for (Ambulance amb : availableAmbulances) {
            double dist = calculateDistance(request.getLatitude(), request.getLongitude(), amb.getLatitude(), amb.getLongitude());
            if (dist < minDistance) {
                minDistance = dist;
                nearest = amb;
            }
        }

        if (nearest != null) {
            nearest.setStatus("busy");
            ambulanceRepository.save(nearest);

            request.setAmbulanceId(nearest.getId());
            request.setStatus("AMBULANCE_DISPATCHED");
            request.setAmbulanceDispatched(true);
            emergencyRepository.save(request);

            double dist = calculateDistance(request.getLatitude(), request.getLongitude(), nearest.getLatitude(), nearest.getLongitude());
            double eta = (dist / 40.0) * 60.0 + 1.0; // Simulated ambulance speed

            logEvent(request.getId(), "AMBULANCE_DISPATCHED", "Ambulance " + nearest.getUnitId() + " dispatched. Dist: " + String.format("%.2f", dist) + " km, ETA: " + String.format("%.1f", eta) + " mins");
            
            // Notify family contacts about dispatch details
            familyNotificationService.sendFamilyNotification(
                    request,
                    request.getDetectedVitals(),
                    "Dispatched",
                    String.format("%.1f mins", eta)
            );

            broadcastWorkflowUpdate(request);

            // Trigger real-time tracking simulation
            runAmbulanceSimulation(request, nearest);
        }
    }

    private void runAmbulanceSimulation(EmergencyRequest request, Ambulance ambulance) {
        CompletableFuture.runAsync(() -> {
            try {
                request.setStatus("AMBULANCE_EN_ROUTE");
                emergencyRepository.save(request);
                logEvent(request.getId(), "AMBULANCE_EN_ROUTE", "Ambulance en route to patient location.");
                broadcastWorkflowUpdate(request);

                Double startLat = ambulance.getLatitude();
                Double startLng = ambulance.getLongitude();
                Double destLat = request.getLatitude();
                Double destLng = request.getLongitude();

                int steps = 10;
                for (int step = 1; step <= steps; step++) {
                    Thread.sleep(3000); // 3 seconds per step
                    
                    // Reload request & check if cancelled
                    Optional<EmergencyRequest> reloadedOpt = emergencyRepository.findById(request.getId());
                    if (reloadedOpt.isPresent() && Boolean.TRUE.equals(reloadedOpt.get().getCancelled())) {
                        logEvent(request.getId(), "CANCELLED", "Tracking cancelled: Emergency request was aborted.");
                        ambulance.setStatus("available");
                        ambulanceRepository.save(ambulance);
                        return;
                    }

                    double fraction = (double) step / steps;
                    Double currentLat = startLat + (destLat - startLat) * fraction;
                    Double currentLng = startLng + (destLng - startLng) * fraction;

                    ambulance.setLatitude(currentLat);
                    ambulance.setLongitude(currentLng);
                    ambulanceRepository.save(ambulance);

                    // Broadcast tracking position update
                    Map<String, Object> trackingPayload = new HashMap<>();
                    trackingPayload.put("sosId", request.getId());
                    trackingPayload.put("status", request.getStatus());
                    trackingPayload.put("ambulanceLatitude", currentLat);
                    trackingPayload.put("ambulanceLongitude", currentLng);
                    trackingPayload.put("progress", fraction);
                    trackingPayload.put("eta", String.format("%.1f mins", (1.0 - fraction) * 5.0));
                    messagingTemplate.convertAndSend("/topic/emergency/" + request.getId(), (Object) trackingPayload);

                    if (step == steps / 2) {
                        request.setStatus("PATIENT_PICKED_UP");
                        emergencyRepository.save(request);
                        logEvent(request.getId(), "PATIENT_PICKED_UP", "Patient picked up by ambulance.");
                        broadcastWorkflowUpdate(request);
                    }
                }

                // Step: Arrived at Hospital
                request.setStatus("ARRIVED_AT_HOSPITAL");
                emergencyRepository.save(request);
                logEvent(request.getId(), "ARRIVED_AT_HOSPITAL", "Ambulance arrived at the assigned hospital.");
                broadcastWorkflowUpdate(request);

                // Simulation delay inside hospital
                Thread.sleep(4000);

                // Auto-resolve case
                resolveEmergency(request.getId());

            } catch (Exception e) {
                System.err.println("Error in ambulance tracking simulator: " + e.getMessage());
            }
        });
    }

    public void resolveEmergency(Long id) {
        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isPresent()) {
            EmergencyRequest req = reqOpt.get();
            if ("RESOLVED".equalsIgnoreCase(req.getStatus()) || "COMPLETED".equalsIgnoreCase(req.getStatus())) {
                return;
            }
            req.setStatus("RESOLVED");
            req.setCompletedAt(LocalDateTime.now());
            emergencyRepository.save(req);

            // Release doctor
            if (req.getDoctorId() != null && req.getDoctorId() > 0) {
                doctorRepository.findById(req.getDoctorId()).ifPresent(doc -> {
                    doc.setAvailableForEmergency(true);
                    doctorRepository.save(doc);
                });
            }

            // Release ambulance
            if (req.getAmbulanceId() != null) {
                ambulanceRepository.findById(req.getAmbulanceId()).ifPresent(amb -> {
                    amb.setStatus("available");
                    ambulanceRepository.save(amb);
                });
            }

            // Release hospital capacity
            if (req.getHospitalId() != null) {
                hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> {
                    h.setAvailableBeds(Math.min(h.getTotalBeds(), h.getAvailableBeds() + 1));
                    h.setAvailableDoctors(Math.min(h.getTotalDoctors(), h.getAvailableDoctors() + 1));
                    hospitalRepository.save(h);
                });
            }

            logEvent(id, "RESOLVED", "Emergency resolved successfully. Resources released.");
            broadcastWorkflowUpdate(req);
        }
    }

    public void cancelEmergency(Long id) {
        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isPresent()) {
            EmergencyRequest req = reqOpt.get();
            req.setStatus("CANCELLED");
            req.setCancelled(true);
            req.setCompletedAt(LocalDateTime.now());
            emergencyRepository.save(req);

            // Release doctor
            if (req.getDoctorId() != null && req.getDoctorId() > 0) {
                doctorRepository.findById(req.getDoctorId()).ifPresent(doc -> {
                    doc.setAvailableForEmergency(true);
                    doctorRepository.save(doc);
                });
            }

            // Release ambulance
            if (req.getAmbulanceId() != null) {
                ambulanceRepository.findById(req.getAmbulanceId()).ifPresent(amb -> {
                    amb.setStatus("available");
                    ambulanceRepository.save(amb);
                });
            }

            // Release hospital capacity
            if (req.getHospitalId() != null) {
                hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> {
                    h.setAvailableBeds(Math.min(h.getTotalBeds(), h.getAvailableBeds() + 1));
                    h.setAvailableDoctors(Math.min(h.getTotalDoctors(), h.getAvailableDoctors() + 1));
                    hospitalRepository.save(h);
                });
            }

            logEvent(id, "CANCELLED", "Emergency cancelled.");
            broadcastWorkflowUpdate(req);
        }
    }

    private void assignDoctor(EmergencyRequest request) {
        List<Doctor> doctors = doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(
                request.getHospitalId(), request.getRequiredDepartment(), true, true);

        if (!doctors.isEmpty()) {
            Doctor doc = doctors.get(0);
            doc.setAvailableForEmergency(false);
            doctorRepository.save(doc);
            request.setDoctorId(doc.getId());
            request.setStatus("DOCTOR_ASSIGNED");
            emergencyRepository.save(request);

            // Consume doctor capacity
            hospitalRepository.findById(request.getHospitalId()).ifPresent(h -> {
                h.setAvailableDoctors(Math.max(0, h.getAvailableDoctors() - 1));
                hospitalRepository.save(h);
            });

            logEvent(request.getId(), "DOCTOR_ASSIGNED", "Doctor " + doc.getName() + " (" + doc.getSpecialization() + ") assigned.");
        } else {
            // Assign to general emergency team
            request.setDoctorId(-1L);
            request.setStatus("DOCTOR_ASSIGNED");
            emergencyRepository.save(request);
            logEvent(request.getId(), "DOCTOR_ASSIGNED", "Specialist doctor unavailable. Assigned to emergency duty team.");
        }
    }

    private String classifyDepartment(String patientUid) {
        Optional<MedicalProfile> profileOpt = medicalProfileRepository.findByUserUid(patientUid);
        if (profileOpt.isPresent()) {
            MedicalProfile profile = profileOpt.get();
            if (Boolean.TRUE.equals(profile.getChestPain()) || (profile.getPreviousHeartProblems() != null && profile.getPreviousHeartProblems().toLowerCase().contains("heart"))) {
                return "Cardiology";
            }
            if (Boolean.TRUE.equals(profile.getShortnessOfBreath()) || Boolean.TRUE.equals(profile.getAsthma())) {
                return "Pulmonology";
            }
            if (Boolean.TRUE.equals(profile.getSeizures()) || Boolean.TRUE.equals(profile.getDizziness())) {
                return "Neurology";
            }
            if (Boolean.TRUE.equals(profile.getAbdominalPain())) {
                return "General Medicine";
            }
        }
        return "Emergency";
    }

    private void logEvent(Long emergencyId, String status, String description) {
        EmergencyEvent event = new EmergencyEvent(emergencyId, status, description);
        eventRepository.save(event);
    }

    private void broadcastWorkflowUpdate(EmergencyRequest request) {
        messagingTemplate.convertAndSend("/topic/emergency/" + request.getId(), (Object) request);
        messagingTemplate.convertAndSend("/topic/emergency-updates", (Object) request);
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
    }
}
