package com.vitaguard.backend_java.doctor;

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
@RequestMapping("/api/doctor")
public class DoctorController {

    private final DoctorRepository doctorRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;

    public DoctorController(DoctorRepository doctorRepository,
                            EmergencyRequestRepository emergencyRepository,
                            UserRepository userRepository) {
        this.doctorRepository = doctorRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
    }

    @GetMapping("/emergencies")
    public ResponseEntity<?> getAssignedEmergencies() {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can access this endpoint"));
        }

        Optional<Doctor> doctorOpt = doctorRepository.findById(doctorUser.getId());
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Doctor profile not found"));
        }

        Doctor doctor = doctorOpt.get();
        List<EmergencyRequest> emergencies = emergencyRepository.findByDoctorId(doctor.getId());
        return ResponseEntity.ok(emergencies);
    }

    @GetMapping("/patients")
    public ResponseEntity<?> getAssignedPatients() {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can access this endpoint"));
        }

        Optional<Doctor> doctorOpt = doctorRepository.findById(doctorUser.getId());
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Doctor profile not found"));
        }

        Doctor doctor = doctorOpt.get();
        List<EmergencyRequest> emergencies = emergencyRepository.findByDoctorId(doctor.getId());

        // Extract unique patients
        List<Map<String, Object>> patients = emergencies.stream()
                .map(e -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("emergencyId", e.getId());
                    map.put("patientUid", e.getPatientUid());
                    map.put("severity", e.getSeverity());
                    map.put("riskScore", e.getRiskScore());
                    map.put("status", e.getStatus());
                    map.put("detectedVitals", e.getDetectedVitals());
                    map.put("createdAt", e.getCreatedAt());
                    return map;
                })
                .toList();

        return ResponseEntity.ok(patients);
    }

    @GetMapping("/emergency/{emergencyId}")
    public ResponseEntity<?> getEmergencyDetails(@PathVariable Long emergencyId) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can access this endpoint"));
        }

        Optional<EmergencyRequest> emergencyOpt = emergencyRepository.findById(emergencyId);
        if (emergencyOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        EmergencyRequest emergency = emergencyOpt.get();

        // Verify this doctor is assigned to this emergency
        Optional<Doctor> doctorOpt = doctorRepository.findById(doctorUser.getId());
        if (doctorOpt.isEmpty() || !doctorOpt.get().getId().equals(emergency.getDoctorId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Not authorized to view this emergency"));
        }

        return ResponseEntity.ok(emergency);
    }

    @PostMapping("/status")
    public ResponseEntity<?> updateAvailability(@RequestBody Map<String, Object> body) {
        String doctorUid = SecurityContextHolder.getContext().getAuthentication().getName();
        User doctorUser = userRepository.findByUid(doctorUid).orElse(null);

        if (doctorUser == null || !"DOCTOR".equals(doctorUser.getRole())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only doctors can update availability"));
        }

        Optional<Doctor> doctorOpt = doctorRepository.findById(doctorUser.getId());
        if (doctorOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Doctor doctor = doctorOpt.get();
        Boolean onDuty = (Boolean) body.get("onDuty");
        Boolean availableForEmergency = (Boolean) body.get("availableForEmergency");

        if (onDuty != null) doctor.setOnDuty(onDuty);
        if (availableForEmergency != null) doctor.setAvailableForEmergency(availableForEmergency);

        doctorRepository.save(doctor);
        return ResponseEntity.ok(doctor);
    }
}