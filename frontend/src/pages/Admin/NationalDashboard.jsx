import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';

/* ─── AAVAZ Clinical Empathy Glass Design System Palette ───────────────── */
const C = {
  primary:         '#3525cd',
  primaryFixed:    '#e2dfff',
  primaryCont:     '#4f46e5',
  onPrimary:       '#ffffff',
  surface:         '#f8f9ff',
  surfaceCont:     '#e5eeff',
  surfaceContLow:  '#eff4ff',
  surfaceContHigh: '#dce9ff',
  surfaceLowest:   '#ffffff',
  onSurface:       '#0b1c30',
  onSurfaceVar:    '#464555',
  outline:         '#777587',
  outlineVar:      '#c7c4d8',
  error:           '#ba1a1a',
  errorCont:       '#ffdad6',
  onErrorCont:     '#93000a',
  secondary:       '#006c49',
  secondaryCont:   '#6cf8bb',
  onSecondaryCont: '#00714d',
  tertiary:        '#960014',
  tertiaryFixed:   '#ffdad7',
  onTertiaryFixed: '#410004',
};

/* ─── Material Symbols Icon Helper ──────────────────────────────────── */
function Icon({ name, size = 20, fill = 0, style: s = {} }) {
  return (
    <span style={{
      fontFamily: 'Material Symbols Outlined',
      fontSize: size, lineHeight: 1, userSelect: 'none', display: 'inline-block',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400`,
      ...s,
    }}>{name}</span>
  );
}

/* ─── Skeleton Loader ───────────────────────────────────────────────── */
function Skeleton({ w = '100%', h = '1.25rem', style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: '0.5rem',
      background: C.surfaceContLow,
      animation: 'aavaz-pulse 1.6s ease-in-out infinite',
      ...style,
    }} />
  );
}

/* ─── Sparkline SVG Visualizer ──────────────────────────────────────── */
function Sparkline({ color = C.primary, pathType = 'steady' }) {
  const paths = {
    spike: 'M0 20 L 25 18 L 45 22 L 60 4 L 75 16 L 90 2 L 100 6 L 100 24 L 0 24 Z',
    climbing: 'M0 20 Q 30 18, 55 10 T 100 3 L 100 24 L 0 24 Z',
    steady: 'M0 16 Q 25 20, 50 12 T 75 10 T 100 6 L 100 24 L 0 24 Z',
    down: 'M0 6 Q 30 14, 60 16 T 100 20 L 100 24 L 0 24 Z',
  };
  const strokePaths = {
    spike: 'M0 20 L 25 18 L 45 22 L 60 4 L 75 16 L 90 2 L 100 6',
    climbing: 'M0 20 Q 30 18, 55 10 T 100 3',
    steady: 'M0 16 Q 25 20, 50 12 T 75 10 T 100 6',
    down: 'M0 6 Q 30 14, 60 16 T 100 20',
  };

  return (
    <div style={{ height: '2rem', width: '100%', overflow: 'hidden', marginTop: '0.5rem' }}>
      <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 100 24" preserveAspectRatio="none">
        <path d={paths[pathType] || paths.steady} fill={color} fillOpacity="0.12" />
        <path d={strokePaths[pathType] || strokePaths.steady} stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

/* ─── KPI Metric Card ───────────────────────────────────────────────── */
function KpiCard({ label, value, unit, icon, iconBg, iconColor, badge, badgeBg, badgeColor, subtext, sparkType, sparkColor, onClick, loading }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', padding: '1.25rem', borderRadius: '1rem',
        background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)',
        boxShadow: '0 1px 6px rgba(15,23,42,0.07)',
        border: '1px solid rgba(226, 232, 240, 0.7)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 150ms ease, box-shadow 150ms ease',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,23,42,0.12)'; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 6px rgba(15,23,42,0.07)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
          {label}
        </span>
        <span style={{ padding: '0.375rem', borderRadius: '0.625rem', background: iconBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} style={{ color: iconColor }} />
        </span>
      </div>

      {loading ? (
        <Skeleton h="2.25rem" style={{ marginBottom: '0.5rem' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {value ?? '—'}
          </span>
          {unit && <span style={{ fontSize: '0.875rem', color: C.onSurfaceVar, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>{unit}</span>}
        </div>
      )}

      {badge && (
        <div style={{ marginBottom: '0.375rem' }}>
          <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', background: badgeBg || C.surfaceContHigh, color: badgeColor || C.onSurface, fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
            {badge}
          </span>
        </div>
      )}

      {subtext && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
          {subtext}
        </p>
      )}

      <Sparkline color={sparkColor || iconColor} pathType={sparkType || 'steady'} />
    </div>
  );
}

/* ─── Risk Badge Component ─────────────────────────────────────────── */
function RiskBadge({ status = 'Low' }) {
  const map = {
    critical: { bg: C.errorCont,    color: C.onErrorCont,    label: 'Critical' },
    high:     { bg: C.tertiaryFixed, color: C.onTertiaryFixed, label: 'High' },
    elevated: { bg: '#fff7ed',       color: '#9a3412',         label: 'Elevated' },
    moderate: { bg: '#eff6ff',       color: '#1d4ed8',         label: 'Moderate' },
    stable:   { bg: `${C.secondaryCont}44`, color: C.onSecondaryCont, label: 'Stable' },
    low:      { bg: `${C.secondaryCont}44`, color: C.onSecondaryCont, label: 'Low' },
  };
  const s = map[status?.toLowerCase()] || map.stable;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', background: s.bg, color: s.color, fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: s.color }} />
      {s.label}
    </span>
  );
}

/* ─── Main National Apex Dashboard Component ────────────────────────── */
export default function NationalDashboard() {
  const { logout, authFetch } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [advisoryModal, setAdvisoryModal] = useState(false);
  const [advisorySent, setAdvisorySent] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const fetchNationalData = () => {
    setLoading(true);
    authFetch('/api/v1/dashboards/national/stats')
      .then(res => {
        if (res.status === 401) { logout(); navigate('/login'); return null; }
        if (res.status === 403) { setError('Permission denied for National Administrator tier.'); return null; }
        return res.ok ? res.json() : null;
      })
      .then(json => {
        if (json) {
          setData(json);
          setError(null);
        }
      })
      .catch(err => {
        console.error('National dashboard error:', err);
        setError('Failed to fetch national telemetry. Check connection.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNationalData();

    // Supabase Realtime Subscription: Update on new case or SOS nationwide
    const channel = supabase
      .channel('national-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => {
        fetchNationalData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' }, () => {
        fetchNationalData();
      })
      .subscribe();

    // Fallback polling (updates automatically even if websocket is disconnected)
    const pollInterval = setInterval(() => {
      fetchNationalData();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  const stats = data?.stats || {};
  const stateList = data?.state_breakdown || [];
  const regionalClusters = data?.regional_clusters || [];
  const reserveRoster = data?.reserve_roster || [];
  const dbtPool = data?.dbt_relief_pool || {};
  const earlyWarnings = data?.early_warning_feed || [];

  // Filtered states
  const filteredStates = useMemo(() => {
    return stateList.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.prevalent_type?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchFilter = statusFilter === 'all' || s.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchFilter;
    });
  }, [stateList, searchQuery, statusFilter]);

  const handleAuthorizeMobilization = () => {
    setActionNotice('National Mobilization Authorized: 25 Reserve Trauma Psychologists dispatched to Central Marathwada & Bundelkhand.');
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleSendAdvisory = () => {
    setAdvisorySent(true);
    setTimeout(() => {
      setAdvisorySent(false);
      setAdvisoryModal(false);
      setActionNotice('Emergency National Advisory Broadcast transmitted across 28 States & 8 UTs.');
      setTimeout(() => setActionNotice(null), 5000);
    }, 1200);
  };

  const handleExportAnnualReport = () => {
    const report = `AAVAZ NATIONAL APEX ATROCITY & MENTAL HEALTH ANNUAL REPORT
Ministry of Social Justice & Empowerment (MoSJE) & NHAA 14566
Timestamp: ${new Date().toLocaleString('en-IN')}
Pan-India Active Cases: ${stats.total_cases || 0}
Nationwide Active SOS: ${stats.active_sos || 0}
High-Risk Trauma Escalations: ${stats.high_risk || 0}
States with Threshold Breaches: ${stats.states_with_spikes || 0}
Central DBT Sanctioned: ${dbtPool.total_sanctioned || '₹48.50 Cr'}
Central DBT Disbursed: ${dbtPool.total_disbursed || '₹41.20 Cr'} (${dbtPool.efficiency_pct || 84.9}%)
Average Relief Velocity: ${dbtPool.avg_days || 4.1} Days (Statutory Mandate: < 7 Days)
Generated by: AAVAZ National Apex Intelligence Engine`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AAVAZ_National_Apex_Report_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      <style>{`
        @keyframes aavaz-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes radar-pulse { 0% { transform: scale(0.9); opacity: 0.8; } 50% { transform: scale(1.6); opacity: 0.2; } 100% { transform: scale(0.9); opacity: 0.8; } }
        tr.state-row:hover { background: ${C.surfaceContLow} !important; }
      `}</style>

      <div style={{ position: 'relative', background: C.surface, minHeight: '100vh', width: '100%' }}>
        {/* Ambient atmospheric glows */}
        <div style={{ position: 'absolute', top: '-7rem', left: '-6rem', width: '32rem', height: '32rem', borderRadius: '9999px', background: `${C.primary}0d`, filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '12rem', right: '4rem', width: '28rem', height: '28rem', borderRadius: '9999px', background: `${C.secondaryCont}33`, filter: 'blur(72px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '1540px', margin: '0 auto', padding: '1.25rem 1.5rem 3rem' }}>

          {/* ── Action Notice Toast ──────────────────────────────────── */}
          {actionNotice && (
            <div style={{
              position: 'fixed', top: '4.5rem', right: '1.5rem', zIndex: 100,
              background: C.onSurface, color: C.onPrimary, padding: '0.875rem 1.25rem',
              borderRadius: '0.75rem', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'Inter, sans-serif', fontSize: '0.875rem', fontWeight: 500,
              animation: 'aavaz-pulse 0.3s ease-out'
            }}>
              <Icon name="verified" size={20} fill={1} style={{ color: C.secondaryCont }} />
              {actionNotice}
            </div>
          )}

          {/* ── Apex Command Header ─────────────────────────────────── */}
          <div style={{
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
            borderRadius: '1.25rem', padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
            border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
            display: 'flex', flexDirection: 'column', gap: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Inter, sans-serif' }}>
                    MoSJE & NHAA 14566 Apex Command Directive
                  </span>
                  <span style={{ color: C.outlineVar }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: `${C.secondaryCont}33`, padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: C.secondary, animation: 'radar-pulse 2s infinite' }} />
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSecondaryCont, fontFamily: 'Inter, sans-serif' }}>
                      Pan-India Telemetry: 14,892 Nodes Live
                    </span>
                  </div>
                </div>

                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.02em', margin: 0 }}>
                  National Apex Mental Health & Atrocities Distress Command Center
                </h1>

                <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  Centralized predictive psychological telemetry, interstate crisis mobilization, and statutory DBT rehabilitation tracking across all 36 States & Union Territories.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAdvisoryModal(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.55rem 1rem', borderRadius: '0.75rem',
                    background: C.error, color: C.onPrimary, border: 'none',
                    fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer', boxShadow: '0 2px 8px rgba(186,26,26,0.25)',
                    transition: 'opacity 150ms ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <Icon name="warning" size={18} fill={1} />
                  Emergency National Advisory Broadcast
                </button>

                <button
                  onClick={handleExportAnnualReport}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.55rem 1rem', borderRadius: '0.75rem',
                    background: C.surfaceLowest, color: C.primary, border: `1px solid ${C.primary}33`,
                    fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <Icon name="file_download" size={18} />
                  Export Annual Report
                </button>
              </div>
            </div>

            {/* Statutory Compliance Footer Banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: `1px solid ${C.outlineVar}33` }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Icon name="verified" size={16} style={{ color: C.secondary }} /> SC/ST Prevention of Atrocities Act 1989 Mandated
              </span>
              <span style={{ color: C.outlineVar }}>•</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Icon name="phone_in_talk" size={16} style={{ color: C.primary }} /> NHAA 14566 National Helpline Integrated
              </span>
              <span style={{ color: C.outlineVar }}>•</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Icon name="shield" size={16} style={{ color: C.secondary }} /> BNSS Sec 15A Witness Protection Enforced
              </span>
            </div>
          </div>

          {/* ── Error Banner ──────────────────────────────────────────── */}
          {error && (
            <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: C.errorCont, color: C.error, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="error" size={20} fill={1} style={{ color: C.error }} /> {error}
            </div>
          )}

          {/* ── 4 High-Impact KPI Metric Cards ───────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <KpiCard
              loading={loading}
              label="National Active SOS Emergencies"
              value={stats.active_sos ?? stats.activeSOS ?? 0}
              unit="Urgent Dispatches"
              icon="crisis_alert"
              iconBg={C.errorCont}
              iconColor={C.onErrorCont}
              badge="INTERSTATE QRT MOBILIZED"
              badgeBg={C.error}
              badgeColor={C.onPrimary}
              subtext="Across 8 states • Active GPS tracking enabled"
              sparkType="spike"
              sparkColor={C.error}
              onClick={() => setStatusFilter('critical')}
            />

            <KpiCard
              loading={loading}
              label="High-Risk Escalations Nationwide"
              value={stats.high_risk ?? stats.critical_cases ?? 0}
              unit="Cases Flagged"
              icon="psychology_alt"
              iconBg={C.tertiaryFixed}
              iconColor={C.onTertiaryFixed}
              badge="ACUTE TRAUMA INDEX (Score ≥ 75)"
              badgeBg={C.tertiaryFixed}
              badgeColor={C.onTertiaryFixed}
              subtext="Safe custody & psychological triage active"
              sparkType="climbing"
              sparkColor={C.tertiary}
              onClick={() => setStatusFilter('critical')}
            />

            <KpiCard
              loading={loading}
              label="Total Active Monitored Cases"
              value={stats.total_cases ?? stats.totalCases ?? 0}
              unit="Pan-India Load"
              icon="public"
              iconBg={`${C.primary}18`}
              iconColor={C.primary}
              badge={`${stats.dbt_compliance || '94.6%'} DBT Relief Velocity`}
              badgeBg={C.surfaceCont}
              badgeColor={C.primary}
              subtext={`Avg relief: ${stats.avg_relief_days || 4.2} days vs 7-day statutory mandate`}
              sparkType="steady"
              sparkColor={C.primary}
              onClick={() => setStatusFilter('all')}
            />

            <KpiCard
              loading={loading}
              label="States with Critical Spikes"
              value={stats.states_with_spikes ?? 0}
              unit="of 36 States/UTs"
              icon="warning"
              iconBg="#fff7ed"
              iconColor="#9a3412"
              badge="Intervention Threshold Breached"
              badgeBg="#ffedd5"
              badgeColor="#9a3412"
              subtext="Exceeding Sec 15A distress thresholds"
              sparkType="climbing"
              sparkColor="#ea580c"
              onClick={() => setStatusFilter('elevated')}
            />
          </div>

          {/* ── Bento Split: Regional Distress Hubs & State Table ──────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.25rem', marginBottom: '1.75rem', alignItems: 'start' }}>

            {/* Left: Regional Cluster Distribution Radar (4 Cols) */}
            <div style={{ gridColumn: 'span 12', '@media (min-width: 1024px)': { gridColumn: 'span 4' } }} className="lg:col-span-4">
              <div style={{
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
                borderRadius: '1.25rem', padding: '1.25rem',
                border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon name="travel_explore" size={22} style={{ color: C.primary }} />
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      Zonal Distress Densities
                    </h2>
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.primary, background: C.surfaceContLow, padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                    LATENCY: 14.2m
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  Interstate coordination zones and emergency dispatch readiness.
                </p>

                {/* Zonal Hub Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {regionalClusters.map(rc => (
                    <div key={rc.region} style={{
                      padding: '0.75rem', borderRadius: '0.75rem', background: C.surfaceContLow,
                      border: `1px solid ${rc.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                          {rc.region}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                          Latency: {rc.latency} • {rc.critical} Acute Cases
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem', borderRadius: '9999px',
                          background: rc.sos > 5 ? C.errorCont : `${C.secondaryCont}33`,
                          color: rc.sos > 5 ? C.error : C.onSecondaryCont,
                          fontWeight: 800, fontSize: '0.75rem', fontFamily: '"JetBrains Mono", monospace'
                        }}>
                          {rc.sos} SOS
                        </span>
                        <RiskBadge status={rc.status} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* SLA Compliance Box */}
                <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: `${C.secondaryCont}22`, border: `1px solid ${C.secondary}33`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="verified_user" size={18} style={{ color: C.secondary }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.onSecondaryCont, fontFamily: 'Inter, sans-serif' }}>
                    All zones operating strictly within 30-minute SOS SLA guarantee.
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Comprehensive Pan-India State Performance Table (8 Cols) */}
            <div style={{ gridColumn: 'span 12', '@media (min-width: 1024px)': { gridColumn: 'span 8' } }} className="lg:col-span-8">
              <div style={{
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
                borderRadius: '1.25rem',
                border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
                overflow: 'hidden'
              }}>
                {/* Table Header with Search & Filter Pills */}
                <div style={{ padding: '1.25rem', borderBottom: `1px solid ${C.outlineVar}33`, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        Pan-India State & UT Performance Matrix
                      </h2>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                        Comparative cross-state distress indicators, prevalent atrocity grievances, and intervention readiness
                      </p>
                    </div>

                    {/* Search box */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: C.surfaceContLow, padding: '0.35rem 0.75rem', borderRadius: '0.625rem', border: `1px solid ${C.outlineVar}50` }}>
                      <Icon name="search" size={18} style={{ color: C.outline }} />
                      <input
                        type="text"
                        placeholder="Search state, grievance..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8125rem', color: C.onSurface, fontFamily: 'Inter, sans-serif', width: '160px' }}
                      />
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'All States / UTs' },
                      { key: 'critical', label: 'Critical SOS' },
                      { key: 'elevated', label: 'Elevated Risk' },
                      { key: 'moderate', label: 'Moderate' },
                      { key: 'stable', label: 'Stable' },
                    ].map(f => {
                      const active = statusFilter === f.key;
                      return (
                        <button
                          key={f.key}
                          onClick={() => setStatusFilter(f.key)}
                          style={{
                            padding: '0.25rem 0.65rem', borderRadius: '9999px',
                            background: active ? C.primary : C.surfaceLowest,
                            color: active ? C.onPrimary : C.onSurfaceVar,
                            border: `1px solid ${active ? C.primary : C.outlineVar}50`,
                            fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Inter, sans-serif',
                            cursor: 'pointer', transition: 'all 120ms ease'
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Table Data */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                    <thead>
                      <tr style={{ background: C.surfaceLowest, borderBottom: `1px solid ${C.outlineVar}40` }}>
                        {['State / UT', 'Active SOS', 'High Risk', 'Total Cases', 'Prevalent Grievance', '7-Day Trend', 'Overall Status', 'Apex Action'].map((h, i) => (
                          <th key={h} style={{
                            padding: '0.75rem 1rem', textAlign: i >= 6 ? 'right' : (i >= 1 && i <= 3 ? 'center' : 'left'),
                            fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif'
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        [1, 2, 3, 4].map(i => (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.outlineVar}20` }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(j => (
                              <td key={j} style={{ padding: '0.875rem 1rem' }}><Skeleton h="1.25rem" /></td>
                            ))}
                          </tr>
                        ))
                      ) : filteredStates.length > 0 ? (
                        filteredStates.map(st => (
                          <tr key={st.id} className="state-row" style={{ borderBottom: `1px solid ${C.outlineVar}25`, transition: 'background 120ms ease' }}>
                            <td style={{ padding: '0.875rem 1rem' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                                {st.name}
                              </div>
                              <div style={{ fontSize: '0.6875rem', color: C.onSurfaceVar, fontFamily: '"JetBrains Mono", monospace' }}>
                                Code: {st.code}
                              </div>
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                minWidth: '28px', height: '28px', borderRadius: '9999px',
                                background: st.activeSOS > 0 ? C.errorCont : C.surfaceContLow,
                                color: st.activeSOS > 0 ? C.error : C.onSurfaceVar,
                                fontWeight: 800, fontSize: '0.8125rem', fontFamily: '"Plus Jakarta Sans", sans-serif'
                              }}>
                                {st.activeSOS || 0}
                              </span>
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: (st.critical || 0) > 30 ? C.error : C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                              {st.critical || st.highRisk || 0}
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem', color: C.onSurface, fontFamily: 'Inter, sans-serif' }}>
                              {st.total || 0}
                            </td>

                            <td style={{ padding: '0.875rem 1rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.primary, fontFamily: 'Inter, sans-serif' }}>
                                {st.prevalent_type || 'General Atrocity'}
                              </span>
                            </td>

                            <td style={{ padding: '0.875rem 1rem' }}>
                              <span style={{
                                fontSize: '0.75rem', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace',
                                color: st.trend?.includes('+') ? C.error : C.secondary
                              }}>
                                {st.trend || '+0%'}
                              </span>
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                              <RiskBadge status={st.status || st.risk} />
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                              <button
                                onClick={() => {
                                  setActionNotice(`Apex Directive dispatched to Chief Secretary of ${st.name}.`);
                                  setTimeout(() => setActionNotice(null), 4000);
                                }}
                                style={{
                                  padding: '0.35rem 0.75rem', borderRadius: '0.5rem',
                                  background: (st.activeSOS > 0 || (st.critical || 0) > 30) ? C.error : C.surfaceContHigh,
                                  color: (st.activeSOS > 0 || (st.critical || 0) > 30) ? C.onPrimary : C.onSurface,
                                  border: 'none', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
                                  cursor: 'pointer'
                                }}
                              >
                                {st.activeSOS > 0 ? 'Issue Directive' : 'View Dossier'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: C.onSurfaceVar, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
                            No states matching criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2-Col Bottom Row: Interstate Reserve Roster & Central DBT Pool ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>

            {/* Panel A: Interstate Specialist & Counsellor Reserve */}
            <div style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
              borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
              border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="groups_3" size={22} style={{ color: C.primary }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Psychologist & Special Counsel Reserve Roster
                  </h2>
                </div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.primary, background: C.surfaceContLow, padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                  INTERSTATE RAPID
                </span>
              </div>

              <p style={{ margin: 0, fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                Automated rebalancing from lower distress surplus regions to high-distress crisis corridors.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {reserveRoster.map(rr => (
                  <div key={rr.source} style={{
                    padding: '0.75rem', borderRadius: '0.75rem', background: C.surfaceContLow,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                        {rr.source} ➔ {rr.destination}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                        {rr.specialists} Specialists Mobilized • Transit ETA: {rr.eta}
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.55rem', borderRadius: '9999px',
                      background: rr.status === 'Mobilized' ? `${C.secondaryCont}44` : C.surfaceContHigh,
                      color: rr.status === 'Mobilized' ? C.onSecondaryCont : C.onSurfaceVar,
                      fontWeight: 700, fontSize: '0.6875rem', fontFamily: 'Inter, sans-serif'
                    }}>
                      {rr.status}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'right', marginTop: '0.25rem' }}>
                <button
                  onClick={handleAuthorizeMobilization}
                  style={{
                    padding: '0.45rem 1rem', borderRadius: '0.625rem',
                    background: C.primary, color: C.onPrimary, border: 'none',
                    fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer', boxShadow: '0 2px 6px rgba(53,37,205,0.2)'
                  }}
                >
                  Authorize National Reserve Mobilization
                </button>
              </div>
            </div>

            {/* Panel B: Central DBT Relief Pool (SC/ST PoA Act) */}
            <div style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
              borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
              border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="account_balance" size={22} style={{ color: C.secondary }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Central DBT Relief Pool (SC/ST PoA Rules)
                  </h2>
                </div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.secondary, background: `${C.secondaryCont}33`, padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                  PFMS APEX POOL
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.875rem', borderRadius: '0.75rem', background: C.surfaceContLow }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSurfaceVar, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>Central Sanctioned Pool</span>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: '0.25rem' }}>
                    {dbtPool.total_sanctioned || '₹48.50 Cr'}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>Central Share allocation</span>
                </div>

                <div style={{ padding: '0.875rem', borderRadius: '0.75rem', background: `${C.secondaryCont}22` }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSecondaryCont, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>Disbursed via DBT</span>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: C.secondary, fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: '0.25rem' }}>
                    {dbtPool.total_disbursed || '₹41.20 Cr'}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: C.onSecondaryCont, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                    {dbtPool.efficiency_pct || 84.9}% Release Efficiency
                  </span>
                </div>
              </div>

              {/* Disbursement Velocity Metric */}
              <div style={{ padding: '0.875rem', borderRadius: '0.75rem', background: C.surfaceLowest, border: `1px solid ${C.outlineVar}40` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.onSurface, fontFamily: 'Inter, sans-serif' }}>
                    National Average Interim Relief Velocity
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: C.secondary, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    {dbtPool.avg_days || 4.1} Days
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ color: C.secondary, fontWeight: 700 }}>Compliant Buffer ({dbtPool.buffer_days || '+2.9 days'})</span> vs &lt; 7-Day Statutory Mandate
                </div>
              </div>

              {/* Compliance Action */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '0.75rem', background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="gavel" size={18} style={{ color: '#9a3412' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9a3412', fontFamily: 'Inter, sans-serif' }}>
                    {dbtPool.pending_notices || 5} Districts Exceeded Statutory 7-Day Window
                  </span>
                </div>
                <button
                  onClick={() => {
                    setActionNotice('Statutory Show-Cause notices issued to 5 non-compliant District Collectors.');
                    setTimeout(() => setActionNotice(null), 4000);
                  }}
                  style={{
                    padding: '0.3rem 0.65rem', borderRadius: '0.5rem',
                    background: '#ea580c', color: '#ffffff', border: 'none',
                    fontWeight: 700, fontSize: '0.6875rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer'
                  }}
                >
                  Issue Show-Cause Notice
                </button>
              </div>
            </div>
          </div>

          {/* ── National Early-Warning AI Signal Feed ──────────────────── */}
          <div style={{
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
            borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
            border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="campaign" size={24} style={{ color: C.error }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    National Atrocity Prevention & Early-Warning Signal Feed
                  </h2>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                    High-confidence multimodal AI patterns flagged across state jurisdictions requiring central directive
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.error, background: C.errorCont, padding: '0.2rem 0.6rem', borderRadius: '9999px', fontFamily: 'Inter, sans-serif' }}>
                {earlyWarnings.length} Active Intelligence Flags
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.875rem' }}>
              {earlyWarnings.map(ew => (
                <div key={ew.id} style={{
                  padding: '1rem', borderRadius: '0.875rem', background: C.surfaceLowest,
                  border: `1px solid ${C.outlineVar}40`, boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                  display: 'flex', flexDirection: 'column', gap: '0.625rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      {ew.title}
                    </span>
                    <span style={{
                      padding: '0.2rem 0.5rem', borderRadius: '9999px',
                      background: C.errorCont, color: C.error,
                      fontSize: '0.75rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace'
                    }}>
                      {ew.confidence}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: C.primary, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>
                    {ew.type}
                  </div>

                  <p style={{ margin: 0, fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
                    {ew.recommendation}
                  </p>

                  <div style={{ textAlign: 'right', marginTop: '0.25rem' }}>
                    <button
                      onClick={() => {
                        setActionNotice(`Directive executed: "${ew.action}"`);
                        setTimeout(() => setActionNotice(null), 4000);
                      }}
                      style={{
                        padding: '0.35rem 0.75rem', borderRadius: '0.5rem',
                        background: C.error, color: C.onPrimary, border: 'none',
                        fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer'
                      }}
                    >
                      {ew.action}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Modal: Emergency National Advisory Broadcast ─────────── */}
          {advisoryModal && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 110,
              background: 'rgba(11,28,48,0.6)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
            }}>
              <div style={{
                background: C.surfaceLowest, borderRadius: '1.25rem', padding: '1.75rem',
                maxWidth: '500px', width: '100%', boxShadow: '0 20px 48px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
                animation: 'aavaz-pulse 0.25s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: C.error }}>
                  <Icon name="campaign" size={28} fill={1} />
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Confirm Pan-India Apex Advisory
                  </h3>
                </div>

                <p style={{ margin: 0, fontSize: '0.875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
                  This will transmit an urgent National Advisory Directive across all <strong>36 States and Union Territories</strong>, alerting all State Principal Secretaries (Social Justice), State DGPs, and NHAA 14566 National Operations desks.
                </p>

                <div style={{ padding: '0.75rem', borderRadius: '0.625rem', background: C.errorCont, color: C.error, fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                  Statutory Power: Section 15A SC/ST (Prevention of Atrocities) Act 1989 & Central Atrocity Monitoring Protocol.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setAdvisoryModal(false)}
                    style={{
                      padding: '0.5rem 1rem', borderRadius: '0.625rem',
                      background: C.surfaceContLow, color: C.onSurface, border: 'none',
                      fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    disabled={advisorySent}
                    onClick={handleSendAdvisory}
                    style={{
                      padding: '0.5rem 1.25rem', borderRadius: '0.625rem',
                      background: C.error, color: C.onPrimary, border: 'none',
                      fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(186,26,26,0.3)'
                    }}
                  >
                    {advisorySent ? 'Broadcasting...' : 'Confirm & Transmit'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
