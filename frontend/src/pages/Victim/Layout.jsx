import React, { useState, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, FileText, MessageCircle, User, AlertTriangle, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिंदी)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'ur', name: 'Urdu (اردو)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
];

const NAV_ITEMS = [
  { to: '/victim/dashboard', icon: Home, label: 'Home' },
  { to: '/victim/register-grievance', icon: FileText, label: 'Case' },
  { to: '/victim/chat', icon: MessageCircle, label: 'AI Chat' },
];

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
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
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      const { latitude, longitude } = position.coords;

      const casesRes = await authFetch(`/api/v1/intake/app/cases/${user?.id}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      const casesData = await casesRes.json();
      const caseId = casesData?.cases?.[0]?.id;

      if (!caseId) throw new Error('No active case found');

      const sosRes = await authFetch('/api/v1/cases/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ case_id: caseId, location_lat: latitude, location_lng: longitude }),
      });

      if (!sosRes.ok) throw new Error('SOS dispatch failed');

      toast.success('SOS Activated — Emergency contacts and authorities notified.', { id: toastId, duration: 8000 });
    } catch (err) {
      console.error('SOS error:', err);
      toast.error(
        err.message === 'No active case found'
          ? 'No active case found. Please register a case first.'
          : 'Could not dispatch SOS. Please call 112 directly.',
        { id: toastId }
      );
      setSosActive(false);
    }

    setTimeout(() => setSosActive(false), 30000);
  }, [sosActive, authFetch, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ─── Mobile Header ────────────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border sticky top-0 z-30 shadow-sm">
        <div className="font-bold text-lg text-text-main tracking-tight">AAVAZ</div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Globe size={14} className="text-text-muted absolute left-2 pointer-events-none" />
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="pl-7 pr-4 py-1 bg-background border border-border rounded-lg text-xs font-semibold text-text-secondary focus:outline-none appearance-none"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-xs h-7 px-2">Exit</Button>
        </div>
      </div>

      {/* ─── Desktop Sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-surface border-r border-border p-6 sticky top-0 h-screen shadow-sm z-20">
        <div className="font-bold text-2xl text-text-main tracking-tight mb-8">AAVAZ</div>

        <div className="mb-6 relative">
          <Globe size={16} className="text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-background border border-border rounded-xl text-sm font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-primary-base appearance-none transition-shadow"
          >
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>

        <nav className="flex-1 space-y-1 relative">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-200 z-10",
                  isActive ? "text-primary-base" : "text-text-secondary hover:text-text-main hover:bg-surface-hover"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="victim-sidebar-indicator"
                      className="absolute inset-0 rounded-xl bg-primary-muted -z-10"
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

        <div className="mt-auto space-y-4">
          <div className="relative">
            {!sosActive && (
              <div
                className="absolute inset-0 rounded-xl bg-critical-muted animate-pulse-critical"
                aria-hidden
              />
            )}
            <button
              onClick={triggerSOS}
              disabled={sosActive}
              className={cn(
                "relative w-full py-4 rounded-xl font-bold text-text-inverse flex justify-center items-center gap-2 transition-all duration-200 active:scale-95",
                sosActive ? "bg-critical-hover opacity-90 scale-[0.97]" : "bg-critical-base shadow-critical hover:bg-critical-hover"
              )}
            >
              <AlertTriangle size={20} />
              {sosActive ? 'SOS ACTIVE' : 'EMERGENCY SOS'}
            </button>
          </div>

          <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
            <div className="w-9 h-9 rounded-full bg-primary-muted flex items-center justify-center shrink-0">
              <User size={18} className="text-primary-base" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-main truncate">{user?.name}</div>
              <div className="text-xs font-medium text-text-muted truncate">{user?.phone_number}</div>
            </div>
            <button onClick={logout} className="text-xs font-bold text-danger-base hover:underline shrink-0">Exit</button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-auto pb-24 md:pb-0 relative bg-background">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="h-full max-w-5xl mx-auto"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Floating Mobile SOS ─────────────────────────────────── */}
      <button
        onClick={triggerSOS}
        disabled={sosActive}
        className={cn(
          "md:hidden fixed right-4 bottom-20 w-14 h-14 rounded-full flex justify-center items-center z-30 transition-all duration-200 active:scale-95",
          sosActive ? "bg-critical-hover opacity-90 scale-[0.97]" : "bg-critical-base shadow-critical"
        )}
      >
        <AlertTriangle size={24} className="text-text-inverse" />
      </button>

      {/* ─── Mobile Bottom Nav ───────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 border-t border-border px-6 py-2 flex justify-around items-center z-20 backdrop-blur-md pb-safe">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 p-2 transition-colors",
                isActive ? "text-primary-base" : "text-text-secondary"
              )
            }
          >
            <item.icon size={20} />
            <span className="text-[10px] font-semibold">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
