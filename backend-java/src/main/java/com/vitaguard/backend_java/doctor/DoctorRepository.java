package com.vitaguard.backend_java.doctor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DoctorRepository extends JpaRepository<Doctor, Long> {
    List<Doctor> findByHospitalId(Long hospitalId);
    List<Doctor> findByHospitalIdAndDepartmentName(Long hospitalId, String departmentName);
    List<Doctor> findByHospitalIdAndDepartmentNameAndOnDutyAndAvailableForEmergency(Long hospitalId, String departmentName, Boolean onDuty, Boolean availableForEmergency);
}
