package com.vitaguard.backend_java.ambulance;

import com.vitaguard.backend_java.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AmbulanceRepository extends JpaRepository<Ambulance, Long> {
    Optional<Ambulance> findByUnitId(String unitId);
    List<Ambulance> findByStatus(String status);
    List<Ambulance> findByStatusIn(List<String> statuses);
    List<Ambulance> findByHospitalName(String hospitalName);
    Optional<Ambulance> findByDriverId(Long driverId);
}
