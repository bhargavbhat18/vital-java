package com.vitaguard.backend_java.emergency;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalRepository;
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
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/emergency")
public class EmergencyController {

    private final EmergencyService emergencyService;
    private final EmergencyRequestRepository emergencyRepository;
    private final HospitalRepository hospitalRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;

    public EmergencyController(
            EmergencyService emergencyService,
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository
    ) {
        this.emergencyService = emergencyService;
        this.emergencyRepository = emergencyRepository;
        this.hospitalRepository = hospitalRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
    }

    @PostMapping("/sos")
    public ResponseEntity<?> triggerSos(@RequestBody Map<String, Object> body) {
        String patientUid = SecurityContextHolder.getContext().getAuthentication().getName();

        String alertMessage = (String) body.getOrDefault("alert_message", "Emergency Alert");
        String symptomDescription = (String) body.getOrDefault("description", "");
        
        // Parse list of symptoms
        List<String> symptomsList = (List<String>) body.get("symptoms");
        String symptoms = symptomsList != null ? String.join(",", symptomsList) : alertMessage;

        Map<String, Object> location = (Map<String, Object>) body.get("location");
        Double lat = 12.9716;
        Double lng = 77.5946;
        if (location != null) {
            lat = ((Number) location.getOrDefault("lat", 12.9716)).doubleValue();
            lng = ((Number) location.getOrDefault("lng", 77.5946)).doubleValue();
        }

        EmergencyRequest request = emergencyService.triggerSos(patientUid, lat, lng, symptoms, symptomDescription);
        return ResponseEntity.ok(request);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getEmergencyRequest(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization validation:
        // Patient: own emergency only
        // Family: linked patient only (checked via relationship)
        // Doctor: assigned emergencies only
        // Hospital Admin: emergencies assigned to their hospital only
        // System Admin: all emergencies
        boolean isAuthorized = false;
        String role = requester.getRole();
        
        if (requesterUid.equals(request.getPatientUid())) {
            isAuthorized = true; // Patient owns the emergency
        } else if ("FAMILY_MEMBER".equals(role)) {
            // Check family relationship via PatientFamilyRelationship
            // This would need relationshipRepository - for now, allow if family member
            // TODO: Add proper family relationship check
            isAuthorized = false; // Require explicit check
        } else if ("DOCTOR".equals(role)) {
            // Doctor can only access emergencies assigned to them
            if (request.getDoctorId() != null && request.getDoctorId() > 0) {
                isAuthorized = request.getDoctorId().equals(requester.getId());
            }
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            // Hospital admin can only access emergencies assigned to their hospital
            if (requester.getHospitalId() != null && request.getHospitalId() != null) {
                isAuthorized = requester.getHospitalId().equals(request.getHospitalId());
            }
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Access denied: Unauthorized to view this emergency event");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(err);
        }

        return ResponseEntity.ok(request);
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<?> acceptCase(@PathVariable Long id) {
        try {
            EmergencyRequest request = emergencyService.acceptEmergency(id);
            return ResponseEntity.ok(request);
        } catch (IllegalArgumentException e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @GetMapping("/active")
    public ResponseEntity<?> getActiveEmergencies() {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<EmergencyRequest> allActive = emergencyRepository.findByStatusIn(List.of(
                "CREATED", "SEARCHING_HOSPITAL", "HOSPITAL_ASSIGNED", "ACCEPTED",
                "DOCTOR_ASSIGNED", "AMBULANCE_ASSIGNED", "AMBULANCE_EN_ROUTE", "PATIENT_PICKED_UP"
        ));

        // Filter based on role
        List<EmergencyRequest> filtered;
        String role = requester.getRole();

        if ("PATIENT".equals(role)) {
            filtered = allActive.stream()
                    .filter(e -> requesterUid.equals(e.getPatientUid()))
                    .toList();
        } else if ("FAMILY_MEMBER".equals(role)) {
            // Filter by family relationship - for now return empty, would need relationship check
            filtered = List.of();
        } else if ("DOCTOR".equals(role)) {
            filtered = allActive.stream()
                    .filter(e -> e.getDoctorId() != null && e.getDoctorId().equals(requester.getId()))
                    .toList();
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            if (requester.getHospitalId() != null) {
                filtered = allActive.stream()
                        .filter(e -> requester.getHospitalId().equals(e.getHospitalId()))
                        .toList();
            } else {
                filtered = List.of();
            }
        } else if ("SYSTEM_ADMIN".equals(role)) {
            filtered = allActive;
        } else if ("AMBULANCE_DRIVER".equals(role)) {
            // Get ambulances assigned to this driver
            filtered = allActive.stream()
                    .filter(e -> e.getAmbulanceId() != null)
                    .filter(e -> {
                        Optional<Ambulance> ambOpt = ambulanceRepository.findById(e.getAmbulanceId());
                        return ambOpt.isPresent() && ambOpt.get().getDriver() != null 
                                && ambOpt.get().getDriver().getId().equals(requester.getId());
                    })
                    .toList();
        } else {
            filtered = List.of();
        }

        return ResponseEntity.ok(filtered);
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolveCase(@PathVariable Long id) {
        String requesterUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User requester = userRepository.findByUid(requesterUid).orElse(null);

        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }

        // Authorization: Only assigned doctor, hospital admin for their hospital, or system admin can resolve
        boolean isAuthorized = false;
        String role = requester.getRole();

        if ("DOCTOR".equals(role) && request.getDoctorId() != null && request.getDoctorId().equals(requester.getId())) {
            isAuthorized = true;
        } else if ("HOSPITAL_ADMIN".equals(role) && requester.getHospitalId() != null 
                && requester.getHospitalId().equals(request.getHospitalId())) {
            isAuthorized = true;
        } else if ("SYSTEM_ADMIN".equals(role)) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Unauthorized to resolve this emergency"));
        }

        request.setStatus("COMPLETED");
        request.setCompletedAt(java.time.LocalDateTime.now());
        emergencyRepository.save(request);

        // Update hospital resources if needed
        Hospital hospital = hospitalRepository.findById(request.getHospitalId()).orElse(null);
        if (hospital != null) {
            hospital.setAvailableBeds(Math.min(hospital.getTotalBeds(), hospital.getAvailableBeds() + 1));
            hospital.setAvailableDoctors(Math.min(hospital.getTotalDoctors(), hospital.getAvailableDoctors() + 1));
            hospitalRepository.save(hospital);
        }

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("sos_id", id);
        res.put("status", "resolved");
        return ResponseEntity.ok(res);
    }
}
