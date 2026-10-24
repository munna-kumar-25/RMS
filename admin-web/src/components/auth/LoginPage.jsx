import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import BackendConnectionStatus from '../common/BackendConnectionStatus.jsx';

const pageStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  background: 'linear-gradient(135deg, #172554 0%, #0f766e 48%, #f8fafc 48%, #f8fafc 100%)',
  fontFamily: 'Georgia, serif',
};

const cardStyle = {
  width: '100%',
  maxWidth: '440px',
  padding: '40px',
  background: '#ffffff',
  border: '1px solid rgba(15, 23, 42, 0.12)',
  boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '13px 42px 13px 42px',
  border: '1px solid #cbd5e1',
  fontSize: '15px',
  color: '#0f172a',
  outline: 'none',
};

const LoginPage = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (requestError) {
      setError(requestError.message || 'Cannot reach the server. Check that the RMS backend is running and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main style={pageStyle} data-auth-state="unauthenticated">
      <section style={cardStyle} aria-labelledby="login-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0f766e', marginBottom: '28px' }}>
          <ShieldCheck size={28} strokeWidth={1.8} />
          <span style={{ fontSize: '13px', letterSpacing: '0.14em', fontFamily: 'sans-serif', fontWeight: 700 }}>RMS ADMIN</span>
        </div>
        <h1 id="login-title" style={{ margin: 0, color: '#0f172a', fontSize: '34px', lineHeight: 1.1 }}>Welcome back</h1>
        <p style={{ margin: '12px 0 28px', color: '#64748b', fontFamily: 'sans-serif', lineHeight: 1.5 }}>Sign in to manage your restaurant operations.</p>

        <form onSubmit={submit}>
          <label style={{ display: 'block', marginBottom: '16px', color: '#334155', fontFamily: 'sans-serif', fontSize: '13px', fontWeight: 700 }}>
            Email address
            <div style={{ position: 'relative', marginTop: '7px' }}>
              <Mail size={17} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94a3b8' }} />
              <input style={inputStyle} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </div>
          </label>

          <label style={{ display: 'block', marginBottom: '16px', color: '#334155', fontFamily: 'sans-serif', fontSize: '13px', fontWeight: 700 }}>
            Password
            <div style={{ position: 'relative', marginTop: '7px' }}>
              <LockKeyhole size={17} style={{ position: 'absolute', top: '14px', left: '14px', color: '#94a3b8' }} />
              <input
                style={inputStyle}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', top: '10px', right: '10px', border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {error && <p role="alert" style={{ color: '#b91c1c', fontFamily: 'sans-serif', fontSize: '13px' }}>{error}</p>}
          <button type="submit" disabled={isSubmitting} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '14px', border: 0, background: isSubmitting ? '#94a3b8' : '#0f766e', color: '#fff', cursor: isSubmitting ? 'wait' : 'pointer', fontFamily: 'sans-serif', fontWeight: 700 }}>
            {isSubmitting ? 'Please wait...' : 'Sign in'}
            {!isSubmitting && <ArrowRight size={17} />}
          </button>
        </form>
      </section>
      <div style={{ marginTop: '16px' }}>
        <BackendConnectionStatus />
      </div>
    </main>
  );
};

export default LoginPage;
