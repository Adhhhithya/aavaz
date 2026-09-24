import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, MapPin, AlertTriangle, Users, ArrowRight, ShieldAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import KPICard from '../../components/ui/KPICard';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/Alert';

export default function DistrictDashboard() {
  const { user, logout, authFetch } = useAuth();
  const navigate = useNavigate();
  
  const [stats, setStats] = useState(null);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const districtName = user?.district || 'unassigned';
    
    const handleResponse = async (res) => {
      if (res.status === 401) {
        logout();
        return null;
      }
      if (res.status === 403) {
        setError('You do not have permission to view this district dashboard.');
        return null;
      }
      return res.ok ? res.json() : null;
    };

    Promise.all([
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/stats`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(handleResponse),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/queue`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(handleResponse),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/sos`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(handleResponse),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/roster`, { headers: { 'ngrok-skip-browser-warning': '1' } }).then(handleResponse)
    ])
    .then(([s, q, sos, r]) => {
      setStats(s || { active_cases: 0, critical_alerts: 0, totalCases: 0 });
      setQueue(q?.queue || []);
      setSosAlerts(sos?.alerts || []);
      setRoster(r?.roster || []);
    })
    .catch(err => {
      console.error(err);
      setError('Failed to load district data. Some features may be unavailable.');
    });
  }, [authFetch, user, logout]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <PageHeader 
        title={`${user?.district || 'District'} Jurisdiction`}
        subtitle="Real-time telemetry, active SOS monitoring, and counsellor caseloads."
      />

      {error && (
        <Alert variant="critical">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ─── KPIs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard 
          label="Active SOS Dispatch" 
          value={stats?.active_cases || 0} 
          icon={<AlertTriangle size={24} />} 
          variant="danger" 
          onClick={() => navigate('/admin/cases?filter=sos')}
        />
        <KPICard 
          label="High Risk Triages" 
          value={stats?.critical_alerts || 0} 
          icon={<MapPin size={24} />} 
          variant="warning" 
          onClick={() => navigate('/admin/cases?filter=high_risk')}
        />
        <KPICard 
          label="Total Active Cases" 
          value={stats?.totalCases || 0} 
          icon={<ShieldCheck size={24} />} 
          variant="default" 
          onClick={() => navigate('/admin/cases')}
        />
      </div>

      {/* ─── Active SOS Panel ─────────────────────────────────────── */}
      {sosAlerts.length > 0 && (
        <Card className="border-critical-base/50 shadow-critical bg-critical-muted">
          <CardHeader>
            <CardTitle className="text-critical-hover flex items-center gap-2">
              <ShieldAlert size={20} /> Active Emergency Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sosAlerts.map(alert => (
                <div key={alert.id} className="bg-surface p-4 rounded-xl shadow-sm border border-border flex justify-between items-center relative overflow-hidden isolate">
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-critical-muted -z-10" />
                  <div>
                    <h3 className="font-bold text-text-main">{alert.user_name}</h3>
                    <p className="text-sm font-medium text-text-secondary mt-0.5">{alert.location}</p>
                    <div className="text-xs font-bold text-critical-base uppercase tracking-wider mt-2">
                      Dispatched {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <Button variant="critical">Manage</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ─── Case Queue Table (2/3 width) ────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle>District Case Triage</CardTitle>
            <Button variant="link" onClick={() => navigate('/admin/cases')}>View All</Button>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-text-secondary font-bold">
                    <th className="pb-3 pl-2">Case ID</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Assigned To</th>
                    <th className="pb-3">Risk Level</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queue.length > 0 ? queue.map((c) => (
                    <tr key={c.id} className="group hover:bg-surface-hover transition-colors">
                      <td className="py-4 pl-2 font-mono text-sm text-text-muted">{c.id.substring(0, 8)}</td>
                      <td className="py-4 font-semibold text-text-main capitalize">{c.case_type.replace(/_/g, ' ')}</td>
                      <td className="py-4 text-sm text-text-secondary">{c.assigned_counsellor_name || 'Unassigned'}</td>
                      <td className="py-4">
                        <RiskBadge risk={c.risk || 'unknown'} />
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <Button variant="outline" size="icon" onClick={() => navigate(`/admin/case/${c.id}`)}>
                          <ArrowRight size={14} />
                        </Button>
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
          </CardContent>
        </Card>

        {/* ─── Counsellor Roster (1/3 width) ───────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Users size={20} className="text-primary-base" /> Staff Roster
            </CardTitle>
          </CardHeader>
          
          <CardContent>
            <div className="divide-y divide-border">
              {roster.length > 0 ? roster.map((staff) => (
                <div key={staff.id} className="py-4 flex justify-between items-center group">
                  <div>
                    <h3 className="font-semibold text-text-main group-hover:text-primary-base transition-colors">{staff.name}</h3>
                    <p className="text-xs text-text-secondary mt-0.5">{staff.active_cases} Active Cases</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success-base animate-pulse" />
                    <span className="text-xs font-bold text-text-secondary">Online</span>
                  </div>
                </div>
              )) : (
                <div className="py-8 text-center text-text-muted font-medium">
                  No staff roster loaded.
                </div>
              )}
            </div>
            <Button variant="outline" className="w-full mt-4">Manage Staff</Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
