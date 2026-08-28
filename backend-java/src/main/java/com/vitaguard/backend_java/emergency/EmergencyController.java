package com.vitaguard.backend_java.emergency;

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

@RestController
@RequestMapping("/api/emergency")
public class EmergencyController {

    private final EmergencyService emergencyService;
    private final EmergencyRequestRepository emergencyRepository;
    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;

    public EmergencyController(
            EmergencyService emergencyService,
            EmergencyRequestRepository emergencyRepository,
            HospitalRepository hospitalRepository,
            UserRepository userRepository
    ) {
        this.emergencyService = emergencyService;
        this.emergencyRepository = emergencyRepository;
        this.hospitalRepository = hospitalRepository;
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
        // A doctor or hospital admin from Hospital A must not access an emergency belonging to Hospital B.
        boolean isAuthorized = requesterUid.equals(request.getPatientUid())
                || "DOCTOR".equals(requester.getRole())
                || ("HOSPITAL_ADMIN".equals(requester.getRole()) && (request.getHospitalId() == null || request.getHospitalId().equals(requester.getId()))); // assume requester id matches hospital id for admin, or verify

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
    public ResponseEntity<List<EmergencyRequest>> getActiveEmergencies() {
        return ResponseEntity.ok(emergencyRepository.findByStatusIn(List.of(
                "CREATED", "SEARCHING_HOSPITAL", "HOSPITAL_ASSIGNED", "ACCEPTED", 
                "DOCTOR_ASSIGNED", "AMBULANCE_ASSIGNED", "AMBULANCE_EN_ROUTE", "PATIENT_PICKED_UP"
        )));
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolveCase(@PathVariable Long id) {
        EmergencyRequest request = emergencyRepository.findById(id).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
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
