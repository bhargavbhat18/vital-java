import requests
import sys
import time

BASE_URL = "http://localhost:8000/api"

def print_step(step, name):
    print(f"\n{'='*70}\n[STEP {step}] {name}\n{'='*70}")

def run_e2e_tests():
    ts = int(time.time())
    
    # ----------------------------------------------------
    # 1. Patient Registration & Login
    # ----------------------------------------------------
    print_step(1, "Patient Registration & Immediate Login")
    patient_email = f"patient_{ts}@vitalguard.com"
    pat_payload = {
        "fullName": "Test Patient",
        "email": patient_email,
        "password": "Password123!",
        "role": "PATIENT",
        "age": 42,
        "bloodGroup": "O+",
        "address": "100 MG Road, Bengaluru",
        "latitude": 12.9716,
        "longitude": 77.5946
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=pat_payload)
    assert r.status_code == 200, f"Patient register failed: {r.text}"
    pat_data = r.json()
    assert "token" in pat_data and pat_data["token"], "Patient should receive immediate JWT token"
    print(f"✓ Patient registered and received JWT token: UID={pat_data.get('uid')}")

    # Patient login
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": patient_email, "password": "Password123!"})
    assert r.status_code == 200, f"Patient login failed: {r.text}"
    pat_token = r.json()["token"]
    print("✓ Patient login successful with active session")

    # ----------------------------------------------------
    # 2. Doctor Registration (PENDING approval)
    # ----------------------------------------------------
    print_step(2, "Doctor Registration (Applicant Submission)")
    doc_email = f"doctor_{ts}@vitalguard.com"
    doc_payload = {
        "fullName": "Dr. Vikas Khanna",
        "email": doc_email,
        "password": "DoctorPass123!",
        "role": "DOCTOR",
        "phone": "+91 9880112233",
        "medicalLicense": f"MCI-{ts}",
        "specialization": "Cardiology",
        "hospitalAffiliation": "Apollo Hospital"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=doc_payload)
    assert r.status_code == 200, f"Doctor register request failed: {r.text}"
    doc_data = r.json()
    assert doc_data.get("status") == "PENDING", f"Expected PENDING status, got {doc_data.get('status')}"
    assert "token" not in doc_data or not doc_data["token"], "Pending doctor must NOT receive JWT token"
    assert "awaiting admin approval" in doc_data.get("message", "").lower(), f"Unexpected message: {doc_data.get('message')}"
    print(f"✓ Doctor registered with PENDING approval status: {doc_data.get('message')}")

    # ----------------------------------------------------
    # 3. Hospital Admin Registration (PENDING approval)
    # ----------------------------------------------------
    print_step(3, "Hospital Admin Registration (Applicant Submission)")
    hosp_admin_email = f"hospadmin_{ts}@vitalguard.com"
    hosp_admin_payload = {
        "fullName": "Dr. Rajesh Sharma",
        "email": hosp_admin_email,
        "password": "HospAdminPass123!",
        "role": "HOSPITAL_ADMIN",
        "phone": "+91 9880445566",
        "hospitalAffiliation": "Apollo Hospital",
        "hospitalAddress": "154/11 Bannerghatta Road, Bengaluru",
        "hospitalRegistrationNumber": f"HOSP-REG-{ts}"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=hosp_admin_payload)
    assert r.status_code == 200, f"Hospital Admin register failed: {r.text}"
    hosp_data = r.json()
    assert hosp_data.get("status") == "PENDING", f"Expected PENDING status, got {hosp_data.get('status')}"
    print(f"✓ Hospital Admin registered with PENDING approval status")

    # ----------------------------------------------------
    # 4. Ambulance Driver Registration (PENDING approval)
    # ----------------------------------------------------
    print_step(4, "Ambulance Driver Registration (Applicant Submission)")
    driver_email = f"driver_{ts}@vitalguard.com"
    driver_payload = {
        "fullName": "Gurpreet Singh",
        "email": driver_email,
        "password": "DriverPass123!",
        "role": "AMBULANCE_DRIVER",
        "phone": "+91 9880998877",
        "drivingLicense": f"DL-KA-{ts}",
        "vehicleNumber": f"KA-01-AMB-{ts % 1000}",
        "organization": "Apollo Hospital"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=driver_payload)
    assert r.status_code == 200, f"Driver register failed: {r.text}"
    driver_data = r.json()
    assert driver_data.get("status") == "PENDING", f"Expected PENDING status, got {driver_data.get('status')}"
    print(f"✓ Ambulance Driver registered with PENDING approval status")

    # ----------------------------------------------------
    # 5. Pending Doctor & Hosp Admin Login Attempts (Must be denied)
    # ----------------------------------------------------
    print_step(5, "Pending Accounts Login Attempt (Must be Blocked)")
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": doc_email, "password": "DoctorPass123!"})
    assert r.status_code in [400, 401, 403], f"Expected login denial for pending doctor, got {r.status_code}"
    err_msg = r.json().get("error", "")
    assert "waiting for administrator approval" in err_msg.lower() or "approval" in err_msg.lower(), f"Unexpected error msg: {err_msg}"
    print(f"✓ Pending doctor successfully blocked from login: '{err_msg}'")

    # ----------------------------------------------------
    # 6. Rejected Applicant Flow
    # ----------------------------------------------------
    print_step(6, "Rejection Workflow Test")
    reject_email = f"fake_applicant_{ts}@vitalguard.com"
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "fullName": "Fake Applicant",
        "email": reject_email,
        "password": "Password123!",
        "role": "DOCTOR",
        "medicalLicense": "INVALID-000",
        "specialization": "Cardiology"
    })
    assert r.status_code == 200

    # ----------------------------------------------------
    # 7. System Admin Authentication & Review
    # ----------------------------------------------------
    print_step(7, "System Admin Authentication & Application Review")
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": "admin@vitaguard.com", "password": "password"})
    if r.status_code != 200:
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": "SYS_01", "password": "password"})
    assert r.status_code == 200, f"System admin login failed: {r.text}"
    admin_token = r.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("✓ System Admin authenticated")

    # Fetch registration requests
    r = requests.get(f"{BASE_URL}/admin/registration-requests?status=PENDING", headers=admin_headers)
    assert r.status_code == 200, f"Failed to list registration requests: {r.text}"
    pending_list = r.json()
    print(f"✓ System Admin fetched {len(pending_list)} pending registration requests")

    # Find our submitted applicants
    doc_app = next((u for u in pending_list if u.get("email") == doc_email), None)
    hosp_app = next((u for u in pending_list if u.get("email") == hosp_admin_email), None)
    driver_app = next((u for u in pending_list if u.get("email") == driver_email), None)
    reject_app = next((u for u in pending_list if u.get("email") == reject_email), None)

    assert doc_app is not None, f"Submitted doctor {doc_email} not found in pending list"
    assert hosp_app is not None, f"Submitted hosp admin {hosp_admin_email} not found in pending list"
    assert driver_app is not None, f"Submitted driver {driver_email} not found in pending list"
    assert reject_app is not None, f"Reject applicant {reject_email} not found in pending list"

    # Reject fake applicant with custom reason
    rejection_reason = "Medical registration could not be verified with State Medical Council"
    r = requests.post(f"{BASE_URL}/admin/users/{reject_app['id']}/reject", json={"reason": rejection_reason}, headers=admin_headers)
    assert r.status_code == 200, f"Rejection failed: {r.text}"
    print(f"✓ Applicant rejected with reason: '{rejection_reason}'")

    # Verify rejected user cannot log in and sees reason
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": reject_email, "password": "Password123!"})
    assert r.status_code in [400, 401, 403]
    err = r.json().get("error", "")
    assert rejection_reason in err, f"Expected rejection reason '{rejection_reason}' in error, got: '{err}'"
    print(f"✓ Rejected user blocked from login with explicit rejection message: '{err}'")

    # Approve Hospital Admin
    print_step(8, "Approving Hospital Admin & Verifying Hospital Link")
    r = requests.post(f"{BASE_URL}/admin/users/{hosp_app['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, f"Hospital admin approval failed: {r.text}"
    approved_hosp_user = r.json()["user"]
    assert approved_hosp_user.get("status") == "ACTIVE"
    assigned_hosp_id = approved_hosp_user.get("hospitalId")
    assert assigned_hosp_id is not None, "Hospital Admin must have hospitalId linked"
    print(f"✓ Hospital Admin approved & linked: Hospital ID={assigned_hosp_id}")

    # Hospital Admin can now log in
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": hosp_admin_email, "password": "HospAdminPass123!"})
    assert r.status_code == 200, f"Approved hospital admin login failed: {r.text}"
    hosp_admin_token = r.json()["token"]
    hosp_admin_headers = {"Authorization": f"Bearer {hosp_admin_token}"}
    print("✓ Approved Hospital Admin logged in successfully")

    # Approve Doctor
    print_step(9, "Approving Doctor & Verifying Hospital/Doctor Association")
    r = requests.post(f"{BASE_URL}/admin/users/{doc_app['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, f"Doctor approval failed: {r.text}"
    approved_doc_user = r.json()["user"]
    assert approved_doc_user.get("status") == "ACTIVE"
    assert approved_doc_user.get("hospitalId") is not None, "Doctor must have hospitalId linked"
    assert approved_doc_user.get("doctorId") is not None, "Doctor must have doctorId linked"
    print(f"✓ Doctor approved & linked: Hospital ID={approved_doc_user.get('hospitalId')}, Doctor ID={approved_doc_user.get('doctorId')}")

    # Doctor can now log in
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": doc_email, "password": "DoctorPass123!"})
    assert r.status_code == 200, f"Approved doctor login failed: {r.text}"
    doc_token = r.json()["token"]
    print("✓ Approved doctor logged in successfully with JWT session")

    # Approve Ambulance Driver
    print_step(10, "Approving Driver & Linking Ambulance Unit")
    r = requests.post(f"{BASE_URL}/admin/users/{driver_app['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, f"Driver approval failed: {r.text}"
    approved_driver_user = r.json()["user"]
    assert approved_driver_user.get("status") == "ACTIVE"
    assert approved_driver_user.get("ambulanceId") is not None, "Driver must have ambulanceId linked"
    print(f"✓ Driver approved & linked: Ambulance ID={approved_driver_user.get('ambulanceId')}")

    # Driver can now log in
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": driver_email, "password": "DriverPass123!"})
    assert r.status_code == 200, f"Approved driver login failed: {r.text}"
    driver_token = r.json()["token"]
    driver_headers = {"Authorization": f"Bearer {driver_token}"}
    print("✓ Approved driver logged in successfully with JWT session")

    # Driver is on duty and updates location
    r = requests.post(f"{BASE_URL}/ambulance/location", json={"latitude": 12.9716, "longitude": 77.5946}, headers=driver_headers)
    assert r.status_code == 200, f"Driver location update failed: {r.text}"
    print("✓ Driver on-duty and updated location to GPS (12.9716, 77.5946)")

    # ----------------------------------------------------
    # 11. End-to-End Emergency Dispatch to Driver
    # ----------------------------------------------------
    print_step(11, "Emergency Creation, Hospital Acceptance & Driver Dispatch")
    pat_headers = {"Authorization": f"Bearer {pat_token}"}
    sos_payload = {
        "alert_message": "Severe chest tightness and tachycardia",
        "description": "Patient experiencing severe chest pain and breathlessness",
        "symptoms": ["chest pain", "tachycardia"],
        "severity": "CRITICAL",
        "heartRate": 142.0,
        "bloodPressure": "170/110",
        "oxygenLevel": 91.0,
        "location": { "lat": 12.9716, "lng": 77.5946 },
        "requiresAmbulance": True
    }
    r = requests.post(f"{BASE_URL}/emergency/sos", json=sos_payload, headers=pat_headers)
    assert r.status_code in [200, 201], f"Emergency trigger failed: {r.text}"
    sos_data = r.json()
    sos_id = sos_data["id"]
    assigned_hospital_id = sos_data.get("hospitalId")
    print(f"✓ Emergency triggered: SOS-{sos_id}, Status={sos_data.get('status')}, Assigned Hospital={assigned_hospital_id}")

    # Accept emergency via system admin or hospital admin to trigger ambulance assignment
    r = requests.post(f"{BASE_URL}/emergency/{sos_id}/accept", headers=admin_headers)
    assert r.status_code == 200, f"Hospital accept emergency failed: {r.text}"
    print(f"✓ Hospital accepted emergency SOS-{sos_id}")

    # Driver fetches pending requests
    time.sleep(1)
    r = requests.get(f"{BASE_URL}/ambulance/pending-requests", headers=driver_headers)
    assert r.status_code == 200, f"Pending requests fetch failed: {r.text}"
    pending_driver_reqs = r.json()
    assert len(pending_driver_reqs) > 0, "Driver should receive pending ambulance request for the emergency"
    active_amb_req = next((req for req in pending_driver_reqs if req.get("emergencyId") == sos_id), pending_driver_reqs[0])
    print(f"✓ Driver received pending emergency dispatch request ID={active_amb_req['id']} for SOS-{active_amb_req['emergencyId']}")

    # Driver accepts request
    r = requests.post(f"{BASE_URL}/ambulance/requests/{active_amb_req['id']}/accept", headers=driver_headers)
    assert r.status_code == 200, f"Accept request failed: {r.text}"
    print(f"✓ Driver accepted dispatch request {active_amb_req['id']}")

    # Driver updates progress: EN_ROUTE_TO_PATIENT -> ARRIVED_AT_PATIENT -> PATIENT_PICKED_UP -> ARRIVED_AT_HOSPITAL
    print_step(12, "Driver Status Progression & Live Tracking")
    statuses = ["EN_ROUTE_TO_PATIENT", "ARRIVED_AT_PATIENT", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"]
    for st in statuses:
        r = requests.post(f"{BASE_URL}/ambulance/status", json={"status": st, "latitude": 12.9716, "longitude": 77.5946}, headers=driver_headers)
        assert r.status_code == 200, f"Update status to {st} failed: {r.text}"
        print(f"✓ Driver progressed status to {st}")

    print("\n" + "="*70)
    print("🎯 ALL REGISTRATION, APPROVAL, AUTHENTICATION & AMBULANCE DISPATCH TESTS PASSED!")
    print("="*70 + "\n")

if __name__ == "__main__":
    try:
        run_e2e_tests()
    except Exception as e:
        print(f"\n❌ TEST FAILURE: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

