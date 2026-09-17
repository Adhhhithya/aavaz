import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, FileText, MessageCircle, Wind, User, AlertTriangle, Globe } from 'lucide-react';

export default function VictimLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sosActive, setSosActive] = useState(false);
  const [lang, setLang] = useState('en');

  const languages = [
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
    { code: 'as', name: 'Assamese (অসমীয়া)' },
    { code: 'mai', name: 'Maithili (मैथिली)' },
    { code: 'sat', name: 'Santali (ᱥᱟᱱᱛᱟᱲᱤ)' },
    { code: 'ks', name: 'Kashmiri (کأشُر)' },
    { code: 'ne', name: 'Nepali (नेपाली)' },
    { code: 'sd', name: 'Sindhi (سنڌي)' },
    { code: 'doi', name: 'Dogri (डोगरी)' },
    { code: 'kok', name: 'Konkani (कोंकणी)' },
    { code: 'mni', name: 'Manipuri (ꯃꯤꯇꯩꯂꯣꯟ)' },
    { code: 'brx', name: 'Bodo (बड़ो)' },
    { code: 'sa', name: 'Sanskrit (संस्कृतम्)' }
  ];

  const navItems = [
    { to: '/victim/dashboard', icon: Home, label: 'Home' },
    { to: '/victim/case', icon: FileText, label: 'Case' },
    { to: '/victim/chat', icon: MessageCircle, label: 'AI Chat' },
    { to: '/victim/breathe', icon: Wind, label: 'Breathe' },
  ];

  const triggerSOS = async () => {
    setSosActive(true);
    alert('SOS Activated! Emergency contacts and Police have been notified with your live location.');
    // In prod, call backend SOS endpoint
    setTimeout(() => setSosActive(false), 5000); // Reset after 5s for demo
  };

  return (
    <div className="min-h-screen bg-canvas-base flex flex-col md:flex-row">
      {/* Mobile/Tablet Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-canvas-surface border-b border-canvas-border sticky top-0 z-10">
        <div className="font-bold text-lg text-text-primary">Justice Portal</div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Globe size={16} className="text-text-muted absolute left-2 pointer-events-none" />
            <select 
              value={lang} 
              onChange={e => setLang(e.target.value)}
              className="pl-7 pr-6 py-1 bg-canvas-base border border-canvas-border rounded-lg text-xs font-bold text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-main appearance-none"
            >
              {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <button onClick={logout} className="text-sm font-semibold text-text-muted px-3 py-1 bg-canvas-surfaceSubtle rounded-pill">
            Exit
          </button>
        </div>
      </div>

      {/* Sidebar for Desktop */}
      <div className="hidden md:flex flex-col w-64 bg-canvas-surface border-r border-canvas-border p-6 sticky top-0 h-screen">
        <div className="flex items-center justify-between mb-10">
          <div className="font-black text-2xl text-text-primary tracking-tight">Justice Portal</div>
        </div>
        
        <div className="mb-6 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Globe size={18} className="text-text-muted" />
          </div>
          <select 
            value={lang} 
            onChange={e => setLang(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-canvas-base border border-canvas-border rounded-xl text-sm font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 appearance-none"
          >
            {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                  isActive 
                    ? 'bg-primary-muted text-primary-main' 
                    : 'text-text-muted hover:bg-canvas-surfaceSubtle hover:text-text-primary'
                }`
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="mt-auto space-y-4">
          <button 
            onClick={triggerSOS}
            className={`w-full py-4 rounded-xl font-black text-white flex justify-center items-center gap-2 transition-all shadow-sos ${
              sosActive ? 'bg-accent-terracotta scale-95' : 'bg-accent-sos hover:bg-accent-sosLight hover:-translate-y-1'
            }`}
          >
            <AlertTriangle size={20} />
            {sosActive ? 'SOS ACTIVE' : 'SOS EMERGENCY'}
          </button>
          
          <div className="flex items-center gap-3 p-3 bg-canvas-base rounded-xl border border-canvas-border">
            <div className="w-10 h-10 rounded-full bg-primary-muted flex items-center justify-center">
              <User size={20} className="text-primary-main" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-primary truncate">{user?.name}</div>
              <div className="text-xs font-semibold text-text-muted truncate">{user?.phone_number}</div>
            </div>
            <button onClick={logout} className="text-xs font-bold text-accent-sos hover:underline">Exit</button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto pb-24 md:pb-0 relative">
        <Outlet />
      </div>

      {/* Floating Mobile SOS Button */}
      <button 
        onClick={triggerSOS}
        className={`md:hidden fixed right-4 bottom-24 w-14 h-14 rounded-full flex justify-center items-center shadow-sos z-20 transition-transform ${
          sosActive ? 'bg-accent-terracotta scale-95' : 'bg-accent-sos'
        }`}
      >
        <AlertTriangle size={24} color="#FFF" />
      </button>

      {/* Bottom Navigation for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-canvas-surface border-t border-canvas-border px-6 py-4 flex justify-between items-center z-10 safe-area-bottom pb-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => 
              `flex flex-col items-center gap-1 transition-colors ${
                isActive ? 'text-primary-main' : 'text-text-muted'
              }`
            }
          >
            <item.icon size={24} />
            <span className="text-[10px] font-bold">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
