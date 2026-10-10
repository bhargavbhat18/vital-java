package com.vitaguard.backend_java.auth;

import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final com.vitaguard.backend_java.doctor.DoctorRepository doctorRepository;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthenticationManager authenticationManager
    ) {
        this(userRepository, passwordEncoder, jwtService, authenticationManager, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthenticationManager authenticationManager,
            @org.springframework.context.annotation.Lazy com.vitaguard.backend_java.doctor.DoctorRepository doctorRepository
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
        this.doctorRepository = doctorRepository;
    }

    public AuthResponse register(RegisterRequest request) {
        if (request.getEmail() == null || request.getEmail().trim().isEmpty() || !request.getEmail().contains("@")) {
            throw new IllegalArgumentException("A valid email address is required");
        }
        String email = request.getEmail().trim().toLowerCase();

        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already in use");
        }

        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new IllegalArgumentException("Password must be at least 6 characters");
        }

        if (request.getFullName() == null || request.getFullName().trim().isEmpty()) {
            throw new IllegalArgumentException("Full name is required");
        }

        String role = request.getRole();
        if (role == null || role.trim().isEmpty()) {
            role = "PATIENT";
        }
        role = role.trim().toUpperCase();

        if ("SYSTEM_ADMIN".equals(role) || "ADMIN".equals(role)) {
            throw new IllegalArgumentException("System Admin accounts cannot be self-registered.");
        }

        if (!List.of("PATIENT", "FAMILY_MEMBER", "DOCTOR", "HOSPITAL_ADMIN", "AMBULANCE_DRIVER").contains(role)) {
            throw new IllegalArgumentException("Invalid registration role: " + role);
        }

        // Validate role-specific required details
        if ("DOCTOR".equals(role)) {
            if (request.getMedicalLicense() == null || request.getMedicalLicense().trim().isEmpty()) {
                throw new IllegalArgumentException("Medical registration / license number is required for doctor registration");
            }
            if (request.getSpecialization() == null || request.getSpecialization().trim().isEmpty()) {
                throw new IllegalArgumentException("Specialization is required for doctor registration");
            }
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            String hospName = request.getHospitalName() != null ? request.getHospitalName() : request.getHospitalAffiliation();
            if (hospName == null || hospName.trim().isEmpty()) {
                throw new IllegalArgumentException("Hospital name is required for hospital admin registration");
            }
        } else if ("AMBULANCE_DRIVER".equals(role)) {
            if (request.getDrivingLicense() == null || request.getDrivingLicense().trim().isEmpty()) {
                throw new IllegalArgumentException("Driving license details are required for ambulance driver registration");
            }
        }

        // Generate clean UID
        String prefix;
        switch (role) {
            case "PATIENT" -> prefix = "PAT";
            case "FAMILY_MEMBER" -> prefix = "FAM";
            case "DOCTOR" -> prefix = "DOC";
            case "HOSPITAL_ADMIN" -> prefix = "HSP";
            case "AMBULANCE_DRIVER" -> prefix = "AMB";
            default -> prefix = "USR";
        }
        String uid = prefix + "_" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();

        User user = new User(
                uid,
                email,
                passwordEncoder.encode(request.getPassword()),
                role
        );

        user.setFullName(request.getFullName().trim());
        user.setPhone(request.getPhone() != null ? request.getPhone().trim() : request.getDoctorPhone());
        user.setRegisteredAt(java.time.LocalDateTime.now());

        // For Patient and Family - immediate active
        if ("PATIENT".equals(role) || "FAMILY_MEMBER".equals(role)) {
            user.setStatus("ACTIVE");
            user.setAge(request.getAge());
            user.setBloodGroup(request.getBloodGroup());
            user.setAddress(request.getAddress());
            user.setLatitude(request.getLatitude());
            user.setLongitude(request.getLongitude());
            user.setDoctorName(request.getDoctorName());
            user.setDoctorPhone(request.getDoctorPhone());
            user.setDoctorHospital(request.getDoctorHospital());

            userRepository.save(user);
            String jwtToken = jwtService.generateToken(user);
            return new AuthResponse(jwtToken, user.getUid(), user.getEmail(), user.getRole(), user.getFullName(), user.getHospitalId(), user.getAmbulanceId(), user.getId(), user.getDoctorId());
        }

        // For privileged applicant roles (DOCTOR, HOSPITAL_ADMIN, AMBULANCE_DRIVER) -> PENDING approval
        user.setStatus("PENDING");
        user.setAddress(request.getAddress() != null ? request.getAddress() : request.getHospitalAddress());
        user.setLatitude(request.getLatitude());
        user.setLongitude(request.getLongitude());

        if ("DOCTOR".equals(role)) {
            user.setMedicalLicense(request.getMedicalLicense() != null ? request.getMedicalLicense().trim() : null);
            user.setSpecialization(request.getSpecialization() != null ? request.getSpecialization().trim() : null);
            user.setHospitalAffiliation(request.getHospitalAffiliation() != null ? request.getHospitalAffiliation().trim() : request.getDoctorHospital());
            user.setDoctorHospital(user.getHospitalAffiliation());
        } else if ("HOSPITAL_ADMIN".equals(role)) {
            String hospName = request.getHospitalName() != null ? request.getHospitalName().trim() : request.getHospitalAffiliation();
            user.setHospitalAffiliation(hospName != null ? hospName.trim() : null);
            user.setHospitalAddress(request.getHospitalAddress() != null ? request.getHospitalAddress().trim() : request.getAddress());
            user.setHospitalRegistrationNumber(request.getHospitalRegistrationNumber() != null ? request.getHospitalRegistrationNumber().trim() : null);
        } else if ("AMBULANCE_DRIVER".equals(role)) {
            user.setDrivingLicense(request.getDrivingLicense() != null ? request.getDrivingLicense().trim() : null);
            user.setVehicleNumber(request.getVehicleNumber() != null ? request.getVehicleNumber().trim() : null);
            user.setOrganization(request.getOrganization() != null ? request.getOrganization().trim() : request.getHospitalAffiliation());
            user.setHospitalAffiliation(user.getOrganization());
        }

        userRepository.save(user);

        return new AuthResponse(
                "Registration submitted successfully. Your account is awaiting admin approval.",
                "PENDING",
                user.getRole(),
                user.getEmail(),
                user.getFullName(),
                user.getUid()
        );
    }

    public AuthResponse login(LoginRequest request) {
        if (request.getEmail() == null || request.getEmail().trim().isEmpty()) {
            throw new IllegalArgumentException("Email/UID is required");
        }
        String identifier = request.getEmail().trim().toLowerCase();

        // 1 & 2. Find user by email or UID
        User user = userRepository.findByEmail(identifier)
                .or(() -> userRepository.findByUid(request.getEmail().trim()))
                .orElseThrow(() -> new IllegalArgumentException("Your account has not been registered by the system administrator."));

        // 3. Verify account status before authenticating
        String status = user.getStatus();
        if (status == null || !"ACTIVE".equalsIgnoreCase(status)) {
            if ("PENDING".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account is waiting for administrator approval.");
            } else if ("REJECTED".equalsIgnoreCase(status)) {
                if (user.getRejectionReason() != null && !user.getRejectionReason().trim().isEmpty()) {
                    throw new IllegalArgumentException("Your account registration was rejected: " + user.getRejectionReason().trim());
                } else {
                    throw new IllegalArgumentException("Your account registration was rejected.");
                }
            } else if ("SUSPENDED".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account has been suspended. Contact system administrator.");
            } else if ("DEACTIVATED".equalsIgnoreCase(status)) {
                throw new IllegalArgumentException("Your account is currently inactive.");
            } else {
                throw new IllegalArgumentException("Your account has not been registered by the system administrator.");
            }
        }

        // 4. Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email/UID or password");
        }

        // 5. Authenticate session with Spring Security
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        user.getUid(),
                        request.getPassword()
                )
        );

        // 6. Resolve doctor profile if user is DOCTOR
        Long doctorId = user.getDoctorId();
        if (doctorId == null && "DOCTOR".equals(user.getRole()) && doctorRepository != null && user.getHospitalId() != null) {
            doctorId = doctorRepository.findByHospitalId(user.getHospitalId()).stream()
                    .filter(d -> d.getName().equalsIgnoreCase(user.getFullName()) || (d.getPhone() != null && d.getPhone().equals(user.getPhone())))
                    .map(com.vitaguard.backend_java.doctor.Doctor::getId)
                    .findFirst()
                    .orElse(null);
            if (doctorId != null) {
                user.setDoctorId(doctorId);
                userRepository.save(user);
            }
        }

        // 7. Generate JWT token
        String jwtToken = jwtService.generateToken(user);
        return new AuthResponse(jwtToken, user.getUid(), user.getEmail(), user.getRole(), user.getFullName(), user.getHospitalId(), user.getAmbulanceId(), user.getId(), doctorId != null ? doctorId : user.getId());
    }
}
