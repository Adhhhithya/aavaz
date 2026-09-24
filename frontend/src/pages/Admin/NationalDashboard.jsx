import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MapPin, AlertTriangle, Users, TrendingUp, Filter, BarChart2 } from 'lucide-react';
import KPICard from '../../components/ui/KPICard';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';

/* ─── Meteors Background Component ───────────────────────────────── */
const STATIC_METEORS = [
  { top: '12%', left: '25%', animationDelay: '0.4s', animationDuration: '4s' },
  { top: '28%', left: '72%', animationDelay: '1.2s', animationDuration: '5s' },
  { top: '45%', left: '15%', animationDelay: '2.1s', animationDuration: '3s' },
  { top: '60%', left: '88%', animationDelay: '0.8s', animationDuration: '6s' },
  { top: '75%', left: '42%', animationDelay: '1.7s', animationDuration: '4s' },
  { top: '85%', left: '60%', animationDelay: '2.5s', animationDuration: '5s' },
  { top: '35%', left: '50%', animationDelay: '1.0s', animationDuration: '3s' },
  { top: '92%', left: '20%', animationDelay: '0.2s', animationDuration: '4s' },
];

function Meteors() {
  const meteors = STATIC_METEORS;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      {meteors.map((m, idx) => (
        <span
          key={idx}
          className="absolute h-0.5 w-0.5 rounded-full bg-secondary-base shadow-[0_0_0_1px_#ffffff10] rotate-[215deg] animate-[meteor_5s_linear_infinite]"
          style={m}
        >
          {/* Meteor tail */}
          <div className="absolute top-1/2 -translate-y-1/2 w-[50px] h-[1px] bg-gradient-to-r from-secondary-base to-transparent pointer-events-none" />
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
  const { authFetch } = useAuth();
  const [stats, setStats] = useState({
    activeSOS: 0,
    highRisk: 0,
    totalCases: 0,
    statesWithSpikes: 0
  });
  const [stateList, setStateList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out relative">
      <Meteors />
      
      <PageHeader 
        title="National Command Center"
        subtitle="Aggregated distress telemetry across all States and Union Territories."
        right={
          <Button variant="outline" className="gap-2">
            <Filter size={16} /> Filter by State
          </Button>
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
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <MapPin size={20} className="text-primary-base" /> State Risk Breakdown
            </CardTitle>
            <Button variant="link">Export Full Report</Button>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-text-secondary font-bold">
                    <th className="pb-3 pl-2">State / UT</th>
                    <th className="pb-3 text-center">Active SOS</th>
                    <th className="pb-3 text-center">High Risk</th>
                    <th className="pb-3 text-center">Total Cases</th>
                    <th className="pb-3 text-right pr-2">Overall Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-text-muted font-medium">Loading state data...</td>
                    </tr>
                  ) : stateList.length > 0 ? (
                    stateList.map((state, idx) => (
                      <tr key={state.id || idx} className="group hover:bg-surface-hover transition-colors">
                        <td className="py-4 pl-2 font-semibold text-text-main">{state.name}</td>
                        <td className="py-4 text-center">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${state.activeSOS > 0 ? 'bg-critical-muted text-critical-base' : 'text-text-muted'}`}>
                            {state.activeSOS || 0}
                          </span>
                        </td>
                        <td className="py-4 text-center font-bold text-text-main">{state.critical || state.highRisk || 0}</td>
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
          </CardContent>
        </Card>

        {/* ─── Policy Insights (Dynamic) ─────────────────────────────── */}
        <Card className="bg-surface-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary-base">
              <TrendingUp size={20} />
              Policy Insights
            </CardTitle>
            <p className="text-sm text-text-secondary font-medium mt-2">
              Automated XAI analysis of National telemetry trends.
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="bg-surface p-6 rounded-xl border border-border shadow-sm text-center">
              <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Insufficient Telemetry</span>
              <p className="text-sm font-medium text-text-muted">
                The XAI model is still aggregating state-level telemetry data. Actionable insights will appear here once sufficient baseline patterns are established.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
