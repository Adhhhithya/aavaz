import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, MapPin, AlertTriangle, Users, TrendingUp, Filter, Activity } from 'lucide-react';
import AdminLayout from '../../components/ui/AdminLayout';
import KPICard from '../../components/ui/KPICard';
import Card from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';

export default function StateDashboard() {
  const { user, authFetch } = useAuth();
  const [stats, setStats] = useState({
    activeSOS: 0,
    highRisk: 0,
    totalCases: 0,
    districtsWithSpikes: 0
  });
  
  const [loading, setLoading] = useState(true);

  const [districtList, setDistrictList] = useState([]);

  useEffect(() => {
    // S3: Fixed authFetch ReferenceError by properly destructuring it from useAuth
    authFetch('/api/v1/dashboards/state/stats', {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.stats) {
          setStats({
            activeSOS: data.stats.critical_cases || 0,
            highRisk: data.stats.critical_cases || 0,
            totalCases: data.stats.total_cases || 0,
            districtsWithSpikes: data.district_breakdown?.length || 0
          });
          setDistrictList(data.district_breakdown || []);
        } else {
          setStats({ activeSOS: 0, highRisk: 0, totalCases: 0, districtsWithSpikes: 0 });
          setDistrictList([]);
        }
      })
      .catch(err => console.error('Error loading state stats:', err))
      .finally(() => setLoading(false));
  }, [authFetch]);

  return (
    <AdminLayout level="state">
      
      <div className="animate-[card-in_400ms_var(--ease-out-quint)_both] space-y-8">
        <PageHeader 
          title="State Overview"
          subtitle="Aggregated real-time distress telemetry across all districts."
          right={
            <button className="flex items-center gap-2 bg-canvas-surface border border-canvas-border px-4 py-2 rounded-xl text-sm font-bold text-text-primary hover:bg-canvas-surfaceSubtle transition-colors active:scale-95 shadow-sm">
              <Filter size={16} /> Filter by District
            </button>
          }
        />

        {/* ─── KPIs ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard label="Statewide Active SOS" value={stats.activeSOS} icon={<AlertTriangle size={24} />} variant="danger" />
          <KPICard label="High Risk Escalations" value={stats.highRisk} icon={<TrendingUp size={24} />} variant="warning" />
          <KPICard label="Total Active Cases" value={stats.totalCases} icon={<Users size={24} />} variant="default" />
          <KPICard label="Districts w/ Spikes" value={stats.districtsWithSpikes} icon={<Activity size={24} />} variant="default" />
        </div>

        {/* ─── District Breakdown Table ────────────────────────────── */}
        <Card>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <MapPin size={20} className="text-primary-main" /> District Risk Breakdown
            </h2>
            <button className="text-sm font-bold text-primary-main hover:underline">Export Report</button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-canvas-border text-xs uppercase tracking-wider text-text-secondary font-bold">
                  <th className="pb-3 pl-2">District</th>
                  <th className="pb-3 text-center">Active SOS</th>
                  <th className="pb-3 text-center">High Risk</th>
                  <th className="pb-3 text-center">Total Cases</th>
                  <th className="pb-3 text-right pr-2">Overall Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-canvas-border">
                {districtList.length > 0 ? (
                  districtList.map((district, idx) => (
                    <tr key={district.id || idx} className="group hover:bg-canvas-surfaceSubtle transition-colors">
                      <td className="py-4 pl-2 font-bold text-text-primary">{district.name}</td>
                      <td className="py-4 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${district.activeSOS > 0 ? 'bg-accent-sosBg text-accent-sos' : 'text-text-muted'}`}>
                          {district.activeSOS || 0}
                        </span>
                      </td>
                      <td className="py-4 text-center font-bold text-text-primary">{district.critical || district.highRisk || 0}</td>
                      <td className="py-4 text-center font-medium text-text-secondary">{district.total || 0}</td>
                      <td className="py-4 pr-2 text-right">
                        <RiskBadge risk={district.risk || 'low'} showDot={true} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-text-muted font-medium">
                      No district data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </AdminLayout>
  );
}
