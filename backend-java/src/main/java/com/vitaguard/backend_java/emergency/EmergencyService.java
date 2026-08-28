package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.medical.MedicalProfile;
import com.vitaguard.backend_java.medical.MedicalProfileRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Service
public class EmergencyService {

    private final EmergencyRequestRepository emergencyRepository;
    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final MedicalProfileRepository medicalProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final RestTemplate restTemplate = new RestTemplate();

    public EmergencyService(
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            MedicalProfileRepository medicalProfileRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.emergencyRepository = emergencyRepository;
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.medicalProfileRepository = medicalProfileRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public EmergencyRequest triggerSos(String patientUid, Double lat, Double lng, String symptoms, String description) {
        // 1. Determine Department
        String department = classifyDepartment(patientUid, symptoms);

        // 2. Find and Rank Hospitals
        Hospital matchedHospital = matchHospital(lat, lng, department);

        EmergencyRequest request = new EmergencyRequest(patientUid, lat, lng, symptoms, description);
        request.setRequiredDepartment(department);
        request.setHospitalId(matchedHospital != null ? matchedHospital.getId() : null);
        request.setStatus("HOSPITAL_ASSIGNED");
        emergencyRepository.save(request);

        // Broadcast to hospital portal Command Centers
        broadcastToHospitalCommandCenters();

        return request;
    }

    public EmergencyRequest acceptEmergency(Long sosId) {
        EmergencyRequest request = emergencyRepository.findById(sosId)
                .orElseThrow(() -> new IllegalArgumentException("SOS event not found"));

        request.setStatus("ACCEPTED");
        request.setAcceptedAt(LocalDateTime.now());
        emergencyRepository.save(request);

        // Assign Doctor
        assignDoctor(request);

        // Assign Ambulance
        assignAmbulance(request);

        broadcastToHospitalCommandCenters();
        return request;
    }

    private String classifyDepartment(String patientUid, String symptoms) {
        if (symptoms == null) return "Emergency";
        String lSymptoms = symptoms.toLowerCase();

        boolean hasHeartHistory = false;
        Optional<MedicalProfile> profileOpt = medicalProfileRepository.findByUserUid(patientUid);
        if (profileOpt.isPresent()) {
            String heartHistory = profileOpt.get().getPreviousHeartProblems().toLowerCase();
            hasHeartHistory = heartHistory.contains("heart") || heartHistory.contains("cardiac") || heartHistory.contains("yes");
        }

        if (lSymptoms.contains("chest pain")) {
            return hasHeartHistory ? "Cardiology" : "Emergency";
        }
        if (lSymptoms.contains("breathing difficulty") || lSymptoms.contains("breath")) {
            return "Pulmonology";
        }
        if (lSymptoms.contains("accident") || lSymptoms.contains("injury") || lSymptoms.contains("bleeding")) {
            return "Trauma";
        }
        if (lSymptoms.contains("seizure") || lSymptoms.contains("consciousness")) {
            return "Neurology";
        }
        if (lSymptoms.contains("bone") || lSymptoms.contains("fracture")) {
            return "Orthopedics";
        }
        if (lSymptoms.contains("fever")) {
            return "General Medicine";
        }

        return "Emergency";
    }

    private Hospital matchHospital(Double patientLat, Double patientLng, String departmentName) {
        List<Hospital> hospitals = hospitalRepository.findAll();
        Hospital bestHospital = null;
        double minDistance = Double.MAX_VALUE;

        for (Hospital hospital : hospitals) {
            // Check if department is available and accepting patients
            Optional<HospitalDepartment> depOpt = departmentRepository.findByHospitalIdAndName(hospital.getId(), departmentName);
            if (depOpt.isPresent()) {
                HospitalDepartment dep = depOpt.get();
                if (dep.getAvailable() && dep.getEmergencyService() && dep.getAcceptingPatients()) {
                    double dist = calculateDistance(patientLat, patientLng, hospital.getLat(), hospital.getLng());
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestHospital = hospital;
                    }
                }
            }
        }

        // Fallback: If no hospital matches department capability, select closest hospital with an available Emergency Department
        if (bestHospital == null) {
            for (Hospital hospital : hospitals) {
                Optional<HospitalDepartment> depOpt = departmentRepository.findByHospitalIdAndName(hospital.getId(), "Emergency");
                if (depOpt.isPresent() && depOpt.get().getAvailable() && depOpt.get().getAcceptingPatients()) {
                    double dist = calculateDistance(patientLat, patientLng, hospital.getLat(), hospital.getLng());
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestHospital = hospital;
                    }
                }
            }
        }

        return bestHospital;
    }

    private void assignDoctor(EmergencyRequest request) {
        List<Doctor> doctors = doctorRepository.findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(
                request.getHospitalId(), request.getRequiredDepartment(), true, true);

        if (!doctors.isEmpty()) {
            Doctor doc = doctors.get(0);
            doc.setAvailableForEmergency(false); // set doctor busy
            doctorRepository.save(doc);
            request.setDoctorId(doc.getId());
            request.setStatus("DOCTOR_ASSIGNED");
            request.setAssignedAt(LocalDateTime.now());
        } else {
            // Fallback: Assign to department/emergency team
            request.setDoctorId(-1L); // Representation for Emergency Team
            request.setStatus("DOCTOR_ASSIGNED");
            request.setAssignedAt(LocalDateTime.now());
        }
        emergencyRepository.save(request);
    }

    private void assignAmbulance(EmergencyRequest request) {
        List<Ambulance> availableAmbulances = ambulanceRepository.findByStatus("available");
        if (availableAmbulances.isEmpty()) {
            // No ambulance available
            request.setAmbulanceId(null);
            emergencyRepository.save(request);
            // Send WebSocket notification
            sendLiveTrackingUpdate(request, null, null, 0.0, "Ambulance Unavailable");
            return;
        }

        Ambulance bestAmb = null;
        double minDistance = Double.MAX_VALUE;

        for (Ambulance amb : availableAmbulances) {
            double dist = calculateDistance(request.getLatitude(), request.getLongitude(), amb.getLatitude(), amb.getLongitude());
            if (dist < minDistance) {
                minDistance = dist;
                bestAmb = amb;
            }
        }

        if (bestAmb != null) {
            bestAmb.setStatus("busy");
            ambulanceRepository.save(bestAmb);

            request.setAmbulanceId(bestAmb.getId());
            request.setStatus("AMBULANCE_ASSIGNED");
            emergencyRepository.save(request);

            // Spawn dispatch tracking loop
            dispatchAmbulanceSimulation(request, bestAmb);
        }
    }

    private void dispatchAmbulanceSimulation(EmergencyRequest request, Ambulance ambulance) {
        CompletableFuture.runAsync(() -> {
            try {
                request.setStatus("AMBULANCE_EN_ROUTE");
                emergencyRepository.save(request);

                Hospital hospital = hospitalRepository.findById(request.getHospitalId()).orElse(null);
                Double destLat = request.getLatitude();
                Double destLng = request.getLongitude();

                // Fetch route coordinates from OSRM
                List<Double[]> routePoints = fetchRouteWaypoints(
                        ambulance.getLatitude(), ambulance.getLongitude(),
                        destLat, destLng
                );

                int totalSteps = routePoints.size();
                for (int step = 0; step < totalSteps; step++) {
                    Thread.sleep(3000); // 3-second simulation step

                    Double[] currentPt = routePoints.get(step);
                    ambulance.setLatitude(currentPt[0]);
                    ambulance.setLongitude(currentPt[1]);
                    ambulanceRepository.save(ambulance);

                    // Transition to PICKED_UP midway
                    if (step == totalSteps / 2) {
                        request.setStatus("PATIENT_PICKED_UP");
                        emergencyRepository.save(request);
                    }

                    double remainingMin = (totalSteps - 1 - step) * 3 / 60.0;
                    double progress = (double) (step + 1) / totalSteps;

                    sendLiveTrackingUpdate(request, currentPt[0], currentPt[1], progress, String.format("%.1f min", remainingMin));
                }

                // Arrived at scene/hospital
                request.setStatus("ARRIVED_AT_HOSPITAL");
                request.setCompletedAt(LocalDateTime.now());
                emergencyRepository.save(request);

                // Release ambulance back to hospital position as available
                if (hospital != null) {
                    ambulance.setLatitude(hospital.getLat());
                    ambulance.setLongitude(hospital.getLng());
                }
                ambulance.setStatus("available");
                ambulanceRepository.save(ambulance);

                sendLiveTrackingUpdate(request, ambulance.getLatitude(), ambulance.getLongitude(), 1.0, "ARRIVED");
                broadcastToHospitalCommandCenters();

            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private List<Double[]> fetchRouteWaypoints(Double fromLat, Double fromLng, Double toLat, Double toLng) {
        List<Double[]> pts = new ArrayList<>();
        String url = String.format(Locale.US, "http://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson",
                fromLng, fromLat, toLng, toLat);

        try {
            Map<String, Object> resp = restTemplate.getForObject(url, Map.class);
            List<Map<String, Object>> routes = (List<Map<String, Object>>) resp.get("routes");
            if (routes != null && !routes.isEmpty()) {
                Map<String, Object> route = routes.get(0);
                Map<String, Object> geom = (Map<String, Object>) route.get("geometry");
                List<List<Double>> coords = (List<List<Double>>) geom.get("coordinates"); // list of [lng, lat]
                if (coords != null && coords.size() >= 2) {
                    // Resample to exactly 15 steps
                    int targetSteps = 15;
                    for (int i = 0; i < targetSteps; i++) {
                        int idx = i * (coords.size() - 1) / (targetSteps - 1);
                        List<Double> coord = coords.get(idx);
                        pts.add(new Double[]{coord.get(1), coord.get(0)}); // [lat, lng]
                    }
                    return pts;
                }
            }
        } catch (Exception e) {
            System.err.println("[OSRM] Failed to load route from OSRM, falling back to straight-line interpolation");
        }

        // Fallback: 15-step straight-line interpolation
        int steps = 15;
        for (int i = 0; i < steps; i++) {
            double fraction = (double) i / (steps - 1);
            double lat = fromLat + (toLat - fromLat) * fraction;
            double lng = fromLng + (toLng - fromLng) * fraction;
            pts.add(new Double[]{lat, lng});
        }
        return pts;
    }

    private void sendLiveTrackingUpdate(EmergencyRequest req, Double ambLat, Double ambLng, Double progress, String eta) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("sosId", req.getId());
        payload.put("status", req.getStatus());
        payload.put("ambulanceLatitude", ambLat);
        payload.put("ambulanceLongitude", ambLng);
        payload.put("progress", progress);
        payload.put("eta", eta);

        hospitalRepository.findById(req.getHospitalId()).ifPresent(h -> payload.put("hospital", h.getName()));
        if (req.getDoctorId() != null && req.getDoctorId() > 0) {
            doctorRepository.findById(req.getDoctorId()).ifPresent(d -> payload.put("doctor", d.getName()));
        } else if (req.getDoctorId() != null && req.getDoctorId() == -1L) {
            payload.put("doctor", "Emergency Team");
        }

        messagingTemplate.convertAndSend("/topic/emergency/" + req.getId(), (Object) payload);
        // Also update command center
        messagingTemplate.convertAndSend("/topic/emergency-updates", (Object) payload);
    }

    private void broadcastToHospitalCommandCenters() {
        messagingTemplate.convertAndSend("/topic/hospital-queue-refresh", "refresh");
    }

    public double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
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
