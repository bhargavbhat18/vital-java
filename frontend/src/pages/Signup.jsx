import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const queryRole = searchParams.get('role')?.toUpperCase();
  const initialRole = ['PATIENT', 'FAMILY_MEMBER', 'DOCTOR', 'HOSPITAL_ADMIN', 'AMBULANCE_DRIVER'].includes(queryRole)
    ? queryRole
    : 'PATIENT';

  const [formData, setFormData] = useState({
    role: initialRole,
    fullName: '',
    email: '',
    password: '',
    phone: '',
    // Patient specific
    age: '',
    bloodGroup: '',
    address: '',
    latitude: 12.9716,
    longitude: 77.5946,
    doctorName: '',
    doctorPhone: '',
    doctorHospital: '',
    // Doctor specific
    medicalLicense: '',
    specialization: 'Emergency Medicine',
    hospitalAffiliation: '',
    // Hospital Admin specific
    hospitalName: '',
    hospitalAddress: '',
    hospitalRegistrationNumber: '',
    // Ambulance Driver specific
    drivingLicense: '',
    vehicleNumber: '',
    organization: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittedApplicant, setSubmittedApplicant] = useState(null);

  useEffect(() => {
    if (queryRole && ['PATIENT', 'FAMILY_MEMBER', 'DOCTOR', 'HOSPITAL_ADMIN', 'AMBULANCE_DRIVER'].includes(queryRole)) {
      setFormData(prev => ({ ...prev, role: queryRole }));
    }
  }, [queryRole]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
    }));
  };

  const handleRoleChange = (selectedRole) => {
    setError('');
    setFormData(prev => ({ ...prev, role: selectedRole }));
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
        },
        () => alert('Could not fetch GPS location. Using default coordinates.')
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
      const submitData = { ...formData };
      if (submitData.age === '') delete submitData.age;
      if (submitData.latitude === '') delete submitData.latitude;
      if (submitData.longitude === '') delete submitData.longitude;

      const res = await register(submitData);

      if (submitData.role === 'PATIENT' || submitData.role === 'FAMILY_MEMBER') {
        if (res.role === 'PATIENT' || res.role === 'FAMILY_MEMBER') {
          navigate('/user-dashboard');
        } else {
          navigate('/healthcare-dashboard');
        }
      } else {
        // Privileged applicant roles -> display awaiting approval screen
        setSubmittedApplicant({
          role: submitData.role,
          fullName: submitData.fullName,
          email: submitData.email,
          phone: submitData.phone,
          details: submitData.role === 'DOCTOR'
            ? `License: ${submitData.medicalLicense} • Spec: ${submitData.specialization} • Hospital: ${submitData.hospitalAffiliation || 'Pending'}`
            : submitData.role === 'HOSPITAL_ADMIN'
            ? `Hospital: ${submitData.hospitalName} • Reg #: ${submitData.hospitalRegistrationNumber}`
            : `License: ${submitData.drivingLicense} • Vehicle: ${submitData.vehicleNumber || 'Auto-assign'}`
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please check your information and try again.');
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: 'PATIENT', label: 'Patient', icon: '👤', desc: 'Emergency SOS & live biometric vitals' },
    { value: 'FAMILY_MEMBER', label: 'Family Member', icon: '👨‍👩‍👧', desc: 'Monitor & receive emergency alerts' },
    { value: 'DOCTOR', label: 'Specialist Doctor', icon: '👨‍⚕️', desc: 'Clinical dashboard & triage response' },
    { value: 'HOSPITAL_ADMIN', label: 'Hospital Admin', icon: '🏥', desc: 'Emergency admissions & bed capacity' },
    { value: 'AMBULANCE_DRIVER', label: 'Ambulance Driver', icon: '🚑', desc: 'Live dispatch & navigation' },
  ];

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const specializations = [
    'Emergency Medicine',
    'Cardiology',
    'Neurology',
    'Pulmonology',
    'Trauma Surgery',
    'Orthopedics',
    'General Medicine',
    'Pediatrics',
    'Intensive Care (ICU)'
  ];

  if (submittedApplicant) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'var(--color-gray-50)',
        padding: 'var(--space-6)'
      }}>
        <div className="card" style={{ maxWidth: '580px', width: '100%', padding: 'var(--space-8)', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
          <div style={{ fontSize: '54px', marginBottom: 'var(--space-4)' }}>⏳</div>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(234, 179, 8, 0.15)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            color: '#b45309',
            fontSize: '12px',
            fontWeight: 800,
            marginBottom: 'var(--space-4)',
            textTransform: 'uppercase'
          }}>
            Status: Awaiting Admin Approval
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: '12px' }}>
            Registration Submitted Successfully
          </h2>
          <p style={{ color: 'var(--color-gray-600)', fontSize: '14px', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
            Your <strong>{submittedApplicant.role.replace('_', ' ')}</strong> application has been received with <strong>PENDING</strong> status. An authorized System Administrator will review your credentials and verify your institutional affiliation.
          </p>

          <div style={{ background: 'var(--color-gray-100)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', textAlign: 'left', marginBottom: 'var(--space-6)', fontSize: '13px' }}>
            <div style={{ fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>Application Summary:</div>
            <div><strong>Applicant:</strong> {submittedApplicant.fullName}</div>
            <div><strong>Email:</strong> {submittedApplicant.email}</div>
            <div><strong>Phone:</strong> {submittedApplicant.phone || 'N/A'}</div>
            <div><strong>Details:</strong> {submittedApplicant.details}</div>
          </div>

          <p style={{ color: 'var(--color-gray-500)', fontSize: '12px', marginBottom: 'var(--space-6)' }}>
            Once approved, you can log in immediately with your Gmail address and password.
          </p>

          <Link to="/login" className="btn btn-primary w-full" style={{ padding: '12px', fontWeight: 800, textDecoration: 'none', display: 'block' }}>
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'var(--color-gray-50)',
      padding: 'var(--space-6)',
    }}>
      <div style={{ width: '100%', maxWidth: '780px' }}>
        <div className="card" style={{ padding: 'var(--space-8)', boxShadow: 'var(--shadow-xl)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div className="avatar avatar-xl" style={{
              margin: '0 auto var(--space-4)',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
              fontSize: '28px'
            }}>
              🛡️
            </div>
            <h1 style={{
              fontSize: 'var(--font-size-3xl)',
              fontWeight: 'var(--font-weight-extrabold)',
              color: 'var(--color-gray-900)',
              marginBottom: 'var(--space-2)',
            }}>
              Join VitalGuard Network
            </h1>
            <p style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 'var(--space-2)',
            }}>
              Emergency Healthcare Command & Telemetry
            </p>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
              Select your role and enter your details below
            </p>
          </div>

          {/* Role Selector Tabs */}
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 'var(--space-2)',
              background: 'var(--color-gray-100)',
              padding: '6px',
              borderRadius: 'var(--radius-xl)'
            }}>
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleRoleChange(opt.value)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 'var(--radius-lg)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    background: formData.role === opt.value ? 'white' : 'transparent',
                    boxShadow: formData.role === opt.value ? 'var(--shadow-sm)' : 'none',
                    color: formData.role === opt.value ? 'var(--color-primary)' : 'var(--color-gray-600)',
                    fontWeight: formData.role === opt.value ? 800 : 600,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{opt.icon}</span>
                  <span style={{ fontSize: '11px', textAlign: 'center', lineHeight: 1.2 }}>{opt.label}</span>
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '8px' }}>
              {roleOptions.find(o => o.value === formData.role)?.desc}
            </div>
          </div>

          {/* Role Status Note */}
          {formData.role !== 'PATIENT' && formData.role !== 'FAMILY_MEMBER' && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: '#0284c7',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>ℹ️</span>
              <span>
                <strong>Admin Approval Required:</strong> {formData.role.replace('_', ' ')} accounts require verification and approval by a system administrator before dashboard access is granted.
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="alert alert-critical" style={{ marginBottom: 'var(--space-5)' }}>
              <span style={{ fontSize: '18px' }}>🚨</span>
              <div>
                <div className="alert-title">Registration Error</div>
                <div className="alert-message">{error}</div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            
            {/* Common Credentials */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: 'var(--space-3)' }}>
                Account Credentials
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="fullName">
                    {formData.role === 'HOSPITAL_ADMIN' ? 'Administrator Name' : 'Full Name'} *
                  </label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    className="form-input"
                    placeholder={formData.role === 'DOCTOR' ? 'Dr. Sarah Jenkins' : 'Rahul Sharma'}
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="email">Gmail / Email Address *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="form-input"
                    placeholder="user@gmail.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="password">Password *</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    className="form-input"
                    placeholder="•••••••• (min 6 chars)"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="phone">Phone Number *</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    className="form-input"
                    placeholder="+91 9880123456"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </div>

            {/* DOCTOR SPECIFIC FIELDS */}
            {formData.role === 'DOCTOR' && (
              <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: 'var(--space-3)' }}>
                  Medical Professional Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="medicalLicense">Medical Registration / License Number *</label>
                    <input
                      type="text"
                      id="medicalLicense"
                      name="medicalLicense"
                      className="form-input"
                      placeholder="MCI-2024-88492"
                      value={formData.medicalLicense}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="specialization">Clinical Specialization *</label>
                    <select
                      id="specialization"
                      name="specialization"
                      className="form-select"
                      value={formData.specialization}
                      onChange={handleChange}
                      required
                    >
                      {specializations.map(spec => (
                        <option key={spec} value={spec}>{spec}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="hospitalAffiliation">Primary Hospital Affiliation *</label>
                    <input
                      type="text"
                      id="hospitalAffiliation"
                      name="hospitalAffiliation"
                      className="form-input"
                      placeholder="e.g. Apollo Hospital, Manipal Hospital"
                      value={formData.hospitalAffiliation}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* HOSPITAL ADMIN SPECIFIC FIELDS */}
            {formData.role === 'HOSPITAL_ADMIN' && (
              <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: 'var(--space-3)' }}>
                  Hospital Institution Details
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="hospitalName">Hospital / Medical Center Name *</label>
                    <input
                      type="text"
                      id="hospitalName"
                      name="hospitalName"
                      className="form-input"
                      placeholder="e.g. Apollo Hospital Bannerghatta"
                      value={formData.hospitalName}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="hospitalRegistrationNumber">Hospital Registration / License #</label>
                    <input
                      type="text"
                      id="hospitalRegistrationNumber"
                      name="hospitalRegistrationNumber"
                      className="form-input"
                      placeholder="HSP-REG-2024-912"
                      value={formData.hospitalRegistrationNumber}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="hospitalAddress">Hospital Address *</label>
                    <input
                      type="text"
                      id="hospitalAddress"
                      name="hospitalAddress"
                      className="form-input"
                      placeholder="154/11 Bannerghatta Road, Bangalore"
                      value={formData.hospitalAddress}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* AMBULANCE DRIVER SPECIFIC FIELDS */}
            {formData.role === 'AMBULANCE_DRIVER' && (
              <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: 'var(--space-3)' }}>
                  Ambulance & Driver Credentials
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="drivingLicense">Commercial Driving License # *</label>
                    <input
                      type="text"
                      id="drivingLicense"
                      name="drivingLicense"
                      className="form-input"
                      placeholder="DL-KA-01-2018-09124"
                      value={formData.drivingLicense}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="vehicleNumber">Vehicle Number / Unit ID</label>
                    <input
                      type="text"
                      id="vehicleNumber"
                      name="vehicleNumber"
                      className="form-input"
                      placeholder="KA-01-EA-1024 (or AMB-01)"
                      value={formData.vehicleNumber}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="organization">Hospital / Emergency Fleet Organization</label>
                    <input
                      type="text"
                      id="organization"
                      name="organization"
                      className="form-input"
                      placeholder="e.g. Apollo Hospital Emergency Fleet"
                      value={formData.organization}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PATIENT & FAMILY SPECIFIC FIELDS */}
            {(formData.role === 'PATIENT' || formData.role === 'FAMILY_MEMBER') && (
              <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: 'var(--space-3)' }}>
                  Profile & Location
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                  {formData.role === 'PATIENT' && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="age">Age</label>
                        <input
                          type="number"
                          id="age"
                          name="age"
                          className="form-input"
                          placeholder="45"
                          value={formData.age}
                          onChange={handleChange}
                          min="1"
                          max="120"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="bloodGroup">Blood Group</label>
                        <select
                          id="bloodGroup"
                          name="bloodGroup"
                          className="form-select"
                          value={formData.bloodGroup}
                          onChange={handleChange}
                        >
                          <option value="">Select Blood Group</option>
                          {bloodGroups.map(bg => (
                            <option key={bg} value={bg}>{bg}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="address">Address</label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      className="form-input"
                      placeholder="Street address, City, State"
                      value={formData.address}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">GPS Coordinates</label>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <input
                        type="number"
                        step="any"
                        name="latitude"
                        className="form-input"
                        placeholder="Latitude"
                        value={formData.latitude}
                        onChange={handleChange}
                        required
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        step="any"
                        name="longitude"
                        className="form-input"
                        placeholder="Longitude"
                        value={formData.longitude}
                        onChange={handleChange}
                        required
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleGeoLocation}
                        className="btn btn-secondary"
                        style={{ alignSelf: 'flex-end', height: '42px', padding: '0 var(--space-4)' }}
                      >
                        📍 Detect
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
              style={{ padding: 'var(--space-3)', fontSize: 'var(--font-size-base)', marginTop: 'var(--space-2)', fontWeight: 800 }}
            >
              {loading
                ? 'Processing Registration...'
                : formData.role === 'PATIENT' || formData.role === 'FAMILY_MEMBER'
                ? 'Create Account'
                : 'Submit Registration Request'}
            </button>
          </form>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 'var(--font-weight-semibold)', textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;