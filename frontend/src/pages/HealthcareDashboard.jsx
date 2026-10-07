import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API, { isActiveEmergency, useApiResource } from '../services/api';
import { useRealtimeRefresh } from '../services/websocket';
import GoogleMapTracking from '../components/GoogleMapTracking';
import EmergencyDetails from '../components/EmergencyDetails';

const HealthcareDashboard = () => {
  const { user, logout } = useAuth();
  const role = user?.role; // DOCTOR, HOSPITAL_ADMIN, AMBULANCE_DRIVER, ADMIN, SYSTEM_ADMIN

  const [activeTab, setActiveTab] = useState('');

  // Database states
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);
  const [selectedPatientUid, setSelectedPatientUid] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const { connected: wsConnected, revision, refresh, tracking: _tracking, ambulanceLocation } = useRealtimeRefresh(user?.uid, selectedEmergencyId, selectedPatientUid);
  const { data: queue } = useApiResource(user ? '/hospital/emergencies' : null, revision);
  const emergencies = Array.isArray(queue) ? queue : [];
  const selectedEmergency = emergencies.find(emergency => emergency.id === selectedEmergencyId);
  const activeEmergencies = emergencies.filter(isActiveEmergency);
  const setSelectedEmergency = emergency => {
    setSelectedEmergencyId(emergency?.id ?? null);
    setSelectedPatientUid(emergency?.patientUid ?? null);
  };

  // Store role-specific IDs for WebSocket topics
  useEffect(() => {
    if (user) {
      localStorage.setItem('userRole', role || '');
      if (role === 'HOSPITAL_ADMIN' && user.hospitalId) {
        localStorage.setItem('hospitalId', user.hospitalId.toString());
      } else if (role === 'DOCTOR' && user.id) {
        localStorage.setItem('doctorId', user.id.toString());
      } else if (role === 'AMBULANCE_DRIVER') {
        if (user.ambulanceId) localStorage.setItem('ambulanceId', user.ambulanceId.toString());
        if (user.id) localStorage.setItem('userId', user.id.toString());
      }
    }
  }, [user, role]);

  // Set default tabs based on role
  useEffect(() => {
    if (role === 'DOCTOR') setActiveTab('cases');
    else if (role === 'HOSPITAL_ADMIN') setActiveTab('queue');
    else if (role === 'AMBULANCE_DRIVER') setActiveTab('requests');
    else if (role === 'ADMIN' || role === 'SYSTEM_ADMIN') setActiveTab('hospitals');
  }, [role]);

  const loadHospitals = async () => {
    try {
      const res = await API.get('/hospital');
      setHospitals(res.data);
      if (res.data.length > 0) {
        setSelectedHospital(res.data[0]);
      }
    } catch {
      setHospitals([]);
    }
  };

  const loadHospitalDetails = async (hospitalName) => {
    try {
      const res = await API.get(`/hospital/departments/${encodeURIComponent(hospitalName)}`);
      setDepartments(res.data.departments || []);
    } catch {
      setDepartments([]);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await API.get('/emergencies/doctors/available');
      setDoctors(res.data);
    } catch {
      setDoctors([]);
    }
  };

  const loadAmbulances = async () => {
    try {
      const res = await API.get('/emergencies/ambulances/nearby?lat=12.9716&lng=77.5946');
      setAmbulances(res.data);
    } catch {
      setAmbulances([]);
    }
  };

  const loadDriverData = useCallback(async () => {
    try {
      // Load current job
      const jobRes = await API.get('/ambulance/current-job');
      if (jobRes.data.ambulance) {
        setCurrentJob(jobRes.data);
      }
      // Load pending requests
      const reqRes = await API.get('/ambulance/pending-requests');
      setPendingRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
    } catch (error) {
      console.error('Failed to load driver data:', error);
    }
  }, []);

  const loadEmergencies = refresh;

  useEffect(() => {
    if (user) {
      loadHospitals();
      loadDoctors();
      loadAmbulances();
      if (role === 'AMBULANCE_DRIVER') {
        loadDriverData();
      }
    }
  }, [user, loadDriverData]);

  useEffect(() => {
    if (selectedHospital) {
      loadHospitalDetails(selectedHospital.name);
    }
  }, [selectedHospital]);

  // Refresh driver data when revision changes (WebSocket updates)
  useEffect(() => {
    if (role === 'AMBULANCE_DRIVER') {
      loadDriverData();
    }
  }, [revision, loadDriverData]);

  // Start GPS tracking when driver has an active job
  const [isTracking, setIsTracking] = useState(false);
  const startGpsTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser');
      return;
    }
    
    setIsTracking(true);
    
    // Request permission and start watching position
    navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await API.post('/ambulance/location', { latitude, longitude });
        } catch (error) {
          console.error('Failed to send location update:', error);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          alert('Location permission denied. Please enable location access for live tracking.');
          setIsTracking(false);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, []);

  const stopGpsTracking = useCallback(() => {
    setIsTracking(false);
    // Note: In a real implementation, you'd store the watchId and clear it
  }, []);

  const acceptCase = async (id) => {
    try {
      const res = await API.post(`/emergency/${id}/accept`);
      alert('Emergency Incident Accepted. Ambulance dispatched.');
      loadEmergencies();
      setSelectedEmergency(res.data);
      if (selectedHospital) {
        loadHospitalDetails(selectedHospital.name);
      }
    } catch (error) {
      alert('Failed to accept: ' + (error.response?.data?.error || error.message));
    }
  };

  const resolveCase = async (id) => {
    try {
      await API.post(`/emergencies/${id}/resolve`);
      alert('Case marked resolved successfully. Restored resources.');
      setSelectedEmergency(null);
      loadEmergencies();
      loadAmbulances();
      if (selectedHospital) {
        loadHospitalDetails(selectedHospital.name);
      }
    } catch {
      alert('Failed to resolve case.');
    }
  };

  const toggleDoctor = async (doc, field) => {
    const updatedDoc = {
      id: doc.id,
      onDuty: field === 'onDuty' ? !doc.onDuty : doc.onDuty,
      availableForEmergency: field === 'availableForEmergency' ? !doc.availableForEmergency : doc.availableForEmergency
    };

    try {
      await API.post('/hospital/doctors/status', updatedDoc);
      loadDoctors();
    } catch {
      alert('Failed to update doctor status.');
    }
  };

  const updateBeds = async (dep, offset) => {
    const updatedDep = {
      id: dep.id,
      available: dep.available,
      emergencyService: dep.emergencyService,
      acceptingPatients: dep.acceptingPatients,
      availableBeds: Math.max(0, dep.availableBeds + offset),
      availableDoctors: dep.availableDoctors
    };

    try {
      await API.post('/hospital/departments', updatedDep);
      if (selectedHospital) {
        loadHospitalDetails(selectedHospital.name);
      }
    } catch {
      alert('Failed to update bed details.');
    }
  };

  // Driver functions
  const acceptRequest = async (requestId) => {
    try {
      await API.post(`/ambulance/requests/${requestId}/accept`);
      alert('Request accepted!');
      loadDriverData();
    } catch (error) {
      alert('Failed to accept: ' + (error.response?.data?.error || error.message));
    }
  };

  const declineRequest = async (requestId) => {
    try {
      await API.post(`/ambulance/requests/${requestId}/decline`);
      alert('Request declined. Next ambulance will be notified.');
      loadDriverData();
    } catch (error) {
      alert('Failed to decline: ' + (error.response?.data?.error || error.message));
    }
  };

  const updateAmbulanceStatus = async (status) => {
    try {
      await API.post('/ambulance/status', { status });
      alert(`Status updated to ${status}`);
      loadDriverData();
    } catch (error) {
      alert('Failed to update status: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="app-shell">
      <div className="dashboard-container">
        
        {/* TOP NAVBAR */}
        <header className="top-navbar">
          <div className="nav-left">
            <span className="brand-logo">🛡️</span>
            <span className="brand-name">VitalGuard Portal</span>
          </div>

          <div className="nav-links">
            {role === 'DOCTOR' && (
              <button className={`nav-link-btn ${activeTab === 'cases' ? 'active' : ''}`} onClick={() => setActiveTab('cases')}>
                My Cases
              </button>
            )}
            {role === 'HOSPITAL_ADMIN' && (
              <>
                <button className={`nav-link-btn ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
                  SOS Queue
                </button>
                <button className={`nav-link-btn ${activeTab === 'resources' ? 'active' : ''}`} onClick={() => setActiveTab('resources')}>
                  Beds & Staff
                </button>
              </>
            )}
            {role === 'AMBULANCE_DRIVER' && (
              <button className={`nav-link-btn ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
                Emergency Requests
              </button>
            )}
            {role === 'ADMIN' && (
              <>
                <button className={`nav-link-btn ${activeTab === 'hospitals' ? 'active' : ''}`} onClick={() => setActiveTab('hospitals')}>
                  Hospitals
                </button>
                <button className={`nav-link-btn ${activeTab === 'doctors' ? 'active' : ''}`} onClick={() => setActiveTab('doctors')}>
                  Doctors
                </button>
                <button className={`nav-link-btn ${activeTab === 'ambulances' ? 'active' : ''}`} onClick={() => setActiveTab('ambulances')}>
                  Ambulances
                </button>
                <button className={`nav-link-btn ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
                  SOS Logs
                </button>
              </>
            )}
          </div>

          <div className="nav-right">
            <div className={`live-indicator ${wsConnected ? '' : 'disconnected'}`}>
              <span className="pulse-dot" />
              {wsConnected ? 'Live' : 'Connection Lost'}
            </div>
            
            <div className="user-profile-badge">
              <div className="avatar-circle">{user?.fullName?.charAt(0) || 'D'}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{user?.fullName || 'Doctor'}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{user?.role}</div>
              </div>
            </div>

            <button onClick={logout} className="nav-logout-btn" title="Sign Out">
              🚪 Sign Out
            </button>
          </div>
        </header>

        {/* 1. DOCTOR PORTAL */}
        {role === 'DOCTOR' && activeTab === 'cases' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Good evening, Doctor</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Clinical emergency duty overview dashboard</p>
            </div>

            <div className="vitals-grid-row" style={{ marginBottom: '10px' }}>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>ACTIVE CASES</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
                  {activeEmergencies.length}
                </div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>CRITICAL PATIENTS</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-red)' }}>
                  {emergencies.filter(e => e.severity === 'CRITICAL' && e.status !== 'RESOLVED').length}
                </div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>PATIENTS MONITORED</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>{emergencies.filter(e => e.status !== 'RESOLVED').length}</div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>RESOLVED TODAY</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-green)' }}>
                  {emergencies.filter(e => e.status === 'RESOLVED').length}
                </div>
              </div>
            </div>

            {/* PROMINENT NEW CASE ALERT FOR DOCTOR */}
            {activeEmergencies.filter(e => e.status === 'DOCTOR_ASSIGNED').map((alert, _idx) => (
              <div key={alert.id} style={{ 
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
                border: '2px solid var(--accent-blue)', 
                borderRadius: '16px', 
                padding: '20px', 
                marginBottom: '20px',
                boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h2 style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: 800, margin: 0 }}>
                      🚨 NEW CASE ASSIGNED
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', marginBottom: '0' }}>
                      <strong>Patient:</strong> {alert.patientName || alert.patientUid}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
                      <span style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                        Severity: {alert.severity}
                      </span>
                      <span style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                        Risk Score: {alert.riskScore}/100
                      </span>
                      <span style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                        Dept: {alert.requiredDepartment}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '200px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>VITALS</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{alert.detectedVitals}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>LOCATION</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>AMBULANCE</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: alert.requiresAmbulance ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
                      {alert.requiresAmbulance ? '🚑 REQUIRED' : '✓ NOT REQUIRED'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <button 
                    onClick={() => setSelectedEmergency(alert)}
                    className="btn-primary" 
                    style={{ background: 'var(--accent)', flex: 1 }}
                  >
                    👁 VIEW CASE
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: '20px' }} className="saas-grid-layout">
              {/* List */}
              <div className="saas-card" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                <h3 className="card-title" style={{ marginBottom: '16px' }}>🚨 My Assigned Emergencies</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeEmergencies.map(eq => (
                    <div 
                      key={eq.id} 
                      className={`queue-item-card ${selectedEmergency?.id === eq.id ? 'active-select' : ''}`}
                      onClick={() => setSelectedEmergency(eq)}
                      style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', background: '#fdfdfd' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
                        <span>SOS-{eq.id}</span>
                        <span className={`pill-status ${eq.severity === 'CRITICAL' ? 'critical' : eq.severity === 'HIGH' ? 'warning' : 'normal'}`}>{eq.severity}</span>
                      </div>
                      <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                        <strong>Patient:</strong> {eq.patientName || eq.patientUid}
                      </p>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>
                        <strong>Vitals:</strong> {eq.detectedVitals}
                      </p>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        <span>Risk: <strong>{eq.riskScore}/100</strong></span>
                        <span>Status: <strong>{eq.status}</strong></span>
                        <span>Amb: <strong>{eq.ambulanceUnitId ? eq.ambulanceStatus : (eq.requiresAmbulance ? 'Requested' : 'N/A')}</strong></span>
                      </div>
                    </div>
                  ))}
                  {activeEmergencies.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No active assigned cases.</p>
                  )}
                </div>
              </div>

              {/* Patient Snapshot view */}
              <div className="saas-card">
                {selectedEmergency ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Incident SOS-{selectedEmergency.id}</h2>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button onClick={() => resolveCase(selectedEmergency.id)} className="btn-primary" style={{ background: 'var(--accent-green)' }}>
                          🏁 Mark Case Resolved
                        </button>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                      <h4 style={{ fontWeight: 700, marginBottom: '12px' }}>Patient Summary</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                        <p><strong>Patient:</strong> {selectedEmergency.patientName || selectedEmergency.patientUid}</p>
                        <p><strong>Age:</strong> {selectedEmergency.patientAge || 'N/A'}</p>
                        <p><strong>Blood Group:</strong> {selectedEmergency.patientBloodGroup || 'N/A'}</p>
                        <p><strong>Severity:</strong> <span className={`pill-status ${selectedEmergency.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>{selectedEmergency.severity}</span></p>
                        <p><strong>Risk Score:</strong> {selectedEmergency.riskScore}/100</p>
                        <p><strong>Department:</strong> {selectedEmergency.requiredDepartment}</p>
                        <p><strong>Hospital:</strong> {selectedEmergency.hospitalName || 'N/A'}</p>
                        <p><strong>Ambulance:</strong> {selectedEmergency.ambulanceUnitId ? `${selectedEmergency.ambulanceUnitId} (${selectedEmergency.ambulanceStatus || 'En Route'})` : (selectedEmergency.requiresAmbulance ? 'Requested' : 'Not Required')}</p>
                        <p><strong>Status:</strong> <span className={`pill-status ${['AMBULANCE_REQUESTED', 'AMBULANCE_ACCEPTED', 'AMBULANCE_DISPATCHED', 'EN_ROUTE_TO_PATIENT', 'ARRIVED_AT_PATIENT', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL'].includes(selectedEmergency.status) ? 'warning' : 'normal'}`}>{selectedEmergency.status}</span></p>
                        <p><strong>Created:</strong> {selectedEmergency.createdAt ? new Date(selectedEmergency.createdAt).toLocaleString() : 'N/A'}</p>
                        <p><strong>Vitals:</strong> {selectedEmergency.detectedVitals}</p>
                      </div>
                    </div>

                    {selectedEmergency.ambulanceUnitId && selectedEmergency.requiresAmbulance && (
                      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <h4 style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          🗺️ Live Ambulance Tracking
                        </h4>
                        <div style={{ height: '350px', borderRadius: '12px', overflow: 'hidden' }}>
                          <GoogleMapTracking
                            patientLocation={[selectedEmergency.latitude, selectedEmergency.longitude]}
                            hospitalLocation={selectedEmergency.hospitalLat && selectedEmergency.hospitalLng ? [selectedEmergency.hospitalLat, selectedEmergency.hospitalLng] : null}
                            ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : (selectedEmergency.ambulanceLat && selectedEmergency.ambulanceLng ? [selectedEmergency.ambulanceLat, selectedEmergency.ambulanceLng] : null)}
                            ambulanceStatus={selectedEmergency.status}
                            ambulanceUnitId={selectedEmergency.ambulanceUnitId}
                            driverName={selectedEmergency.driverName}
                            emergencyId={selectedEmergency.id}
                            followAmbulance={false}
                            showRoute={true}
                            height="350px"
                          />
                        </div>
                        <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>🚑 {selectedEmergency.ambulanceUnitId}</span>
                              <span className={`pill-status ${['EN_ROUTE_TO_PATIENT', 'ARRIVED_AT_PATIENT', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL'].includes(selectedEmergency.status) ? 'warning' : 'normal'}`}>
                                {selectedEmergency.status}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                              {ambulanceLocation && ambulanceLocation.distance !== undefined && (
                                <span style={{ fontWeight: 600 }}>📏 {ambulanceLocation.distance} km</span>
                              )}
                              {ambulanceLocation && ambulanceLocation.eta !== undefined && (
                                <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>⏱️ {ambulanceLocation.eta} min</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <EmergencyDetails emergencyId={selectedEmergency.id} revision={revision} />
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '100px 0', fontSize: '13px' }}>
                    Select an active SOS case from the queue to view details.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* 2. HOSPITAL OPERATIONS PORTAL */}
        {role === 'HOSPITAL_ADMIN' && activeTab === 'queue' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Hospital Command Center</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Resource allocation & automatic emergency triage queue</p>
            </div>

            <div className="vitals-grid-row">
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>INCOMING EMERGENCIES</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-red)' }}>
                  {emergencies.filter(e => e.status !== 'RESOLVED' && e.status !== 'CANCELLED').length}
                </div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>AVAILABLE BEDS</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-green)' }}>
                  {selectedHospital?.availableBeds || 0}
                </div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>DOCTORS ON DUTY</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
                  {doctors.filter(d => d.onDuty).length}
                </div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>FLEET AMBULANCES</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
                  {ambulances.length}
                </div>
              </div>
            </div>

            {/* PROMINENT INCOMING EMERGENCY ALERT */}
            {emergencies.filter(e => e.status === 'HOSPITAL_ASSIGNED').map((alert, _idx) => (
              <div key={alert.id} style={{ 
                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', 
                border: '2px solid var(--accent-red)', 
                borderRadius: '16px', 
                padding: '20px', 
                marginBottom: '20px',
                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.15)',
                animation: 'pulse 2s infinite'
              }}>
                <style jsx>{`
                  @keyframes pulse {
                    0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15); }
                    50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.3); }
                  }
                `}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h2 style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: 800, margin: 0 }}>
                      🚨 NEW EMERGENCY REQUEST
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', marginBottom: '0' }}>
                      <strong>Patient:</strong> {alert.patientName || alert.patientUid}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
                      <span style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, color: 'var(--accent-red)' }}>
                        Severity: {alert.severity}
                      </span>
                      <span style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, color: 'var(--accent-red)' }}>
                        Risk Score: {alert.riskScore}/100
                      </span>
                      <span style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, color: 'var(--accent-red)' }}>
                        Dept: {alert.requiredDepartment}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '200px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>VITALS</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{alert.detectedVitals}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>LOCATION</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>AMBULANCE</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: alert.requiresAmbulance ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
                      {alert.requiresAmbulance ? '🚑 REQUIRED' : '✓ NOT REQUIRED'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <button 
                    onClick={() => setSelectedEmergency(alert)}
                    className="btn-primary" 
                    style={{ background: 'var(--accent)', flex: 1 }}
                  >
                    👁 VIEW EMERGENCY
                  </button>
                  <button 
                    onClick={() => acceptCase(alert.id)}
                    className="btn-primary" 
                    style={{ background: 'var(--accent-green)', flex: 1, fontWeight: 800, fontSize: '14px' }}
                  >
                    ✓ ACCEPT & DISPATCH
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }} className="saas-grid-layout">
              {/* Queue List */}
              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '14px' }}>🚑 AI Risk Prioritization Queue</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[...emergencies].sort((a, b) => {
                    const aCrit = a.severity === 'CRITICAL';
                    const bCrit = b.severity === 'CRITICAL';
                    if (aCrit && !bCrit) return -1;
                    if (!aCrit && bCrit) return 1;
                    return (b.riskScore || 0) - (a.riskScore || 0);
                  }).filter(e => e.status !== 'RESOLVED' && e.status !== 'CANCELLED').map(eq => (
                    <div 
                      key={eq.id} 
                      className={`queue-item-card ${selectedEmergency?.id === eq.id ? 'active-select' : ''}`}
                      onClick={() => setSelectedEmergency(eq)}
                      style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', background: '#fdfdfd' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>SOS-{eq.id}</span>
                        <span className={`pill-status ${eq.severity === 'CRITICAL' ? 'critical' : eq.severity === 'HIGH' ? 'warning' : 'normal'}`}>{eq.severity}</span>
                      </div>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>Patient: {eq.patientName || eq.patientUid}</p>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>Vitals: {eq.detectedVitals}</p>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>Dept: {eq.requiredDepartment}</p>
                      
                      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '6px' }}>
                        <span>Risk: <strong>{eq.riskScore || 0}/100</strong></span>
                        <span>Status: <strong>{eq.status}</strong></span>
                        <span>Dr: <strong>{eq.doctorName || 'Unassigned'}</strong></span>
                        <span>Amb: <strong>{eq.ambulanceUnitId ? 'Assigned' : (eq.requiresAmbulance ? 'Requested' : 'Not Required')}</strong></span>
                      </div>
                    </div>
                  ))}
                  {emergencies.filter(e => e.status !== 'RESOLVED' && e.status !== 'CANCELLED').length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No active alerts.</p>}
                </div>
              </div>

              {/* Action details */}
              <div className="saas-card">
                {selectedEmergency ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Incident SOS-{selectedEmergency.id} Details</h3>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {selectedEmergency.status === 'HOSPITAL_ASSIGNED' && (
                          <button onClick={() => acceptCase(selectedEmergency.id)} className="btn-primary" style={{ background: 'var(--accent-green)' }}>
                            ✓ Accept Case & Dispatch
                          </button>
                        )}
                        {['ACCEPTED', 'DOCTOR_ASSIGNED', 'FAMILY_NOTIFIED', 'AMBULANCE_REQUESTED', 'AMBULANCE_ACCEPTED', 'AMBULANCE_DISPATCHED', 'EN_ROUTE_TO_PATIENT', 'ARRIVED_AT_PATIENT', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL', 'ARRIVED_AT_HOSPITAL'].includes(selectedEmergency.status) && (
                          <button onClick={() => resolveCase(selectedEmergency.id)} className="btn-primary" style={{ background: 'var(--accent-blue)' }}>
                            🏁 Resolve Incident
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                      <h4 style={{ fontWeight: 700, marginBottom: '12px' }}>Emergency Summary</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                        <p><strong>Patient:</strong> {selectedEmergency.patientName || selectedEmergency.patientUid}</p>
                        <p><strong>Age:</strong> {selectedEmergency.patientAge || 'N/A'}</p>
                        <p><strong>Severity:</strong> <span className={`pill-status ${selectedEmergency.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>{selectedEmergency.severity}</span></p>
                        <p><strong>Risk Score:</strong> {selectedEmergency.riskScore}/100</p>
                        <p><strong>Department:</strong> {selectedEmergency.requiredDepartment}</p>
                        <p><strong>Hospital:</strong> {selectedEmergency.hospitalName || 'Assigned'}</p>
                        <p><strong>Doctor:</strong> {selectedEmergency.doctorName || 'Unassigned'}</p>
                        <p><strong>Ambulance:</strong> {selectedEmergency.ambulanceUnitId ? `${selectedEmergency.ambulanceUnitId} (${selectedEmergency.ambulanceStatus || 'En Route'})` : (selectedEmergency.requiresAmbulance ? 'Requested' : 'Not Required')}</p>
                        <p><strong>Status:</strong> <span className={`pill-status ${['AMBULANCE_REQUESTED', 'AMBULANCE_ACCEPTED', 'AMBULANCE_DISPATCHED', 'EN_ROUTE_TO_PATIENT', 'ARRIVED_AT_PATIENT', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL'].includes(selectedEmergency.status) ? 'warning' : 'normal'}`}>{selectedEmergency.status}</span></p>
                        <p><strong>Created:</strong> {selectedEmergency.createdAt ? new Date(selectedEmergency.createdAt).toLocaleString() : 'N/A'}</p>
                        <p><strong>Vitals:</strong> {selectedEmergency.detectedVitals}</p>
                      </div>
                    </div>

                    {selectedEmergency.ambulanceUnitId && selectedEmergency.requiresAmbulance && (
                      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <h4 style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          🗺️ Live Ambulance Tracking
                        </h4>
                        <div style={{ height: '350px', borderRadius: '12px', overflow: 'hidden' }}>
                          <GoogleMapTracking
                            patientLocation={[selectedEmergency.latitude, selectedEmergency.longitude]}
                            hospitalLocation={selectedEmergency.hospitalLat && selectedEmergency.hospitalLng ? [selectedEmergency.hospitalLat, selectedEmergency.hospitalLng] : null}
                            ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : (selectedEmergency.ambulanceLat && selectedEmergency.ambulanceLng ? [selectedEmergency.ambulanceLat, selectedEmergency.ambulanceLng] : null)}
                            ambulanceStatus={selectedEmergency.status}
                            ambulanceUnitId={selectedEmergency.ambulanceUnitId}
                            driverName={selectedEmergency.driverName}
                            emergencyId={selectedEmergency.id}
                            followAmbulance={false}
                            showRoute={true}
                            height="350px"
                          />
                        </div>
                        <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>🚑 {selectedEmergency.ambulanceUnitId}</span>
                              <span className={`pill-status ${['EN_ROUTE_TO_PATIENT', 'ARRIVED_AT_PATIENT', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL'].includes(selectedEmergency.status) ? 'warning' : 'normal'}`}>
                                {selectedEmergency.status}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                              {ambulanceLocation && ambulanceLocation.distance !== undefined && (
                                <span style={{ fontWeight: 600 }}>📏 {ambulanceLocation.distance} km</span>
                              )}
                              {ambulanceLocation && ambulanceLocation.eta !== undefined && (
                                <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>⏱️ {ambulanceLocation.eta} min</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <EmergencyDetails emergencyId={selectedEmergency.id} revision={revision} />
                  </div>
                ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '80px 0', fontSize: '13px' }}>Select an active emergency card to view details.</p>}
              </div>
            </div>
          </>
        )}

        {role === 'HOSPITAL_ADMIN' && activeTab === 'resources' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }} className="saas-grid-layout">
            <div className="saas-card">
              <h3 className="card-title" style={{ marginBottom: '14px' }}>🏥 Beds Allocation Manager</h3>
              {departments.map(dep => (
                <div key={dep.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', padding: '12px 0', fontSize: '13px' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{dep.name} Unit</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Capacity: {dep.availableBeds} / {dep.totalBeds} Beds</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => updateBeds(dep, -1)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', cursor: 'pointer' }}>-</button>
                    <button onClick={() => updateBeds(dep, 1)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="saas-card">
              <h3 className="card-title" style={{ marginBottom: '14px' }}>👨‍⚕️ Medical Specialists Status</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Specialty</th>
                      <th>Duty</th>
                      <th>Emergency state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 700 }}>{d.name}</td>
                        <td>{d.specialization}</td>
                        <td>
                          <button onClick={() => toggleDoctor(d, 'onDuty')} style={{ background: d.onDuty ? 'var(--accent-green)' : 'var(--text-muted)', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                            {d.onDuty ? 'ON' : 'OFF'}
                          </button>
                        </td>
                        <td>
                          <button onClick={() => toggleDoctor(d, 'availableForEmergency')} style={{ background: d.availableForEmergency ? 'var(--accent-blue)' : 'var(--text-muted)', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                            {d.availableForEmergency ? 'FREE' : 'BUSY'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. AMBULANCE DRIVER PORTAL */}
        {role === 'AMBULANCE_DRIVER' && activeTab === 'requests' && (
          <div className="saas-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 className="card-title" style={{ marginBottom: '20px' }}>🚑 Ambulance Dispatch Console</h3>
            
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ color: 'var(--accent-red)', fontWeight: 800, fontSize: '15px', marginBottom: '16px' }}>🚨 PENDING EMERGENCY REQUESTS</h4>
                {pendingRequests.map(req => (
                  <div key={req.id} style={{ background: '#fff1f0', border: '1px solid #ffccc7', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-red)' }}>Emergency SOS-{req.emergencyId}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <strong>Patient:</strong> {req.patientName} | <strong>Severity:</strong> <span className={`pill-status ${req.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>{req.severity}</span> | <strong>Risk:</strong> {req.riskScore}/100
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <strong>Pickup:</strong> {req.pickupLat?.toFixed(4)}, {req.pickupLng?.toFixed(4)} | <strong>Distance:</strong> {req.distanceKm} km | <strong>ETA:</strong> {req.etaMinutes} min
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <strong>Destination:</strong> {req.destinationHospital}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => acceptRequest(req.id)} className="btn-primary" style={{ background: 'var(--accent-green)', flex: 1 }}>
                        ✓ ACCEPT
                      </button>
                      <button onClick={() => declineRequest(req.id)} className="btn-primary" style={{ background: 'var(--accent-red)', flex: 1 }}>
                        ✗ DECLINE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Current Active Job */}
            {currentJob?.emergency && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: '16px', borderRadius: '12px' }}>
                  <h4 style={{ color: 'var(--accent-green)', fontWeight: 800, fontSize: '15px' }}>✅ ACTIVE EMERGENCY RESPONSE</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginTop: '10px' }}>
                    <p><strong>Emergency ID:</strong> SOS-{currentJob.emergency.id}</p>
                    <p><strong>Patient:</strong> {currentJob.emergency.patientName || currentJob.emergency.patientUid}</p>
                    <p><strong>Current Status:</strong> {currentJob.emergency.status}</p>
                    <p><strong>Ambulance:</strong> {currentJob.ambulance?.unitId}</p>
                    <p><strong>Patient coords:</strong> {currentJob.emergency.latitude?.toFixed(4)}, {currentJob.emergency.longitude?.toFixed(4)}</p>
                    <p><strong>Destination Hospital:</strong> {currentJob.emergency.hospitalName}</p>
                  </div>
                </div>

                <div style={{ height: '450px', borderRadius: '14px', overflow: 'hidden' }}>
                  <GoogleMapTracking
                    patientLocation={[currentJob.emergency.latitude, currentJob.emergency.longitude]}
                    hospitalLocation={currentJob.emergency.hospitalLat && currentJob.emergency.hospitalLng ? [currentJob.emergency.hospitalLat, currentJob.emergency.hospitalLng] : null}
                    ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : (currentJob.ambulance?.latitude && currentJob.ambulance?.longitude ? [currentJob.ambulance.latitude, currentJob.ambulance.longitude] : null)}
                    ambulanceStatus={currentJob.emergency.status}
                    ambulanceUnitId={currentJob.ambulance?.unitId}
                    driverName={currentJob.ambulance?.driver?.fullName}
                    emergencyId={currentJob.emergency.id}
                    followAmbulance={true}
                    showRoute={true}
                    height="450px"
                  />
                </div>

                <EmergencyDetails emergencyId={currentJob.emergency.id} revision={revision} />

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button onClick={() => updateAmbulanceStatus('EN_ROUTE_TO_PATIENT')} className="btn-primary" style={{ flex: 1, minWidth: '140px' }}>
                    🚑 En Route to Patient
                  </button>
                  <button onClick={() => updateAmbulanceStatus('ARRIVED_AT_PATIENT')} className="btn-primary" style={{ flex: 1, minWidth: '140px' }}>
                    📍 Arrived at Patient
                  </button>
                  <button onClick={() => updateAmbulanceStatus('PATIENT_PICKED_UP')} className="btn-primary" style={{ flex: 1, minWidth: '140px' }}>
                    👤 Patient Picked Up
                  </button>
                  <button onClick={() => updateAmbulanceStatus('EN_ROUTE_TO_HOSPITAL')} className="btn-primary" style={{ flex: 1, minWidth: '140px' }}>
                    🏥 En Route to Hospital
                  </button>
                  <button onClick={() => updateAmbulanceStatus('ARRIVED_AT_HOSPITAL')} className="btn-primary" style={{ flex: 1, minWidth: '140px', background: 'var(--accent-green)' }}>
                    ✅ Arrived at Hospital
                  </button>
                </div>

                {/* GPS Tracking Controls */}
                <div style={{ 
                  background: '#f8fafc', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '12px', 
                  padding: '16px',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`pulse-dot ${wsConnected ? '' : 'disconnected'}`} style={{ width: '10px', height: '10px' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: wsConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {wsConnected ? 'Live GPS Connected' : 'GPS Disconnected'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!isTracking ? (
                      <button 
                        onClick={startGpsTracking} 
                        className="btn-primary" 
                        style={{ background: 'var(--accent-green)' }}
                      >
                        📍 Start Live GPS Tracking
                      </button>
                    ) : (
                      <button 
                        onClick={stopGpsTracking} 
                        className="btn-primary" 
                        style={{ background: 'var(--accent-amber)' }}
                      >
                        ⏹️ Stop GPS Tracking
                      </button>
                    )}
                    {ambulanceLocation && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: '4px' }}>
                        Last update: {new Date(ambulanceLocation.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!pendingRequests.length && !currentJob?.emergency && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>No active ambulance requests or jobs allocated to your unit.</p>
            )}
          </div>
        )}

        {/* 4. ADMIN NETWORK PORTAL */}
        {role === 'ADMIN' && activeTab === 'hospitals' && (
          <div className="saas-card">
            <h3 className="card-title" style={{ marginBottom: '14px' }}>Hospital Network Registry</h3>
            <div className="data-table-wrapper">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Hospital</th>
                    <th>Coords</th>
                    <th>Bed Capacity</th>
                    <th>Specialists</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitals.map(h => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 700 }}>{h.name}</td>
                      <td>{h.lat?.toFixed(4)}, {h.lng?.toFixed(4)}</td>
                      <td>{h.availableBeds} / {h.totalBeds} beds</td>
                      <td>{h.availableDoctors} / {h.totalDoctors} active</td>
                      <td style={{ fontWeight: 600 }}>{h.rating}★</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {role === 'ADMIN' && activeTab === 'doctors' && (
          <div className="saas-card">
            <h3 className="card-title" style={{ marginBottom: '14px' }}>Specialist Doctor Directory</h3>
            <div className="data-table-wrapper">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Specialist</th>
                    <th>Specialization</th>
                    <th>Associated Hospital</th>
                    <th>Duty</th>
                    <th>Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 700 }}>{d.name}</td>
                      <td>{d.specialization}</td>
                      <td>Hospital {d.hospitalId}</td>
                      <td><span className={`pill-status ${d.onDuty ? 'normal' : 'critical'}`}>{d.onDuty ? 'ON' : 'OFF'}</span></td>
                      <td><span className={`pill-status ${d.availableForEmergency ? 'normal' : 'warning'}`}>{d.availableForEmergency ? 'FREE' : 'BUSY'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {role === 'ADMIN' && activeTab === 'ambulances' && (
          <div className="saas-card">
            <h3 className="card-title" style={{ marginBottom: '14px' }}>Ambulance Fleet Status</h3>
            <div className="data-table-wrapper">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Ambulance Unit</th>
                    <th>Coords</th>
                    <th>Status</th>
                    <th>Base Station</th>
                  </tr>
                </thead>
                <tbody>
                  {ambulances.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 700 }}>{a.unitId}</td>
                      <td>{a.latitude?.toFixed(4)}, {a.longitude?.toFixed(4)}</td>
                      <td><span className={`pill-status ${a.status === 'available' ? 'normal' : 'critical'}`}>{a.status.toUpperCase()}</span></td>
                      <td>{a.hospitalName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {role === 'ADMIN' && activeTab === 'requests' && (
          <div className="saas-card">
            <h3 className="card-title" style={{ marginBottom: '14px' }}>System SOS Request Logs</h3>
            <div className="data-table-wrapper">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>SOS ID</th>
                    <th>Patient UID</th>
                    <th>Severity</th>
                    <th>Required Dept</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emergencies.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 700 }}>SOS-{e.id}</td>
                      <td>{e.patientUid}</td>
                      <td><span className={`pill-status ${e.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>{e.severity}</span></td>
                      <td>{e.requiredDepartment}</td>
                      <td style={{ fontWeight: 600 }}>{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default HealthcareDashboard;
