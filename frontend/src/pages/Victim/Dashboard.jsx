import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, ArrowRight, HeartPulse } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function VictimDashboard() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState('');
  const [scoreData, setScoreData] = useState(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
    
    // Fetch score if user exists
    if (user?.id) {
      // First get the active case
      fetch(`/api/v1/cases?user_id=${user.id}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      })
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) {
          return fetch(`/api/v1/cases/${data[0].id}/progress`, {
            headers: { 'ngrok-skip-browser-warning': '1' }
          });
        }
        throw new Error('No case found');
      })
      .then(res => res.json())
      .then(data => {
        setScoreData({ score: data.latestScore, explanation: data.scoreExplanation });
      })
      .catch(err => console.error("Error fetching score:", err));
    }
  }, [user]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Area */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-text-primary tracking-tight">
          {greeting}, <span className="text-primary-main">{user?.name}</span>
        </h1>
        <p className="text-text-secondary mt-2 text-lg font-medium">
          We're here to support you every step of the way.
        </p>
      </div>

      {/* Primary Action Card */}
      <div className="bg-canvas-surface rounded-2xl p-6 md:p-8 shadow-hover border border-canvas-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden group">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-muted rounded-full blur-3xl opacity-50 transition-opacity group-hover:opacity-100"></div>
        <div className="relative z-10 flex-1">
          {scoreData ? (
            <>
              <div className="flex items-center gap-2 text-primary-main mb-2">
                <HeartPulse size={20} />
                <span className="font-bold text-sm tracking-widest uppercase">Well-being Status</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-2">
                {scoreData.explanation}
              </h2>
              <p className="text-text-muted font-medium max-w-md">
                We continuously monitor your interactions to ensure your assigned counsellor provides the right support at the right time.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-primary-main mb-2">
                <ShieldAlert size={20} />
                <span className="font-bold text-sm tracking-widest uppercase">Action Required</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-2">Your Case requires an update</h2>
              <p className="text-text-muted font-medium max-w-md">
                Please complete the initial demographic assessment so your assigned counsellor can review your details.
              </p>
            </>
          )}
        </div>
        <Link 
          to="/victim/case"
          className="relative z-10 shrink-0 bg-primary-main hover:bg-primary-hover active:scale-95 text-white font-bold py-3 px-6 rounded-pill shadow-sm transition-all flex items-center gap-2 whitespace-nowrap"
        >
          View Case Status <ArrowRight size={18} />
        </Link>
      </div>

      {/* Secondary Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Chatbot Entry */}
        <Link 
          to="/victim/chat"
          className="bg-canvas-surface rounded-2xl p-6 border border-canvas-border shadow-card hover:shadow-hover hover:-translate-y-1 transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-primary-muted flex items-center justify-center mb-4">
            <span className="text-2xl">💬</span>
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">Talk to Support AI</h3>
          <p className="text-text-muted text-sm font-medium">
            Confidential space to express your feelings and get immediate guidance.
          </p>
        </Link>

        {/* Breathing Exercise Entry */}
        <Link 
          to="/victim/breathe"
          className="bg-canvas-surface rounded-2xl p-6 border border-canvas-border shadow-card hover:shadow-hover hover:-translate-y-1 transition-all group"
        >
          <div className="w-12 h-12 rounded-full bg-accent-sage/20 flex items-center justify-center mb-4 text-accent-sage">
            <HeartPulse size={24} />
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">Grounding Exercise</h3>
          <p className="text-text-muted text-sm font-medium">
            Take 2 minutes to follow a guided breathing animation to reduce panic.
          </p>
        </Link>

      </div>

    </div>
  );
}
