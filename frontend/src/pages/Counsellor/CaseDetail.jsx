import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  ArrowLeft, Activity, Scale, Clock, BrainCircuit, Mic, 
  HeartHandshake, ShieldCheck, MessageSquare, PhoneCall, Smartphone, Radio, Download 
} from 'lucide-react';
import { toast } from 'sonner';
import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { Card } from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';

export default function CaseDetail() {
  const { caseId } = useParams();
  const { logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingStage, setUpdatingStage] = useState(false);

  useEffect(() => {
    // S3: Uses counsellor endpoint with full engagement_profile
    authFetch(`/api/v1/dashboards/counsellor/case/${caseId}`, {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
    .then(res => {
      if (res.status === 401) { logout(); navigate('/login'); return null; }
      if (res.status === 403) { setError('You do not have access to this case.'); return null; }
      if (!res.ok) { setError('Case not found.'); return null; }
      return res.json();
    })
    .then(d => {
      if (d) setData(d);
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setError('Failed to load case details.');
      setLoading(false);
    });
  }, [caseId, authFetch, navigate, logout]);

  const handleUpdateStage = async (newStage) => {
    setUpdatingStage(true);
    const toastId = toast.loading(`Updating stage to ${newStage.replace(/_/g, ' ')}...`);
    try {
      const res = await authFetch(`/api/v1/cases/${caseId}/stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ new_stage: newStage })
      });
      if (!res.ok) throw new Error('Stage update failed');
      toast.success('Case stage updated successfully', { id: toastId });
      
      // Optimistic update
      setData(prev => ({
        ...prev,
        case_info: { ...prev.case_info, case_stage: newStage }
      }));
    } catch (err) {
      toast.error(err.message, { id: toastId });
    }
    setUpdatingStage(false);
  };

  const handleDownloadReport = async () => {
    const toastId = toast.loading('Generating official report PDF...');
    try {
      const res = await authFetch(`/api/v1/cases/${caseId}/report`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!res.ok) throw new Error('Report generation failed');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `case_report_${caseId.substring(0,8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success('Report downloaded successfully', { id: toastId });
    } catch (err) {
      toast.error(err.message, { id: toastId });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background p-10 flex justify-center">
      <div className="w-8 h-8 border-4 border-primary-muted border-t-primary-base rounded-full animate-spin" />
    </div>
  );
  if (error) return <div className="p-10 text-center text-critical-base font-bold">{error}</div>;
  if (!data) return <div className="p-10 text-center text-text-muted font-bold">Case not found.</div>;

  const { case_info, interactions, engagement_profile } = data;
  
  // Extract XAI breakdown values from latest interaction
  const latestInteraction = interactions?.[0] || {};
  const breakdown = latestInteraction.score_breakdown || {};
  const currentScore = case_info.current_distress_score || 0;
  
  const acousticContrib = Math.round(breakdown.acoustic?.contribution ?? (currentScore * 0.4));
  const sentimentContrib = Math.round(breakdown.sentiment?.contribution ?? (currentScore * 0.4));
  const engagementContrib = Math.round(breakdown.engagement?.contribution ?? (currentScore * 0.2));
  
  const aiReasoning = breakdown.sentiment?.reason || breakdown.sentiment?.notes || latestInteraction?.clinical_reasoning || "Telemetry signals remain within acceptable baseline ranges.";
  
  const intervention = latestInteraction.intervention_recommended || 
    (currentScore >= 85 ? 'witness_protection' : currentScore >= 60 ? 'counselling' : 'legal_aid');

  const channelIcon = (channel) => {
    switch (channel) {
      case 'voice': return <Radio size={14} className="text-primary-base" />;
      case 'ivr': return <PhoneCall size={14} className="text-warning-base" />;
      case 'chatbot': return <MessageSquare size={14} className="text-success-base" />;
      case 'sms': return <Smartphone size={14} className="text-text-muted" />;
      default: return <MessageSquare size={14} className="text-text-muted" />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-300">
      <div className="max-w-6xl w-full mx-auto p-6 md:p-10 space-y-6">
        
        <Link to="/counsellor/queue" className="inline-flex items-center gap-2 text-primary-base hover:text-primary-hover font-bold text-sm uppercase tracking-wider transition-colors active:scale-95">
          <ArrowLeft size={16} /> Back to Queue
        </Link>
        
        {/* ─── Case Header ──────────────────────────────────────────────── */}
        <Card className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 p-6">
          <div>
            <h1 className="text-2xl font-bold text-text-main flex items-center gap-3">
              Case {caseId.substring(0,8)}
              {case_info.has_sos && <RiskBadge risk="critical" />}
            </h1>
            <p className="text-text-secondary font-medium mt-1">
              Victim: <span className="text-text-main font-bold">{case_info.user_name}</span> • {case_info.phone_number}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={handleDownloadReport}
              className="gap-2 font-bold shadow-sm"
            >
              <Download size={16} /> Get Report
            </Button>
            <div className={cn("px-4 py-2 rounded-xl border", currentScore >= 70 ? 'bg-critical-muted border-critical-base/30 text-critical-base' : 'bg-primary-muted border-primary-base/20 text-primary-base')}>
              <span className="font-bold text-[10px] tracking-widest uppercase block text-center mb-0.5">Distress</span>
              <span className="text-3xl font-black text-center block leading-none">
                <NumberFlow value={Math.round(currentScore)} />
              </span>
            </div>
            <div className="px-4 py-2 rounded-xl border border-border bg-surface-hover">
              <span className="font-bold text-[10px] text-text-muted tracking-widest uppercase block mb-0.5">Intervention</span>
              <span className="text-sm font-black text-text-main uppercase tracking-wide capitalize flex items-center gap-1.5 h-[30px]">
                <HeartHandshake size={14} className="text-primary-base" />
                {intervention.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </Card>

        {/* ─── Action Bar ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 bg-surface p-4 rounded-2xl border border-border shadow-sm">
          <span className="text-sm font-bold text-text-secondary uppercase tracking-wider ml-2">Update Stage:</span>
          {['registered', 'investigating', 'charge_sheet', 'trial', 'resolved', 'closed'].map(stage => (
            <button
              key={stage}
              onClick={() => handleUpdateStage(stage)}
              disabled={updatingStage || case_info.case_stage === stage}
              className={cn("px-3 py-1.5 rounded-lg text-sm font-bold capitalize transition-colors",
                case_info.case_stage === stage 
                  ? 'bg-primary-base text-white'
                  : 'bg-background border border-border text-text-muted hover:text-text-main disabled:opacity-50'
              )}
            >
              {stage.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ─── Explainable AI (XAI) Attribution ────────────────────────── */}
          <Card className="md:col-span-2 flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit size={20} className="text-primary-base" />
                  <h2 className="text-lg font-bold text-text-main">XAI Attribution</h2>
                </div>
              </div>

              <div className="p-4 bg-surface-hover rounded-xl border border-border mb-6">
                <p className="text-sm font-medium text-text-secondary leading-relaxed">
                  <span className="font-bold text-text-main">LangGraph Triage Trace: </span>
                  {aiReasoning}
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-secondary flex items-center gap-1.5"><Mic size={14} className="text-primary-base" /> Acoustic Stress</span>
                    <span className="text-sm font-black text-text-main"><NumberFlow value={acousticContrib} /> pts</span>
                  </div>
                  <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (acousticContrib / 40) * 100)}%` }} transition={{ duration: 1, ease: 'easeOut' }} className="bg-primary-base h-full rounded-full" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-secondary flex items-center gap-1.5"><Activity size={14} className="text-critical-base" /> NLP Sentiment</span>
                    <span className="text-sm font-black text-text-main"><NumberFlow value={sentimentContrib} /> pts</span>
                  </div>
                  <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (sentimentContrib / 40) * 100)}%` }} transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }} className="bg-critical-base h-full rounded-full" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-secondary flex items-center gap-1.5"><Clock size={14} className="text-success-base" /> Engagement Risk</span>
                    <span className="text-sm font-black text-text-main"><NumberFlow value={engagementContrib} /> pts</span>
                  </div>
                  <div className="w-full bg-surface-hover rounded-full h-2 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (engagementContrib / 20) * 100)}%` }} transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }} className="bg-success-base h-full rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ─── Engagement Profile ────────────────────────────────────── */}
          <Card className="flex flex-col p-6 bg-surface-hover border-transparent">
            <h2 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
              <PhoneCall size={18} className="text-primary-base" />
              Engagement Profile
            </h2>
            <div className="space-y-4 flex-1">
              <div className="bg-surface p-4 rounded-xl border border-border shadow-sm">
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Response Rate</span>
                <span className="text-2xl font-black text-text-main">{engagement_profile?.response_rate || "N/A"}</span>
              </div>
              <div className="bg-surface p-4 rounded-xl border border-border shadow-sm">
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Missed Check-ins</span>
                <span className="text-2xl font-black text-warning-base"><NumberFlow value={engagement_profile?.missed_calls || 0} /></span>
              </div>
              <div className="bg-surface p-4 rounded-xl border border-border shadow-sm">
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">System Nudge</span>
                <span className="text-sm font-bold text-primary-base">{engagement_profile?.nudge || "Monitor actively"}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ─── Interactions List ──────────────────────────────────────── */}
        {interactions && interactions.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary-base" />
              Interaction History
            </h2>
            <div className="divide-y divide-border">
              {interactions.map((interaction) => (
                <div key={interaction.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-hover border border-border flex items-center justify-center">
                      {channelIcon(interaction.channel)}
                    </div>
                    <div>
                      <div className="font-bold text-text-main capitalize flex items-center gap-2">
                        {interaction.channel} Session
                        {interaction.emotion_tag && (
                          <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-primary-muted text-primary-base tracking-wider">
                            {interaction.emotion_tag}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-text-muted mt-0.5">
                        {new Date(interaction.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-text-main"><NumberFlow value={Math.round(interaction.final_score || 0)} /></span>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">Distress</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}
