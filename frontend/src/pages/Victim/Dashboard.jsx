import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FileText, MessageCircle, ArrowRight, AlertCircle, ShieldAlert } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { supabase } from '../../config/supabase';
import useAlertStore from '../../store/alertStore';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

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
  }, [user, authFetch, navigate]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      
      {/* ─── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold text-text-main tracking-tight">
          Hello, {user?.name?.split(' ')[0] || 'Citizen'}
        </h1>
        <p className="text-text-secondary mt-1 font-medium">Here is your current status update.</p>
      </div>

      {/* ─── Check-In Banner ────────────────────────────────────── */}
      {activeCase && activeCase.days_since_last_interaction >= 15 && activeCase.status !== 'RESOLVED' && (
        <div className="bg-warning-muted border border-warning-base/50 rounded-xl p-5 flex flex-col md:flex-row items-center gap-4 justify-between shadow-sm">
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 bg-warning-base/20 text-warning-hover rounded-full flex items-center justify-center shrink-0">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-warning-hover">Mandatory Check-in Required</h2>
              <p className="text-text-main text-sm font-medium mt-1">It has been {activeCase.days_since_last_interaction} days since your last update. Please check in to keep your support network informed.</p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/victim/chat')}
            variant="warning"
            className="whitespace-nowrap bg-warning-base text-white hover:bg-warning-hover shrink-0"
          >
            Start Check-in
          </Button>
        </div>
      )}

      {/* ─── Primary Hero Card (Spotlight style) ────────────────── */}
      <Card className="relative overflow-hidden isolate border-primary-base/20 shadow-md">
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-primary-muted -z-10" />
        
        <CardContent className="p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="text-xs font-bold text-primary-base uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-base animate-pulse" />
              Active System Status
            </div>
            
            {loading ? (
              <div className="h-8 w-48 bg-surface-hover rounded-lg animate-pulse mb-3" />
            ) : caseProgress ? (
              <>
                <h2 className="text-4xl font-black text-text-main mb-3">
                  Score: <NumberFlow value={caseProgress.latestScore || 0} />
                </h2>
                <p className="text-text-secondary font-medium text-lg leading-relaxed max-w-lg">
                  {caseProgress.scoreExplanation}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-text-main mb-3">No Active Case</h2>
                <p className="text-text-secondary font-medium max-w-lg">
                  You haven't registered a case yet. Your support network will activate once you file a complaint.
                </p>
              </>
            )}
          </div>

          <div className="shrink-0 flex gap-3 flex-wrap">
            <Button
              onClick={() => navigate('/victim/chat')}
              size="lg"
              className="rounded-full shadow-sm"
            >
              Talk to AI
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Secondary Action Grid ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <Card
          onClick={() => navigate('/victim/register-grievance')}
          className="group cursor-pointer hover:shadow-md hover:border-primary-base/30 transition-all duration-200 hover:-translate-y-1"
        >
          <CardContent className="p-6">
            <div className="w-12 h-12 bg-primary-muted rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
              <FileText size={24} className="text-primary-base" />
            </div>
            <h3 className="text-xl font-bold text-text-main mb-2">Register Grievance</h3>
            <p className="text-text-secondary font-medium">
              View your legal timeline, court dates, and assigned counsellor contact.
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => navigate('/victim/chat')}
          className="group cursor-pointer hover:shadow-md hover:border-primary-base/30 transition-all duration-200 hover:-translate-y-1"
        >
          <CardContent className="p-6">
            <div className="w-12 h-12 bg-surface-hover rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
              <MessageCircle size={24} className="text-text-secondary" />
            </div>
            <h3 className="text-xl font-bold text-text-main mb-2 flex items-center gap-2">
              AI Support Chat
              <ArrowRight size={18} className="text-text-muted opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
            </h3>
            <p className="text-text-secondary font-medium">
              Get instant legal answers or talk through how you're feeling right now.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
