import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, User, Phone, LogIn } from 'lucide-react';

export default function Login() {
  const [loginType, setLoginType] = useState('victim'); // 'victim' or 'staff'
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('hi');
  const [name, setName] = useState('');
  // S2: the phone-verified token proving OTP success for `phone`, valid only
  // long enough to complete registration — never persisted to localStorage.
  const [phoneVerifiedToken, setPhoneVerifiedToken] = useState(null);

  const handleVictimLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Step 1: Request a real OTP
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
      } catch (err) {
        setError('Failed to connect to authentication server. Please check your network or try again.');
      }
      setLoading(false);
      return;
    }

    // Step 2: Verify OTP or Submit Onboarding
    try {
      if (showOtpInput && !showOnboarding) {
        if (otp.length !== 6) {
          setError('Invalid OTP. Please enter the 6-digit code sent to your phone.');
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
          // data.token is a phone-verified token, not a session — only used
          // for the upcoming /register call below.
          setPhoneVerifiedToken(data.token);
          setShowOnboarding(true);
          setShowOtpInput(false);
        } else {
          login({
            id: data.userProfile.id,
            name: data.userProfile.name,
            role: data.userProfile.role_type,
            phone_number: phone,
            token: data.token,
          });
          navigate('/victim/dashboard');
        }
      } else if (showOnboarding) {
        if (!phoneVerifiedToken) {
          setError('Your phone verification has expired. Please start over.');
          setLoading(false);
          return;
        }
        // Register new user. phone_number is NOT sent — the backend derives
        // it from the phone-verified token.
        const regResponse = await fetch('/api/v1/intake/app/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1',
            'Authorization': `Bearer ${phoneVerifiedToken}`,
          },
          body: JSON.stringify({
            name: name || 'Citizen',
            role_type: 'victim',
            consent_given: true,
            preferred_language: preferredLanguage
          })
        });

        const regData = await regResponse.json();
        if (regResponse.ok && regData.status === 'success') {
          login({ id: regData.user_id, name: name || 'Citizen', role: 'victim', phone_number: phone, token: regData.token });
          navigate('/victim/dashboard');
        } else {
          setError('Registration failed.');
        }
      }
    } catch (err) {
      setError('Failed to connect to authentication server. Please check your network or try again.');
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
      
      if (!response.ok) {
        throw new Error('Invalid credentials');
      }
      
      const data = await response.json();
      // Forward the Supabase access_token so subsequent staff dashboard
      // requests can authenticate (see AuthContext.authFetch and S1's
      // server-side authorization work) — previously discarded here, which
      // meant no staff request could ever be authenticated after login.
      login({ ...data.user, token: data.access_token });

      // Route based on role
      if (data.user.role === 'counsellor') navigate('/counsellor/queue');
      else if (data.user.role === 'admin_district') navigate('/admin/district');
      else if (data.user.role === 'admin_state') navigate('/admin/state');
      else if (data.user.role === 'admin_national') navigate('/admin/national');
      else navigate('/');
      
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-canvas-base flex flex-col items-center justify-center p-4">
      
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-primary-main rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-hover">
          <ShieldCheck size={32} color="#FFFFFF" />
        </div>
        <h1 className="text-3xl font-bold text-text-primary">Justice Portal</h1>
        <p className="text-text-muted mt-2 font-medium">Secure Access Point</p>
      </div>

      <div className="w-full max-w-md bg-canvas-surface rounded-2xl shadow-card border border-canvas-border overflow-hidden">
        
        {/* Tabs */}
        <div className="flex border-b border-canvas-border">
          <button 
            onClick={() => setLoginType('victim')}
            className={`flex-1 py-4 font-bold text-sm tracking-wide transition-colors ${loginType === 'victim' ? 'text-primary-main border-b-2 border-primary-main bg-primary-muted/20' : 'text-text-muted hover:bg-canvas-surfaceSubtle'}`}
          >
            CITIZEN ACCESS
          </button>
          <button 
            onClick={() => setLoginType('staff')}
            className={`flex-1 py-4 font-bold text-sm tracking-wide transition-colors ${loginType === 'staff' ? 'text-primary-main border-b-2 border-primary-main bg-primary-muted/20' : 'text-text-muted hover:bg-canvas-surfaceSubtle'}`}
          >
            STAFF PORTAL
          </button>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-accent-sosBg text-accent-sos border border-accent-sosLight/30 rounded-lg text-sm font-semibold flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {loginType === 'victim' ? (
            <form onSubmit={handleVictimLogin} className="space-y-5">
              {!showOnboarding ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Phone Number</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone size={18} className="text-text-muted" />
                      </div>
                      <input 
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        disabled={showOtpInput}
                        placeholder="+91 98765 43210"
                        className="w-full pl-10 pr-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all font-medium disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {showOtpInput && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Enter OTP</label>
                      <input 
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                        placeholder="• • • • • •"
                        maxLength={6}
                        className="w-full px-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all font-medium text-center tracking-widest text-lg"
                      />
                      <p className="text-right text-xs text-primary-main font-bold mt-2 cursor-pointer hover:underline">Resend OTP</p>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 bg-primary-main hover:bg-primary-hover active:scale-[0.98] text-white font-bold py-3.5 rounded-pill shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? 'Processing...' : showOtpInput ? 'Verify & Login' : 'Send OTP securely'} 
                    {!loading && <LogIn size={18} />}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Your Name</label>
                    <input 
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Jane Doe"
                      className="w-full px-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Preferred Language</label>
                    <select 
                      value={preferredLanguage}
                      onChange={(e) => setPreferredLanguage(e.target.value)}
                      className="w-full px-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all font-medium"
                    >
                      <option value="hi">Hindi</option>
                      <option value="en">English</option>
                      <option value="ta">Tamil</option>
                      <option value="ml">Malayalam</option>
                    </select>
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 bg-primary-main hover:bg-primary-hover active:scale-[0.98] text-white font-bold py-3.5 rounded-pill shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? 'Setting up...' : 'Complete Registration'} 
                  </button>
                </>
              )}
              <p className="text-center text-xs text-text-muted font-medium mt-4">
                We will send an OTP via SMS to verify your identity.
              </p>
            </form>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Username / ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={18} className="text-text-muted" />
                  </div>
                  <input 
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="counsellor_01"
                    className="w-full pl-10 pr-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ShieldCheck size={18} className="text-text-muted" />
                  </div>
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 focus:border-primary-main transition-all font-medium"
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-text-primary hover:bg-black active:scale-[0.98] text-white font-bold py-3.5 rounded-pill shadow-sm transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Authenticating...' : 'Secure Login'}
                {!loading && <LogIn size={18} />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
