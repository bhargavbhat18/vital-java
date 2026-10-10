package com.vitaguard.backend_java.auth;

public class RegisterRequest {
    private String email;
    private String password;
    private String role; // PATIENT, FAMILY_MEMBER, DOCTOR, HOSPITAL_ADMIN, AMBULANCE_DRIVER, SYSTEM_ADMIN
    private String fullName;
    private Integer age;
    private String bloodGroup;
    private String address;
    private Double latitude;
    private Double longitude;

    private String phone;

    // Doctor details (optional, for patient role)
    private String doctorName;
    private String doctorPhone;
    private String doctorHospital;

    // Applicant Details for Doctor, Hospital Admin, Ambulance Driver
    private String medicalLicense;
    private String specialization;
    private String hospitalAffiliation;
    private String hospitalName;
    private String hospitalAddress;
    private String hospitalRegistrationNumber;
    private String drivingLicense;
    private String vehicleNumber;
    private String organization;

    // Getters and Setters
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }

    public String getBloodGroup() { return bloodGroup; }
    public void setBloodGroup(String bloodGroup) { this.bloodGroup = bloodGroup; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public String getDoctorName() { return doctorName; }
    public void setDoctorName(String doctorName) { this.doctorName = doctorName; }

    public String getDoctorPhone() { return doctorPhone; }
    public void setDoctorPhone(String doctorPhone) { this.doctorPhone = doctorPhone; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getDoctorHospital() { return doctorHospital; }
    public void setDoctorHospital(String doctorHospital) { this.doctorHospital = doctorHospital; }

    public String getMedicalLicense() { return medicalLicense; }
    public void setMedicalLicense(String medicalLicense) { this.medicalLicense = medicalLicense; }

    public String getSpecialization() { return specialization; }
    public void setSpecialization(String specialization) { this.specialization = specialization; }

    public String getHospitalAffiliation() { return hospitalAffiliation != null ? hospitalAffiliation : hospitalName; }
    public void setHospitalAffiliation(String hospitalAffiliation) { this.hospitalAffiliation = hospitalAffiliation; }

    public String getHospitalName() { return hospitalName != null ? hospitalName : hospitalAffiliation; }
    public void setHospitalName(String hospitalName) { this.hospitalName = hospitalName; }

    public String getHospitalAddress() { return hospitalAddress; }
    public void setHospitalAddress(String hospitalAddress) { this.hospitalAddress = hospitalAddress; }

    public String getHospitalRegistrationNumber() { return hospitalRegistrationNumber; }
    public void setHospitalRegistrationNumber(String hospitalRegistrationNumber) { this.hospitalRegistrationNumber = hospitalRegistrationNumber; }

    public String getDrivingLicense() { return drivingLicense; }
    public void setDrivingLicense(String drivingLicense) { this.drivingLicense = drivingLicense; }

    public String getVehicleNumber() { return vehicleNumber; }
    public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }

    public String getOrganization() { return organization; }
    public void setOrganization(String organization) { this.organization = organization; }
}
