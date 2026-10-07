import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

const Profile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    fullName: '',
    age: '',
    bloodGroup: '',
    address: '',
    latitude: '',
    longitude: '',
    doctorName: '',
    doctorPhone: '',
    doctorHospital: '',
  });

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      const res = await API.get('/auth/profile');
      if (res.data) {
        setProfile(res.data);
        setFormData({
          fullName: res.data.fullName || '',
          age: res.data.age || '',
          bloodGroup: res.data.bloodGroup || '',
          address: res.data.address || '',
          latitude: res.data.latitude || '',
          longitude: res.data.longitude || '',
          doctorName: res.data.doctorName || '',
          doctorPhone: res.data.doctorPhone || '',
          doctorHospital: res.data.doctorHospital || '',
        });
      }
    } catch (_err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const updates = {
        fullName: formData.fullName,
        age: formData.age ? parseInt(formData.age) : null,
        bloodGroup: formData.bloodGroup,
        address: formData.address,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        doctorName: formData.doctorName,
        doctorPhone: formData.doctorPhone,
        doctorHospital: formData.doctorHospital,
      };
      await API.put('/auth/profile', updates);
      setSuccess('Profile updated successfully');
      setEditing(false);
      fetchProfile();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f8f9fb', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>🛡️ VitalGuard</h2>
          <p style={{ color: '#475569' }}>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="dashboard-container">
        <header className="top-navbar">
          <div className="nav-left">
            <span className="brand-logo">🛡️</span>
            <span className="brand-name">VitalGuard</span>
          </div>
          <div className="nav-links">
            <button className="nav-link-btn" onClick={() => window.history.back()}>
              ← Back to Dashboard
            </button>
          </div>
          <div className="nav-right">
            <div className="user-profile-badge">
              <div className="avatar-circle">{user?.fullName?.charAt(0) || 'U'}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{user?.fullName || 'Patient'}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{user?.role || 'PATIENT'}</div>
              </div>
            </div>
          </div>
        </header>

        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Profile</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>Manage your personal and emergency information</p>

          {error && (
            <div style={{ background: '#fff1f0', border: '1px solid #ffccc7', color: 'var(--accent-red)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', color: 'var(--accent-green)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              {success}
            </div>
          )}

          {!editing ? (
            <div style={{ display: 'grid', gap: '20px' }}>
              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👤 Personal Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Full Name</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.fullName || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Email</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.email || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>UID</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{profile?.uid || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Age</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.age ? profile.age + ' years' : 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Blood Group</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.bloodGroup || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Role</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.role || 'PATIENT'}</p>
                  </div>
                </div>
              </div>

              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📍 Contact Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Address</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.address || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Latitude</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.latitude ? profile.latitude.toFixed(6) : 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Longitude</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.longitude ? profile.longitude.toFixed(6) : 'Not set'}</p>
                  </div>
                </div>
              </div>

              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🚨 Emergency Contact Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Doctor Name</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.doctorName || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Doctor Phone</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.doctorPhone || 'Not set'}</p>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Doctor Hospital</label>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.doctorHospital || 'Not set'}</p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(true)} className="btn-primary">
                  ✏️ Edit Profile
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
              <div className="saas-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 className="card-title" style={{ marginBottom: 0 }}>👤 Personal Information</h3>
                  <button type="button" onClick={() => { setFormData({
                    fullName: profile?.fullName || '',
                    age: profile?.age || '',
                    bloodGroup: profile?.bloodGroup || '',
                    address: profile?.address || '',
                    latitude: profile?.latitude || '',
                    longitude: profile?.longitude || '',
                    doctorName: profile?.doctorName || '',
                    doctorPhone: profile?.doctorPhone || '',
                    doctorHospital: profile?.doctorHospital || '',
                  }); setEditing(false); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Email (read-only)</label>
                    <input type="email" value={profile?.email || ''} readOnly style={{ background: '#f8fafc' }} />
                  </div>
                  <div className="form-group">
                    <label>UID (read-only)</label>
                    <input type="text" value={profile?.uid || ''} readOnly style={{ background: '#f8fafc', fontFamily: 'monospace' }} />
                  </div>
                  <div className="form-group">
                    <label>Age</label>
                    <input type="number" name="age" value={formData.age} onChange={handleChange} min="0" max="120" />
                  </div>
                  <div className="form-group">
                    <label>Blood Group</label>
                    <select name="bloodGroup" value={formData.bloodGroup} onChange={handleChange}>
                      <option value="">Select</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '16px' }}>📍 Contact Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Address</label>
                    <input type="text" name="address" value={formData.address} onChange={handleChange} placeholder="Enter your address" />
                  </div>
                  <div className="form-group">
                    <label>Latitude</label>
                    <input type="text" name="latitude" value={formData.latitude} onChange={handleChange} placeholder="e.g., 12.9716" />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input type="text" name="longitude" onChange={handleChange} value={formData.longitude} placeholder="e.g., 77.5946" />
                  </div>
                </div>
              </div>

              <div className="saas-card">
                <h3 className="card-title" style={{ marginBottom: '16px' }}>🚨 Emergency Contact Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group">
                    <label>Doctor Name</label>
                    <input type="text" name="doctorName" value={formData.doctorName} onChange={handleChange} placeholder="Primary doctor name" />
                  </div>
                  <div className="form-group">
                    <label>Doctor Phone</label>
                    <input type="tel" name="doctorPhone" value={formData.doctorPhone} onChange={handleChange} placeholder="Doctor's phone number" />
                  </div>
                  <div className="form-group">
                    <label>Doctor Hospital</label>
                    <input type="text" name="doctorHospital" value={formData.doctorHospital} onChange={handleChange} placeholder="Hospital name" />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditing(false)} className="btn-primary" style={{ background: 'var(--text-muted)' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: 'var(--accent)' }}>
                  💾 Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;