import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Activity, Scale, Clock, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CaseDetail() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In MVP, we fetch the progress data which includes the trend
    fetch(`/api/v1/cases/${caseId}/progress`, {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
    .then(res => res.json())
    .then(data => {
      setCaseData(data);
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [caseId]);

  if (loading) return <div className="p-10 text-center text-text-muted font-medium">Loading Case Details...</div>;
  if (!caseData) return <div className="p-10 text-center text-text-muted font-medium">Case not found.</div>;

  return (
    <div className="min-h-screen bg-canvas-base p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <Link to="/counsellor/queue" className="inline-flex items-center gap-2 text-primary-main hover:text-primary-hover font-bold text-sm uppercase tracking-wider transition-colors">
          <ArrowLeft size={16} /> Back to Queue
        </Link>
        
        <header className="bg-canvas-surface p-6 rounded-2xl shadow-sm border border-canvas-border flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-text-primary">Case {caseId.substring(0,8)}</h1>
            <p className="text-text-muted font-medium mt-1">Current Stage: <span className="uppercase text-text-secondary">{caseData.currentStage}</span></p>
          </div>
          <div className={`px-4 py-2 rounded-xl border ${caseData.latestScore > 60 ? 'bg-accent-sosBg border-accent-sosLight text-accent-sos' : 'bg-primary-muted border-primary-main/20 text-primary-main'}`}>
            <span className="font-bold text-sm tracking-widest uppercase block text-center mb-1">Distress Score</span>
            <span className="text-3xl font-black">{caseData.latestScore.toFixed(0)}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Longitudinal Trend Chart */}
          <div className="bg-canvas-surface p-6 rounded-2xl shadow-sm border border-canvas-border flex flex-col">
            <div className="flex items-center gap-2 text-text-primary mb-6">
              <Activity size={20} className="text-primary-main" />
              <h2 className="text-xl font-bold">Longitudinal Distress Trend</h2>
            </div>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={caseData.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                  <XAxis dataKey="label" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#8A79B8" 
                    strokeWidth={4}
                    dot={{ fill: '#8A79B8', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* eCourts Integration Section */}
          <div className="bg-canvas-surface p-6 rounded-2xl shadow-sm border border-canvas-border">
            <div className="flex items-center gap-2 text-text-primary mb-6">
              <Scale size={20} className="text-accent-sage" />
              <h2 className="text-xl font-bold">eCourts Legal Trajectory</h2>
            </div>
            
            {caseData.ecourts_data ? (
              <div className="space-y-6">
                <div className="p-4 bg-canvas-surfaceSubtle rounded-xl border border-canvas-border">
                  <h3 className="font-bold text-text-primary flex items-center gap-2"><Clock size={16} /> Latest Legal Update</h3>
                  <p className="text-sm font-medium text-text-secondary mt-2 leading-relaxed">
                    {caseData.ecourts_data.detailed_case_update || "No detailed update available."}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-canvas-base rounded-xl border border-canvas-border">
                    <span className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Next Hearing Date</span>
                    <span className="font-bold text-text-primary">{caseData.ecourts_data.nextHearingDate || "Not Scheduled"}</span>
                  </div>
                  <div className="p-4 bg-canvas-base rounded-xl border border-canvas-border">
                    <span className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Current Status</span>
                    <span className="font-bold text-text-primary">{caseData.ecourts_data.currentStatus || caseData.ecourts_data.caseStatus || "Unknown"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-text-muted">
                <AlertTriangle size={32} className="mb-2 opacity-50" />
                <p className="font-medium text-sm">No eCourts API data linked to this case.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
