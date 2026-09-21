import React, { useState, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, FileText, MessageCircle, User, AlertTriangle, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिंदी)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'ur', name: 'Urdu (اردو)' },
  { code: 'gu', name: 'Gujarati (ગુジરાتী)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
];

const NAV_ITEMS = [
  { to: '/victim/dashboard', icon: Home, label: 'Home' },
  { to: '/victim/case', icon: FileText, label: 'Case' },
  { to: '/victim/chat', icon: MessageCircle, label: 'AI Chat' },
];

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
};

export default function VictimLayout() {
  const { user, logout, authFetch } = useAuth();
  const location = useLocation();
  const [sosActive, setSosActive] = useState(false);
  const [lang, setLang] = useState('en');

  const triggerSOS = useCallback(async () => {
    if (sosActive) return;
    setSosActive(true);

    const toastId = toast.loading('Activating SOS — locating you…');

    try {
      // Get GPS coords
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      const { latitude, longitude } = position.coords;

      // Get case_id for this user
      const casesRes = await authFetch(`/api/v1/intake/app/cases/${user?.id}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      const casesData = await casesRes.json();
      const caseId = casesData?.cases?.[0]?.id;

      if (!caseId) throw new Error('No active case found');

      // Fire the real SOS endpoint
      const sosRes = await authFetch('/api/v1/cases/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ case_id: caseId, location_lat: latitude, location_lng: longitude }),
      });

      if (!sosRes.ok) throw new Error('SOS dispatch failed');

      toast.success('SOS Activated — Emergency contacts and authorities notified.', { id: toastId, duration: 8000 });
    } catch (err) {
      // Degrade gracefully — geolocation blocked or network failure
      console.error('SOS error:', err);
      toast.error(
        err.message === 'No active case found'
          ? 'No active case found. Please register a case first.'
          : 'Could not dispatch SOS. Please call 112 directly.',
        { id: toastId }
      );
      setSosActive(false);
    }

    // Auto-reset after 30s
    setTimeout(() => setSosActive(false), 30000);
  }, [sosActive, authFetch, user]);

  return (
    <div className="min-h-screen bg-canvas-base flex flex-col md:flex-row">

      {/* ─── Mobile Header ────────────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-between p-4 bg-canvas-surface border-b border-canvas-border sticky top-0 z-10">
        <div className="font-black text-lg text-text-primary tracking-tight">AAVAZ</div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Globe size={14} className="text-text-muted absolute left-2 pointer-events-none" />
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="pl-6 pr-5 py-1 bg-canvas-base border border-canvas-border rounded-lg text-xs font-bold text-text-secondary focus:outline-none appearance-none"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <button onClick={logout} className="text-xs font-bold text-text-muted px-3 py-1 bg-canvas-surfaceSubtle rounded-full">
            Exit
          </button>
        </div>
      </div>

      {/* ─── Desktop Sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-canvas-surface border-r border-canvas-border p-6 sticky top-0 h-screen">
        <div className="font-black text-2xl text-text-primary tracking-tight mb-10">AAVAZ</div>

        {/* Language selector */}
        <div className="mb-6 relative">
          <Globe size={16} className="text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-canvas-base border border-canvas-border rounded-xl text-sm font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 appearance-none"
          >
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>

        {/* Nav items with spring sliding indicator */}
        <nav className="flex-1 space-y-1 relative">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors duration-[160ms] z-10 ${
                  isActive ? 'text-primary-main' : 'text-text-muted hover:text-text-primary hover:bg-canvas-surfaceSubtle'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute inset-0 rounded-xl bg-primary-muted -z-[1]"
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    />
                  )}
                  <item.icon size={20} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* SOS + User footer */}
        <div className="mt-auto space-y-4">
          {/* SOS Button with CSS pulse ring */}
          <div className="relative">
            {!sosActive && (
              <div
                className="absolute inset-0 rounded-xl bg-accent-sos/30"
                style={{ animation: 'sos-pulse 2s ease-out infinite' }}
                aria-hidden
              />
            )}
            <button
              onClick={triggerSOS}
              disabled={sosActive}
              className="relative w-full py-4 rounded-xl font-black text-white flex justify-center items-center gap-2 disabled:opacity-75"
              style={{
                background: sosActive ? 'var(--color-accent-terracotta)' : 'var(--color-accent-sos)',
                transform: sosActive ? 'scale(0.97)' : undefined,
                transition: `transform var(--duration-instant) var(--ease-out-quint), background-color var(--duration-fast) var(--ease-out-quint)`,
                boxShadow: 'var(--shadow-sos)',
              }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <AlertTriangle size={20} />
              {sosActive ? 'SOS ACTIVE' : 'SOS EMERGENCY'}
            </button>
          </div>

          {/* User pill */}
          <div className="flex items-center gap-3 p-3 bg-canvas-base rounded-xl border border-canvas-border">
            <div className="w-9 h-9 rounded-full bg-primary-muted flex items-center justify-center shrink-0">
              <User size={18} className="text-primary-main" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-primary truncate">{user?.name}</div>
              <div className="text-xs font-medium text-text-muted truncate">{user?.phone_number}</div>
            </div>
            <button onClick={logout} className="text-xs font-bold text-accent-sos hover:underline shrink-0">Exit</button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content with AnimatePresence page transitions ─── */}
      <div className="flex-1 overflow-auto pb-24 md:pb-0 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Floating Mobile SOS ─────────────────────────────────── */}
      <button
        onClick={triggerSOS}
        disabled={sosActive}
        className="md:hidden fixed right-4 bottom-24 w-14 h-14 rounded-full flex justify-center items-center shadow-sos z-20 disabled:opacity-75"
        style={{
          background: sosActive ? 'var(--color-accent-terracotta)' : 'var(--color-accent-sos)',
          transition: `transform var(--duration-instant) var(--ease-out-quint)`,
        }}
        onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.93)'; }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <AlertTriangle size={24} color="#FFF" />
      </button>

      {/* ─── Mobile Bottom Nav ───────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-canvas-surface/90 border-t border-canvas-border px-6 py-3 flex justify-around items-center z-10 backdrop-blur-[8px]">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 transition-colors duration-[160ms] ${
                isActive ? 'text-primary-main' : 'text-text-muted'
              }`
            }
          >
            <item.icon size={22} />
            <span className="text-[10px] font-bold">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
