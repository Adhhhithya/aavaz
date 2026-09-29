import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import LeafletSosMap from '../../components/ui/LeafletSosMap';

/* ─── AAVAZ Design Palette ─────────────────────────────────────────── */
const C = {
  primary:         '#3525cd',
  primaryFixed:    '#e2dfff',
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

/* ─── Icon helper ──────────────────────────────────────────────────── */
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

/* ─── Skeleton ─────────────────────────────────────────────────────── */
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

/* ─── KPI Card — no sparklines ─────────────────────────────────────── */
function KpiCard({ label, value, unit, icon, iconBg, iconColor, badge, badgeColor, badgeBg, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', padding: '1.25rem', borderRadius: '1rem',
        background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)',
        boxShadow: '0 1px 6px rgba(15,23,42,0.07)',
        border: '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', width: '100%',
        transition: 'box-shadow 150ms ease, transform 150ms ease',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 6px rgba(15,23,42,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>{label}</span>
        <span style={{ padding: '0.375rem', borderRadius: '0.625rem', background: iconBg }}>
          <Icon name={icon} size={18} style={{ color: iconColor }} />
        </span>
      </div>
      {loading ? (
        <Skeleton h="2rem" style={{ marginBottom: '0.5rem' }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', lineHeight: 1 }}>
            {value ?? '—'}
          </span>
          {unit && <span style={{ fontSize: '0.875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>{unit}</span>}
        </div>
      )}
      {badge && (
        <span style={{ padding: '0.15rem 0.5rem', borderRadius: '9999px', background: badgeBg, color: badgeColor, fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

/* ─── Risk Badge ───────────────────────────────────────────────────── */
function RiskBadge({ risk = 'unknown' }) {
  const map = {
    critical: { bg: C.errorCont,    color: C.onErrorCont,    label: 'Critical' },
    high:     { bg: C.tertiaryFixed, color: C.onTertiaryFixed, label: 'High' },
    elevated: { bg: '#fff7ed',       color: '#9a3412',         label: 'Elevated' },
    moderate: { bg: '#fffbeb',       color: '#92400e',         label: 'Moderate' },
    low:      { bg: `${C.secondaryCont}44`, color: C.onSecondaryCont, label: 'Low' },
    unknown:  { bg: C.surfaceContHigh, color: C.onSurfaceVar,  label: 'Unknown' },
  };
  const s = map[risk?.toLowerCase()] || map.unknown;
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', background: s.bg, color: s.color, fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
      {s.label}
    </span>
  );
}

/* ─── Main component ───────────────────────────────────────────────── */
export default function DistrictDashboard() {
  const { user, logout, authFetch } = useAuth();
  const navigate                    = useNavigate();

  const [stats, setStats]         = useState(null);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [queue, setQueue]         = useState([]);
  const [roster, setRoster]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const fetchDistrictData = useCallback(() => {
    const districtName = user?.district || 'unassigned';

    const handle = async (res) => {
      if (res.status === 401) { logout(); return null; }
      if (res.status === 403) { setError('Permission denied for this district.'); return null; }
      return res.ok ? res.json() : null;
    };

    Promise.all([
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/stats`).then(handle),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/queue`).then(handle),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/sos`).then(handle),
      authFetch(`/api/v1/dashboards/district/${encodeURIComponent(districtName)}/roster`).then(handle),
    ]).then(([s, q, sos, r]) => {
      setStats(s || null);
      setQueue(Array.isArray(q) ? q : (q?.queue || []));
      setSosAlerts(Array.isArray(sos) ? sos : (sos?.alerts || []));
      setRoster(Array.isArray(r) ? r : (r?.roster || []));
    }).catch(err => {
      console.error(err);
      setError('Failed to load district data. Some features may be unavailable.');
    }).finally(() => setLoading(false));
  }, [authFetch, user, logout]);

  useEffect(() => {
    fetchDistrictData();

    // Supabase Realtime Subscription: Update on changes to cases or sos_events
    const channel = supabase
      .channel('district-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => {
        fetchDistrictData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' }, () => {
        fetchDistrictData();
      })
      .subscribe();

    // Fallback polling (updates automatically even if websocket is disconnected)
    const pollInterval = setInterval(() => {
      fetchDistrictData();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [fetchDistrictData]);

  const district = user?.district || 'District';

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700&family=JetBrains+Mono:wght@500&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      <style>{`
        @keyframes aavaz-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes pulse-dot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } }
        tr.case-row:hover { background: ${C.surfaceContLow} !important; }
      `}</style>

      <div style={{ position: 'relative', background: C.surface, minHeight: '100vh', width: '100%' }}>
        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: '-6rem', left: '-5rem', width: '24rem', height: '24rem', borderRadius: '9999px', background: `${C.primary}0d`, filter: 'blur(64px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '3rem', right: '2.5rem', width: '20rem', height: '20rem', borderRadius: '9999px', background: `${C.secondaryCont}33`, filter: 'blur(64px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '1540px', margin: '0 auto', padding: '1.25rem 1.25rem 2.5rem' }}>

          {/* ── Header ───────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.02em', margin: 0 }}>
              {district} — District Magistrate Command Center
            </h1>
            <p style={{ fontSize: '0.875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', marginTop: '0.25rem' }}>
              Real-time telemetry, active SOS monitoring, and counsellor caseloads.
            </p>
          </div>

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: C.errorCont, color: C.error, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="error" size={18} fill={1} style={{ color: C.error }} /> {error}
            </div>
          )}

          {/* ── KPI Cards ────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
            <KpiCard
              loading={loading}
              label="Total Registered Cases"
              value={stats?.totalCases ?? stats?.total_cases}
              unit="Cases"
              icon="folder_special"
              iconBg={`${C.primary}15`}
              iconColor={C.primary}
              onClick={() => navigate('/admin/cases')}
            />
            <KpiCard
              loading={loading}
              label="Active SOS Emergencies"
              value={stats?.active_sos ?? stats?.activeSos ?? (loading ? null : sosAlerts.length)}
              unit="Pending Dispatch"
              icon="crisis_alert"
              iconBg={C.errorCont}
              iconColor={C.onErrorCont}
              badge={!loading && (stats?.active_sos ?? stats?.activeSos ?? sosAlerts.length) > 0 ? 'Requires Immediate Action' : undefined}
              badgeColor={C.onPrimary}
              badgeBg={C.error}
              onClick={() => navigate('/admin/cases?filter=sos')}
            />
            <KpiCard
              loading={loading}
              label="High-Risk Distress Survivors"
              value={stats?.critical_alerts ?? stats?.criticalAlerts}
              unit="Monitored"
              icon="psychology_alt"
              iconBg={C.tertiaryFixed}
              iconColor={C.onTertiaryFixed}
              badge={!loading && (stats?.critical_alerts ?? stats?.criticalAlerts ?? 0) > 0 ? 'Acute Triage' : undefined}
              badgeColor={C.onTertiaryFixed}
              badgeBg={C.tertiaryFixed}
              onClick={() => navigate('/admin/cases?filter=high_risk')}
            />

          </div>

          {/* ── Active SOS Alerts & Live OpenStreetMap ────────────────── */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sosAlerts.length > 0 && (
              <div style={{
                padding: '1.25rem',
                borderRadius: '1rem', background: C.errorCont,
                border: `1px solid ${C.error}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Icon name="crisis_alert" size={20} fill={1} style={{ color: C.error, animation: 'pulse-dot 1.5s ease infinite' }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.error, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    Active Emergency Response — {sosAlerts.length} Dispatch{sosAlerts.length !== 1 ? 'es' : ''}
                  </h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                  {sosAlerts.map(alert => (
                    <div key={alert.id} style={{
                      background: C.surfaceLowest, borderRadius: '0.75rem',
                      padding: '0.875rem 1rem', border: `1px solid ${C.error}22`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      boxShadow: '0 2px 8px rgba(186,26,26,0.08)',
                    }}>
                      <div>
                        {/* Anonymised: show case ID instead of victim name */}
                        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                          Case #{alert.id?.substring(0, 8).toUpperCase() ?? '—'}
                        </h3>
                        <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', fontWeight: 700, color: C.error, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>
                          Dispatched {new Date(alert.timestamp || alert.triggered_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/admin/case/${alert.case_id || alert.id}`)}
                        style={{
                          padding: '0.5rem 1rem', borderRadius: '0.625rem',
                          background: C.error, color: C.onPrimary, border: 'none',
                          fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                          cursor: 'pointer',
                        }}>Manage</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live OpenStreetMap Tile Component */}
            <LeafletSosMap
              incidents={sosAlerts.length > 0 ? sosAlerts : queue.filter(q => (q.distress_score || 0) >= 60)}
              height="380px"
              title={`District ${district} — Live OpenStreetMap Telemetry & SOS Emergency Radar`}
            />
          </div>

          {/* ── Case Table — full width ───────────────────────────────── */}
          <div style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRadius: '1rem', boxShadow: '0 1px 6px rgba(15,23,42,0.07)', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.25rem', background: C.surfaceLowest, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Icon name="format_list_bulleted" size={20} style={{ color: C.primary }} />
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Urgent Triage & Case Registry</h2>
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>Real-time distress classification ingested from counsellor feeds</p>
              </div>
              <button
                onClick={() => navigate('/admin/cases')}
                style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer', padding: '0.25rem 0' }}
              >
                View All →
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.outlineVar}` }}>
                    {['Case ID', 'Type', 'Assigned To', 'Risk', 'Score', 'Action'].map(h => (
                      <th key={h} style={{ padding: '0.75rem', textAlign: h === 'Action' ? 'right' : 'left', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1, 2, 3].map(i => (
                      <tr key={i}>
                        {[1, 2, 3, 4, 5, 6].map(j => (
                          <td key={j} style={{ padding: '0.75rem' }}><Skeleton h="1rem" /></td>
                        ))}
                      </tr>
                    ))
                  ) : queue.length > 0 ? queue.map(c => (
                    <tr key={c.id} className="case-row" style={{ borderBottom: `1px solid ${C.outlineVar}40`, transition: 'background 100ms ease' }}>
                      <td style={{ padding: '0.75rem', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: C.onSurfaceVar }}>
                        {c.id.substring(0, 8).toUpperCase()}
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 600, fontSize: '0.875rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', textTransform: 'capitalize' }}>
                        {c.case_type?.replace(/_/g, ' ') ?? '—'}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                        {c.assigned_counsellor_name || 'Unassigned'}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <RiskBadge risk={c.risk} />
                      </td>
                      <td style={{ padding: '0.75rem', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8125rem', fontWeight: 700, color: (c.distress_score ?? 0) >= 70 ? C.error : C.onSurface }}>
                        {c.distress_score ?? '—'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button
                          onClick={() => navigate(`/admin/case/${c.id}`)}
                          style={{ padding: '0.3rem 0.75rem', borderRadius: '0.5rem', background: C.surfaceContHigh, color: C.onSurface, border: 'none', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}
                        >Open</button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: C.onSurfaceVar, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
                        No active cases in this district.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Counsellor Roster ─────────────────────────────────────── */}
          <div style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRadius: '1rem', padding: '1.25rem', boxShadow: '0 1px 6px rgba(15,23,42,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="groups" size={20} style={{ color: C.primary }} />
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Staff Roster</h2>
              </div>
              <button style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>Manage Staff</button>
            </div>
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {[1, 2, 3].map(i => <Skeleton key={i} h="3.5rem" />)}
              </div>
            ) : roster.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {roster.map(staff => (
                  <div key={staff.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '0.75rem', background: C.surfaceContLow }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{staff.name}</div>
                      <div style={{ fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', marginTop: '0.15rem' }}>{staff.active_cases} Active Cases</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '9999px', background: C.secondary, animation: 'pulse-dot 2s ease infinite', display: 'inline-block' }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>Online</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: C.onSurfaceVar, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
                No staff roster loaded.
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
