package com.vitaguard.backend_java.ambulance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AmbulanceRepository extends JpaRepository<Ambulance, Long> {
    Optional<Ambulance> findByUnitId(String unitId);
    List<Ambulance> findByStatus(String status);
    List<Ambulance> findByHospitalName(String hospitalName);
}
