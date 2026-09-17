import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, MapPin, AlertTriangle, Users, TrendingUp, Filter } from 'lucide-react';

export default function StateDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    activeSOS: 0,
    highRisk: 0,
    totalCases: 0,
    districtsWithSpikes: 0
  });

  useEffect(() => {
    // Mocking the backend fetch for MVP
    setTimeout(() => {
      setStats({
        activeSOS: 14, 
        highRisk: 87,
        totalCases: 1450,
        districtsWithSpikes: 3
      });
    }, 600);
  }, []);

  return (
    <div className="min-h-screen bg-canvas-base flex flex-col">
      <header className="bg-canvas-surface border-b border-canvas-border px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary-main" size={24} />
          <span className="font-bold text-lg text-text-primary">State Official Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted hidden md:block">{user?.name} (State Level)</span>
          <button onClick={logout} className="text-sm font-bold text-text-secondary hover:text-primary-main transition-colors">Logout</button>
        </div>
      </header>
      
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-text-primary tracking-tight">State Overview</h1>
            <p className="text-text-secondary mt-1 font-medium">Aggregated real-time distress telemetry across all districts.</p>
          </div>
          <button className="flex items-center gap-2 bg-canvas-surface border border-canvas-border px-4 py-2 rounded-lg text-sm font-bold text-text-primary hover:bg-canvas-surfaceSubtle">
            <Filter size={16} /> Filter by District
          </button>
        </div>

        {/* Top Level KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-sosBg flex items-center justify-center text-accent-sos shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Statewide Active SOS</p>
              <p className="text-2xl font-black text-text-primary">{stats.activeSOS}</p>
            </div>
          </div>
          
          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-muted flex items-center justify-center text-primary-main shrink-0">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">High Risk Escalatons</p>
              <p className="text-2xl font-black text-text-primary">{stats.highRisk}</p>
            </div>
          </div>

          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-canvas-surfaceSubtle flex items-center justify-center text-text-secondary shrink-0">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Active Cases</p>
              <p className="text-2xl font-black text-text-primary">{stats.totalCases}</p>
            </div>
          </div>

          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-terracotta/20 flex items-center justify-center text-accent-terracotta shrink-0">
              <MapPin size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Districts Spiking</p>
              <p className="text-2xl font-black text-text-primary">{stats.districtsWithSpikes}</p>
            </div>
          </div>
        </div>

        {/* Charts & Maps Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-canvas-surface border border-canvas-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-primary-main"/> State Distress Trend
            </h2>
            <div className="h-72 bg-canvas-base border border-canvas-border rounded-xl flex items-center justify-center p-4">
              <div className="w-full h-full border-2 border-dashed border-primary-main/20 rounded-lg flex items-center justify-center text-text-muted">
                Chart Component Ready for Recharts Integration
              </div>
            </div>
          </div>
          <div className="bg-canvas-surface border border-canvas-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-primary-main"/> District Heatmap
            </h2>
            <div className="h-72 bg-canvas-base border border-canvas-border rounded-xl flex items-center justify-center p-4">
              <div className="w-full h-full border-2 border-dashed border-primary-main/20 rounded-lg flex items-center justify-center text-text-muted text-center px-4">
                Map Component Ready for Leaflet Integration<br/>(Red Zones indicate clusters of high distress)
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
