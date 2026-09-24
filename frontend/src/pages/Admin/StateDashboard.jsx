import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, MapPin, AlertTriangle, Users, TrendingUp, Filter, Activity } from 'lucide-react';
import KPICard from '../../components/ui/KPICard';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';

export default function StateDashboard() {
  const { authFetch } = useAuth();
  const [stats, setStats] = useState({
    activeSOS: 0,
    highRisk: 0,
    totalCases: 0,
    districtsWithSpikes: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [districtList, setDistrictList] = useState([]);

  useEffect(() => {
    authFetch('/api/v1/dashboards/state/stats', {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.stats) {
          setStats({
            activeSOS: data.stats.critical_cases || 0,
            highRisk: data.stats.critical_cases || 0, // Using same backend proxy for now, ideally backend separates these
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <PageHeader 
        title="State Overview"
        subtitle="Aggregated real-time distress telemetry across all districts."
        right={
          <Button variant="outline" className="gap-2">
            <Filter size={16} /> Filter by District
          </Button>
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
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <MapPin size={20} className="text-primary-base" /> District Risk Breakdown
          </CardTitle>
          <Button variant="link">Export Report</Button>
        </CardHeader>
        
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-text-secondary font-bold">
                  <th className="pb-3 pl-2">District</th>
                  <th className="pb-3 text-center">Active SOS</th>
                  <th className="pb-3 text-center">High Risk</th>
                  <th className="pb-3 text-center">Total Cases</th>
                  <th className="pb-3 text-right pr-2">Overall Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-text-muted font-medium">Loading district data...</td>
                  </tr>
                ) : districtList.length > 0 ? (
                  districtList.map((district, idx) => (
                    <tr key={district.id || idx} className="group hover:bg-surface-hover transition-colors">
                      <td className="py-4 pl-2 font-semibold text-text-main">{district.name}</td>
                      <td className="py-4 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${district.activeSOS > 0 ? 'bg-critical-muted text-critical-base' : 'text-text-muted'}`}>
                          {district.activeSOS || 0}
                        </span>
                      </td>
                      <td className="py-4 text-center font-bold text-text-main">{district.critical || district.highRisk || 0}</td>
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
        </CardContent>
      </Card>
    </div>
  );
}
