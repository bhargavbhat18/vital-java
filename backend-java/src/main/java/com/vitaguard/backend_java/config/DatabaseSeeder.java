package com.vitaguard.backend_java.config;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartment;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    private final HospitalRepository hospitalRepository;
    private final HospitalDepartmentRepository hospitalDepartmentRepository;
    private final DoctorRepository doctorRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DatabaseSeeder(
            HospitalRepository hospitalRepository,
            HospitalDepartmentRepository hospitalDepartmentRepository,
            DoctorRepository doctorRepository,
            AmbulanceRepository ambulanceRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.hospitalRepository = hospitalRepository;
        this.hospitalDepartmentRepository = hospitalDepartmentRepository;
        this.doctorRepository = doctorRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws Exception {
        // Seed default user for testing
        if (!userRepository.existsByUid("LKT01")) {
            User testUser = new User("LKT01", "patient@vitaguard.com", passwordEncoder.encode("password"), "PATIENT");
            testUser.setFullName("Rahul Sharma");
            testUser.setAge(45);
            testUser.setBloodGroup("O+");
            testUser.setAddress("Bangalore City Center");
            testUser.setLatitude(12.9716);
            testUser.setLongitude(77.5946);
            userRepository.save(testUser);
            System.out.println("[SEED] Test user LKT01 seeded successfully.");
        }

        if (hospitalRepository.count() == 0) {
            // Seed Apollo Hospital
            Hospital apollo = new Hospital("Apollo Hospital", 12.9252, 77.6011, 100, 85, 30, 12, 4.8);
            hospitalRepository.save(apollo);
            seedDepartments(apollo, List.of("Cardiology", "Trauma", "General Medicine", "Emergency"));
            seedDoctor(apollo, "Dr. Anirudh Kulkarni", "9880123456", "Cardiology", "Cardiology");
            seedDoctor(apollo, "Dr. Sarah D'souza", "9880654321", "Trauma Care", "Trauma");
            seedDoctor(apollo, "Dr. Ramesh Babu", "9887766554", "Internal Medicine", "General Medicine");

            // Seed Fortis Hospital
            Hospital fortis = new Hospital("Fortis Hospital", 12.9611, 77.6387, 80, 40, 25, 18, 4.5);
            hospitalRepository.save(fortis);
            seedDepartments(fortis, List.of("Orthopedics", "General Medicine", "Trauma", "Emergency"));
            seedDoctor(fortis, "Dr. Kavita Nair", "9770112233", "Orthopedics", "Orthopedics");
            seedDoctor(fortis, "Dr. Michael Chen", "9772233445", "General Surgery", "General Medicine");
            seedDoctor(fortis, "Dr. Priyanshu Jha", "9773344556", "Emergency Medicine", "Emergency");

            // Seed Manipal Hospital
            Hospital manipal = new Hospital("Manipal Hospital", 12.9591, 77.6473, 120, 110, 40, 35, 4.7);
            hospitalRepository.save(manipal);
            seedDepartments(manipal, List.of("Neurology", "Pediatrics", "General Medicine", "Emergency"));
            seedDoctor(manipal, "Dr. Sumanth Shetty", "9661122334", "Neurology", "Neurology");
            seedDoctor(manipal, "Dr. Deepa Rao", "9662233445", "Pediatrics", "Pediatrics");
            seedDoctor(manipal, "Dr. Aditi Verma", "9663344556", "General Physician", "General Medicine");

            // Seed Narayana Health
            Hospital narayana = new Hospital("Narayana Health", 12.8938, 77.5949, 150, 10, 50, 5, 4.9);
            hospitalRepository.save(narayana);
            seedDepartments(narayana, List.of("Oncology", "Cardiology", "Pulmonology", "Emergency"));
            seedDoctor(narayana, "Dr. AR Reddy", "9551122334", "Oncology", "Oncology");
            seedDoctor(narayana, "Dr. Vikram Singh", "9552233445", "Cardiac Surgery", "Cardiology");
            seedDoctor(narayana, "Dr. Sneha Patil", "9553344556", "Cardiology", "Cardiology");

            // Seed St. John's Hospital
            Hospital stJohns = new Hospital("St. John's Hospital", 12.9353, 77.6174, 200, 150, 60, 40, 4.3);
            hospitalRepository.save(stJohns);
            seedDepartments(stJohns, List.of("General Medicine", "Emergency", "Trauma"));
            seedDoctor(stJohns, "Dr. John Doe", "9441122334", "Emergency Medicine", "Emergency");
            seedDoctor(stJohns, "Dr. Maria Garcia", "9442233445", "Trauma Surgery", "Trauma");
            seedDoctor(stJohns, "Dr. Rajesh Khanna", "9443344556", "General Physician", "General Medicine");

            System.out.println("[SEED] Seeded 5 hospitals, departments, and doctors successfully.");
        }

        if (ambulanceRepository.count() == 0) {
            // Seed ambulances located initially at respective hospitals
            ambulanceRepository.save(new Ambulance("AMB-01", "Apollo Hospital", 12.9252, 77.6011));
            ambulanceRepository.save(new Ambulance("AMB-02", "Fortis Hospital", 12.9611, 77.6387));
            ambulanceRepository.save(new Ambulance("AMB-03", "Manipal Hospital", 12.9591, 77.6473));
            ambulanceRepository.save(new Ambulance("AMB-04", "Narayana Health", 12.8938, 77.5949));
            ambulanceRepository.save(new Ambulance("AMB-05", "St. John's Hospital", 12.9353, 77.6174));

            System.out.println("[SEED] Seeded 5 ambulances successfully.");
        }
    }

    private void seedDepartments(Hospital hospital, List<String> activeSpecs) {
        // Standard list of departments to initialize
        List<String> allDeps = List.of("Emergency", "Cardiology", "Neurology", "Pulmonology", "Orthopedics", "Trauma", "General Medicine", "Pediatrics");
        for (String depName : allDeps) {
            boolean active = activeSpecs.contains(depName) || "Emergency".equals(depName);
            HospitalDepartment dep = new HospitalDepartment(
                    hospital,
                    depName,
                    active, // available
                    active, // emergencyService
                    active, // acceptingPatients
                    hospital.getAvailableBeds() / 8,
                    hospital.getTotalBeds() / 8,
                    hospital.getAvailableDoctors() / 8,
                    hospital.getTotalDoctors() / 8
            );
            hospitalDepartmentRepository.save(dep);
        }
    }

    private void seedDoctor(Hospital hospital, String name, String phone, String specialization, String depName) {
        Doctor doc = new Doctor(hospital, name, phone, specialization, depName, true, true);
        doctorRepository.save(doc);
    }
}
