package com.vitaguard.backend_java.hospital;

import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequest;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/hospital")
public class HospitalController {

    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository departmentRepository;
    private final DoctorRepository doctorRepository;
    private final EmergencyRequestRepository emergencyRepository;
    private final UserRepository userRepository;

    public HospitalController(
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository departmentRepository,
            DoctorRepository doctorRepository,
            EmergencyRequestRepository emergencyRepository,
            UserRepository userRepository
    ) {
        this.hospitalRepository = hospitalRepository;
        this.departmentRepository = departmentRepository;
        this.doctorRepository = doctorRepository;
        this.emergencyRepository = emergencyRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<List<Hospital>> listHospitals() {
        return ResponseEntity.ok(hospitalRepository.findAll());
    }

    @GetMapping("/emergencies")
    public ResponseEntity<List<EmergencyRequest>> getEmergencies() {
        // Return active emergencies for hospital portals
        return ResponseEntity.ok(emergencyRepository.findByStatusIn(List.of(
                "CREATED", "SEARCHING_HOSPITAL", "HOSPITAL_ASSIGNED", "ACCEPTED",
                "DOCTOR_ASSIGNED", "AMBULANCE_ASSIGNED", "AMBULANCE_EN_ROUTE", "PATIENT_PICKED_UP"
        )));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total_sos", emergencyRepository.count());
        stats.put("active", emergencyRepository.findByStatusIn(List.of("AMBULANCE_EN_ROUTE", "PATIENT_PICKED_UP")).size());
        stats.put("resolved", emergencyRepository.findByStatusIn(List.of("COMPLETED", "resolved")).size());
        stats.put("total_patients", userRepository.count());
        stats.put("hospitals", hospitalRepository.findAll());
        return ResponseEntity.ok(stats);
    }

    @PostMapping("/resolve/{id}")
    public ResponseEntity<?> resolveCase(@PathVariable Long id) {
        Optional<EmergencyRequest> reqOpt = emergencyRepository.findById(id);
        if (reqOpt.isPresent()) {
            EmergencyRequest req = reqOpt.get();
            req.setStatus("COMPLETED");
            req.setCompletedAt(java.time.LocalDateTime.now());
            emergencyRepository.save(req);

            // Re-increment beds/doctors
            Hospital hospital = hospitalRepository.findById(req.getHospitalId()).orElse(null);
            if (hospital != null) {
                hospital.setAvailableBeds(Math.min(hospital.getTotalBeds(), hospital.getAvailableBeds() + 1));
                hospital.setAvailableDoctors(Math.min(hospital.getTotalDoctors(), hospital.getAvailableDoctors() + 1));
                hospitalRepository.save(hospital);
            }
            Map<String, Object> res = new HashMap<>();
            res.put("success", true);
            res.put("sos_id", id.toString());
            res.put("status", "resolved");
            return ResponseEntity.ok(res);
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/departments/{name}")
    public ResponseEntity<?> getHospitalDepartments(@PathVariable String name) {
        return hospitalRepository.findByName(name)
                .map(hospital -> {
                    Map<String, Object> data = new HashMap<>();
                    data.put("departments", departmentRepository.findByHospitalId(hospital.getId()));
                    data.put("doctors", doctorRepository.findByHospitalId(hospital.getId()));
                    return ResponseEntity.ok(data);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/departments")
    public ResponseEntity<?> configureDepartment(@RequestBody Map<String, Object> payload) {
        Long depId = ((Number) payload.get("id")).longValue();
        Boolean available = (Boolean) payload.get("available");
        Boolean emergencyService = (Boolean) payload.get("emergencyService");
        Boolean acceptingPatients = (Boolean) payload.get("acceptingPatients");
        Integer availableBeds = ((Number) payload.get("availableBeds")).intValue();
        Integer availableDoctors = ((Number) payload.get("availableDoctors")).intValue();

        return departmentRepository.findById(depId)
                .map(dep -> {
                    dep.setAvailable(available);
                    dep.setEmergencyService(emergencyService);
                    dep.setAcceptingPatients(acceptingPatients);
                    dep.setAvailableBeds(availableBeds);
                    dep.setAvailableDoctors(availableDoctors);
                    departmentRepository.save(dep);
                    return ResponseEntity.ok(dep);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/doctors/status")
    public ResponseEntity<?> toggleDoctorStatus(@RequestBody Map<String, Object> payload) {
        Long docId = ((Number) payload.get("id")).longValue();
        Boolean onDuty = (Boolean) payload.get("onDuty");
        Boolean availableForEmergency = (Boolean) payload.get("availableForEmergency");

        return doctorRepository.findById(docId)
                .map(doc -> {
                    doc.setOnDuty(onDuty);
                    doc.setAvailableForEmergency(availableForEmergency);
                    doctorRepository.save(doc);
                    return ResponseEntity.ok(doc);
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
