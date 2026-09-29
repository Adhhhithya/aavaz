import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LANGUAGES } from '../i18n/translations';
import { AnimatePresence, motion } from 'motion/react';
import { OTPInput } from 'input-otp';

/* ─── Design tokens (from Stitch AAVAZ palette) ───────────────────── */
const C = {
  primary:       '#3525cd',
  primaryCont:   '#4f46e5',
  onPrimary:     '#ffffff',
  surface:       '#f8f9ff',
  surfaceCont:   '#e5eeff',
  surfaceContLow:'#eff4ff',
  surfaceContHigh:'#dce9ff',
  surfaceLowest: '#ffffff',
  onSurface:     '#0b1c30',
  onSurfaceVar:  '#464555',
  outline:       '#777587',
  outlineVar:    '#c7c4d8',
  error:         '#ba1a1a',
  errorCont:     '#ffdad6',
  onErrorCont:   '#93000a',
  secondary:     '#006c49',
  secondaryCont: '#6cf8bb',
  onSecondaryCont:'#00714d',
};

/* ─── Atmospheric background ──────────────────────────────────────── */
function AtmosphericBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <div style={{
        position: 'absolute', top: '-10rem', left: '-8rem',
        width: '650px', height: '650px', borderRadius: '9999px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
        filter: 'blur(64px)',
      }} />
      <div style={{
        position: 'absolute', top: '33%', right: '-7rem',
        width: '600px', height: '600px', borderRadius: '9999px',
        background: 'radial-gradient(circle, rgba(147,197,253,0.14) 0%, transparent 70%)',
        filter: 'blur(64px)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10rem', left: '25%',
        width: '750px', height: '550px', borderRadius: '9999px',
        background: 'radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)',
        filter: 'blur(64px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(248,249,255,0.7) 0%, rgba(244,247,254,0.5) 50%, rgba(238,243,254,0.8) 100%)',
      }} />
    </div>
  );
}

/* ─── AAVAZ Logo SVG ──────────────────────────────────────────────── */
function AavazLogo() {
  return (
    <svg className="h-10 w-auto" fill="none" viewBox="0 0 240 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="aavaz-grad" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect fill="url(#aavaz-grad)" height="44" rx="14" width="44" x="6" y="8" />
      <path d="M18 30h3v0a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-3v8z" fill="#E0E7FF" opacity="0.6" />
      <rect fill="#FFFFFF" height="20" rx="1.75" width="3.5" x="23" y="20" />
      <rect fill="#FFFFFF" height="30" rx="1.75" width="3.5" x="29" y="15" />
      <rect fill="#A5B4FC" height="14" rx="1.75" width="3.5" x="35" y="23" />
      <circle cx="41" cy="22" fill="#10B981" r="2.5" />
      <text fill="#0F172A" fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fontSize="24" fontWeight="900" letterSpacing="1.5" x="60" y="34">AAVAZ</text>
      <text fill="#6366F1" fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fontSize="9" fontWeight="600" letterSpacing="2.2" x="61" y="47">AI DISTRESS PREDICTION</text>
    </svg>
  );
}

/* ─── Slide animation variants ────────────────────────────────────── */
const STEP_VARIANTS = {
  enter:  { opacity: 0, x: 32 },
  center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
  exit:   { opacity: 0, x: -32, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
};

function StepPane({ stepKey, children }) {
  return (
    <motion.div key={stepKey} variants={STEP_VARIANTS} initial="enter" animate="center" exit="exit">
      {children}
    </motion.div>
  );
}

/* ─── Shared input styles ─────────────────────────────────────────── */
const inputBase = {
  width: '100%',
  background: C.surfaceLowest,
  border: `1px solid ${C.outlineVar}`,
  borderRadius: '0.75rem',
  padding: '0.625rem 0.75rem',
  fontSize: '0.9375rem',
  color: C.onSurface,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  transition: 'border-color 150ms, box-shadow 150ms',
};

/* ─── OTP Slot (compatible with input-otp v1) ─────────────────────── */
function OtpSlot({ char, hasFakeCaret }) {
  return (
    <div style={{
      height: '3rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.25rem', fontWeight: '700', fontFamily: '"Plus Jakarta Sans", sans-serif',
      background: C.surfaceLowest, border: `1.5px solid ${C.outlineVar}`, borderRadius: '0.75rem',
      color: C.onSurface, position: 'relative', transition: 'border-color 150ms',
      ...(hasFakeCaret ? { borderColor: C.primary, boxShadow: `0 0 0 2px ${C.primary}33` } : {}),
    }}>
      {char ?? ''}
      {hasFakeCaret && (
        <div style={{
          position: 'absolute', width: '2px', height: '1.25rem',
          background: C.primary, animation: 'caret-blink 1s step-end infinite',
        }} />
      )}
    </div>
  );
}

/* ─── Main Login component ────────────────────────────────────────── */
export default function Login() {
  const { language, setLanguage, t } = useLanguage();
  const [loginType, setLoginType] = useState('victim'); // 'victim' | 'authorities'
  const [phone, setPhone]         = useState('');
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  /* Victim OTP flow */
  const [showOtpInput, setShowOtpInput]       = useState(false);
  const [showOnboarding, setShowOnboarding]   = useState(false);
  const [otp, setOtp]                         = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState(language || 'hi');
  const [name, setName]                       = useState('');
  const [phoneVerifiedToken, setPhoneVerifiedToken] = useState(null);

  const isSubmitting = useRef(false);
  const { login }    = useAuth();
  const navigate     = useNavigate();

  const victimStep = showOnboarding ? 'onboarding' : showOtpInput ? 'otp' : 'phone';

  /* ── Victim login / OTP / onboarding ─────────────────────────────── */
  const handleVictimLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setLoading(true);
    setError('');

    try {
      if (!showOtpInput && !showOnboarding) {
        if (phone.replace(/\D/g, '').length < 10) { setError(t('errEnterValidPhone') || 'Please enter a valid 10-digit mobile number.'); return; }
        try {
          const res = await fetch('/api/v1/auth/otp/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
            body: JSON.stringify({ phone_number: phone }),
          });
          if (!res.ok) {
            setError(res.status === 429 ? (t('errTooManyAttempts') || 'Too many attempts. Please wait before retrying.') : (t('errCouldNotSendCode') || 'Could not send verification code. Try again.'));
          } else {
            setShowOtpInput(true);
          }
        } catch { setError(t('errNetwork') || 'Network error. Please check your connection.'); }
        return;
      }

      if (showOtpInput && !showOnboarding) {
        if (otp.length !== 6) { setError(t('errEnterFullCode') || 'Please enter the full 6-digit code.'); return; }
        const res = await fetch('/api/v1/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ phone_number: phone, code: otp }),
        });
        if (!res.ok) { setError(t('errIncorrectCode') || 'Incorrect or expired code.'); return; }
        const data = await res.json();
        if (data.is_new_user) {
          setPhoneVerifiedToken(data.token);
          setShowOnboarding(true);
          setShowOtpInput(false);
        } else {
          login({ id: data.userProfile.id, name: data.userProfile.name, role: data.userProfile.role_type, phone_number: phone, token: data.token });
          navigate('/victim/dashboard');
        }
      } else if (showOnboarding) {
        if (!phoneVerifiedToken) { setError(t('errPhoneExpired') || 'Phone verification expired. Please start over.'); return; }
        const regRes = await fetch('/api/v1/intake/app/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', 'Authorization': `Bearer ${phoneVerifiedToken}` },
          body: JSON.stringify({ name: name || 'Citizen', role_type: 'victim', consent_given: true, preferred_language: preferredLanguage }),
        });
        const regData = await regRes.json();
        if (regRes.ok && regData.status === 'success') {
          login({ id: regData.user_id, name: name || 'Citizen', role: 'victim', phone_number: phone, token: regData.token });
          navigate('/victim/dashboard');
        } else { setError(t('errRegistrationFailed') || 'Registration failed. Please try again.'); }
      }
    } catch { setError(t('errServerConnect') || 'Failed to connect to authentication server.'); }
    finally { isSubmitting.current = false; setLoading(false); }
  };

  /* ── Staff/authority login ─────────────────────────────────────── */
  const handleAuthorityLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) { setError(t('errInvalidCredentials') || 'Invalid credentials. Please check your ID and password.'); return; }
      const data = await res.json();
      login({
        ...data.user,
        token: data.access_token
      });
      if (data.user.role === 'counsellor') navigate('/counsellor/queue');
      else if (data.user.role === 'admin_district' || data.user.role === 'district_admin') navigate('/admin/district');
      else if (data.user.role === 'admin_state' || data.user.role === 'state_admin') navigate('/admin/state');
      else if (data.user.role === 'admin_national' || data.user.role === 'national_admin') navigate('/admin/national');
      else navigate('/');
    } catch { setError(t('errServerConnect') || 'Failed to connect to authentication server.'); }
    finally { isSubmitting.current = false; setLoading(false); }
  };

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <>
      {/* Google Fonts + Material Symbols */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      <style>{`
        .ms { font-family: 'Material Symbols Outlined'; font-size: 20px; line-height: 1; font-variation-settings: 'FILL' 0, 'wght' 400; user-select: none; }
        .ms-filled { font-variation-settings: 'FILL' 1, 'wght' 400; }
        @keyframes caret-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        input[type="text"]:focus, input[type="password"]:focus, input[type="tel"]:focus, select:focus {
          border-color: ${C.primary} !important;
          box-shadow: 0 0 0 2px ${C.primary}33 !important;
        }
        .role-btn { transition: all 150ms ease; }
        .aavaz-card { transition: box-shadow 200ms ease; }
        .submit-btn:hover:not(:disabled) { transform: scale(1.005); }
        .submit-btn:active:not(:disabled) { transform: scale(0.99); }
      `}</style>

      <AtmosphericBg />

      {/* Floating Language Switcher in Top Right */}
      <div style={{ position: 'fixed', top: '1.25rem', right: '1.5rem', zIndex: 50 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
          border: `1px solid ${C.outlineVar}70`, borderRadius: '9999px',
          padding: '0.3rem 0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }}>
          <span className="ms" style={{ fontSize: '18px', color: C.primary }}>translate</span>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPreferredLanguage(e.target.value);
            }}
            aria-label={t('languageSelectTitle')}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: C.onSurface,
              cursor: 'pointer',
              outline: 'none',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName} ({l.name})
              </option>
            ))}
          </select>
        </div>
      </div>

      <main style={{
        position: 'relative', zIndex: 10, minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', background: C.surface,
      }}>
        <div style={{ width: '100%', maxWidth: '560px' }}>

          {/* ── Emergency Banner ──────────────────────────────────── */}
          <div style={{
            background: `${C.errorCont}66`,
            border: `1px solid ${C.error}26`,
            borderRadius: '1rem', padding: '0.625rem 0.875rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.625rem', marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <span className="ms ms-filled" style={{ color: C.error, animation: 'caret-blink 1s step-start infinite', fontSize: '20px' }}>emergency</span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.onErrorCont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Inter, sans-serif' }}>
                  {t('immediateDangerTitle')}
                </span>
                <span style={{ fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  {t('emergencyLifelineSubtitle')}
                </span>
              </div>
            </div>
            <a href="tel:14416" style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem',
              padding: '0.375rem 0.75rem', borderRadius: '9999px',
              background: C.error, color: C.onPrimary,
              fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Inter, sans-serif',
              textDecoration: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              transition: 'background 150ms',
            }}>
              <span className="ms" style={{ fontSize: '14px' }}>call</span>
              {t('callEmergencyBtn')}
            </a>
          </div>

          {/* ── Glass Card ──────────────────────────────────────── */}
          <div className="aavaz-card" style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.65)',
            borderRadius: '1.5rem',
            boxShadow: '0 20px 60px -15px rgba(79,70,229,0.13), 0 10px 25px -5px rgba(15,23,42,0.07)',
            padding: '2rem 2.25rem',
          }}>

            {/* ── Branding ─────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.5rem' }}>
              <AavazLogo />
              <h1 style={{ marginTop: '0.75rem', fontSize: '1.625rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                {t('welcomeToSanctuary')}
              </h1>
              <p style={{ marginTop: '0.375rem', fontSize: '0.875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                {t('signInToAccess')}
              </p>
            </div>

            {/* ── Role Selector ─────────────────────────────────── */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, marginBottom: '0.5rem', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
                {t('selectAccessPortal')}
              </label>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                background: C.surfaceContLow, borderRadius: '1rem',
                border: `1px solid ${C.outlineVar}40`,
                padding: '0.25rem', gap: '0.25rem',
              }}>
                {[
                  { key: 'victim', icon: 'volunteer_activism', label: t('roleSurvivor') },
                  { key: 'authorities', icon: 'shield_person', label: t('roleAuthorities') },
                ].map(({ key, icon, label }) => {
                  const active = loginType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="role-btn"
                      onClick={() => { setLoginType(key); setError(''); setShowOtpInput(false); setShowOnboarding(false); setOtp(''); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        padding: '0.625rem 0.75rem', borderRadius: '0.75rem',
                        background: active ? C.primary : 'transparent',
                        color: active ? C.onPrimary : C.onSurface,
                        fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                        border: 'none', cursor: 'pointer',
                        boxShadow: active ? '0 2px 8px rgba(53,37,205,0.25)' : 'none',
                      }}
                    >
                      <span className="ms" style={{ fontSize: '18px', color: active ? C.onPrimary : C.primary }}>{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Error Banner ─────────────────────────────────── */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  style={{
                    marginBottom: '1rem',
                    background: C.errorCont,
                    border: `1px solid ${C.error}30`,
                    borderRadius: '0.75rem',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem', color: C.error,
                    fontFamily: 'Inter, sans-serif', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}
                >
                  <span className="ms" style={{ fontSize: '18px', color: C.error }}>error</span>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Forms ────────────────────────────────────────── */}
            {loginType === 'victim' ? (
              /* ── VICTIM: phone → OTP → onboarding ──────────── */
              <form onSubmit={handleVictimLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <AnimatePresence mode="wait">

                  {victimStep === 'phone' && (
                    <StepPane key="phone" stepKey="phone">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: C.onSurface, fontFamily: 'Inter, sans-serif' }} htmlFor="phone-input">
                            {t('loginPhoneLabel')}
                          </label>
                          <span style={{ fontSize: '0.6875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>e.g. +91 98765 43210</span>
                        </div>
                        <div style={{ display: 'flex', borderRadius: '0.75rem', overflow: 'hidden', border: `1px solid ${C.outlineVar}`, background: C.surfaceLowest, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.625rem 0.75rem', background: '#f1f5f9', borderRight: `1px solid ${C.outlineVar}50`, userSelect: 'none' }}>
                            <span style={{ fontSize: '1rem' }}>🇮🇳</span>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: C.onSurface, fontFamily: 'Inter, sans-serif' }}>+91</span>
                          </div>
                          <input
                            id="phone-input"
                            type="tel"
                            inputMode="numeric"
                            placeholder={t('loginPhonePlaceholder')}
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            autoFocus
                            required
                            style={{ ...inputBase, borderRadius: 0, border: 'none', boxShadow: 'none', flex: 1 }}
                          />
                        </div>
                      </div>
                    </StepPane>
                  )}

                  {victimStep === 'otp' && (
                    <StepPane key="otp" stepKey="otp">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: C.onSurface, fontFamily: 'Inter, sans-serif' }}>
                            {t('otpPasscodeLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => { setShowOtpInput(false); setOtp(''); setError(''); }}
                            style={{ fontSize: '0.75rem', color: C.primary, fontWeight: 500, fontFamily: 'Inter, sans-serif', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            {t('changeNumber')}
                          </button>
                        </div>
                        <p style={{ fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', marginTop: '-0.25rem' }}>
                          {t('sentToPhone')} <strong style={{ color: C.onSurface }}>+91 {phone}</strong>
                        </p>
                        <OTPInput
                          maxLength={6}
                          value={otp}
                          onChange={setOtp}
                          containerClassName="flex gap-2"
                          render={({ slots }) => (
                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                              {slots.map((slot, i) => <OtpSlot key={i} {...slot} />)}
                            </div>
                          )}
                        />
                      </div>
                    </StepPane>
                  )}

                  {victimStep === 'onboarding' && (
                    <StepPane key="onboarding" stepKey="onboarding">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ background: `${C.secondaryCont}33`, border: `1px solid ${C.secondary}20`, borderRadius: '0.875rem', padding: '0.875rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                          <span className="ms" style={{ fontSize: '18px', color: C.secondary, marginTop: '2px' }}>verified</span>
                          <div>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: C.secondary, fontFamily: 'Inter, sans-serif', margin: 0 }}>
                              {t('phoneVerified')}
                            </p>
                            <p style={{ fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', margin: '0.25rem 0 0' }}>
                              {t('createSafeProfileDesc')}
                            </p>
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: C.onSurface, fontFamily: 'Inter, sans-serif', display: 'block', marginBottom: '0.375rem' }} htmlFor="name-input">
                            {t('yourNameOptional')}
                          </label>
                          <input id="name-input" type="text" placeholder={t('namePlaceholder')} value={name} onChange={e => setName(e.target.value)} style={inputBase} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: C.onSurface, fontFamily: 'Inter, sans-serif', display: 'block', marginBottom: '0.375rem' }} htmlFor="lang-select">
                            {t('preferredLanguage')}
                          </label>
                          <select
                            id="lang-select"
                            value={preferredLanguage}
                            onChange={e => {
                              setPreferredLanguage(e.target.value);
                              setLanguage(e.target.value);
                            }}
                            style={{ ...inputBase }}
                          >
                            {LANGUAGES.map((l) => (
                              <option key={l.code} value={l.code}>
                                {l.nativeName} ({l.name})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </StepPane>
                  )}
                </AnimatePresence>

                <button
                  id="victim-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="submit-btn"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    background: loading ? '#9ca3af' : C.primary,
                    color: C.onPrimary, border: 'none', borderRadius: '0.75rem',
                    fontSize: '0.9375rem', fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(53,37,205,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    transition: 'all 150ms ease',
                  }}
                >
                  {loading
                    ? <><span className="ms" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>progress_activity</span> {t('btnProcessing')}</>
                    : victimStep === 'phone'
                      ? <><span className="ms" style={{ fontSize: '18px' }}>send</span> {t('btnSendVerificationCode')}</>
                      : victimStep === 'otp'
                        ? <><span className="ms" style={{ fontSize: '18px' }}>login</span> {t('btnVerifyEnterSanctuary')} <span className="ms" style={{ fontSize: '16px' }}>arrow_forward</span></>
                        : <><span className="ms" style={{ fontSize: '18px' }}>person_add</span> {t('btnCreateProfileEnter')} <span className="ms" style={{ fontSize: '16px' }}>arrow_forward</span></>
                  }
                </button>
              </form>

            ) : (
              /* ── AUTHORITY: username + password ─────────────────── */
              <form onSubmit={handleAuthorityLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: C.onSurface, fontFamily: 'Inter, sans-serif' }} htmlFor="authority-user-id">
                      {t('officialUserIdLabel')}
                    </label>
                    <span style={{ fontSize: '0.6875rem', color: C.primary, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>c / d / s / n (Pass: 123456)</span>
                  </div>
                  <div style={{ display: 'flex', borderRadius: '0.75rem', overflow: 'hidden', border: `1px solid ${C.outlineVar}`, background: C.surfaceLowest }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 0.75rem', background: '#f1f5f9', borderRight: `1px solid ${C.outlineVar}50` }}>
                      <span className="ms" style={{ color: C.primary, fontSize: '20px' }}>badge</span>
                    </div>
                    <input
                      id="authority-user-id"
                      type="text"
                      placeholder={t('officialIdPlaceholder')}
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      autoFocus
                      required
                      style={{ ...inputBase, borderRadius: 0, border: 'none', boxShadow: 'none', flex: 1 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: C.onSurface, fontFamily: 'Inter, sans-serif' }} htmlFor="authority-password">
                      {t('passwordLabel')}
                    </label>
                    <button type="button" style={{ fontSize: '0.75rem', color: C.primary, fontWeight: 500, fontFamily: 'Inter, sans-serif', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {t('forgotPassword')}
                    </button>
                  </div>
                  <div style={{ display: 'flex', borderRadius: '0.75rem', overflow: 'hidden', border: `1px solid ${C.outlineVar}`, background: C.surfaceLowest }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 0.75rem', background: '#f1f5f9', borderRight: `1px solid ${C.outlineVar}50` }}>
                      <span className="ms" style={{ color: C.primary, fontSize: '20px' }}>lock</span>
                    </div>
                    <input
                      id="authority-password"
                      type={showPw ? 'text' : 'password'}
                      placeholder={t('passwordPlaceholder')}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      style={{ ...inputBase, borderRadius: 0, border: 'none', boxShadow: 'none', flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      style={{ padding: '0 0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: C.outline }}
                      title="Toggle password visibility"
                    >
                      <span className="ms" style={{ fontSize: '20px' }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>

                <button
                  id="authority-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="submit-btn"
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    background: loading ? '#9ca3af' : C.primary,
                    color: C.onPrimary, border: 'none', borderRadius: '0.75rem',
                    fontSize: '0.9375rem', fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(53,37,205,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    transition: 'all 150ms ease',
                  }}
                >
                  {loading
                    ? <><span className="ms" style={{ fontSize: '18px' }}>progress_activity</span> {t('btnAuthenticating')}</>
                    : <><span className="ms" style={{ fontSize: '18px' }}>login</span> {t('btnLoginOfficial')} <span className="ms" style={{ fontSize: '16px' }}>arrow_forward</span></>
                  }
                </button>
              </form>
            )}

          </div>
        </div>
      </main>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
