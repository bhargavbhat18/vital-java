package com.vitaguard.backend_java.auth;

import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuthenticationManager authenticationManager
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already in use");
        }

        // Generate a clean UID for compatibility (e.g. LKT02, LKT03, etc., or standard format)
        String prefix = "USR";
        if ("PATIENT".equals(request.getRole())) prefix = "PAT";
        else if ("DOCTOR".equals(request.getRole())) prefix = "DOC";
        else if ("HOSPITAL_ADMIN".equals(request.getRole())) prefix = "HSP";
        
        String uid = prefix + "_" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();

        User user = new User(
                uid,
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                request.getRole()
        );
        user.setFullName(request.getFullName());
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
        return new AuthResponse(jwtToken, user.getUid(), user.getEmail(), user.getRole(), user.getFullName());
    }

    public AuthResponse login(LoginRequest request) {
        // Find user by email or UID
        User user = userRepository.findByEmail(request.getEmail())
                .or(() -> userRepository.findByUid(request.getEmail()))
                .orElseThrow(() -> new IllegalArgumentException("Invalid email/UID or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email/UID or password");
        }

        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        user.getUid(),
                        request.getPassword()
                )
        );

        String jwtToken = jwtService.generateToken(user);
        return new AuthResponse(jwtToken, user.getUid(), user.getEmail(), user.getRole(), user.getFullName());
    }
}
