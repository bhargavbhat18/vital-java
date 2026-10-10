package com.vitaguard.backend_java.admin;

import com.vitaguard.backend_java.ambulance.Ambulance;
import com.vitaguard.backend_java.ambulance.AmbulanceRepository;
import com.vitaguard.backend_java.auth.AuthResponse;
import com.vitaguard.backend_java.auth.AuthService;
import com.vitaguard.backend_java.auth.LoginRequest;
import com.vitaguard.backend_java.auth.RegisterRequest;
import com.vitaguard.backend_java.doctor.Doctor;
import com.vitaguard.backend_java.doctor.DoctorRepository;
import com.vitaguard.backend_java.emergency.EmergencyRequestRepository;
import com.vitaguard.backend_java.hospital.Hospital;
import com.vitaguard.backend_java.hospital.HospitalDepartmentRepository;
import com.vitaguard.backend_java.hospital.HospitalRepository;
import com.vitaguard.backend_java.security.JwtService;
import com.vitaguard.backend_java.user.User;
import com.vitaguard.backend_java.user.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RegistrationApprovalWorkflowTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private DoctorRepository doctorRepository;
    @Mock
    private HospitalRepository hospitalRepository;
    @Mock
    private HospitalDepartmentRepository departmentRepository;
    @Mock
    private AmbulanceRepository ambulanceRepository;
    @Mock
    private EmergencyRequestRepository emergencyRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private JwtService jwtService;
    @Mock
    private AuthenticationManager authenticationManager;

    private AuthService authService;
    private AdminController adminController;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, passwordEncoder, jwtService, authenticationManager, doctorRepository);
        adminController = new AdminController(
                userRepository, doctorRepository, hospitalRepository,
                departmentRepository, ambulanceRepository, emergencyRepository, passwordEncoder
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void mockSecurityContext(User user) {
        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn(user.getUid());
        SecurityContext securityContext = mock(SecurityContext.class);
        when(securityContext.getAuthentication()).thenReturn(auth);
        SecurityContextHolder.setContext(securityContext);
        when(userRepository.findByUid(user.getUid())).thenReturn(Optional.of(user));
    }

    @Test
    @DisplayName("Doctor registration sets PENDING status and requires admin approval")
    void testDoctorRegistrationCreatesPendingUser() {
        when(userRepository.existsByEmail("dr.sharma@apollo.com")).thenReturn(false);
        when(passwordEncoder.encode("DoctorPass123!")).thenReturn("hashed_pass");

        RegisterRequest req = new RegisterRequest();
        req.setEmail("dr.sharma@apollo.com");
        req.setPassword("DoctorPass123!");
        req.setFullName("Dr. Rohit Sharma");
        req.setRole("DOCTOR");
        req.setMedicalLicense("MCI-458920");
        req.setSpecialization("Cardiology");
        req.setHospitalAffiliation("Apollo Hospital");

        AuthResponse resp = authService.register(req);

        assertNotNull(resp);
        assertEquals("PENDING", resp.getStatus());
        assertTrue(resp.getMessage().contains("awaiting admin approval"));
        assertNull(resp.getToken(), "Pending user should not receive a JWT token immediately");

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();

        assertEquals("PENDING", saved.getStatus());
        assertEquals("DOCTOR", saved.getRole());
        assertEquals("MCI-458920", saved.getMedicalLicense());
        assertEquals("Cardiology", saved.getSpecialization());
        assertEquals("Apollo Hospital", saved.getHospitalAffiliation());
    }

    @Test
    @DisplayName("Hospital Admin registration sets PENDING status")
    void testHospitalAdminRegistrationCreatesPendingUser() {
        when(userRepository.existsByEmail("admin@manipal.com")).thenReturn(false);
        when(passwordEncoder.encode("ManipalAdmin123!")).thenReturn("hashed_pass");

        RegisterRequest req = new RegisterRequest();
        req.setEmail("admin@manipal.com");
        req.setPassword("ManipalAdmin123!");
        req.setFullName("Suresh Raina");
        req.setRole("HOSPITAL_ADMIN");
        req.setHospitalName("Manipal Hospital");
        req.setHospitalAddress("HAL Airport Road, Bengaluru");
        req.setHospitalRegistrationNumber("KA-HOSP-2024-88");

        AuthResponse resp = authService.register(req);

        assertNotNull(resp);
        assertEquals("PENDING", resp.getStatus());
        assertNull(resp.getToken());

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();

        assertEquals("PENDING", saved.getStatus());
        assertEquals("HOSPITAL_ADMIN", saved.getRole());
        assertEquals("Manipal Hospital", saved.getHospitalAffiliation());
        assertEquals("KA-HOSP-2024-88", saved.getHospitalRegistrationNumber());
    }

    @Test
    @DisplayName("Ambulance Driver registration sets PENDING status")
    void testAmbulanceDriverRegistrationCreatesPendingUser() {
        when(userRepository.existsByEmail("driver.singh@vitalguard.com")).thenReturn(false);
        when(passwordEncoder.encode("DriverPass123!")).thenReturn("hashed_pass");

        RegisterRequest req = new RegisterRequest();
        req.setEmail("driver.singh@vitalguard.com");
        req.setPassword("DriverPass123!");
        req.setFullName("Harpreet Singh");
        req.setRole("AMBULANCE_DRIVER");
        req.setDrivingLicense("DL-04-2018-99281");
        req.setVehicleNumber("KA-01-EA-5566");
        req.setOrganization("Apollo Hospital");

        AuthResponse resp = authService.register(req);

        assertNotNull(resp);
        assertEquals("PENDING", resp.getStatus());
        assertNull(resp.getToken());

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();

        assertEquals("PENDING", saved.getStatus());
        assertEquals("AMBULANCE_DRIVER", saved.getRole());
        assertEquals("DL-04-2018-99281", saved.getDrivingLicense());
        assertEquals("KA-01-EA-5566", saved.getVehicleNumber());
    }

    @Test
    @DisplayName("Patient and Family registration creates ACTIVE account with immediate JWT")
    void testPatientAndFamilyRegistrationCreatesActiveUserWithJwt() {
        when(userRepository.existsByEmail("patient@example.com")).thenReturn(false);
        when(passwordEncoder.encode("PatientPass123!")).thenReturn("hashed_pass");
        when(jwtService.generateToken(any(User.class))).thenReturn("mock_jwt_token_for_patient");

        RegisterRequest req = new RegisterRequest();
        req.setEmail("patient@example.com");
        req.setPassword("PatientPass123!");
        req.setFullName("John Doe");
        req.setRole("PATIENT");

        AuthResponse resp = authService.register(req);

        assertNotNull(resp);
        assertEquals("mock_jwt_token_for_patient", resp.getToken());
        assertEquals("PATIENT", resp.getRole());

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertEquals("ACTIVE", captor.getValue().getStatus());
    }

    @Test
    @DisplayName("Pending accounts are denied login with clear status message")
    void testPendingApplicantDeniedLogin() {
        User pendingUser = new User("DOC_123", "dr.pending@apollo.com", "hashed_pass", "DOCTOR");
        pendingUser.setStatus("PENDING");

        when(userRepository.findByEmail("dr.pending@apollo.com")).thenReturn(Optional.of(pendingUser));

        LoginRequest loginReq = new LoginRequest("dr.pending@apollo.com", "DoctorPass123!");
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(loginReq));
        assertTrue(ex.getMessage().contains("waiting for administrator approval"));
    }

    @Test
    @DisplayName("Rejected accounts are denied login with recorded reason")
    void testRejectedApplicantDeniedLoginWithReason() {
        User rejectedUser = new User("DOC_999", "dr.rejected@apollo.com", "hashed_pass", "DOCTOR");
        rejectedUser.setStatus("REJECTED");
        rejectedUser.setRejectionReason("Medical license verification failed with State Medical Council");

        when(userRepository.findByEmail("dr.rejected@apollo.com")).thenReturn(Optional.of(rejectedUser));

        LoginRequest loginReq = new LoginRequest("dr.rejected@apollo.com", "DoctorPass123!");
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.login(loginReq));
        assertTrue(ex.getMessage().contains("Medical license verification failed"));
    }

    @Test
    @DisplayName("System Admin approves pending Doctor, creating Doctor entity and linking Hospital")
    void testAdminApprovesDoctorAndLinksHospital() {
        User admin = new User("SYS_01", "admin@vitalguard.com", "hashed_pass", "SYSTEM_ADMIN");
        admin.setStatus("ACTIVE");
        mockSecurityContext(admin);

        Hospital hospital = new Hospital("Apollo Hospital", 12.934, 77.61, 50, 50, 10, 10, 4.5);
        hospital.setId(10L);
        when(hospitalRepository.findAll()).thenReturn(List.of(hospital));

        User doctorApplicant = new User("DOC_555", "dr.new@apollo.com", "hashed_pass", "DOCTOR");
        doctorApplicant.setId(200L);
        doctorApplicant.setFullName("Dr. Ananya Roy");
        doctorApplicant.setPhone("9880112233");
        doctorApplicant.setStatus("PENDING");
        doctorApplicant.setSpecialization("Neurology");
        doctorApplicant.setHospitalAffiliation("Apollo Hospital");

        when(userRepository.findById(200L)).thenReturn(Optional.of(doctorApplicant));
        when(doctorRepository.findByHospitalId(10L)).thenReturn(Collections.emptyList());
        when(doctorRepository.save(any(Doctor.class))).thenAnswer(inv -> {
            Doctor doc = inv.getArgument(0);
            doc.setId(50L);
            return doc;
        });

        ResponseEntity<?> resp = adminController.approveUser(200L);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("ACTIVE", doctorApplicant.getStatus());
        assertEquals(10L, doctorApplicant.getHospitalId());
        assertEquals(50L, doctorApplicant.getDoctorId());
        assertNotNull(doctorApplicant.getReviewedAt());
        assertEquals("SYS_01", doctorApplicant.getReviewedBy());

        verify(doctorRepository).save(any(Doctor.class));
        verify(userRepository).save(doctorApplicant);
    }

    @Test
    @DisplayName("System Admin approves pending Driver, creating/linking Ambulance record")
    void testAdminApprovesDriverAndLinksAmbulance() {
        User admin = new User("SYS_01", "admin@vitalguard.com", "hashed_pass", "SYSTEM_ADMIN");
        admin.setStatus("ACTIVE");
        mockSecurityContext(admin);

        User driverApplicant = new User("AMB_777", "driver.alex@vitalguard.com", "hashed_pass", "AMBULANCE_DRIVER");
        driverApplicant.setId(300L);
        driverApplicant.setFullName("Alex Morgan");
        driverApplicant.setStatus("PENDING");
        driverApplicant.setVehicleNumber("KA-05-EA-9900");
        driverApplicant.setOrganization("Apollo Hospital");

        when(userRepository.findById(300L)).thenReturn(Optional.of(driverApplicant));
        when(ambulanceRepository.findAll()).thenReturn(Collections.emptyList());
        when(ambulanceRepository.save(any(Ambulance.class))).thenAnswer(inv -> {
            Ambulance amb = inv.getArgument(0);
            amb.setId(88L);
            return amb;
        });

        ResponseEntity<?> resp = adminController.approveUser(300L);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("ACTIVE", driverApplicant.getStatus());
        assertEquals(88L, driverApplicant.getAmbulanceId());

        ArgumentCaptor<Ambulance> ambCaptor = ArgumentCaptor.forClass(Ambulance.class);
        verify(ambulanceRepository).save(ambCaptor.capture());
        assertEquals("KA-05-EA-9900", ambCaptor.getValue().getUnitId());
        assertEquals(driverApplicant, ambCaptor.getValue().getDriver());
    }

    @Test
    @DisplayName("System Admin rejects pending applicant with custom rejection reason")
    void testAdminRejectsApplicantWithReason() {
        User admin = new User("SYS_01", "admin@vitalguard.com", "hashed_pass", "SYSTEM_ADMIN");
        admin.setStatus("ACTIVE");
        mockSecurityContext(admin);

        User applicant = new User("DOC_888", "dr.fake@apollo.com", "hashed_pass", "DOCTOR");
        applicant.setId(400L);
        applicant.setStatus("PENDING");

        when(userRepository.findById(400L)).thenReturn(Optional.of(applicant));

        Map<String, String> body = Map.of("reason", "License number could not be authenticated with registry");
        ResponseEntity<?> resp = adminController.rejectUser(400L, body);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("REJECTED", applicant.getStatus());
        assertEquals("License number could not be authenticated with registry", applicant.getRejectionReason());
        assertEquals("SYS_01", applicant.getReviewedBy());
        verify(userRepository).save(applicant);
    }

    @Test
    @DisplayName("Duplicate email registration is strictly rejected")
    void testDuplicateEmailRegistrationRejection() {
        when(userRepository.existsByEmail("existing@apollo.com")).thenReturn(true);

        RegisterRequest req = new RegisterRequest();
        req.setEmail("existing@apollo.com");
        req.setPassword("Pass123456!");
        req.setFullName("Existing User");
        req.setRole("DOCTOR");
        req.setMedicalLicense("MCI-123456");
        req.setSpecialization("Cardiology");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> authService.register(req));
        assertTrue(ex.getMessage().contains("Email already in use"));
    }
}
