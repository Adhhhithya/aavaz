import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FileText, MessageCircle, ArrowRight, AlertCircle } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { supabase } from '../../config/supabase';
import useAlertStore from '../../store/alertStore';

export default function VictimDashboard() {
  const { user, authFetch } = useAuth();
  const navigate = useNavigate();
  const [activeCase, setActiveCase] = useState(null);
  const [caseProgress, setCaseProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const casesRes = await authFetch(`/api/v1/intake/app/cases/${user?.id}`, {
          headers: { 'ngrok-skip-browser-warning': '1' }
        });
        const casesData = await casesRes.json();
        
        if (casesData.cases?.length > 0) {
          const currentCase = casesData.cases[0];
          setActiveCase(currentCase);
          const caseId = currentCase.id;
          const progRes = await authFetch(`/api/v1/cases/${caseId}/progress`, {
            headers: { 'ngrok-skip-browser-warning': '1' }
          });
          if (progRes.ok) {
            const data = await progRes.json();
            setCaseProgress(data);
          }
        } else {
          // If no cases exist, redirect to the new Grievance Registration flow
          navigate('/victim/register-grievance');
        }
      } catch (err) {
        console.error("Failed to fetch progress", err);
      }
      setLoading(false);
    }
    
    fetchProgress();

    // Supabase Realtime Subscription
    const channel = supabase
      .channel('victim-cases-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cases',
          filter: `victim_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Realtime case update received for victim!', payload);
          useAlertStore.getState().addAlert({
            title: 'Case Updated',
            message: 'Your case status has been updated in real-time.',
            type: 'info'
          });
          fetchProgress();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, authFetch]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-[card-in_400ms_var(--ease-out-quint)_both]">
      
      {/* ─── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-black text-text-primary tracking-tight">
          Hello, {user?.name?.split(' ')[0] || 'Citizen'}
        </h1>
        <p className="text-text-secondary mt-1 font-medium">Here is your current status update.</p>
      </div>

      {/* ─── Check-In Banner ────────────────────────────────────── */}
      {activeCase && activeCase.days_since_last_interaction >= 15 && activeCase.status !== 'RESOLVED' && (
        <div className="bg-accent-sos/10 border border-accent-sos/20 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 bg-accent-sos/20 text-accent-sos rounded-full flex items-center justify-center shrink-0">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-accent-sos">Mandatory 15-Day Check-in Required</h2>
              <p className="text-text-primary text-sm font-medium">It has been {activeCase.days_since_last_interaction} days since your last update. Please complete a check-in to keep your case active and priorities accurate.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/victim/chat')}
            className="px-6 py-2.5 bg-accent-sos text-white font-bold rounded-xl whitespace-nowrap hover:opacity-90 active:scale-95 transition-all"
          >
            Start Check-in
          </button>
        </div>
      )}

      {/* ─── Primary Hero Card (Spotlight style) ────────────────── */}
      <div className="relative group rounded-2xl border border-canvas-borderActive overflow-hidden bg-canvas-surface shadow-hover isolate">
        {/* CSS Radial gradient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-primary-glow)_0%,transparent_50%)] -z-10" />
        
        <div className="p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="text-xs font-bold text-primary-main uppercase tracking-widest mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-main animate-pulse" />
              Active System Status
            </div>
            
            {loading ? (
              <div className="h-8 w-48 bg-canvas-surfaceSubtle rounded-lg animate-pulse mb-3" />
            ) : caseProgress ? (
              <>
                <h2 className="text-3xl font-black text-text-primary mb-3">
                  Score: <NumberFlow value={caseProgress.latestScore || 0} />
                </h2>
                <p className="text-text-secondary font-medium text-lg leading-relaxed max-w-lg">
                  {caseProgress.scoreExplanation}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-text-primary mb-3">No Active Case</h2>
                <p className="text-text-secondary font-medium max-w-lg">
                  You haven't registered a case yet. Your support network will activate once you file a complaint.
                </p>
              </>
            )}
          </div>

          <div className="shrink-0 flex gap-3 flex-wrap">
            <button
              onClick={() => navigate('/victim/chat')}
              className="px-6 py-3 bg-text-primary text-white font-bold rounded-full transition-transform duration-[var(--duration-instant)] ease-[var(--ease-out-quint)] active:scale-95"
            >
              Talk to AI
            </button>
          </div>
        </div>
      </div>

      {/* ─── Secondary Action Grid ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div
          onClick={() => navigate('/victim/case')}
          className="group cursor-pointer bg-canvas-surface border border-canvas-border rounded-2xl p-6 shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-quint)]"
        >
          <div className="w-12 h-12 bg-primary-muted rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-[var(--duration-fast)]">
            <FileText size={24} className="text-primary-main" />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-2">My Case Details</h3>
          <p className="text-text-secondary font-medium">
            View your legal timeline, court dates, and assigned counsellor contact.
          </p>
        </div>

        <div
          onClick={() => navigate('/victim/chat')}
          className="group cursor-pointer bg-canvas-surface border border-canvas-border rounded-2xl p-6 shadow-card hover:shadow-hover hover:-translate-y-1 transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-quint)]"
        >
          <div className="w-12 h-12 bg-canvas-surfaceSubtle rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-[var(--duration-fast)]">
            <MessageCircle size={24} className="text-text-muted" />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-2 flex items-center gap-2">
            AI Support Chat
            <ArrowRight size={18} className="text-text-muted opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-[var(--duration-fast)]" />
          </h3>
          <p className="text-text-secondary font-medium">
            Get instant legal answers or talk through how you're feeling right now.
          </p>
        </div>

      </div>
    </div>
  );
}
