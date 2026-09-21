import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, User, LogIn, ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { OTPInput } from 'input-otp';

/* ─── Aurora background — gradient mesh (pure CSS, no deps) ────── */
function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #0f0c29 0%, #3A2F6B 40%, #1a1040 70%, #0d1117 100%)',
      }} />
      {/* Animated blobs — compositor-level, run on GPU */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: '60vw', height: '60vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(138,121,184,0.25) 0%, transparent 70%)',
        animation: 'aurora-drift-1 18s ease-in-out infinite alternate',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%',
        width: '55vw', height: '55vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(104,176,135,0.18) 0%, transparent 70%)',
        animation: 'aurora-drift-2 22s ease-in-out infinite alternate',
      }} />
      <div style={{
        position: 'absolute', top: '30%', right: '20%',
        width: '30vw', height: '30vw', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(58,47,107,0.3) 0%, transparent 70%)',
        animation: 'aurora-drift-1 14s ease-in-out infinite alternate-reverse',
      }} />
      <style>{`
        @keyframes aurora-drift-1 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(5%, 8%) scale(1.12); }
        }
        @keyframes aurora-drift-2 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(-6%, -5%) scale(1.08); }
        }
      `}</style>
    </div>
  );
}

/* ─── Smooth step transition wrapper ────────────────────────────── */
const STEP_VARIANTS = {
  enter:  { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0,  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
  exit:   { opacity: 0, x: -40, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } },
};

function StepPane({ stepKey, children }) {
  return (
    <motion.div
      key={stepKey}
      variants={STEP_VARIANTS}
      initial="enter"
      animate="center"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/* ─── Styled input class ─────────────────────────────────────────── */
const INPUT_CLASS = `
  w-full px-4 py-3 bg-white/8 border border-white/15 rounded-xl
  text-white placeholder-white/40 font-medium
  focus:outline-none focus:ring-2 focus:ring-primary-main/40 focus:border-primary-main/60
  transition-colors duration-[160ms]
  backdrop-blur-sm
`.replace(/\n/g, ' ').trim();

const LABEL_CLASS = 'block text-xs font-bold text-white/60 uppercase tracking-wider mb-2';

export default function Login() {
  const [loginType, setLoginType] = useState('victim');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showOtpInput, setShowOtpInput] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [otp, setOtp] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('hi');
  const [name, setName] = useState('');
  const [phoneVerifiedToken, setPhoneVerifiedToken] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Determine current step key for AnimatePresence
  const victimStep = showOnboarding ? 'onboarding' : showOtpInput ? 'otp' : 'phone';

  const handleVictimLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!showOtpInput && !showOnboarding) {
      if (phone.length < 10) {
        setError('Please enter a valid phone number.');
        setLoading(false);
        return;
      }
      try {
        const response = await fetch('/api/v1/auth/otp/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ phone_number: phone })
        });
        if (!response.ok) {
          setError(response.status === 429 ? 'Too many attempts. Please try again later.' : 'Could not send a verification code.');
        } else {
          setShowOtpInput(true);
        }
      } catch {
        setError('Failed to connect. Please check your network.');
      }
      setLoading(false);
      return;
    }

    try {
      if (showOtpInput && !showOnboarding) {
        if (otp.length !== 6) {
          setError('Please enter the full 6-digit code.');
          setLoading(false);
          return;
        }
        const response = await fetch('/api/v1/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
          body: JSON.stringify({ phone_number: phone, code: otp })
        });
        if (!response.ok) {
          setError('Incorrect or expired code.');
          setLoading(false);
          return;
        }
        const data = await response.json();
        if (data.is_new_user) {
          setPhoneVerifiedToken(data.token);
          setShowOnboarding(true);
          setShowOtpInput(false);
        } else {
          login({ id: data.userProfile.id, name: data.userProfile.name, role: data.userProfile.role_type, phone_number: phone, token: data.token });
          navigate('/victim/dashboard');
        }
      } else if (showOnboarding) {
        if (!phoneVerifiedToken) {
          setError('Your phone verification expired. Please start over.');
          setLoading(false);
          return;
        }
        const regResponse = await fetch('/api/v1/intake/app/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', 'Authorization': `Bearer ${phoneVerifiedToken}` },
          body: JSON.stringify({ name: name || 'Citizen', role_type: 'victim', consent_given: true, preferred_language: preferredLanguage })
        });
        const regData = await regResponse.json();
        if (regResponse.ok && regData.status === 'success') {
          login({ id: regData.user_id, name: name || 'Citizen', role: 'victim', phone_number: phone, token: regData.token });
          navigate('/victim/dashboard');
        } else {
          setError('Registration failed. Please try again.');
        }
      }
    } catch {
      setError('Failed to connect to authentication server.');
    }
    setLoading(false);
  };

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) throw new Error('Invalid credentials');
      const data = await response.json();
      login({ ...data.user, token: data.access_token });

      const role = data.user.role;
      if (role === 'counsellor') navigate('/counsellor/queue');
      else if (role === 'admin_district') navigate('/admin/district');
      else if (role === 'admin_state') navigate('/admin/state');
      else if (role === 'admin_national') navigate('/admin/national');
      else if (role === 'super_admin') navigate('/admin/superadmin');
      else navigate('/');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const resetVictim = () => {
    setShowOtpInput(false);
    setShowOnboarding(false);
    setOtp('');
    setPhoneVerifiedToken(null);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <AuroraBackground />

      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-primary-main rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-hover">
          <ShieldCheck size={32} color="#FFFFFF" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">AAVAZ</h1>
        <p className="text-white/50 mt-1.5 font-medium text-sm">Integrated Victim Support System</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {['victim', 'staff'].map((type) => (
            <button
              key={type}
              onClick={() => { setLoginType(type); setError(''); resetVictim(); }}
              className="flex-1 py-4 font-bold text-xs tracking-widest uppercase transition-colors duration-[160ms]"
              style={{
                color: loginType === type ? '#8A79B8' : 'rgba(255,255,255,0.4)',
                borderBottom: loginType === type ? '2px solid #8A79B8' : '2px solid transparent',
                background: loginType === type ? 'rgba(138,121,184,0.08)' : 'transparent',
              }}
            >
              {type === 'victim' ? 'Citizen Access' : 'Staff Portal'}
            </button>
          ))}
        </div>

        <div className="p-8">
          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mb-6 p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2"
                style={{ background: 'rgba(217,93,93,0.18)', color: '#E06A6A', border: '1px solid rgba(217,93,93,0.3)' }}
              >
                <span>⚠️</span> {error}
              </motion.div>
            )}
          </AnimatePresence>

          {loginType === 'victim' ? (
            <form onSubmit={handleVictimLogin} className="space-y-5">
              <AnimatePresence mode="wait">
                {victimStep === 'phone' && (
                  <StepPane key="phone" stepKey="phone">
                    <div className="space-y-5">
                      <div>
                        <label className={LABEL_CLASS}>Mobile Number</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                          placeholder="+91 98765 43210"
                          className={INPUT_CLASS}
                        />
                      </div>
                      <SubmitButton loading={loading} label="Send OTP Securely" />
                    </div>
                  </StepPane>
                )}

                {victimStep === 'otp' && (
                  <StepPane key="otp" stepKey="otp">
                    <div className="space-y-5">
                      <div className="flex items-center gap-3 mb-1">
                        <button type="button" onClick={resetVictim} className="text-white/50 hover:text-white transition-colors">
                          <ArrowLeft size={16} />
                        </button>
                        <div>
                          <p className="text-xs font-bold text-white/60 uppercase tracking-wider">OTP sent to</p>
                          <p className="text-sm font-bold text-white">{phone}</p>
                        </div>
                      </div>

                      {/* 6-cell OTP input */}
                      <div>
                        <label className={LABEL_CLASS}>Enter 6-digit code</label>
                        <OTPInput
                          maxLength={6}
                          value={otp}
                          onChange={setOtp}
                          render={({ slots }) => (
                            <div className="flex gap-2">
                              {slots.map((slot, i) => (
                                <div
                                  key={i}
                                  className="flex-1 h-14 flex items-center justify-center rounded-xl text-white text-xl font-black border transition-colors duration-[160ms]"
                                  style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: slot.isActive ? '2px solid #8A79B8' : '1px solid rgba(255,255,255,0.15)',
                                  }}
                                >
                                  {slot.char ?? ''}
                                </div>
                              ))}
                            </div>
                          )}
                        />
                      </div>
                      <SubmitButton loading={loading} label="Verify & Login" />
                    </div>
                  </StepPane>
                )}

                {victimStep === 'onboarding' && (
                  <StepPane key="onboarding" stepKey="onboarding">
                    <div className="space-y-5">
                      <p className="text-sm text-white/60 font-medium">
                        Welcome! Complete your profile to get started.
                      </p>
                      <div>
                        <label className={LABEL_CLASS}>Your Full Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                          required placeholder="Jane Doe" className={INPUT_CLASS} />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Preferred Language</label>
                        <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}
                          className={INPUT_CLASS}
                          style={{ background: 'rgba(255,255,255,0.08)' }}
                        >
                          {[['hi','Hindi'],['en','English'],['ta','Tamil'],['ml','Malayalam'],['te','Telugu'],['bn','Bengali'],['mr','Marathi'],['gu','Gujarati'],['kn','Kannada']].map(([v,l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      <SubmitButton loading={loading} label="Complete Registration" />
                    </div>
                  </StepPane>
                )}
              </AnimatePresence>

              <p className="text-center text-xs text-white/40 font-medium mt-2">
                We verify your identity via OTP. Your data is protected.
              </p>
            </form>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-5">
              <div>
                <label className={LABEL_CLASS}>Username / Staff ID</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    required placeholder="counsellor_01"
                    className={`${INPUT_CLASS} pl-9`} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLASS}>Password</label>
                <div className="relative">
                  <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    required placeholder="••••••••"
                    className={`${INPUT_CLASS} pl-9`} />
                </div>
              </div>
              <SubmitButton loading={loading} label="Secure Login" darkStyle />
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-white/30 text-xs text-center">
        MoSJE — Ministry of Social Justice &amp; Empowerment
      </p>
    </div>
  );
}

function SubmitButton({ loading, label, darkStyle }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full mt-1 font-bold py-3.5 rounded-full flex items-center justify-center gap-2 text-white disabled:opacity-60"
      style={{
        background: darkStyle
          ? 'rgba(255,255,255,0.15)'
          : 'linear-gradient(135deg, #8A79B8 0%, #6B5CA5 100%)',
        border: '1px solid rgba(255,255,255,0.2)',
        transition: `transform var(--duration-instant) var(--ease-out-quint), opacity var(--duration-fast) var(--ease-out-quint)`,
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <>
          {label}
          <LogIn size={16} />
        </>
      )}
    </button>
  );
}
