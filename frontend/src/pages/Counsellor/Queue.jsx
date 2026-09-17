import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Filter, ArrowRight, Clock, AlertTriangle } from 'lucide-react';

const mockCases = [
  { id: 'CASE-2026-891', user_name: 'Aditi M.', type: 'Witness Intimidation', score: 85, risk: 'high', has_sos: true, time: '10m ago' },
  { id: 'CASE-2026-892', user_name: 'Priya S.', type: 'Caste Violence', score: 72, risk: 'medium', has_sos: false, time: '1h ago' },
  { id: 'CASE-2026-893', user_name: 'Ravi K.', type: 'General Inquiry', score: 45, risk: 'low', has_sos: false, time: '2h ago' },
];

export default function CounsellorQueue() {
  const { user, logout } = useAuth();
  const [filter, setFilter] = useState('all');

  return (
    <div className="min-h-screen bg-canvas-base p-6 md:p-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-black text-text-primary flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-muted rounded-full flex items-center justify-center text-primary-main">👨‍⚕️</div>
            Counsellor Queue
          </h1>
          <p className="text-text-muted mt-2 font-medium">Welcome back, {user?.name}. You have 1 high-priority case.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-canvas-surface border border-canvas-border hover:bg-canvas-surfaceSubtle text-text-primary font-bold py-2.5 px-5 rounded-pill transition-all flex items-center gap-2 shadow-sm text-sm">
            <Filter size={16} /> Filter
          </button>
          <button onClick={logout} className="bg-canvas-surface border border-canvas-border hover:bg-canvas-surfaceSubtle text-text-primary font-bold py-2.5 px-5 rounded-pill transition-all flex items-center gap-2 shadow-sm text-sm">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 gap-4">
        {mockCases.map((c) => (
          <div key={c.id} className={`bg-canvas-surface rounded-2xl p-6 shadow-card border flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:shadow-hover hover:-translate-y-1 ${
            c.risk === 'high' ? 'border-accent-sos/50' : 'border-canvas-border'
          }`}>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-black text-text-secondary uppercase tracking-wider">{c.id}</span>
                {c.has_sos && <span className="bg-accent-sosBg text-accent-sos text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-accent-sosLight/30 flex items-center gap-1"><AlertTriangle size={12}/> SOS Active</span>}
                <span className="text-xs font-bold text-text-muted flex items-center gap-1"><Clock size={12}/> {c.time}</span>
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-1">{c.user_name}</h2>
              <p className="text-text-muted font-medium text-sm">{c.type}</p>
            </div>

            <div className="flex items-center gap-8 border-t md:border-t-0 md:border-l border-canvas-border pt-4 md:pt-0 md:pl-8">
              <div>
                <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1 text-center">Distress Score</div>
                <div className={`text-3xl font-black text-center ${
                  c.score >= 80 ? 'text-accent-sos' : c.score >= 60 ? 'text-accent-amber' : 'text-primary-main'
                }`}>
                  {c.score}
                </div>
              </div>
              <button className="w-12 h-12 rounded-full bg-primary-muted flex items-center justify-center text-primary-main hover:bg-primary-main hover:text-white transition-colors">
                <ArrowRight size={20} />
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}
