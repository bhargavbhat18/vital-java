import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'PATIENT',
    fullName: '',
    age: '',
    bloodGroup: '',
    address: '',
    latitude: 12.9716,
    longitude: 77.5946,
    doctorName: '',
    doctorPhone: '',
    doctorHospital: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'age' ? parseInt(value) || '' : value
    }));
  };

  const handleGeoLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }));
          alert('Location loaded successfully.');
        },
        (error) => {
          console.error(error);
          alert('Could not fetch location. Using default coordinates.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await register(formData);
      if (userData.role === 'PATIENT' || userData.role === 'FAMILY_MEMBER') {
        navigate('/user-dashboard');
      } else {
        navigate('/healthcare-dashboard');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary-gradient)', padding: '40px 20px' }}>
      <div className="saas-card" style={{ width: '100%', maxWidth: '640px', padding: '40px', background: '#ffffff', borderRadius: '24px', boxShadow: '0 20px 40px -10px rgba(103, 110, 144, 0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🛡️</div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Create Account</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '6px' }}>
            Join VitalGuard Health Network
          </p>
        </div>

        {error && (
          <div style={{ padding: '12px', background: '#fff1f0', border: '1px solid #ffa39e', color: 'var(--accent-red)', borderRadius: '10px', fontSize: '12px', marginBottom: '20px', textAlign: 'center', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="saas-grid-layout">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="name@email.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="role">Account Type (Role)</label>
              <select id="role" name="role" value={formData.role} onChange={handleChange} style={{ height: '43px' }}>
                <option value="PATIENT">Patient</option>
                <option value="FAMILY_MEMBER">Family Member</option>
                <option value="DOCTOR">Healthcare Doctor</option>
                <option value="HOSPITAL_ADMIN">Hospital Administrator</option>
                <option value="AMBULANCE_DRIVER">Ambulance Driver</option>
                <option value="ADMIN">Network Administrator</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                placeholder="e.g. Rahul Sharma"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>

            {formData.role === 'PATIENT' && (
              <>
                <div className="form-group">
                  <label htmlFor="age">Age</label>
                  <input
                    type="number"
                    id="age"
                    name="age"
                    placeholder="45"
                    value={formData.age}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bloodGroup">Blood Group</label>
                  <select
                    id="bloodGroup"
                    name="bloodGroup"
                    value={formData.bloodGroup}
                    onChange={handleChange}
                    required
                    style={{ height: '43px' }}
                  >
                    <option value="">Select Blood Group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="address">Address</label>
              <input
                type="text"
                id="address"
                name="address"
                placeholder="Street address, City"
                value={formData.address}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Geographic Coordinates</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  step="any"
                  name="latitude"
                  placeholder="Latitude"
                  value={formData.latitude}
                  onChange={(e) => setFormData(p => ({ ...p, latitude: parseFloat(e.target.value) || 0 }))}
                  required
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  step="any"
                  name="longitude"
                  placeholder="Longitude"
                  value={formData.longitude}
                  onChange={(e) => setFormData(p => ({ ...p, longitude: parseFloat(e.target.value) || 0 }))}
                  required
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={handleGeoLocation} style={{ padding: '0 16px', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  📍 Detect
                </button>
              </div>
            </div>

            {formData.role === 'PATIENT' && (
              <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px' }}>Primary Doctor Referral (Optional)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    name="doctorName"
                    placeholder="Doctor Name"
                    value={formData.doctorName}
                    onChange={handleChange}
                    style={{ padding: '10px', fontSize: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', outline: 'none' }}
                  />
                  <input
                    type="text"
                    name="doctorPhone"
                    placeholder="Doctor Phone"
                    value={formData.doctorPhone}
                    onChange={handleChange}
                    style={{ padding: '10px', fontSize: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', outline: 'none' }}
                  />
                  <input
                    type="text"
                    name="doctorHospital"
                    placeholder="Associated Hospital"
                    value={formData.doctorHospital}
                    onChange={handleChange}
                    style={{ padding: '10px', fontSize: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', outline: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '14px', borderRadius: '12px', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
