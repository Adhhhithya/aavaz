import React, { useState, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Home, FileText, MessageCircle, User, AlertTriangle, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] } },
};

export default function VictimLayout() {
  const { user, logout, authFetch } = useAuth();
  const { lang, setLang, t, languages } = useLanguage();
  const location = useLocation();
  const [sosActive, setSosActive] = useState(false);

  const navItems = [
    { to: '/victim/dashboard', icon: Home, label: t('navDashboard') },
    { to: '/victim/case', icon: FileText, label: t('navMyCase') },
    { to: '/victim/chat', icon: MessageCircle, label: t('navSanctuary') },
    { to: '/victim/register-grievance', icon: FileText, label: t('navRegisterGrievance') },
  ];

  const triggerSOS = useCallback(async () => {
    if (sosActive) return;
    setSosActive(true);

    const toastId = toast.loading('Activating SOS — locating you…');

    try {
      let latitude = user?.location_lat || 18.5204;
      let longitude = user?.location_lng || 73.8567;

      try {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        );
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (geoErr) {
        console.warn('Geolocation failed or denied, using profile coordinates:', geoErr);
      }

      const casesRes = await authFetch(`/api/v1/intake/app/cases/${user?.id}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      const casesData = await casesRes.json();
      const caseId = casesData?.cases?.[0]?.id;

      if (!caseId) throw new Error('No active case found');

      const sosRes = await authFetch('/api/v1/cases/sos/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ case_id: caseId, location_lat: latitude, location_lng: longitude }),
      });

      if (!sosRes.ok) throw new Error('SOS dispatch failed');

      toast.success('SOS Activated — Emergency contacts and authorities notified with your live coordinates.', { id: toastId, duration: 8000 });
    } catch (err) {
      console.error('SOS error:', err);
      toast.error(
        err.message === 'No active case found'
          ? 'No active case found. Please register a grievance first.'
          : 'Could not dispatch SOS. Please call 112 directly.',
        { id: toastId }
      );
      setSosActive(false);
    }

    setTimeout(() => setSosActive(false), 30000);
  }, [sosActive, authFetch, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col w-full">

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
              {languages.map(l => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.name})
                </option>
              ))}
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-xs h-7 px-2">{t('btnExit')}</Button>
        </div>
      </div>

      {/* ─── Desktop Fullscreen Top Navigation Bar ─────────────────── */}
      <header className="hidden md:flex items-center justify-between px-8 py-3.5 bg-surface border-b border-border sticky top-0 z-30 shadow-sm w-full">
        {/* Left: Brand & Navigation Links */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-2xl text-text-main tracking-tight">{t('brandTitle')}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-primary-muted text-primary-base">
              {t('sanctuaryBadge')}
            </span>
          </div>

          <nav className="flex items-center gap-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150",
                    isActive
                      ? "text-primary-base bg-primary-muted"
                      : "text-text-secondary hover:text-text-main hover:bg-surface-hover"
                  )
                }
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right: Language, Emergency SOS & User Profile */}
        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <div className="relative flex items-center">
            <Globe size={15} className="text-text-muted absolute left-3 pointer-events-none" />
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="pl-8 pr-7 py-2 bg-background border border-border rounded-xl text-xs font-semibold text-text-main focus:outline-none focus:ring-1 focus:ring-primary-base appearance-none cursor-pointer"
            >
              {languages.map(l => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.name})
                </option>
              ))}
            </select>
          </div>

          {/* Emergency SOS Button */}
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
                "relative px-4 py-2 rounded-xl text-xs font-bold text-text-inverse flex items-center gap-2 transition-all duration-150 active:scale-95 shadow-sm cursor-pointer",
                sosActive ? "bg-critical-hover opacity-90" : "bg-critical-base shadow-critical hover:bg-critical-hover"
              )}
            >
              <AlertTriangle size={15} />
              <span>{sosActive ? t('btnSOSActive') : t('btnSOS')}</span>
            </button>
          </div>

          {/* User Profile & Exit */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-primary-muted flex items-center justify-center shrink-0">
              <User size={16} className="text-primary-base" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-text-main leading-tight">{user?.name || t('welcomeSurvivor')}</span>
              <span className="text-[10px] text-text-muted">{user?.phone_number || user?.phone || ''}</span>
            </div>
            <button
              onClick={logout}
              className="ml-2 text-xs font-semibold text-text-muted hover:text-danger-base transition-colors px-2 py-1 rounded-lg hover:bg-danger-muted/30 cursor-pointer"
            >
              {t('btnExit')}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Fullscreen Main Content ───────────────────────────────── */}
      <div className="flex-1 overflow-auto pb-24 md:pb-0 relative bg-background w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="h-full w-full"
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
          "md:hidden fixed right-4 bottom-20 w-14 h-14 rounded-full flex justify-center items-center z-30 transition-all duration-200 active:scale-95 shadow-lg",
          sosActive ? "bg-critical-hover opacity-90 scale-[0.97]" : "bg-critical-base shadow-critical"
        )}
      >
        <AlertTriangle size={24} className="text-text-inverse" />
      </button>

      {/* ─── Mobile Bottom Nav ───────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 border-t border-border px-6 py-2 flex justify-around items-center z-20 backdrop-blur-md pb-safe">
        {navItems.map((item) => (
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
