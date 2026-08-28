import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import { createStompClient } from '../services/websocket';
import MapComponent from '../components/MapComponent';

// Custom SVG Line Chart Component for React
const SVGLineChart = ({ data, color, title, unit, minValDefault, maxValDefault }) => {
  if (!data || data.length === 0) {
    return <div style={{ padding: '40px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>No historical metrics loaded.</div>;
  }
  
  const chartData = [...data].reverse().slice(-30);
  const maxVal = Math.max(...chartData, maxValDefault);
  const minVal = Math.min(...chartData, minValDefault);
  const range = maxVal - minVal || 10;
  
  const width = 600;
  const height = 180;
  const padding = 20;
  
  const points = chartData.map((val, idx) => {
    const x = padding + (idx / (chartData.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ position: 'relative', width: '100%', height: '200px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', display: 'block' }}>
        {/* Gridlines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f1f5f9" strokeWidth="1" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4,4" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1" />
        
        {/* Main Line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        
        {/* Highlight latest point */}
        {chartData.length > 0 && (
          <circle
            cx={padding + (chartData.length - 1) * (width - padding * 2) / (chartData.length - 1 || 1)}
            cy={height - padding - ((chartData[chartData.length - 1] - minVal) / range) * (height - padding * 2)}
            r="6"
            fill={color}
            stroke="#ffffff"
            strokeWidth="3.5"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))' }}
          />
        )}
      </svg>
    </div>
  );
};

const UserDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('vitals');
  const [wsConnected, setWsConnected] = useState(false);
  
  // Vitals State
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [latestVital, setLatestVital] = useState(null);
  const [trendAnalysis, setTrendAnalysis] = useState(null);
  
  // Sim Mode States
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState('');

  // Vital entry form
  const [vitalForm, setVitalForm] = useState({
    heart_rate: 72,
    spO2: 98,
    bp_systolic: 120,
    bp_diastolic: 80,
    glucose: 95,
    temperature: 36.6,
    respiratory_rate: 16
  });

  // SOS state
  const [symptomList, setSymptomList] = useState([]);
  const [symptomDesc, setSymptomDesc] = useState('');
  const [activeSos, setActiveSos] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  
  // Active SOS detail objects
  const [assignedHospital, setAssignedHospital] = useState(null);
  const [assignedDoctor, setAssignedDoctor] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);

  // Medical records state
  const [medHistory, setMedHistory] = useState([]);
  const [medProfile, setMedProfile] = useState(null);

  // Past Emergencies History
  const [pastEmergencies, setPastEmergencies] = useState([]);
  const [selectedPastSos, setSelectedPastSos] = useState(null);
  const [pastTimelineEvents, setPastTimelineEvents] = useState([]);

  // Telehealth Chat
  const [chatMessages, setChatMessages] = useState([
    { sender: 'AI', text: 'Hello! I am your VitalGuard AI Medical assistant. Ask me anything about your metrics or symptoms.' }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Active chart metric selection: 'hr', 'spo2', 'temp'
  const [activeChartMetric, setActiveChartMetric] = useState('hr');
  const [activeTimeRange, setActiveTimeRange] = useState('30m');

  const stompClientRef = useRef(null);

  useEffect(() => {
    loadVitals();
    loadMedicalHistory();
    loadMedicalProfile();
    checkActiveSos();
    loadPastEmergencies();
  }, [user]);

  // WebSocket Subscription
  useEffect(() => {
    if (!user) return;
    
    const client = createStompClient(
      () => {
        setWsConnected(true);
        console.log('User STOMP connected.');
        
        // Live vitals stream
        client.subscribe(`/topic/vitals/${user.uid}`, (msg) => {
          const vital = JSON.parse(msg.body);
          setLatestVital(vital);
          setVitalsHistory(prev => [vital, ...prev]);
          loadTrendAnalysis();
        });

        // Family notification alerts
        client.subscribe(`/topic/family-notifications/${user.uid}`, (msg) => {
          const data = JSON.parse(msg.body);
          console.log('[WS Family Notify]', data);
          alert(`👨👩👦 Family Notification Sent: Patient ${data.patientName} is under ${data.severity} emergency. Destination: ${data.hospital}.`);
        });

        if (activeSos) {
          subscribeToSosTracking(client, activeSos.id);
        }
      },
      (err) => {
        setWsConnected(false);
        console.error('STOMP connection error:', err);
      }
    );

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [user, activeSos?.id]);

  const subscribeToSosTracking = (client, sosId) => {
    client.subscribe(`/topic/emergency/${sosId}`, (msg) => {
      const data = JSON.parse(msg.body);
      setTrackingData(data);
      loadTimeline(sosId);
      loadAssignedHospital(sosId);
      loadAssignedDoctor(sosId);

      if (data.status === 'RESOLVED' || data.status === 'COMPLETED') {
        alert('Emergency has been resolved and resources released successfully.');
        checkActiveSos();
        loadPastEmergencies();
      }
    });
  };

  const loadVitals = async () => {
    try {
      const res = await API.get('/vitals/history');
      setVitalsHistory(res.data);
      if (res.data.length > 0) {
        setLatestVital(res.data[0]);
      }
      loadTrendAnalysis();
    } catch (err) {
      console.error(err);
    }
  };

  const loadTrendAnalysis = async () => {
    if (!user) return;
    try {
      const res = await API.get(`/analysis/predict/${user.uid}`);
      setTrendAnalysis(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMedicalHistory = async () => {
    try {
      const res = await API.get('/patients/me/medical-history');
      setMedHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMedicalProfile = async () => {
    try {
      const res = await API.get('/patients/me/medical-profile');
      setMedProfile(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const checkActiveSos = async () => {
    try {
      const res = await API.get('/emergency/active');
      const myActive = res.data.find(req => req.patientUid === user.uid);
      if (myActive) {
        setActiveSos(myActive);
        setTrackingData({
          sosId: myActive.id,
          status: myActive.status,
          ambulanceLatitude: myActive.latitude,
          ambulanceLongitude: myActive.longitude,
          progress: 0.0,
          eta: 'Calculating...'
        });
        loadTimeline(myActive.id);
        loadAssignedHospital(myActive.id);
        loadAssignedDoctor(myActive.id);
      } else {
        setActiveSos(null);
        setTrackingData(null);
        setAssignedHospital(null);
        setAssignedDoctor(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadPastEmergencies = async () => {
    try {
      const res = await API.get('/hospital/emergencies');
      setPastEmergencies(res.data);
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

  const loadAssignedHospital = async (sosId) => {
    try {
      const res = await API.get(`/emergencies/${sosId}/hospital`);
      if (res.status === 200 && res.data) {
        setAssignedHospital(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAssignedDoctor = async (sosId) => {
    try {
      const res = await API.get(`/emergencies/${sosId}/doctor`);
      if (res.status === 200 && res.data) {
        setAssignedDoctor(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const postVital = async (e) => {
    e.preventDefault();
    try {
      await API.post('/vitals', {
        ...vitalForm,
        latitude: user.latitude || 12.9716,
        longitude: user.longitude || 77.5946
      });
      alert('Vitals logged successfully.');
      loadVitals();
    } catch (err) {
      alert('Failed to log vitals.');
    }
  };

  const triggerSos = async () => {
    if (symptomList.length === 0) {
      alert('Please check at least one symptom.');
      return;
    }

    let lat = user.latitude || 12.9716;
    let lng = user.longitude || 77.5946;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          lat = position.coords.latitude;
          lng = position.coords.longitude;
          await executeSosTrigger(lat, lng);
        },
        async () => {
          await executeSosTrigger(lat, lng);
        }
      );
    } else {
      await executeSosTrigger(lat, lng);
    }
  };

  const executeSosTrigger = async (lat, lng) => {
    try {
      const res = await API.post('/emergency/sos', {
        alert_message: symptomList.join(', '),
        description: symptomDesc,
        symptoms: symptomList,
        location: { lat, lng }
      });
      setActiveSos(res.data);
      setActiveTab('sos');
      checkActiveSos();
      alert('Emergency Alert Dispatched! Nearest hospital assigned.');
    } catch (err) {
      alert('SOS Trigger Failed.');
    }
  };

  const startSimulation = async () => {
    try {
      setSimulating(true);
      setSimStep('Step 1: Ingesting normal vitals...');
      
      await API.post('/vitals', {
        heart_rate: 72,
        spO2: 98,
        temperature: 36.6,
        latitude: user.latitude || 12.9716,
        longitude: user.longitude || 77.5946
      });
      loadVitals();

      await new Promise(r => setTimeout(r, 2000));
      setSimStep('Step 2: Detecting elevated anomalies...');

      await API.post('/vitals', {
        heart_rate: 98,
        spO2: 91,
        temperature: 37.8,
        latitude: user.latitude || 12.9716,
        longitude: user.longitude || 77.5946
      });
      loadVitals();

      await new Promise(r => setTimeout(r, 2000));
      setSimStep('Step 3: Vitals crash. Triggering critical AI analysis...');

      await API.post('/vitals', {
        heart_rate: 145,
        spO2: 82,
        temperature: 39.8,
        latitude: user.latitude || 12.9716,
        longitude: user.longitude || 77.5946
      });
      loadVitals();

      setSimStep('Step 4: AI triage matched CRITICAL severity. Emergency created!');
      
      setTimeout(() => {
        checkActiveSos();
        setActiveTab('sos');
        setSimulating(false);
        setSimStep('');
      }, 1500);

    } catch (err) {
      console.error(err);
      alert('Simulation failed: ' + (err.response?.data?.error || err.message));
      setSimulating(false);
      setSimStep('');
    }
  };

  const getTrendIndicator = (vitalName, currentVal) => {
    if (vitalsHistory.length < 2) return 'Stable';
    const prev = vitalsHistory[1];
    let prevVal = 0;
    if (vitalName === 'hr') prevVal = prev.heartRate;
    else if (vitalName === 'spo2') prevVal = prev.spo2;
    else if (vitalName === 'temp') prevVal = prev.temperature;

    const diff = currentVal - prevVal;
    if (diff > 0.1) return `↑ ${diff.toFixed(vitalName === 'temp' ? 1 : 0)} ${vitalName === 'temp' ? '°C' : vitalName === 'spo2' ? '%' : 'BPM'}`;
    if (diff < -0.1) return `↓ ${Math.abs(diff).toFixed(vitalName === 'temp' ? 1 : 0)} ${vitalName === 'temp' ? '°C' : vitalName === 'spo2' ? '%' : 'BPM'}`;
    return '→ Stable';
  };

  const getVitalStatus = (name, val) => {
    if (val === undefined || val === null) return 'NORMAL';
    if (name === 'hr') {
      if (val > 120 || val < 50) return 'CRITICAL';
      if (val > 90 || val < 60) return 'WARNING';
      return 'NORMAL';
    }
    if (name === 'spo2') {
      if (val < 88) return 'CRITICAL';
      if (val < 94) return 'WARNING';
      return 'NORMAL';
    }
    if (name === 'temp') {
      if (val > 38.8 || val < 35.2) return 'CRITICAL';
      if (val > 37.6 || val < 36.0) return 'WARNING';
      return 'NORMAL';
    }
    return 'NORMAL';
  };

  const getAnalyticsStats = () => {
    let historyVals = [];
    if (activeChartMetric === 'hr') historyVals = vitalsHistory.map(v => v.heartRate);
    else if (activeChartMetric === 'spo2') historyVals = vitalsHistory.map(v => v.spo2);
    else if (activeChartMetric === 'temp') historyVals = vitalsHistory.map(v => v.temperature);

    if (historyVals.length === 0) return { latest: '--', avg: '--', min: '--', max: '--' };
    const sum = historyVals.reduce((a, b) => a + b, 0);
    return {
      latest: historyVals[0].toFixed(activeChartMetric === 'temp' ? 1 : 0),
      avg: (sum / historyVals.length).toFixed(activeChartMetric === 'temp' ? 1 : 0),
      min: Math.min(...historyVals).toFixed(activeChartMetric === 'temp' ? 1 : 0),
      max: Math.max(...historyVals).toFixed(activeChartMetric === 'temp' ? 1 : 0)
    };
  };

  const stats = getAnalyticsStats();

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = { sender: 'User', text: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');

    setTimeout(() => {
      const aiReply = {
        sender: 'AI',
        text: `VitalGuard AI Assistant: The symptoms or query you provided ("${userMsg.text}") have been logged. Please note that this is an AI-assisted analysis tool and does NOT represent a medical diagnosis. If you feel severe discomfort or chest pain, please trigger the SOS dispatcher immediately.`
      };
      setChatMessages(prev => [...prev, aiReply]);
    }, 1000);
  };

  return (
    <div className="app-shell">
      <div className="dashboard-container">
        
        {/* TOP NAVBAR */}
        <header className="top-navbar">
          <div className="nav-left">
            <span className="brand-logo">🛡️</span>
            <span className="brand-name">VitalGuard</span>
          </div>

          <div className="nav-links">
            <button className={`nav-link-btn ${activeTab === 'vitals' ? 'active' : ''}`} onClick={() => setActiveTab('vitals')}>
              Overview
            </button>
            <button className={`nav-link-btn ${activeTab === 'sos' ? 'active' : ''}`} onClick={() => setActiveTab('sos')}>
              Monitoring
            </button>
            <button className={`nav-link-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
              History
            </button>
            <button className={`nav-link-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
              Med-AI Chat
            </button>
          </div>

          <div className="nav-right">
            <div className={`live-indicator ${wsConnected ? '' : 'disconnected'}`}>
              <span className="pulse-dot" />
              {wsConnected ? 'Live' : 'Connection Lost'}
            </div>
            
            <div className="user-profile-badge">
              <div className="avatar-circle">{user?.fullName?.charAt(0) || 'U'}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{user?.fullName || 'Bhargav'}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{user?.role || 'PATIENT'}</div>
              </div>
            </div>
          </div>
        </header>

        {simulating && (
          <div style={{ background: '#eef2ff', border: '1px solid #e0e7ff', padding: '16px', borderRadius: '16px', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="pulse-dot" style={{ background: 'var(--accent)' }} />
            <span>[DEMO SIMULATOR ACTIVE] {simStep}</span>
          </div>
        )}

        {/* ACTIVE SOS COMMAND BAR */}
        {activeSos && (
          <div className="saas-card emergency-banner-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: 800 }}>
                  🚨 CRITICAL EMERGENCY ACTIVE — SOS-{activeSos.id}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  <strong>Trigger metrics:</strong> {activeSos.detectedVitals} | <strong>Risk Level:</strong> {activeSos.riskScore}/100 ({activeSos.severity})
                </p>
              </div>
              <span className="pill-status critical" style={{ fontSize: '12px', padding: '6px 14px' }}>
                {trackingData?.status || activeSos.status}
              </span>
            </div>

            <div className="resource-dispatch-row">
              <div className="resource-mini-card">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>🏥 Assigned Hospital</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px', marginTop: '2px' }}>
                  {assignedHospital?.name || 'Locating closest capability...'}
                </span>
                {assignedHospital && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-green)', fontWeight: 600, marginTop: '2px' }}>
                    ✓ Capacity lock reserved
                  </span>
                )}
              </div>

              <div className="resource-mini-card">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>👨‍⚕️ Assigned Doctor</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px', marginTop: '2px' }}>
                  {assignedDoctor?.name || 'Matching specialist...'}
                </span>
                {assignedDoctor && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {assignedDoctor.specialization}
                  </span>
                )}
              </div>

              <div className="resource-mini-card">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>🚑 Dispatched Ambulance</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px', marginTop: '2px' }}>
                  {trackingData?.sosId ? `Unit AMB-${trackingData.sosId}` : 'Dispatching unit...'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: 700, marginTop: '2px' }}>
                  ETA: {trackingData?.eta || 'Estimating...'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                <span>Ambulance Route Journey Progress</span>
                <span>{((trackingData?.progress || 0) * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(0,0,0,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--accent-red)', width: `${(trackingData?.progress || 0) * 100}%`, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'vitals' && (
          <>
            {/* GREETING HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Good evening, {user?.fullName || 'Rahul Sharma'}
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Am I safe? <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>● Live monitoring active</span>
                </p>
              </div>

              <button 
                onClick={startSimulation} 
                disabled={simulating || activeSos} 
                className="btn-primary"
                style={{ background: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}
              >
                ⚡ Start Emergency Simulation
              </button>
            </div>

            {/* VITALS KEY CARDS */}
            <div className="vitals-grid-row">
              {/* Heart Rate Card */}
              <div className="saas-card vital-card">
                <div className="vital-top">
                  <div className="vital-icon-box hr">❤️</div>
                  <span className={`pill-status ${getVitalStatus('hr', latestVital?.heartRate) === 'CRITICAL' ? 'critical' : getVitalStatus('hr', latestVital?.heartRate) === 'WARNING' ? 'warning' : 'normal'}`}>
                    {getVitalStatus('hr', latestVital?.heartRate)}
                  </span>
                </div>
                <div>
                  <div className="vital-value-row">
                    <span className="vital-value">{latestVital?.heartRate?.toFixed(0) || '--'}</span>
                    <span className="vital-unit">BPM</span>
                  </div>
                  <div className="vital-bottom">
                    <span style={{ color: 'var(--text-muted)' }}>{getTrendIndicator('hr', latestVital?.heartRate)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>Heart Rate</span>
                  </div>
                </div>
              </div>

              {/* SpO2 Card */}
              <div className="saas-card vital-card">
                <div className="vital-top">
                  <div className="vital-icon-box spo2">🫁</div>
                  <span className={`pill-status ${getVitalStatus('spo2', latestVital?.spo2) === 'CRITICAL' ? 'critical' : getVitalStatus('spo2', latestVital?.spo2) === 'WARNING' ? 'warning' : 'normal'}`}>
                    {getVitalStatus('spo2', latestVital?.spo2)}
                  </span>
                </div>
                <div>
                  <div className="vital-value-row">
                    <span className="vital-value">{latestVital?.spo2?.toFixed(0) || '--'}</span>
                    <span className="vital-unit">%</span>
                  </div>
                  <div className="vital-bottom">
                    <span style={{ color: 'var(--text-muted)' }}>{getTrendIndicator('spo2', latestVital?.spo2)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>Oxygen Saturation</span>
                  </div>
                </div>
              </div>

              {/* Temperature Card */}
              <div className="saas-card vital-card">
                <div className="vital-top">
                  <div className="vital-icon-box temp">🌡️</div>
                  <span className={`pill-status ${getVitalStatus('temp', latestVital?.temperature) === 'CRITICAL' ? 'critical' : getVitalStatus('temp', latestVital?.temperature) === 'WARNING' ? 'warning' : 'normal'}`}>
                    {getVitalStatus('temp', latestVital?.temperature)}
                  </span>
                </div>
                <div>
                  <div className="vital-value-row">
                    <span className="vital-value">{latestVital?.temperature?.toFixed(1) || '--'}</span>
                    <span className="vital-unit">°C</span>
                  </div>
                  <div className="vital-bottom">
                    <span style={{ color: 'var(--text-muted)' }}>{getTrendIndicator('temp', latestVital?.temperature)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>Body Temperature</span>
                  </div>
                </div>
              </div>

              {/* AI Risk Card */}
              <div className="saas-card vital-card" style={{ borderLeft: '3px solid var(--accent)' }}>
                <div className="vital-top">
                  <div className="vital-icon-box risk">🤖</div>
                  <span className={`pill-status ${trendAnalysis?.warning ? 'critical' : 'normal'}`}>
                    {trendAnalysis?.prediction || 'LOW RISK'}
                  </span>
                </div>
                <div>
                  <div className="vital-value-row">
                    <span className="vital-value">{trendAnalysis?.risk_score || '--'}</span>
                    <span className="vital-unit">/ 100</span>
                  </div>
                  <div className="vital-bottom">
                    <span style={{ color: 'var(--text-muted)' }}>AI-assisted risk analysis</span>
                    <span style={{ color: 'var(--text-muted)' }}>Health Risk Score</span>
                  </div>
                </div>
              </div>
            </div>

            {/* GRID LAYOUT: CHART + SIDE ANALYTICS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', alignItems: 'start' }} className="saas-grid-layout">
              {/* Analytics Card */}
              <div className="saas-card">
                <div className="card-header">
                  <h3 className="card-title">📈 Live Vital Analytics</h3>
                  <div className="analytics-header-controls">
                    <div className="toggle-group">
                      <button className={`toggle-item-btn ${activeChartMetric === 'hr' ? 'active' : ''}`} onClick={() => setActiveChartMetric('hr')}>
                        HR
                      </button>
                      <button className={`toggle-item-btn ${activeChartMetric === 'spo2' ? 'active' : ''}`} onClick={() => setActiveChartMetric('spo2')}>
                        SpO₂
                      </button>
                      <button className={`toggle-item-btn ${activeChartMetric === 'temp' ? 'active' : ''}`} onClick={() => setActiveChartMetric('temp')}>
                        Temp
                      </button>
                    </div>

                    <div className="toggle-group">
                      <button className={`toggle-item-btn ${activeTimeRange === '30m' ? 'active' : ''}`} onClick={() => setActiveTimeRange('30m')}>
                        30m
                      </button>
                      <button className={`toggle-item-btn ${activeTimeRange === '1h' ? 'active' : ''}`} onClick={() => setActiveTimeRange('1h')}>
                        1h
                      </button>
                      <button className={`toggle-item-btn ${activeTimeRange === '24h' ? 'active' : ''}`} onClick={() => setActiveTimeRange('24h')}>
                        24h
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '10px 0' }}>
                  <SVGLineChart
                    data={vitalsHistory.map(v => activeChartMetric === 'hr' ? v.heartRate : activeChartMetric === 'spo2' ? v.spo2 : v.temperature)}
                    color={activeChartMetric === 'hr' ? 'var(--accent-red)' : activeChartMetric === 'spo2' ? 'var(--accent-blue)' : 'var(--accent-amber)'}
                    title={activeChartMetric.toUpperCase()}
                    unit={activeChartMetric === 'temp' ? '°C' : activeChartMetric === 'spo2' ? '%' : 'BPM'}
                    minValDefault={activeChartMetric === 'hr' ? 60 : activeChartMetric === 'spo2' ? 90 : 36}
                    maxValDefault={activeChartMetric === 'hr' ? 100 : activeChartMetric === 'spo2' ? 100 : 38}
                  />
                </div>

                <div className="analytics-stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Latest</span>
                    <span className="stat-val">{stats.latest}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Average</span>
                    <span className="stat-val">{stats.avg}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Minimum</span>
                    <span className="stat-val">{stats.min}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Maximum</span>
                    <span className="stat-val">{stats.max}</span>
                  </div>
                </div>
              </div>

              {/* Side controls/logger */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="saas-card">
                  <h3 className="card-title" style={{ marginBottom: '14px' }}>🤖 AI Health Risk Analysis</h3>
                  {trendAnalysis ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>Current rating status:</span>
                        <span style={{ color: trendAnalysis.warning ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                          {trendAnalysis.prediction.toUpperCase()} ({trendAnalysis.risk_score}/100)
                        </span>
                      </div>
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                        {trendAnalysis.warnings && trendAnalysis.warnings.length > 0 ? (
                          <ul style={{ paddingLeft: '20px', color: 'var(--accent-red)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {trendAnalysis.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                          </ul>
                        ) : (
                          <div style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                            ✓ Vitals stable. No regression anomalies detected.
                          </div>
                        )}
                      </div>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                        AI-assisted risk analysis — prototype only, not a medical diagnosis.
                      </p>
                    </div>
                  ) : <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Log vitals telemetry to activate AI triage.</p>}
                </div>

                <div className="saas-card">
                  <h3 className="card-title" style={{ marginBottom: '14px' }}>✍️ Vital Intake Registry</h3>
                  <form onSubmit={postVital} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label>Heart Rate</label>
                      <input type="number" value={vitalForm.heart_rate} onChange={e => setVitalForm(p => ({ ...p, heart_rate: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="form-group">
                      <label>SpO₂</label>
                      <input type="number" value={vitalForm.spO2} onChange={e => setVitalForm(p => ({ ...p, spO2: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="form-group">
                      <label>Temp (°C)</label>
                      <input type="number" step="0.1" value={vitalForm.temperature} onChange={e => setVitalForm(p => ({ ...p, temperature: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <button type="submit" className="btn-primary" style={{ width: '100%' }}>💾 Log Vital Stats</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: MONITORING / SOS */}
        {activeTab === 'sos' && (
          <div style={{ display: 'grid', gridTemplateColumns: activeSos ? '1.2fr 0.8fr' : '1fr', gap: '20px' }} className="saas-grid-layout">
            {activeSos ? (
              <>
                {/* Left pane: Simulator map & timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="saas-card map-card-wrapper">
                    <MapComponent
                      patientLoc={[activeSos.latitude, activeSos.longitude]}
                      ambulanceLoc={trackingData?.ambulanceLatitude ? [trackingData.ambulanceLatitude, trackingData.ambulanceLongitude] : null}
                      hospitalLoc={assignedHospital ? [assignedHospital.lat, assignedHospital.lng] : [12.9252, 77.6011]}
                    />
                    <div className="map-disclaimer">Prototype GPS simulation — not real-world tracking</div>
                  </div>

                  <div className="saas-card">
                    <h3 className="card-title" style={{ marginBottom: '20px' }}>📋 Emergency Response Timeline</h3>
                    <div className="saas-timeline">
                      {timelineEvents.map((t, idx) => (
                        <div key={idx} className="timeline-item">
                          <div className="timeline-dot-wrapper">
                            <div className={`t-dot ${idx === 0 ? 'active' : ''}`} />
                            {idx < timelineEvents.length - 1 && <div className="t-connector" />}
                          </div>
                          <div className="timeline-info">
                            <span className="timeline-status">{t.status}</span>
                            <span className="timeline-time">{new Date(t.timestamp).toLocaleTimeString()}</span>
                            <p className="timeline-desc">{t.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right pane: Hospital details, medical team, family status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="saas-card">
                    <h3 className="card-title" style={{ marginBottom: '14px' }}>🏥 Assigned Hospital</h3>
                    {assignedHospital ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.18)', padding: '16px', borderRadius: '12px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent-green)' }}>{assignedHospital.name}</span>
                        <p style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                          <strong>Rating:</strong> {assignedHospital.rating}★ | <strong>Beds:</strong> {assignedHospital.availableBeds} available
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <strong>ETA:</strong> {trackingData?.progress ? (11.4 - trackingData.progress * 11.4).toFixed(1) : '11.4'} min
                        </p>
                      </div>
                    ) : <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Matching hospital capabilities...</p>}
                  </div>

                  <div className="saas-card">
                    <h3 className="card-title" style={{ marginBottom: '14px' }}>👨‍⚕️ Assigned Medical Team</h3>
                    {assignedDoctor ? (
                      <div style={{ background: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.18)', padding: '16px', borderRadius: '12px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)' }}>Dr. {assignedDoctor.name}</span>
                        <p style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-secondary)' }}>
                          <strong>Specialty:</strong> {assignedDoctor.specialization}
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <strong>Hospital:</strong> {assignedHospital?.name}
                        </p>
                      </div>
                    ) : <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Awaiting specialist specialist assignment...</p>}
                  </div>

                  <div className="saas-card">
                    <h3 className="card-title" style={{ marginBottom: '14px' }}>👨‍👩‍👦 Family Notifications</h3>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                      <div style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>✓ Emergency notification sent</div>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Broadcast pushed to registered family contacts.</p>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Status: Delivered | Timestamp: {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="saas-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h3 className="card-title" style={{ marginBottom: '14px', fontSize: '16px' }}>🚨 Manual SOS Alert Dispatch</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  If you are experiencing chest discomfort or shortness of breath, select your symptoms below.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  {['Chest Pain', 'Shortness of breath', 'Loss of Consciousness', 'Thermal Fever', 'Asthmatic Fit'].map(s => (
                    <label 
                      key={s} 
                      style={{ 
                        display: 'flex', 
                        gap: '8px', 
                        alignItems: 'center', 
                        padding: '12px', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '10px', 
                        cursor: 'pointer',
                        background: symptomList.includes(s) ? 'var(--accent-light)' : '#ffffff',
                        borderColor: symptomList.includes(s) ? 'var(--accent)' : 'var(--border-color)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={symptomList.includes(s)}
                        onChange={() => {
                          setSymptomList(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
                        }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{s}</span>
                    </label>
                  ))}
                </div>

                <div className="form-group">
                  <label>Onset Description</label>
                  <textarea
                    placeholder="Provide details about the issue..."
                    style={{ width: '100%', minHeight: '80px' }}
                    value={symptomDesc}
                    onChange={(e) => setSymptomDesc(e.target.value)}
                  />
                </div>

                <button 
                  onClick={triggerSos} 
                  className="btn-primary" 
                  style={{ width: '100%', background: 'var(--accent-red)', padding: '14px', fontSize: '14px' }}
                >
                  🚨 TRIGGER EMERGENCY SOS DISPATCH
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAST HISTORY LOGS */}
        {activeTab === 'history' && (
          <div className="saas-card">
            <h3 className="card-title" style={{ marginBottom: '20px' }}>Past Emergency Incident Logs</h3>
            
            {pastEmergencies.length > 0 ? (
              <div className="data-table-wrapper">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Emergency ID</th>
                      <th>Date</th>
                      <th>Severity</th>
                      <th>Required Dept</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastEmergencies.map((pe) => (
                      <tr key={pe.id}>
                        <td style={{ fontWeight: 700 }}>SOS-{pe.id}</td>
                        <td>{new Date(pe.createdAt).toLocaleString()}</td>
                        <td>
                          <span className={`pill-status ${pe.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
                            {pe.severity}
                          </span>
                        </td>
                        <td>{pe.requiredDepartment}</td>
                        <td style={{ fontWeight: 600 }}>{pe.status}</td>
                        <td>
                          <button 
                            onClick={async () => {
                              setSelectedPastSos(pe);
                              try {
                                const res = await API.get(`/emergencies/${pe.id}/timeline`);
                                setPastTimelineEvents(res.data);
                              } catch (err) {
                                console.error(err);
                              }
                            }} 
                            className="btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '11px' }}
                          >
                            View Timeline
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>No historical events recorded.</p>}

            {selectedPastSos && (
              <div style={{ marginTop: '30px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700 }}>Timeline Event Log: SOS-{selectedPastSos.id}</h3>
                  <button onClick={() => setSelectedPastSos(null)} style={{ color: 'var(--accent-red)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    Close Log View
                  </button>
                </div>
                <div className="saas-timeline">
                  {pastTimelineEvents.map((t, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-dot-wrapper">
                        <div className="t-dot" />
                        {idx < pastTimelineEvents.length - 1 && <div className="t-connector" />}
                      </div>
                      <div className="timeline-info">
                        <span className="timeline-status">{t.status}</span>
                        <span className="timeline-time">{new Date(t.timestamp).toLocaleTimeString()}</span>
                        <p className="timeline-desc">{t.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CHAT */}
        {activeTab === 'chat' && (
          <div className="saas-card" style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '520px', padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>
              🤖 Clinical Med-AI Chat Advisor
            </div>
            
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', background: '#f8fafc' }}>
              {chatMessages.map((msg, index) => (
                <div key={index} style={{ alignSelf: msg.sender === 'AI' ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                  <div style={{ 
                    background: msg.sender === 'AI' ? '#ffffff' : 'var(--accent)', 
                    color: msg.sender === 'AI' ? 'var(--text-primary)' : '#ffffff', 
                    padding: '12px 16px', 
                    borderRadius: '16px', 
                    fontSize: '13px',
                    border: msg.sender === 'AI' ? '1px solid var(--border-color)' : 'none',
                    boxShadow: msg.sender === 'AI' ? 'var(--shadow-card)' : 'none'
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Ask AI advisor about cardiac symptoms..."
                style={{ flex: 1, padding: '11px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', outline: 'none', fontSize: '13px' }}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
              />
              <button onClick={handleSendChat} className="btn-primary" style={{ padding: '0 20px' }}>Send</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default UserDashboard;
