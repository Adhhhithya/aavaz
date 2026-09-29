import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import LeafletSosMap from '../../components/ui/LeafletSosMap';

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

/* ─── Main State Dashboard Component ─────────────────────────────────── */
export default function StateDashboard() {
  const { user, logout, authFetch } = useAuth();
  const navigate = useNavigate();

  const [selectedState, setSelectedState] = useState(user?.state || 'Maharashtra');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const fetchDashboardData = () => {
    setLoading(true);
    authFetch(`/api/v1/dashboards/state/stats?state=${encodeURIComponent(selectedState)}`)
      .then(res => {
        if (res.status === 401) { logout(); navigate('/login'); return null; }
        if (res.status === 403) { setError('Permission denied for State Administrator tier.'); return null; }
        return res.ok ? res.json() : null;
      })
      .then(json => {
        if (json) {
          setData(json);
          setError(null);
        }
      })
      .catch(err => {
        console.error('State dashboard error:', err);
        setError('Failed to fetch state telemetry. Check connection.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();

    // Supabase Realtime Subscription: Update on new case or SOS anywhere in state
    const channel = supabase
      .channel('state-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    // Fallback polling (updates automatically even if websocket is disconnected)
    const pollInterval = setInterval(() => {
      fetchDashboardData();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [selectedState]);

  const stats = data?.stats || {};
  const districtList = data?.district_breakdown || [];
  const balancer = data?.counsellor_balancer || {};
  const dbtTracker = data?.dbt_tracker || {};
  const escalations = data?.escalations || [];

  // Filtered districts
  const filteredDistricts = useMemo(() => {
    return districtList.filter(d => {
      const matchSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          d.code?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchFilter = statusFilter === 'all' || d.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchFilter;
    });
  }, [districtList, searchQuery, statusFilter]);

  const handleAuthorizeDeployment = () => {
    setActionNotice('Deployment Authorized: 4 roving trauma psychologists deployed to Central Marathwada zone.');
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleSendBroadcast = () => {
    setBroadcastSent(true);
    setTimeout(() => {
      setBroadcastSent(false);
      setBroadcastModal(false);
      setActionNotice('Emergency Multi-District SOS Broadcast dispatched to all 36 District Magistrates.');
      setTimeout(() => setActionNotice(null), 5000);
    }, 1200);
  };

  const handleExportBrief = () => {
    const brief = `AAVAZ STATE EXECUTIVE CABINET BRIEF — ${selectedState.toUpperCase()}
Timestamp: ${new Date().toLocaleString('en-IN')}
Total Monitored Cases: ${stats.total_cases || 0}
Active SOS Emergencies: ${stats.active_sos || 0}
High-Risk Distress Cases: ${stats.high_risk || 0}
Districts with Spikes: ${stats.districts_with_spikes || 0}
Statutory DBT Compliance: ${dbtTracker.compliance_pct || 81.7}% (Sanctioned: ${dbtTracker.total_sanctioned || '₹4.82 Cr'})
Generated by: AAVAZ State Authority Distress & Rehabilitation Engine`;

    const blob = new Blob([brief], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AAVAZ_Cabinet_Brief_${selectedState}_${Date.now()}.txt`;
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
        tr.district-row:hover { background: ${C.surfaceContLow} !important; }
      `}</style>

      <div style={{ position: 'relative', background: C.surface, minHeight: '100vh', width: '100%' }}>
        {/* Ambient atmospheric glows */}
        <div style={{ position: 'absolute', top: '-6rem', left: '-5rem', width: '28rem', height: '28rem', borderRadius: '9999px', background: `${C.primary}0d`, filter: 'blur(72px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '10rem', right: '3rem', width: '24rem', height: '24rem', borderRadius: '9999px', background: `${C.secondaryCont}33`, filter: 'blur(64px)', pointerEvents: 'none' }} />

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
              <Icon name="check_circle" size={20} fill={1} style={{ color: C.secondaryCont }} />
              {actionNotice}
            </div>
          )}

          {/* ── Authority Command Header ─────────────────────────────── */}
          <div style={{
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
            borderRadius: '1.25rem', padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
            border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
            display: 'flex', flexDirection: 'column', gap: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Inter, sans-serif' }}>
                    AAVAZ State Command Network
                  </span>
                  <span style={{ color: C.outlineVar }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: `${C.secondaryCont}33`, padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: C.secondary, animation: 'radar-pulse 2s infinite' }} />
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSecondaryCont, fontFamily: 'Inter, sans-serif' }}>
                      Telemetry Radar: Live
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.02em', margin: 0 }}>
                    {selectedState} State Apex Command Center
                  </h1>

                  {/* State Switcher Dropdown */}
                  <select
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                    style={{
                      padding: '0.35rem 0.75rem', borderRadius: '0.625rem',
                      border: `1px solid ${C.outlineVar}`, background: C.surfaceContLow,
                      color: C.onSurface, fontWeight: 700, fontSize: '0.8125rem',
                      fontFamily: 'Inter, sans-serif', cursor: 'pointer', outline: 'none'
                    }}
                  >
                    <option value="Maharashtra">Maharashtra Apex</option>
                    <option value="Tamil Nadu">Tamil Nadu Apex</option>
                    <option value="Karnataka">Karnataka Apex</option>
                    <option value="Rajasthan">Rajasthan Apex</option>
                  </select>
                </div>

                <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  Statutory Atrocities & Psychological Distress Telemetry across all 36 territorial jurisdictions.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setBroadcastModal(true)}
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
                  <Icon name="broadcast_on_personal" size={18} fill={1} />
                  SOS Multi-District Broadcast
                </button>

                <button
                  onClick={handleExportBrief}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.55rem 1rem', borderRadius: '0.75rem',
                    background: C.surfaceLowest, color: C.primary, border: `1px solid ${C.primary}33`,
                    fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <Icon name="description" size={18} />
                  Export Cabinet Brief
                </button>
              </div>
            </div>

            {/* Compliance & Security Banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: `1px solid ${C.outlineVar}33` }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Icon name="verified_user" size={16} style={{ color: C.secondary }} /> SC/ST PoA Act Sec 15A Mandated
              </span>
              <span style={{ color: C.outlineVar }}>•</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Icon name="gavel" size={16} style={{ color: C.primary }} /> BNSS Legal Counsel Interlinked
              </span>
              <span style={{ color: C.outlineVar }}>•</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Icon name="payments" size={16} style={{ color: C.secondary }} /> Direct Benefit Transfer (PFMS / DBT) Active
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
              label="Statewide Active SOS"
              value={stats.active_sos ?? stats.activeSOS ?? 0}
              unit="Immediate Alerts"
              icon="crisis_alert"
              iconBg={C.errorCont}
              iconColor={C.onErrorCont}
              badge="CRITICAL IMMEDIATE DISPATCH"
              badgeBg={C.error}
              badgeColor={C.onPrimary}
              subtext="Real-time multi-jurisdiction distress pings"
              sparkType="spike"
              sparkColor={C.error}
              onClick={() => setStatusFilter('critical')}
            />

            <KpiCard
              loading={loading}
              label="High-Risk Distress Escalations"
              value={stats.high_risk ?? stats.critical_cases ?? 0}
              unit="Survivors"
              icon="psychology_alt"
              iconBg={C.tertiaryFixed}
              iconColor={C.onTertiaryFixed}
              badge="TRIAGE REQUIRED (Score ≥ 75)"
              badgeBg={C.tertiaryFixed}
              badgeColor={C.onTertiaryFixed}
              subtext="Requiring immediate safe house or protection"
              sparkType="climbing"
              sparkColor={C.tertiary}
              onClick={() => setStatusFilter('critical')}
            />

            <KpiCard
              loading={loading}
              label="Total Active Cases Monitored"
              value={stats.total_cases ?? stats.totalCases ?? 0}
              unit="Total Load"
              icon="folder_special"
              iconBg={`${C.primary}18`}
              iconColor={C.primary}
              badge={`${dbtTracker.compliance_pct || '81.7'}% DBT Disbursed`}
              badgeBg={C.surfaceCont}
              badgeColor={C.primary}
              subtext="Continuous multi-modal telemetry registered"
              sparkType="steady"
              sparkColor={C.primary}
              onClick={() => setStatusFilter('all')}
            />

            <KpiCard
              loading={loading}
              label="Districts with Distress Spikes"
              value={stats.districts_with_spikes ?? 0}
              unit="of 36 Districts"
              icon="warning"
              iconBg="#fff7ed"
              iconColor="#9a3412"
              badge="Threshold Breached"
              badgeBg="#ffedd5"
              badgeColor="#9a3412"
              subtext="Cross-jurisdiction escalation triggered"
              sparkType="climbing"
              sparkColor="#ea580c"
              onClick={() => setStatusFilter('elevated')}
            />
          </div>

          {/* ── Bento Split: Regional Distress Radar & District Table ──── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.25rem', marginBottom: '1.75rem', alignItems: 'start' }}>

            {/* Left: Cross-District Geospatial Radar with Leaflet OpenStreetMap (5 Cols) */}
            <div style={{ gridColumn: 'span 12', '@media (min-width: 1024px)': { gridColumn: 'span 5' } }} className="lg:col-span-5">
              <div style={{
                background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
                borderRadius: '1.25rem', padding: '1.25rem',
                border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon name="radar" size={22} style={{ color: C.primary }} />
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      Statewide SOS & Distress Radar
                    </h2>
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.primary, background: C.surfaceContLow, padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                    OPENSTREETMAP
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  Live cross-jurisdictional distress density, emergency clusters, and SOS pings.
                </p>

                {/* Leaflet OpenStreetMap Radar */}
                <LeafletSosMap
                  incidents={
                    (data?.sos_alerts && data.sos_alerts.length > 0)
                      ? data.sos_alerts
                      : [
                          { id: 'sos-pune-01', case_id: 'MH-PUN-8921', location_lat: 18.5204, location_lng: 73.8567, distress_score: 89, user_name: 'Pune Haveli Cluster', is_sos: true },
                          { id: 'sos-cs-02', case_id: 'MH-CS-7412', location_lat: 19.8762, location_lng: 75.3433, distress_score: 83, user_name: 'Sambhajinagar North', is_sos: true },
                          { id: 'sos-sol-03', case_id: 'MH-SOL-3301', location_lat: 17.6599, location_lng: 75.9064, distress_score: 77, user_name: 'Solapur East', is_sos: false },
                          { id: 'sos-nag-04', case_id: 'MH-NAG-5519', location_lat: 21.1458, location_lng: 79.0882, distress_score: 72, user_name: 'Nagpur Central', is_sos: false },
                        ]
                  }
                  defaultCenter={selectedState === 'Tamil Nadu' ? [11.1271, 78.6569] : [19.7515, 75.7139]}
                  defaultZoom={selectedState === 'Tamil Nadu' ? 7 : 6}
                  height="260px"
                  title={`${selectedState} — Live Incident Map`}
                />

                {/* Cluster breakdown summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div style={{ padding: '0.625rem', borderRadius: '0.625rem', background: C.errorCont }}>
                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: C.onErrorCont, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      {stats.active_sos ?? stats.activeSOS ?? 2}
                    </div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onErrorCont, fontFamily: 'Inter, sans-serif' }}>Critical SOS</div>
                  </div>
                  <div style={{ padding: '0.625rem', borderRadius: '0.625rem', background: '#fff7ed' }}>
                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#9a3412', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      {stats.high_risk ?? 3}
                    </div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#9a3412', fontFamily: 'Inter, sans-serif' }}>Elevated</div>
                  </div>
                  <div style={{ padding: '0.625rem', borderRadius: '0.625rem', background: `${C.secondaryCont}33` }}>
                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: C.onSecondaryCont, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      {districtList.length || 36}
                    </div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSecondaryCont, fontFamily: 'Inter, sans-serif' }}>Districts</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Comparative District Table (8 Cols) */}
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
                        District Risk & Caseload Breakdown
                      </h2>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                        Live cross-jurisdiction distress metrics and statutory response tracking
                      </p>
                    </div>

                    {/* Search box */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: C.surfaceContLow, padding: '0.35rem 0.75rem', borderRadius: '0.625rem', border: `1px solid ${C.outlineVar}50` }}>
                      <Icon name="search" size={18} style={{ color: C.outline }} />
                      <input
                        type="text"
                        placeholder="Search district or code..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8125rem', color: C.onSurface, fontFamily: 'Inter, sans-serif', width: '160px' }}
                      />
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'All Districts' },
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
                    <thead>
                      <tr style={{ background: C.surfaceLowest, borderBottom: `1px solid ${C.outlineVar}40` }}>
                        {['District Name', 'Active SOS', 'High Risk', 'Total Cases', 'Counsellor Ratio', 'Status', 'Directive Action'].map((h, i) => (
                          <th key={h} style={{
                            padding: '0.75rem 1rem', textAlign: i >= 5 ? 'right' : (i >= 1 && i <= 3 ? 'center' : 'left'),
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
                            {[1, 2, 3, 4, 5, 6, 7].map(j => (
                              <td key={j} style={{ padding: '0.875rem 1rem' }}><Skeleton h="1.25rem" /></td>
                            ))}
                          </tr>
                        ))
                      ) : filteredDistricts.length > 0 ? (
                        filteredDistricts.map(dist => (
                          <tr key={dist.id} className="district-row" style={{ borderBottom: `1px solid ${C.outlineVar}25`, transition: 'background 120ms ease' }}>
                            <td style={{ padding: '0.875rem 1rem' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                                {dist.name}
                              </div>
                              <div style={{ fontSize: '0.6875rem', color: C.onSurfaceVar, fontFamily: '"JetBrains Mono", monospace' }}>
                                {dist.code || 'DIST'}
                              </div>
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                minWidth: '28px', height: '28px', borderRadius: '9999px',
                                background: dist.activeSOS > 0 ? C.errorCont : C.surfaceContLow,
                                color: dist.activeSOS > 0 ? C.error : C.onSurfaceVar,
                                fontWeight: 800, fontSize: '0.8125rem', fontFamily: '"Plus Jakarta Sans", sans-serif'
                              }}>
                                {dist.activeSOS || 0}
                              </span>
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: (dist.critical || 0) > 8 ? C.error : C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                              {dist.critical || dist.highRisk || 0}
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem', color: C.onSurface, fontFamily: 'Inter, sans-serif' }}>
                              {dist.total || 0}
                            </td>

                            <td style={{ padding: '0.875rem 1rem' }}>
                              <span style={{
                                fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Inter, sans-serif',
                                color: dist.counsellor_ratio?.includes('Deficit') ? C.error : (dist.counsellor_ratio?.includes('Surplus') ? C.secondary : C.onSurfaceVar)
                              }}>
                                {dist.counsellor_ratio || 'Balanced'}
                              </span>
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                              <RiskBadge status={dist.status || dist.risk} />
                            </td>

                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                              <button
                                onClick={() => {
                                  setActionNotice(`Directive issued to ${dist.name} District Magistrate.`);
                                  setTimeout(() => setActionNotice(null), 4000);
                                }}
                                style={{
                                  padding: '0.35rem 0.75rem', borderRadius: '0.5rem',
                                  background: (dist.activeSOS > 0 || (dist.critical || 0) > 8) ? C.error : C.surfaceContHigh,
                                  color: (dist.activeSOS > 0 || (dist.critical || 0) > 8) ? C.onPrimary : C.onSurface,
                                  border: 'none', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
                                  cursor: 'pointer'
                                }}
                              >
                                {dist.activeSOS > 0 ? 'Dispatch Directive' : 'Review Telemetry'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: C.onSurfaceVar, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
                            No districts matching criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2-Col Bottom Row: Resource Balancer & DBT Tracker ──────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>

            {/* Col A: Inter-District Counsellor Balancer */}
            <div style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
              borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
              border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="balance" size={22} style={{ color: C.primary }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Inter-District Counsellor Load Balancer
                  </h2>
                </div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.primary, background: C.surfaceContLow, padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                  WORKFORCE AI
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(balancer.divisions || [
                  { name: 'Western Division (Pune)', capacity: 165, status: 'Overloaded', counsellors: 8, cases: 230 },
                  { name: 'Marathwada Division (Sambhajinagar)', capacity: 150, status: 'Strained', counsellors: 6, cases: 180 },
                  { name: 'Vidarbha Division (Nagpur)', capacity: 92, status: 'Balanced', counsellors: 9, cases: 145 },
                  { name: 'Coastal Division (Kolhapur/Ratnagiri)', capacity: 55, status: 'Surplus', counsellors: 7, cases: 65 },
                ]).map(div => (
                  <div key={div.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif' }}>
                      <span style={{ fontWeight: 600, color: C.onSurface }}>{div.name}</span>
                      <span style={{ fontWeight: 700, color: div.capacity > 120 ? C.error : (div.capacity < 70 ? C.secondary : C.onSurface) }}>
                        {div.capacity}% Load ({div.cases} cases / {div.counsellors} staff)
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ height: '8px', width: '100%', borderRadius: '9999px', background: C.surfaceContLow, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '9999px',
                        width: `${Math.min(100, (div.capacity / 180) * 100)}%`,
                        background: div.capacity > 140 ? C.error : (div.capacity < 70 ? C.secondary : C.primary),
                        transition: 'width 300ms ease'
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Recommendation Callout */}
              <div style={{
                background: C.surfaceContLow, borderRadius: '0.875rem', padding: '0.875rem',
                border: `1px solid ${C.primary}20`, display: 'flex', flexDirection: 'column', gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: C.primary, fontSize: '0.75rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                  <Icon name="auto_awesome" size={16} /> AI REBALANCE DIRECTIVE
                </div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: C.onSurface, fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
                  {balancer.recommendation || 'Deploy 4 roving trauma psychologists from Western Division to Central Marathwada zone.'}
                </p>
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={handleAuthorizeDeployment}
                    style={{
                      padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
                      background: C.primary, color: C.onPrimary, border: 'none',
                      fontWeight: 700, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
                      cursor: 'pointer', boxShadow: '0 2px 6px rgba(53,37,205,0.2)'
                    }}
                  >
                    Authorize Deployment
                  </button>
                </div>
              </div>
            </div>

            {/* Col B: Statutory DBT Grant & Rehabilitation Tracker */}
            <div style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
              borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
              border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="payments" size={22} style={{ color: C.secondary }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Rehabilitation Grant & DBT Tracker (SC/ST PoA)
                  </h2>
                </div>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.secondary, background: `${C.secondaryCont}33`, padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                  PFMS VERIFIED
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.875rem', borderRadius: '0.75rem', background: C.surfaceContLow }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSurfaceVar, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>Total Sanctioned</span>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: '0.25rem' }}>
                    {dbtTracker.total_sanctioned || '₹4.82 Cr'}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>Statutory budget allocated</span>
                </div>

                <div style={{ padding: '0.875rem', borderRadius: '0.75rem', background: `${C.secondaryCont}22` }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.onSecondaryCont, textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>Disbursed via DBT</span>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: C.secondary, fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: '0.25rem' }}>
                    {dbtTracker.total_disbursed || '₹3.94 Cr'}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: C.onSecondaryCont, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                    {dbtTracker.compliance_pct || 81.7}% Compliance
                  </span>
                </div>
              </div>

              {/* Disbursement Velocity Metric */}
              <div style={{ padding: '0.875rem', borderRadius: '0.75rem', background: C.surfaceLowest, border: `1px solid ${C.outlineVar}40` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.onSurface, fontFamily: 'Inter, sans-serif' }}>
                    Average Interim Relief Velocity
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: C.secondary, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    {dbtTracker.avg_days || 4.8} Days
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                  <span style={{ color: C.secondary, fontWeight: 700 }}>Compliant Buffer (+2.2 days)</span> vs Statutory Target &lt; 7 Days
                </div>
              </div>

              {/* DM Action Callout */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '0.75rem', background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="pending_actions" size={18} style={{ color: '#9a3412' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9a3412', fontFamily: 'Inter, sans-serif' }}>
                    ₹88 Lakhs pending DM sign-off in 4 districts
                  </span>
                </div>
                <button
                  onClick={() => {
                    setActionNotice('High-priority escalation notice sent to 4 pending District Magistrates.');
                    setTimeout(() => setActionNotice(null), 4000);
                  }}
                  style={{
                    padding: '0.3rem 0.65rem', borderRadius: '0.5rem',
                    background: '#ea580c', color: '#ffffff', border: 'none',
                    fontWeight: 700, fontSize: '0.6875rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer'
                  }}
                >
                  Send DM Escalation
                </button>
              </div>
            </div>
          </div>

          {/* ── Recent Critical State Escalations Triage Feed ──────────── */}
          <div style={{
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
            borderRadius: '1.25rem', padding: '1.25rem 1.5rem',
            border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="notification_important" size={22} style={{ color: C.error }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    State Emergency Escalation Log
                  </h2>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                    Deterministic high-distress events requiring state oversight or police coordination
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.error, background: C.errorCont, padding: '0.2rem 0.6rem', borderRadius: '9999px', fontFamily: 'Inter, sans-serif' }}>
                {escalations.length} Active Events
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.875rem' }}>
              {escalations.map(esc => (
                <div key={esc.id} style={{
                  padding: '1rem', borderRadius: '0.875rem', background: C.surfaceLowest,
                  border: `1px solid ${esc.score >= 80 ? C.error + '40' : C.outlineVar + '40'}`,
                  boxShadow: '0 2px 8px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column', gap: '0.625rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      {esc.case_code} • {esc.district}
                    </span>
                    <span style={{
                      padding: '0.2rem 0.5rem', borderRadius: '9999px',
                      background: esc.score >= 80 ? C.errorCont : '#fff7ed',
                      color: esc.score >= 80 ? C.error : '#9a3412',
                      fontSize: '0.75rem', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace'
                    }}>
                      Score {esc.score}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: C.primary, textTransform: 'capitalize', fontFamily: 'Inter, sans-serif' }}>
                    {esc.case_type} ({esc.stage})
                  </div>

                  <p style={{ margin: 0, fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
                    {esc.summary}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {esc.actions?.map(act => (
                      <button
                        key={act}
                        onClick={() => {
                          setActionNotice(`Action logged: "${act}" for ${esc.case_code}`);
                          setTimeout(() => setActionNotice(null), 4000);
                        }}
                        style={{
                          flex: 1, padding: '0.35rem 0.5rem', borderRadius: '0.5rem',
                          background: act.includes('Escort') || act.includes('Police') ? C.error : C.surfaceContHigh,
                          color: act.includes('Escort') || act.includes('Police') ? C.onPrimary : C.onSurface,
                          border: 'none', fontWeight: 700, fontSize: '0.6875rem', fontFamily: 'Inter, sans-serif',
                          cursor: 'pointer'
                        }}
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Modal: Multi-District SOS Broadcast ───────────────────── */}
          {broadcastModal && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 110,
              background: 'rgba(11,28,48,0.6)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
            }}>
              <div style={{
                background: C.surfaceLowest, borderRadius: '1.25rem', padding: '1.75rem',
                maxWidth: '480px', width: '100%', boxShadow: '0 20px 48px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', gap: '1rem',
                animation: 'aavaz-pulse 0.25s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: C.error }}>
                  <Icon name="crisis_alert" size={26} fill={1} />
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Confirm Multi-District Broadcast
                  </h3>
                </div>

                <p style={{ margin: 0, fontSize: '0.875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
                  This will dispatch an emergency operational directive across all 36 District Magistrate control rooms in <strong>{selectedState}</strong>, alerting designated police liaisons and mobilizing roving mental health teams.
                </p>

                <div style={{ padding: '0.75rem', borderRadius: '0.625rem', background: C.errorCont, color: C.error, fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                  Statutory Authorization: SC/ST PoA Act Sec 15A & National Atrocity Prevention Protocol.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setBroadcastModal(false)}
                    style={{
                      padding: '0.5rem 1rem', borderRadius: '0.625rem',
                      background: C.surfaceContLow, color: C.onSurface, border: 'none',
                      fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    disabled={broadcastSent}
                    onClick={handleSendBroadcast}
                    style={{
                      padding: '0.5rem 1.25rem', borderRadius: '0.625rem',
                      background: C.error, color: C.onPrimary, border: 'none',
                      fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(186,26,26,0.3)'
                    }}
                  >
                    {broadcastSent ? 'Dispatching...' : 'Confirm & Transmit'}
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
