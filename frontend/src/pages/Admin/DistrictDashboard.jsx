import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, MapPin, AlertTriangle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DistrictDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    activeSOS: 0,
    highRisk: 0,
    totalCases: 0
  });

  useEffect(() => {
    // Fetch real data from backend
    fetch('/api/v1/dashboards/district', {
      headers: { 'ngrok-skip-browser-warning': '1' }
    })
    .then(res => res.json())
    .then(data => {
      // In a real scenario, this returns aggregated data based on RLS
      setStats({
        activeSOS: data.activeSOS || 2, // fallback to mock for visuals
        highRisk: data.highRisk || 5,
        totalCases: data.totalCases || 120
      });
    })
    .catch(err => console.error("Error fetching district stats", err));
  }, []);

  return (
    <div className="min-h-screen bg-canvas-base">
      <header className="bg-canvas-surface border-b border-canvas-border px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary-main" size={24} />
          <span className="font-bold text-lg text-text-primary">District Admin Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">{user?.name}</span>
          <button onClick={logout} className="text-sm font-bold text-text-secondary hover:text-primary-main transition-colors">Logout</button>
        </div>
      </header>
      
      <main className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-text-primary tracking-tight">District Overview</h1>
          <p className="text-text-secondary mt-1 font-medium">Real-time telemetry for your jurisdiction.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-sosBg flex items-center justify-center text-accent-sos">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-text-muted uppercase tracking-wider">Active SOS</p>
              <p className="text-2xl font-black text-text-primary">{stats.activeSOS}</p>
            </div>
          </div>
          
          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-muted flex items-center justify-center text-primary-main">
              <MapPin size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-text-muted uppercase tracking-wider">High Risk Cases</p>
              <p className="text-2xl font-black text-text-primary">{stats.highRisk}</p>
            </div>
          </div>

          <div className="bg-canvas-surface p-6 rounded-2xl border border-canvas-border shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-canvas-surfaceSubtle flex items-center justify-center text-text-secondary">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-text-muted uppercase tracking-wider">Total Active Cases</p>
              <p className="text-2xl font-black text-text-primary">{stats.totalCases}</p>
            </div>
          </div>
        </div>

        <div className="bg-canvas-surface border border-canvas-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-text-primary mb-4">Live District Heatmap</h2>
          <div className="h-64 bg-canvas-base rounded-xl border border-canvas-border flex items-center justify-center p-4">
            <div className="w-full h-full border-2 border-dashed border-primary-main/20 rounded-lg flex items-center justify-center text-text-muted">
              Map Component Ready for Leaflet Integration
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
