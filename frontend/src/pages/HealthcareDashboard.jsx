import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import { createStompClient } from '../services/websocket';
import MapComponent from '../components/MapComponent';

const HealthcareDashboard = () => {
  const { user, logout } = useAuth();
  const role = user?.role; // DOCTOR, HOSPITAL_ADMIN, AMBULANCE_DRIVER, ADMIN
  
  const [wsConnected, setWsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('');
  
  // Database states
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [selectedEmergency, setSelectedEmergency] = useState(null);

  // Selected patient telemetry logs
  const [patientProfile, setPatientProfile] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [patientVitals, setPatientVitals] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);

  const stompClientRef = useRef(null);

  // Set default tabs based on role
  useEffect(() => {
    if (role === 'DOCTOR') setActiveTab('cases');
    else if (role === 'HOSPITAL_ADMIN') setActiveTab('queue');
    else if (role === 'AMBULANCE_DRIVER') setActiveTab('job');
    else if (role === 'ADMIN') setActiveTab('hospitals');
  }, [role]);

  useEffect(() => {
    loadHospitals();
    loadEmergencies();
    loadDoctors();
    loadAmbulances();
  }, [user]);

  useEffect(() => {
    if (selectedHospital) {
      loadHospitalDetails(selectedHospital.name);
    }
  }, [selectedHospital]);

  useEffect(() => {
    if (selectedEmergency) {
      loadPatientDetails(selectedEmergency.patientUid);
      loadTimeline(selectedEmergency.id);
    }
  }, [selectedEmergency]);

  // STOMP WebSocket Sync
  useEffect(() => {
    if (!user) return;
    
    const client = createStompClient(
      () => {
        setWsConnected(true);
        console.log('Healthcare WebSocket connected.');
        
        client.subscribe('/topic/emergency-updates', (msg) => {
          const data = JSON.parse(msg.body);
          loadEmergencies();
          if (selectedHospital) {
            loadHospitalDetails(selectedHospital.name);
          }
          if (selectedEmergency && selectedEmergency.id === data.id) {
            setSelectedEmergency(data);
            loadTimeline(data.id);
          }
        });
      },
      (err) => {
        setWsConnected(false);
        console.error('Healthcare WebSocket connection error:', err);
      }
    );

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [selectedHospital?.id, selectedEmergency?.id]);

  const loadHospitals = async () => {
    try {
      const res = await API.get('/hospital');
      setHospitals(res.data);
      if (res.data.length > 0) {
        setSelectedHospital(res.data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadHospitalDetails = async (hospitalName) => {
    try {
      const res = await API.get(`/hospital/departments/${encodeURIComponent(hospitalName)}`);
      setDepartments(res.data.departments || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await API.get('/emergencies/doctors/available');
      setDoctors(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAmbulances = async () => {
    try {
      const res = await API.get('/emergencies/ambulances/nearby?lat=12.9716&lng=77.5946');
      setAmbulances(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadEmergencies = async () => {
    try {
      const res = await API.get('/hospital/emergencies');
      setEmergencies(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPatientDetails = async (uid) => {
    try {
      const profRes = await API.get(`/patients/${uid}/medical-profile`);
      setPatientProfile(profRes.data);

      const histRes = await API.get(`/patients/${uid}/medical-history`);
      setPatientHistory(histRes.data);

      const vitalsRes = await API.get(`/analysis/predict/${uid}`);
      setPatientVitals(vitalsRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTimeline = async (sosId) => {
    try {
      const res = await API.get(`/emergencies/${sosId}/timeline`);
      setTimelineEvents(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const acceptCase = async (id) => {
    try {
      const res = await API.post(`/emergency/${id}/accept`);
      alert('Emergency Incident Accepted. Ambulance dispatched.');
      loadEmergencies();
      setSelectedEmergency(res.data);
      if (selectedHospital) {
        loadHospitalDetails(selectedHospital.name);
      }
    } catch (err) {
      alert('Failed to accept: ' + err.message);
    }
  };

  const resolveCase = async (id) => {
    try {
      await API.post(`/emergencies/${id}/resolve`);
      alert('Case marked resolved successfully. Restored resources.');
      setSelectedEmergency(null);
      setPatientProfile(null);
      setPatientHistory([]);
      setPatientVitals(null);
      loadEmergencies();
      loadAmbulances();
      if (selectedHospital) {
        loadHospitalDetails(selectedHospital.name);
      }
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      alert('Failed to update bed details.');
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
              <button className={`nav-link-btn ${activeTab === 'job' ? 'active' : ''}`} onClick={() => setActiveTab('job')}>
                Active Job
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
                  {emergencies.filter(e => e.status !== 'RESOLVED' && e.status !== 'COMPLETED').length}
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
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>{doctors.length}</div>
              </div>
              <div className="saas-card" style={{ padding: '18px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>RESOLVED TODAY</span>
                <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-green)' }}>
                  {emergencies.filter(e => e.status === 'RESOLVED').length}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2fr', gap: '20px' }} className="saas-grid-layout">
              {/* List */}
              <div className="saas-card" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                <h3 className="card-title" style={{ marginBottom: '16px' }}>🚨 Emergency Queue</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {emergencies.filter(e => e.status !== 'RESOLVED' && e.status !== 'COMPLETED').map(eq => (
                    <div 
                      key={eq.id} 
                      className={`queue-item-card ${selectedEmergency?.id === eq.id ? 'active-select' : ''}`}
                      onClick={() => setSelectedEmergency(eq)}
                      style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', background: '#fdfdfd' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px' }}>
                        <span>SOS-{eq.id}</span>
                        <span className={`pill-status ${eq.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>{eq.severity}</span>
                      </div>
                      <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                        <strong>Vitals:</strong> {eq.detectedVitals}
                      </p>
                    </div>
                  ))}
                  {emergencies.filter(e => e.status !== 'RESOLVED').length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No active cases.</p>
                  )}
                </div>
              </div>

              {/* Patient Snapshot view */}
              <div className="saas-card">
                {selectedEmergency ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Incident SOS-{selectedEmergency.id}</h2>
                      <button onClick={() => resolveCase(selectedEmergency.id)} className="btn-primary" style={{ background: 'var(--accent-green)' }}>
                        🏁 Mark Case Resolved
                      </button>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TELEMETRY AT CRASH TIME</span>
                      <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-red)', marginTop: '4px' }}>
                        {selectedEmergency.detectedVitals}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Risk Score Rating: {selectedEmergency.riskScore}/100 ({selectedEmergency.severity})
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Medical Profile</h4>
                        {patientProfile ? (
                          <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <p><strong>Conditions:</strong> {patientProfile.existingConditions || 'None'}</p>
                            <p><strong>Cardiac History:</strong> {patientProfile.previousHeartProblems || 'None'}</p>
                            <p><strong>Allergies:</strong> {patientProfile.allergies || 'None'}</p>
                            <p><strong>Medications:</strong> {patientProfile.currentMedications || 'None'}</p>
                          </div>
                        ) : <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No medical context registered.</p>}
                      </div>

                      <div>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Timeline events</h4>
                        <div className="saas-timeline">
                          {timelineEvents.map((t, idx) => (
                            <div key={idx} className="timeline-item">
                              <div className="timeline-dot-wrapper">
                                <div className="t-dot" />
                                {idx < timelineEvents.length - 1 && <div className="t-connector" />}
                              </div>
                              <div className="timeline-info">
                                <span className="timeline-status" style={{ fontSize: '12px' }}>{t.status}</span>
                                <span className="timeline-time" style={{ fontSize: '9px' }}>{new Date(t.timestamp).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
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
                  {emergencies.filter(e => e.status !== 'RESOLVED').length}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }} className="saas-grid-layout">
              {/* Queue List */}
              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '14px' }}>Emergency Alert Queue</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {emergencies.map(eq => (
                    <div 
                      key={eq.id} 
                      className={`queue-item-card ${selectedEmergency?.id === eq.id ? 'active-select' : ''}`}
                      onClick={() => setSelectedEmergency(eq)}
                      style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', background: '#fdfdfd' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>SOS-{eq.id}</span>
                        <span className={`pill-status ${eq.status === 'HOSPITAL_ASSIGNED' ? 'warning' : 'normal'}`}>{eq.status}</span>
                      </div>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>Symptoms: {eq.symptoms}</p>
                    </div>
                  ))}
                  {emergencies.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No active alerts.</p>}
                </div>
              </div>

              {/* Action details */}
              <div className="saas-card">
                {selectedEmergency ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Incident SOS-{selectedEmergency.id} Details</h3>
                      {selectedEmergency.status === 'HOSPITAL_ASSIGNED' && (
                        <button onClick={() => acceptCase(selectedEmergency.id)} className="btn-primary" style={{ background: 'var(--accent-green)' }}>
                          ✓ Accept Case & Dispatch
                        </button>
                      )}
                      {['ACCEPTED', 'DOCTOR_ASSIGNED', 'AMBULANCE_DISPATCHED', 'AMBULANCE_EN_ROUTE', 'PATIENT_PICKED_UP', 'ARRIVED_AT_HOSPITAL'].includes(selectedEmergency.status) && (
                        <button onClick={() => resolveCase(selectedEmergency.id)} className="btn-primary" style={{ background: 'var(--accent-blue)' }}>
                          🏁 Resolve Incident
                        </button>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                      <p><strong>Dept Required:</strong> {selectedEmergency.requiredDepartment}</p>
                      <p><strong>Location Coords:</strong> {selectedEmergency.latitude?.toFixed(4)}, {selectedEmergency.longitude?.toFixed(4)}</p>
                      <p style={{ gridColumn: 'span 2' }}><strong>Alert Symptoms:</strong> {selectedEmergency.symptoms}</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <h4 style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Patient History</h4>
                        {patientHistory.map((h, idx) => (
                          <div key={idx} style={{ fontSize: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', marginBottom: '4px' }}>
                            <strong>{h.diagnosis}</strong>: {h.treatment}
                          </div>
                        ))}
                        {patientHistory.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No logs.</p>}
                      </div>
                      <div>
                        <h4 style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Status Timeline</h4>
                        {timelineEvents.map((t, idx) => (
                          <div key={idx} style={{ fontSize: '11px', marginBottom: '2px' }}>
                            • [{t.status}] {t.description}
                          </div>
                        ))}
                      </div>
                    </div>
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
        {role === 'AMBULANCE_DRIVER' && activeTab === 'job' && (
          <div className="saas-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 className="card-title" style={{ marginBottom: '20px' }}>🚑 Ambulance Dispatch Console</h3>
            
            {emergencies.filter(e => ['AMBULANCE_DISPATCHED', 'AMBULANCE_EN_ROUTE', 'PATIENT_PICKED_UP', 'ARRIVED_AT_HOSPITAL'].includes(e.status)).length > 0 ? (
              (() => {
                const activeJob = emergencies.find(e => ['AMBULANCE_DISPATCHED', 'AMBULANCE_EN_ROUTE', 'PATIENT_PICKED_UP', 'ARRIVED_AT_HOSPITAL'].includes(e.status));
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', padding: '16px', borderRadius: '12px' }}>
                      <h4 style={{ color: 'var(--accent-red)', fontWeight: 800, fontSize: '15px' }}>🚨 ACTIVE EMERGENCY RESPONSE ASSIGNED</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginTop: '10px' }}>
                        <p><strong>Patient coords:</strong> {activeJob.latitude.toFixed(4)}, {activeJob.longitude.toFixed(4)}</p>
                        <p><strong>Destination Hospital ID:</strong> Hospital {activeJob.hospitalId}</p>
                        <p><strong>Current status:</strong> {activeJob.status}</p>
                      </div>
                    </div>

                    <div style={{ height: '350px', borderRadius: '14px', overflow: 'hidden' }}>
                      <MapComponent
                        patientLoc={[activeJob.latitude, activeJob.longitude]}
                        hospitalLoc={[12.9252, 77.6011]}
                        ambulanceLoc={[12.935, 77.61]}
                      />
                    </div>

                    <button onClick={() => resolveCase(activeJob.id)} className="btn-primary" style={{ width: '100%', padding: '14px', background: 'var(--accent-green)' }}>
                      ✓ Complete Route & Arrive at Hospital
                    </button>
                  </div>
                );
              })()
            ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>No active ambulance jobs allocated to your unit.</p>}
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
