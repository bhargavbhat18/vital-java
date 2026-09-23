package com.vitaguard.backend_java.ambulance;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class AmbulanceService {

    private final AmbulanceRepository ambulanceRepository;
    private final AmbulanceRequestRepository requestRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    // Track pending requests to prevent duplicate acceptance
    private final Map<Long, Long> pendingRequestLocks = new ConcurrentHashMap<>();

    public AmbulanceService(AmbulanceRepository ambulanceRepository,
                            AmbulanceRequestRepository requestRepository,
                            EmergencyRequestRepository emergencyRepository,
                            HospitalRepository hospitalRepository,
                            UserRepository userRepository,
                            SimpMessagingTemplate messagingTemplate) {
        this.ambulanceRepository = ambulanceRepository;
        this.requestRepository = requestRepository;
        this.emergencyRepository = emergencyRepository;
        this.hospitalRepository = hospitalRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public AmbulanceRequest requestNearestAmbulance(EmergencyRequest emergency) {
        List<Ambulance> availableAmbulances = ambulanceRepository.findByStatus("AVAILABLE");
        if (availableAmbulances.isEmpty()) {
            return null;
        }

        // Calculate distances and sort by nearest
        List<AmbulanceDistance> distances = new ArrayList<>();
        for (Ambulance amb : availableAmbulances) {
            double dist = calculateDistance(emergency.getLatitude(), emergency.getLongitude(),
                    amb.getLatitude(), amb.getLongitude());
            int eta = (int) Math.ceil((dist / 40.0) * 60.0); // ~40 km/h average
            distances.add(new AmbulanceDistance(amb, dist, eta));
        }

        distances.sort(Comparator.comparingDouble(AmbulanceDistance::distance));

        // Request the nearest ambulance first
        for (AmbulanceDistance ad : distances) {
            AmbulanceRequest request = createRequest(emergency, ad.ambulance(), ad.distance(), ad.eta());
            if (request != null) {
                // Mark ambulance as REQUESTED
                ad.ambulance().setStatus("REQUESTED");
                ad.ambulance().setCurrentEmergencyId(emergency.getId());
                ambulanceRepository.save(ad.ambulance());

                // Update emergency status
                emergency.setStatus("AMBULANCE_REQUESTED");
                emergencyRepository.save(emergency);

                // Send WebSocket notification to driver
                sendRequestToDriver(ad.ambulance().getDriver(), request, emergency, ad.distance(), ad.eta());

                return request;
            }
        }

        return null;
    }

    private AmbulanceRequest createRequest(EmergencyRequest emergency, Ambulance ambulance, double distance, int eta) {
        // Check if there's already a pending request for this emergency
        if (requestRepository.existsByEmergencyIdAndStatusIn(emergency.getId(),
                List.of("PENDING", "ACCEPTED"))) {
            return null;
        }

        // Check if ambulance already has a pending request
        if (requestRepository.findByAmbulanceIdAndStatusIn(ambulance.getId(),
                List.of("PENDING", "ACCEPTED")).size() > 0) {
            return null;
        }

        AmbulanceRequest request = new AmbulanceRequest(emergency.getId(), ambulance.getId(), distance, eta);
        requestRepository.save(request);
        return request;
    }

    private void sendRequestToDriver(User driver, AmbulanceRequest request, EmergencyRequest emergency, double distance, int eta) {
        if (driver == null) return;

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("requestId", request.getId());
        payload.put("emergencyId", emergency.getId());
        payload.put("patientName", getPatientName(emergency.getPatientUid()));
        payload.put("severity", emergency.getSeverity());
        payload.put("riskScore", emergency.getRiskScore());
        payload.put("distanceKm", Math.round(distance * 100.0) / 100.0);
        payload.put("etaMinutes", eta);
        payload.put("pickupLat", emergency.getLatitude());
        payload.put("pickupLng", emergency.getLongitude());
        payload.put("destinationHospital", getHospitalName(emergency.getHospitalId()));
        payload.put("status", "PENDING");

        messagingTemplate.convertAndSend("/topic/ambulance/request/" + driver.getId(), (Object) payload);
    }

    @Transactional
    public synchronized boolean acceptRequest(Long requestId, Long driverId) {
        AmbulanceRequest request = requestRepository.findById(requestId).orElse(null);
        if (request == null) {
            return false;
        }

        // Check if already accepted or declined
        if (!"PENDING".equals(request.getStatus())) {
            return false;
        }

        // Verify driver owns the ambulance
        Ambulance ambulance = ambulanceRepository.findById(request.getAmbulanceId()).orElse(null);
        if (ambulance == null || ambulance.getDriver() == null || !ambulance.getDriver().getId().equals(driverId)) {
            return false;
        }

        // Check if another request for this emergency was already accepted
        List<AmbulanceRequest> acceptedRequests = requestRepository.findByEmergencyIdAndStatusIn(request.getEmergencyId(),
                List.of("ACCEPTED"));
        if (!acceptedRequests.isEmpty() && !acceptedRequests.get(0).getId().equals(requestId)) {
            // Another ambulance already accepted - decline this one
            request.setStatus("DECLINED");
            request.setRespondedAt(LocalDateTime.now());
            requestRepository.save(request);
            return false;
        }

        // Accept the request
        request.setStatus("ACCEPTED");
        request.setRespondedAt(LocalDateTime.now());
        requestRepository.save(request);

        // Update ambulance status
        ambulance.setStatus("ACCEPTED");
        ambulance.setCurrentEmergencyId(request.getEmergencyId());
        ambulanceRepository.save(ambulance);

        // Update emergency
        EmergencyRequest emergency = emergencyRepository.findById(request.getEmergencyId()).orElse(null);
        if (emergency != null) {
            emergency.setAmbulanceId(ambulance.getId());
            emergency.setStatus("AMBULANCE_ACCEPTED");
            emergency.setAmbulanceDispatched(true);
            emergencyRepository.save(emergency);
        }

        // Notify all parties
        notifyAmbulanceAccepted(request, ambulance, emergency);

        return true;
    }

    @Transactional
    public synchronized boolean declineRequest(Long requestId, Long driverId) {
        AmbulanceRequest request = requestRepository.findById(requestId).orElse(null);
        if (request == null) {
            return false;
        }

        if (!"PENDING".equals(request.getStatus())) {
            return false;
        }

        Ambulance ambulance = ambulanceRepository.findById(request.getAmbulanceId()).orElse(null);
        if (ambulance == null || ambulance.getDriver() == null || !ambulance.getDriver().getId().equals(driverId)) {
            return false;
        }

        request.setStatus("DECLINED");
        request.setRespondedAt(LocalDateTime.now());
        requestRepository.save(request);

        // Return ambulance to AVAILABLE
        ambulance.setStatus("AVAILABLE");
        ambulance.setCurrentEmergencyId(null);
        ambulanceRepository.save(ambulance);

        // Request next nearest ambulance
        EmergencyRequest emergency = emergencyRepository.findById(request.getEmergencyId()).orElse(null);
        if (emergency != null) {
            requestNextNearestAmbulance(emergency);
        }

        return true;
    }

    private void requestNextNearestAmbulance(EmergencyRequest emergency) {
        List<Ambulance> availableAmbulances = ambulanceRepository.findByStatus("AVAILABLE");
        if (availableAmbulances.isEmpty()) {
            emergency.setStatus("AMBULANCE_UNAVAILABLE");
            emergencyRepository.save(emergency);
            return;
        }

        List<AmbulanceDistance> distances = new ArrayList<>();
        for (Ambulance amb : availableAmbulances) {
            double dist = calculateDistance(emergency.getLatitude(), emergency.getLongitude(),
                    amb.getLatitude(), amb.getLongitude());
            int eta = (int) Math.ceil((dist / 40.0) * 60.0);
            distances.add(new AmbulanceDistance(amb, dist, eta));
        }

        distances.sort(Comparator.comparingDouble(AmbulanceDistance::distance));

        for (AmbulanceDistance ad : distances) {
            AmbulanceRequest request = createRequest(emergency, ad.ambulance(), ad.distance(), ad.eta());
            if (request != null) {
                ad.ambulance().setStatus("REQUESTED");
                ad.ambulance().setCurrentEmergencyId(emergency.getId());
                ambulanceRepository.save(ad.ambulance());

                emergency.setStatus("AMBULANCE_REQUESTED");
                emergencyRepository.save(emergency);

                sendRequestToDriver(ad.ambulance().getDriver(), request, emergency, ad.distance(), ad.eta());
                break;
            }
        }
    }

    private void notifyAmbulanceAccepted(AmbulanceRequest request, Ambulance ambulance, EmergencyRequest emergency) {
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("emergencyId", emergency.getId());
        payload.put("ambulanceId", ambulance.getId());
        payload.put("ambulanceUnitId", ambulance.getUnitId());
        payload.put("driverName", ambulance.getDriver() != null ? ambulance.getDriver().getFullName() : "Unknown");
        payload.put("status", "AMBULANCE_ACCEPTED");
        payload.put("distanceKm", request.getDistanceKm());
        payload.put("etaMinutes", request.getEtaMinutes());

        // Broadcast to patient, family, hospital, doctor
        messagingTemplate.convertAndSend("/topic/emergency/" + emergency.getId(), (Object) payload);
        messagingTemplate.convertAndSend("/topic/ambulance/" + ambulance.getId(), (Object) payload);
        if (emergency.getHospitalId() != null) {
            messagingTemplate.convertAndSend("/topic/hospital/" + emergency.getHospitalId() + "/incoming", (Object) payload);
        }
        if (emergency.getDoctorId() != null && emergency.getDoctorId() > 0) {
            messagingTemplate.convertAndSend("/topic/doctor/" + emergency.getDoctorId() + "/updates", (Object) payload);
        }
    }

    @Transactional
    public void updateAmbulanceStatus(Long ambulanceId, String status, Double lat, Double lng) {
        Ambulance ambulance = ambulanceRepository.findById(ambulanceId).orElse(null);
        if (ambulance == null) return;

        ambulance.setStatus(status);
        if (lat != null) ambulance.setLatitude(lat);
        if (lng != null) ambulance.setLongitude(lng);
        ambulanceRepository.save(ambulance);

        // Broadcast location update
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("ambulanceId", ambulanceId);
        payload.put("unitId", ambulance.getUnitId());
        payload.put("status", status);
        payload.put("latitude", ambulance.getLatitude());
        payload.put("longitude", ambulance.getLongitude());
        payload.put("timestamp", LocalDateTime.now().toString());

        messagingTemplate.convertAndSend("/topic/ambulance/" + ambulanceId, (Object) payload);

        if (ambulance.getCurrentEmergencyId() != null) {
            messagingTemplate.convertAndSend("/topic/emergency/" + ambulance.getCurrentEmergencyId(), (Object) payload);
        }
    }

    public Optional<Ambulance> getCurrentJob(Long driverId) {
        return ambulanceRepository.findByDriverId(driverId);
    }

    public List<AmbulanceRequest> getPendingRequests(Long driverId) {
        Ambulance ambulance = ambulanceRepository.findByDriverId(driverId).orElse(null);
        if (ambulance == null) return List.of();
        return requestRepository.findByAmbulanceIdAndStatusIn(ambulance.getId(), List.of("PENDING"));
    }

    private String getPatientName(String patientUid) {
        return userRepository.findByUid(patientUid)
                .map(User::getFullName)
                .orElse("Unknown Patient");
    }

    private String getHospitalName(Long hospitalId) {
        if (hospitalId == null) return "TBD";
        return hospitalRepository.findById(hospitalId)
                .map(Hospital::getName)
                .orElse("TBD");
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

    private record AmbulanceDistance(Ambulance ambulance, double distance, int eta) {}
}