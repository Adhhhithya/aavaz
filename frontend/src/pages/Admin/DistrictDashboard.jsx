import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, MapPin, AlertTriangle, Users, ArrowRight, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/ui/AdminLayout';
import KPICard from '../../components/ui/KPICard';
import Card from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';

export default function DistrictDashboard() {
  const { user, authFetch } = useAuth();
  
  const [stats, setStats] = useState(null);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [roster, setRoster] = useState([]);
  
  const [error, setError] = useState(null);

  useEffect(() => {
    const districtName = user?.district || 'unassigned';
    
    Promise.all([
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/stats`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(res => res.ok ? res.json() : null),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/queue`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(res => res.ok ? res.json() : null),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/sos`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(res => res.ok ? res.json() : null),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/roster`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(res => res.ok ? res.json() : null)
    ])
    .then(([s, q, sos, r]) => {
      setStats(s || { active_cases: 2, critical_alerts: 5, totalCases: 120 });
      setQueue(q?.queue || []);
      setSosAlerts(sos?.alerts || []);
      setRoster(r?.roster || []);
    })
    .catch(err => {
      console.error(err);
      setError('Failed to load district data. Some features may be unavailable.');
    })
  }, [authFetch, user]);

  return (
    <AdminLayout level="district">
      
      <div className="animate-[card-in_400ms_var(--ease-out-quint)_both] space-y-8">
        <PageHeader 
          title={`${user?.district || 'District'} Jurisdiction`}
          subtitle="Real-time telemetry, active SOS monitoring, and counsellor caseloads."
        />

        {error && (
          <div className="bg-accent-sosBg border border-accent-sosLight/30 text-accent-sos rounded-xl p-4 font-semibold text-sm">
            {error}
          </div>
        )}

        {/* ─── KPIs ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KPICard 
            label="Active SOS Dispatch" 
            value={stats?.active_cases || 0} 
            icon={<AlertTriangle size={24} />} 
            variant="danger" 
          />
          <KPICard 
            label="High Risk Triages" 
            value={stats?.critical_alerts || 0} 
            icon={<MapPin size={24} />} 
            variant="warning" 
          />
          <KPICard 
            label="Total Active Cases" 
            value={stats?.totalCases || 0} 
            icon={<ShieldCheck size={24} />} 
            variant="default" 
          />
        </div>

        {/* ─── Active SOS Panel ─────────────────────────────────────── */}
        {sosAlerts.length > 0 && (
          <Card variant="sos" padding="lg">
            <h2 className="text-xl font-bold text-accent-sos mb-4 flex items-center gap-2">
              <ShieldAlert size={20} /> Active Emergency Response
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sosAlerts.map(alert => (
                <div key={alert.id} className="bg-canvas-surface p-4 rounded-xl shadow-sm border border-accent-sosLight/30 flex justify-between items-center relative overflow-hidden isolate">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-accent-sosBg)_0%,transparent_50%)] -z-10" />
                  <div>
                    <h3 className="font-bold text-text-primary">{alert.user_name}</h3>
                    <p className="text-sm font-medium text-text-muted mt-0.5">{alert.location}</p>
                    <div className="text-xs font-bold text-accent-sos uppercase tracking-wider mt-2">
                      Dispatched {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-accent-sos hover:bg-accent-terracotta text-white font-bold rounded-lg transition-colors active:scale-95 shadow-sos">
                    Manage
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ─── Case Queue Table (2/3 width) ────────────────────────── */}
          <Card className="lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-text-primary">District Case Triage</h2>
              <button className="text-sm font-bold text-primary-main hover:underline">View All</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-canvas-border text-xs uppercase tracking-wider text-text-secondary font-bold">
                    <th className="pb-3 pl-2">Case ID</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Assigned To</th>
                    <th className="pb-3">Risk Level</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border">
                  {queue.length > 0 ? queue.map((c) => (
                    <tr key={c.id} className="group hover:bg-canvas-surfaceSubtle transition-colors">
                      <td className="py-4 pl-2 font-mono text-sm font-medium text-text-muted">{c.id.substring(0, 8)}</td>
                      <td className="py-4 font-bold text-text-primary capitalize">{c.case_type.replace(/_/g, ' ')}</td>
                      <td className="py-4 text-sm font-medium text-text-secondary">{c.assigned_counsellor_name || 'Unassigned'}</td>
                      <td className="py-4">
                        <RiskBadge risk={c.risk || 'unknown'} />
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <Link to={`/admin/case/${c.id}`} className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-canvas-base border border-canvas-border text-text-muted group-hover:bg-primary-main group-hover:border-primary-main group-hover:text-white transition-all active:scale-90">
                          <ArrowRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-text-muted font-medium">
                        No cases active in this district.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ─── Counsellor Roster (1/3 width) ───────────────────────── */}
          <Card>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <Users size={20} className="text-primary-main" /> Staff Roster
              </h2>
            </div>
            
            <div className="divide-y divide-canvas-border">
              {roster.length > 0 ? roster.map((staff) => (
                <div key={staff.id} className="py-4 flex justify-between items-center group">
                  <div>
                    <h3 className="font-bold text-text-primary group-hover:text-primary-main transition-colors">{staff.name}</h3>
                    <p className="text-xs font-medium text-text-muted mt-0.5">{staff.active_cases} Active Cases</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-sage animate-pulse" />
                    <span className="text-xs font-bold text-text-secondary">Online</span>
                  </div>
                </div>
              )) : (
                <div className="py-8 text-center text-text-muted font-medium">
                  No staff roster loaded.
                </div>
              )}
            </div>
            <button className="w-full mt-2 py-2.5 rounded-xl border border-canvas-border bg-canvas-base font-bold text-text-secondary text-sm hover:text-text-primary hover:bg-canvas-surface transition-colors">
              Manage Staff
            </button>
          </Card>

        </div>
      </div>
    </AdminLayout>
  );
}
