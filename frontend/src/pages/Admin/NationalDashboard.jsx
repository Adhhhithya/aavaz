import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MapPin, AlertTriangle, Users, TrendingUp, Filter, BarChart2 } from 'lucide-react';
import AdminLayout from '../../components/ui/AdminLayout';
import KPICard from '../../components/ui/KPICard';
import Card from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';

/* ─── Meteors Background Component ───────────────────────────────── */
function Meteors() {
  const meteors = useMemo(() => new Array(8).fill(true).map(() => ({
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 3}s`,
    animationDuration: `${Math.floor(Math.random() * (8 - 2) + 2)}s`,
  })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      {meteors.map((m, idx) => (
        <span
          key={idx}
          className="absolute h-0.5 w-0.5 rounded-full bg-slate-500 shadow-[0_0_0_1px_#ffffff10] rotate-[215deg] animate-[meteor_5s_linear_infinite]"
          style={m}
        >
          {/* Meteor tail */}
          <div className="absolute top-1/2 -translate-y-1/2 w-[50px] h-[1px] bg-gradient-to-r from-slate-500 to-transparent pointer-events-none" />
        </span>
      ))}
      <style>{`
        @keyframes meteor {
          0% { transform: rotate(215deg) translateX(0); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: rotate(215deg) translateX(-500px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function NationalDashboard() {
  const { user, authFetch } = useAuth();
  const [stats, setStats] = useState({
    activeSOS: 0,
    highRisk: 0,
    totalCases: 0,
    statesWithSpikes: 0
  });
  const [stateList, setStateList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // S3: Fixed authFetch ReferenceError by properly destructuring it from useAuth
    authFetch('/api/v1/dashboards/national/stats', {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const totalCritical = data.state_breakdown?.reduce((acc, s) => acc + (s.critical || 0), 0) || 0;
          setStats({
            activeSOS: totalCritical, 
            highRisk: totalCritical,
            totalCases: data.total_cases || 0,
            statesWithSpikes: data.state_breakdown?.filter(s => s.critical > 5).length || 0
          });
          setStateList(data.state_breakdown || []);
        } else {
          setStats({ activeSOS: 0, highRisk: 0, totalCases: 0, statesWithSpikes: 0 });
          setStateList([]);
        }
      })
      .catch(err => console.error('Error loading national stats:', err))
      .finally(() => setLoading(false));
  }, [authFetch]);

  return (
    <AdminLayout level="national">
      
      <div className="animate-[card-in_400ms_var(--ease-out-quint)_both] space-y-8 relative">
        <Meteors />
        
        <PageHeader 
          title="National Command Center"
          subtitle="Aggregated distress telemetry across all States and Union Territories."
          right={
            <button className="flex items-center gap-2 bg-canvas-surface border border-canvas-border px-4 py-2 rounded-xl text-sm font-bold text-text-primary hover:bg-canvas-surfaceSubtle transition-colors active:scale-95 shadow-sm">
              <Filter size={16} /> Filter by State
            </button>
          }
        />

        {/* ─── KPIs ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard label="National Active SOS" value={stats.activeSOS} icon={<AlertTriangle size={24} />} variant="danger" />
          <KPICard label="High Risk Escalations" value={stats.highRisk} icon={<TrendingUp size={24} />} variant="warning" />
          <KPICard label="Total Active Cases" value={stats.totalCases} icon={<Users size={24} />} variant="default" />
          <KPICard label="States w/ Spikes" value={stats.statesWithSpikes} icon={<BarChart2 size={24} />} variant="default" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ─── State Breakdown Table ───────────────────────────────── */}
          <Card className="lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <MapPin size={20} className="text-primary-main" /> State Risk Breakdown
              </h2>
              <button className="text-sm font-bold text-primary-main hover:underline">Export Full Report</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-canvas-border text-xs uppercase tracking-wider text-text-secondary font-bold">
                    <th className="pb-3 pl-2">State / UT</th>
                    <th className="pb-3 text-center">Active SOS</th>
                    <th className="pb-3 text-center">High Risk</th>
                    <th className="pb-3 text-center">Total Cases</th>
                    <th className="pb-3 text-right pr-2">Overall Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border">
                  {stateList.length > 0 ? (
                    stateList.map((state, idx) => (
                      <tr key={state.id || idx} className="group hover:bg-canvas-surfaceSubtle transition-colors">
                        <td className="py-4 pl-2 font-bold text-text-primary">{state.name}</td>
                        <td className="py-4 text-center">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${state.activeSOS > 0 ? 'bg-accent-sosBg text-accent-sos' : 'text-text-muted'}`}>
                            {state.activeSOS || 0}
                          </span>
                        </td>
                        <td className="py-4 text-center font-bold text-text-primary">{state.critical || state.highRisk || 0}</td>
                        <td className="py-4 text-center font-medium text-text-secondary">{state.total || 0}</td>
                        <td className="py-4 pr-2 text-right">
                          <RiskBadge risk={state.risk || 'low'} showDot={true} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-text-muted font-medium">
                        No state data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ─── Policy Insights ─────────────────────────────────────── */}
          <Card variant="subtle">
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-primary-main" />
              Policy Insights
            </h2>
            <p className="text-sm text-text-secondary font-medium leading-relaxed mb-6">
              Automated XAI analysis of National telemetry trends.
            </p>
            
            <div className="space-y-4">
              <div className="bg-canvas-surface p-4 rounded-xl border border-canvas-border shadow-sm border-l-4 border-l-accent-sos">
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Critical Insight</span>
                <p className="text-sm font-medium text-text-primary">
                  12% spike in Witness Intimidation reports across Maharashtra and UP in the last 48 hours.
                </p>
              </div>
              <div className="bg-canvas-surface p-4 rounded-xl border border-canvas-border shadow-sm border-l-4 border-l-accent-amber">
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Warning Insight</span>
                <p className="text-sm font-medium text-text-primary">
                  Counsellor response latency is increasing in Karnataka (avg 4.2 hrs). Recommend resource reallocation.
                </p>
              </div>
              <div className="bg-canvas-surface p-4 rounded-xl border border-canvas-border shadow-sm border-l-4 border-l-accent-sage">
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Positive Trend</span>
                <p className="text-sm font-medium text-text-primary">
                  Kerala showing 15% reduction in overall distress scores following new intervention protocols.
                </p>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </AdminLayout>
  );
}
