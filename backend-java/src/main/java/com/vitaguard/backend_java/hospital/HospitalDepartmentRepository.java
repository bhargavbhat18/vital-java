package com.vitaguard.backend_java.hospital;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HospitalDepartmentRepository extends JpaRepository<HospitalDepartment, Long> {
    List<HospitalDepartment> findByHospitalId(Long hospitalId);
    Optional<HospitalDepartment> findByHospitalIdAndName(Long hospitalId, String name);
}
