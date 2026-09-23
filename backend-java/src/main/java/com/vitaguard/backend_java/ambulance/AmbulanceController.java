package com.vitaguard.backend_java.ambulance;

import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping({"/api/ambulance", "/api/ambulances"})
public class AmbulanceController {

    private final AmbulanceService ambulanceService;
    private final AmbulanceRepository ambulanceRepository;
    private final AmbulanceRequestRepository requestRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;

    public AmbulanceController(AmbulanceService ambulanceService,
                               AmbulanceRepository ambulanceRepository,
                               AmbulanceRequestRepository requestRepository,
                               EmergencyRequestRepository emergencyRepository,
                               UserRepository userRepository) {
        this.ambulanceService = ambulanceService;
        this.ambulanceRepository = ambulanceRepository;
        this.requestRepository = requestRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<List<Ambulance>> getAllAmbulances() {
        return ResponseEntity.ok(ambulanceRepository.findAll());
    }

    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<?> getAmbulanceById(@PathVariable Long id) {
        return ambulanceRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/current-job")
    public ResponseEntity<?> getCurrentJob() {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can access this endpoint"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.ok(Map.of("message", "No ambulance assigned to this driver"));
        }

        Ambulance ambulance = ambulanceOpt.get();
        Map<String, Object> response = new HashMap<>();
        response.put("ambulance", ambulance);
        
        if (ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            emergencyOpt.ifPresent(e -> response.put("emergency", e));
        }

        return ResponseEntity.ok(response);
    }

    @GetMapping("/pending-requests")
    public ResponseEntity<?> getPendingRequests() {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can access this endpoint"));
        }

        List<AmbulanceRequest> requests = ambulanceService.getPendingRequests(driver.getId());
        return ResponseEntity.ok(requests);
    }

    @PostMapping("/requests/{requestId}/accept")
    public ResponseEntity<?> acceptRequest(@PathVariable Long requestId) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can accept requests"));
        }

        boolean accepted = ambulanceService.acceptRequest(requestId, driver.getId());
        if (accepted) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Request accepted"));
        } else {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Request no longer available or already accepted by another driver"));
        }
    }

    @PostMapping("/requests/{requestId}/decline")
    public ResponseEntity<?> declineRequest(@PathVariable Long requestId) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can decline requests"));
        }

        boolean declined = ambulanceService.declineRequest(requestId, driver.getId());
        if (declined) {
            return ResponseEntity.ok(Map.of("success", true, "message", "Request declined"));
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot decline request"));
        }
    }

    @PostMapping("/status")
    public ResponseEntity<?> updateStatus(@RequestBody Map<String, Object> body) {
        String driverUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User driver = userRepository.findByUid(driverUid).orElse(null);

        if (driver == null || !"AMBULANCE_DRIVER".equals(driver.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only ambulance drivers can update status"));
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findByDriverId(driver.getId());
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No ambulance assigned to this driver"));
        }

        Ambulance ambulance = ambulanceOpt.get();
        String status = (String) body.get("status");
        Double lat = body.containsKey("latitude") ? Double.valueOf(body.get("latitude").toString()) : null;
        Double lng = body.containsKey("longitude") ? Double.valueOf(body.get("longitude").toString()) : null;

        // Validate status transition
        if (!isValidStatusTransition(ambulance.getStatus(), status)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid status transition from " + ambulance.getStatus() + " to " + status));
        }

        ambulanceService.updateAmbulanceStatus(ambulance.getId(), status, lat, lng);

        // If status is PATIENT_PICKED_UP, update emergency
        if ("PATIENT_PICKED_UP".equals(status) && ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            emergencyOpt.ifPresent(e -> {
                e.setStatus("PATIENT_PICKED_UP");
                emergencyRepository.save(e);
            });
        }

        // If status is ARRIVED_AT_HOSPITAL, update emergency
        if ("ARRIVED_AT_HOSPITAL".equals(status) && ambulance.getCurrentEmergencyId() != null) {
            Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(ambulance.getCurrentEmergencyId());
            emergencyOpt.ifPresent(e -> {
                e.setStatus("ARRIVED_AT_HOSPITAL");
                emergencyRepository.save(e);
            });
        }

        return ResponseEntity.ok(Map.of("success", true, "status", status));
    }

    private boolean isValidStatusTransition(String currentStatus, String newStatus) {
        if (currentStatus == null || newStatus == null) return false;
        
        Map<String, List<String>> validTransitions = Map.of(
            "AVAILABLE", List.of("REQUESTED"),
            "REQUESTED", List.of("ACCEPTED", "DECLINED", "AVAILABLE"),
            "ACCEPTED", List.of("EN_ROUTE_TO_PATIENT"),
            "EN_ROUTE_TO_PATIENT", List.of("ARRIVED_AT_PATIENT"),
            "ARRIVED_AT_PATIENT", List.of("PATIENT_PICKED_UP"),
            "PATIENT_PICKED_UP", List.of("EN_ROUTE_TO_HOSPITAL"),
            "EN_ROUTE_TO_HOSPITAL", List.of("ARRIVED_AT_HOSPITAL"),
            "ARRIVED_AT_HOSPITAL", List.of("COMPLETED"),
            "COMPLETED", List.of("AVAILABLE")
        );

        List<String> allowed = validTransitions.get(currentStatus);
        return allowed != null && allowed.contains(newStatus);
    }

    @GetMapping("/{ambulanceId}/location")
    public ResponseEntity<?> getAmbulanceLocation(@PathVariable Long ambulanceId) {
        String currentUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByUid(currentUid).orElse(null);

        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Ambulance> ambulanceOpt = ambulanceRepository.findById(ambulanceId);
        if (ambulanceOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Ambulance ambulance = ambulanceOpt.get();

        // Authorization: driver can see own, hospital admin can see their hospital's, system admin can see all
        boolean authorized = "AMBULANCE_DRIVER".equals(currentUser.getRole()) && ambulance.getDriver() != null && ambulance.getDriver().getId().equals(currentUser.getId())
                || "HOSPITAL_ADMIN".equals(currentUser.getRole()) && ambulance.getCurrentEmergencyId() != null
                || "SYSTEM_ADMIN".equals(currentUser.getRole())
                || "DOCTOR".equals(currentUser.getRole()) && ambulance.getCurrentEmergencyId() != null;

        if (!authorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to view ambulance location"));
        }

        Map<String, Object> response = new HashMap<>();
        response.put("ambulanceId", ambulance.getId());
        response.put("unitId", ambulance.getUnitId());
        response.put("latitude", ambulance.getLatitude());
        response.put("longitude", ambulance.getLongitude());
        response.put("status", ambulance.getStatus());
        return ResponseEntity.ok(response);
    }
}