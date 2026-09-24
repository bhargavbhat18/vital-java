import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Demo accounts (development only)
  const demoAccounts = [
    { email: 'patient@vitaguard.com', role: 'PATIENT', password: 'password', desc: 'Patient Dashboard' },
    { email: 'family@vitaguard.com', role: 'FAMILY_MEMBER', password: 'password', desc: 'Family Dashboard' },
    { email: 'doctor@vitaguard.com', role: 'DOCTOR', password: 'password', desc: 'Doctor Dashboard' },
    { email: 'hospital-admin@vitalguard.com', role: 'HOSPITAL_ADMIN', password: 'password', desc: 'Hospital Admin Dashboard (Apollo Hospital)' },
    { email: 'ambulance-driver@vitalguard.com', role: 'AMBULANCE_DRIVER', password: 'password', desc: 'Ambulance Driver Dashboard (AMB-01)' },
    { email: 'sysadmin@vitaguard.com', role: 'SYSTEM_ADMIN', password: 'password', desc: 'System Admin Dashboard' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await login(email, password);
      // Backend-driven role redirect
      switch (userData.role) {
        case 'PATIENT':
        case 'FAMILY_MEMBER':
          navigate('/user-dashboard');
          break;
        case 'DOCTOR':
        case 'HOSPITAL_ADMIN':
        case 'AMBULANCE_DRIVER':
        case 'ADMIN':
        case 'SYSTEM_ADMIN':
          navigate('/healthcare-dashboard');
          break;
        default:
          navigate('/healthcare-dashboard');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (account) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  return (
    <div className="auth-container" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary-gradient)', padding: '20px' }}>
      <div className="saas-card" style={{ width: '100%', maxWidth: '420px', padding: '40px', background: '#ffffff', borderRadius: '24px', boxShadow: '0 20px 40px -10px rgba(103, 110, 144, 0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>🛡️</div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>VitalGuard</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '6px' }}>
            Health Command & Telemetry Network
          </p>
        </div>

        {error && (
          <div style={{ padding: '12px', background: '#fff1f0', border: '1px solid #ffa39e', color: 'var(--accent-red)', borderRadius: '10px', fontSize: '12px', marginBottom: '20px', textAlign: 'center', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <label htmlFor="email">Email address or User ID</label>
            <input
              type="text"
              id="email"
              placeholder="e.g. LKT01 or patient@vitaguard.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '14px', borderRadius: '12px' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Accounts Section (Development Only) */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Demo Accounts (Development)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            {demoAccounts.map((account, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => fillDemoAccount(account)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#f8fafc',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '11px',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => e.target.style.background = '#eef2ff'}
                onMouseOut={(e) => e.target.style.background = '#f8fafc'}
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{account.email}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '10px' }}>{account.role}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
            Password for all demo accounts: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>password</code>
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Don't have an account? <Link to="/signup" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign up</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
