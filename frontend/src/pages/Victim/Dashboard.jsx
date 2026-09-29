import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NumberFlow from '@number-flow/react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { supabase } from '../../config/supabase';
import useAlertStore from '../../store/alertStore';
import WeeklyTrendGraph from '../../components/victim/WeeklyTrendGraph';

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

/* ─── Material Icon helper ─────────────────────────────────────────── */
function Icon({ name, size = 20, fill = 0, style = {} }) {
  return (
    <span style={{
      fontFamily: 'Material Symbols Outlined',
      fontSize: size, lineHeight: 1, userSelect: 'none',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400`,
      ...style,
    }}>{name}</span>
  );
}

/* ─── Polar to Cartesian Helper ─────────────────────────────────────── */
function polarToCartesian(cx, cy, r, angleInDegrees) {
  const rad = (angleInDegrees * Math.PI) / 180.0;
  return {
    x: Number((cx + r * Math.cos(rad)).toFixed(2)),
    y: Number((cy + r * Math.sin(rad)).toFixed(2)),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

/* ─── Distress Gauge SVG ───────────────────────────────────────────── */
function DistressGauge({ score, t = (k) => k }) {
  const safeScore = Math.round(Math.min(Math.max(score ?? 0, 0), 100));
  const pct       = safeScore / 100;
  const angle     = 180 + pct * 180;
  const rad       = (angle * Math.PI) / 180;

  // Center is (120, 100), arc radius is 80, needle tip radius is 72
  const cx = 120;
  const cy = 100;
  const rNeedle = 72;
  const nx = Number((cx + rNeedle * Math.cos(rad)).toFixed(2));
  const ny = Number((cy + rNeedle * Math.sin(rad)).toFixed(2));

  const color = safeScore >= 70 ? C.error : safeScore >= 45 ? '#f59e0b' : C.secondary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ position: 'relative', width: '240px', height: '124px', display: 'flex', justifyContent: 'center' }}>
        <svg width="240" height="124" viewBox="0 0 240 124" style={{ overflow: 'visible' }}>
          {/* Subtle full track */}
          <path
            d={describeArc(cx, cy, 80, 180, 360)}
            fill="none"
            stroke={C.surfaceContHigh}
            strokeLinecap="round"
            strokeWidth="11"
          />

          {/* Segment 1: Stable (0–44) */}
          <path
            d={describeArc(cx, cy, 80, 180, 258)}
            fill="none"
            stroke={C.secondary}
            strokeWidth="11"
            strokeLinecap="round"
            strokeOpacity={safeScore < 45 ? 1 : 0.4}
          />

          {/* Segment 2: Moderate (45–69) */}
          <path
            d={describeArc(cx, cy, 80, 262, 303)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="11"
            strokeLinecap="round"
            strokeOpacity={safeScore >= 45 && safeScore < 70 ? 1 : 0.4}
          />

          {/* Segment 3: Elevated (70–100) */}
          <path
            d={describeArc(cx, cy, 80, 307, 360)}
            fill="none"
            stroke={C.error}
            strokeWidth="11"
            strokeLinecap="round"
            strokeOpacity={safeScore >= 70 ? 1 : 0.4}
          />

          {/* Scale Labels */}
          <text x="36" y="118" textAnchor="middle" fontSize="10" fontWeight="600" fill={C.outline} fontFamily='"JetBrains Mono", monospace'>0</text>
          <text x="120" y="10" textAnchor="middle" fontSize="10" fontWeight="600" fill={C.outline} fontFamily='"JetBrains Mono", monospace'>50</text>
          <text x="204" y="118" textAnchor="middle" fontSize="10" fontWeight="600" fill={C.outline} fontFamily='"JetBrains Mono", monospace'>100</text>

          {/* Needle Line */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))' }}
          />

          {/* Precision Center Pivot */}
          <circle cx={cx} cy={cy} r="8" fill={C.surfaceLowest} stroke={color} strokeWidth="2.5" />
          <circle cx={cx} cy={cy} r="3.5" fill={C.onSurface} />
        </svg>
      </div>

      {/* Digital Score Readout — completely separated below the pivot to prevent collision */}
      <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25rem' }}>
          <span style={{ fontSize: '2.25rem', fontWeight: 800, color, fontFamily: '"Plus Jakarta Sans", sans-serif', lineHeight: 1 }}>
            <NumberFlow value={safeScore} />
          </span>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: C.onSurfaceVar, fontFamily: '"JetBrains Mono", monospace' }}>
            / 100
          </span>
        </div>
        <div style={{
          fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em',
          color: C.onSurfaceVar, fontFamily: '"JetBrains Mono", monospace',
          textTransform: 'uppercase', marginTop: '0.25rem',
        }}>
          {t('clinicalDistressIndex')}
        </div>
      </div>

      {/* Clinical Risk Tiers Reference */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
        marginTop: '0.75rem', padding: '0.375rem 0.625rem', borderRadius: '0.5rem',
        background: C.surfaceContLow, width: '100%', maxWidth: '280px',
      }}>
        {[
          { key: 'stable', label: t('tierStable'), color: C.secondary, active: safeScore < 45 },
          { key: 'moderate', label: t('tierModerate'), color: '#d97706', active: safeScore >= 45 && safeScore < 70 },
          { key: 'elevated', label: t('tierElevated'), color: C.error, active: safeScore >= 70 },
        ].map(tier => (
          <span
            key={tier.key}
            style={{
              fontSize: '0.625rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: tier.active ? 700 : 500,
              color: tier.active ? tier.color : C.outline,
              background: tier.active ? `${tier.color}16` : 'transparent',
              padding: '0.2rem 0.4rem',
              borderRadius: '0.25rem',
              transition: 'all 150ms ease',
            }}
          >
            {tier.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Skeleton block ───────────────────────────────────────────────── */
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

/* ─── Case Timeline Item ───────────────────────────────────────────── */
function TimelineItem({ icon, label, date, description, active, upcoming, verifiedText }) {
  const dotBg    = active ? C.primary : upcoming ? C.surfaceCont : C.secondary;
  const dotColor = active ? C.onPrimary : upcoming ? C.onSurfaceVar : C.onPrimary;

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
      <div style={{
        position: 'absolute', left: '-1.5rem', top: '2px',
        width: '1.375rem', height: '1.375rem', borderRadius: '9999px',
        background: dotBg, color: dotColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: active ? `0 0 0 4px ${C.primary}22` : `0 0 0 3px ${C.surfaceLowest}`,
        zIndex: 1,
      }}>
        {active
          ? <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: C.surfaceContLow }} />
          : <Icon name={icon || 'check'} size={13} fill={1} />
        }
      </div>
      <div style={{ flex: 1, paddingBottom: upcoming ? 0 : '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{label}</span>
          {date && (
            <span style={{
              padding: '0.1rem 0.5rem', borderRadius: '9999px',
              background: upcoming ? C.errorCont : C.surfaceCont,
              color: upcoming ? C.onErrorCont : C.onSurfaceVar,
              fontSize: '0.6875rem', fontFamily: '"JetBrains Mono", monospace', fontWeight: upcoming ? 700 : 400,
            }}>{date}</span>
          )}
        </div>
        {description && (
          <p style={{ marginTop: '0.2rem', fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>{description}</p>
        )}
        {active && (
          <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: C.secondary, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Icon name="verified" size={13} style={{ color: C.secondary }} /> {verifiedText || 'Cryptographically Timestamped on eCourts Enclave'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helper: format date for display ─────────────────────────────── */
function fmtDate(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─── Helper: get initials from name string ────────────────────────── */
function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

/* ─── Score status badge label ─────────────────────────────────────── */
function scoreStatus(score, t = (k) => k) {
  if (score == null) return null;
  if (score >= 70) return { label: t('statusElevated'), bg: C.errorCont, color: C.onErrorCont, dot: C.error };
  if (score >= 45) return { label: t('statusModerate'), bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' };
  return { label: t('statusStable'), bg: `${C.secondaryCont}55`, color: C.onSecondaryCont, dot: C.secondary };
}

/* ─── Helper: Check if case is an actual registered grievance ──────── */
function isRealCase(c) {
  if (!c) return false;
  if (c.is_grievance_filed === true) return true;
  if (c.grievance_related_to && String(c.grievance_related_to).trim().length > 0) return true;
  if (c.grievance_description && String(c.grievance_description).trim().length > 0) return true;
  if (c.cnr && String(c.cnr).trim().length > 0) return true;
  if (c.cnr_number && String(c.cnr_number).trim().length > 0) return true;
  if (c.has_fir === true) return true;
  if (c.ecourts_data && Object.keys(c.ecourts_data).length > 0) return true;
  if (c.case_type && c.case_type.toLowerCase() !== 'unspecified') return true;
  if (c.status && !['REGISTERED', 'UNSPECIFIED', 'PENDING'].includes(c.status.toUpperCase())) return true;
  return false;
}

/* ─── Main Component ───────────────────────────────────────────────── */
export default function VictimDashboard() {
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const navigate            = useNavigate();
  const [activeCase, setActiveCase]     = useState(null);
  const [caseProgress, setCaseProgress] = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const casesRes  = await authFetch(`/api/v1/intake/app/cases/${user?.id}`);
        const casesData = await casesRes.json();
        if (casesData.cases?.length > 0) {
          const foundReal = casesData.cases.find(c => isRealCase(c));
          const c = foundReal || casesData.cases[0];
          setActiveCase(c);
          if (c?.id) {
            const progRes = await authFetch(`/api/v1/cases/${c.id}/progress`);
            if (progRes.ok) setCaseProgress(await progRes.json());
          }
        } else {
          setActiveCase(null);
          setCaseProgress(null);
        }
      } catch (err) {
        console.error('Failed to fetch case progress', err);
      }
      setLoading(false);
    }
    fetchProgress();

    const channel = supabase
      .channel(`victim-cases-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cases', filter: `user_id=eq.${user.id}` }, () => {
        useAlertStore.getState().addAlert({ title: 'Case Updated', message: 'Your case status has been updated.', type: 'info' });
        fetchProgress();
      })
      .subscribe();

    // Fallback polling (updates automatically even if Realtime websocket is offline)
    const pollInterval = setInterval(() => {
      fetchProgress();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [user, authFetch, navigate]);

  const firstName        = user?.name?.split(' ')[0] || t('welcomeSurvivor');
  const score            = caseProgress?.latestScore ?? null;
  const status           = scoreStatus(score, t);
  const isCaseRegistered = isRealCase(activeCase);

  // Build a clean, short case ID ONLY if a real grievance/case was registered
  const caseIdShort = isCaseRegistered && activeCase?.id
    ? `#CR-${activeCase.id.substring(0, 12).toUpperCase()}`
    : null;

  // Clinician from real data only
  const clinicianName = caseProgress?.assigned_clinician_name ?? null;
  const clinicianRole = caseProgress?.assigned_clinician_role ?? null;

  // Build timeline items ONLY if a real case is registered
  const timelineItems = [];
  if (isCaseRegistered && activeCase) {
    timelineItems.push({
      key: 'registered',
      icon: 'check',
      label: t('stageRegistered'),
      date: fmtDate(activeCase.created_at),
      description: activeCase.registration_description ?? (activeCase.grievance_related_to ? `Grievance category: ${activeCase.grievance_related_to.replace(/_/g, ' ')}` : null),
      active: false,
      upcoming: false,
      verifiedText: t('verifiedEcourts'),
    });
  }
  if (isCaseRegistered && caseProgress?.milestones?.length > 0) {
    caseProgress.milestones.forEach((m, i) => {
      timelineItems.push({
        key: m.id ?? i,
        icon: m.icon ?? 'check',
        label: m.label,
        date: m.date ? fmtDate(m.date) : (m.upcoming ? 'Upcoming' : null),
        description: m.description ?? null,
        active: m.active ?? false,
        upcoming: m.upcoming ?? false,
      });
    });
  }

  // Biomarker metrics — only render when real values exist
  const biomarkers = [
    caseProgress?.acoustic_shimmer != null && {
      label: 'Acoustic Shimmer', value: caseProgress.acoustic_shimmer, color: C.error,
    },
    caseProgress?.nlp_valence != null && {
      label: 'NLP Valence', value: caseProgress.nlp_valence, color: C.tertiary,
    },
    caseProgress?.heart_rate != null && {
      label: 'Autonomic Tone', value: `${caseProgress.heart_rate} BPM`, color: C.secondary,
    },
  ].filter(Boolean);

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700&family=JetBrains+Mono:wght@500&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      <style>{`
        @keyframes aavaz-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        .sanctuary-card { transition: box-shadow 200ms ease; }
        .action-btn-primary:hover { filter: brightness(1.08); }
        .action-btn-secondary:hover { background: ${C.surfaceContHigh} !important; }
        @keyframes ping { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.4; } }
      `}</style>

      <div style={{ width: '100%', minHeight: '100vh', background: C.surface }}>
        <div style={{ maxWidth: '1540px', margin: '0 auto', padding: '1.5rem 1.25rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* ── Check-in warning (driven purely by real data) ─────────── */}
          {activeCase && activeCase.days_since_last_interaction >= 15 && activeCase.status !== 'RESOLVED' && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fbbf2480', borderRadius: '0.875rem',
              padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '9999px', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="warning" size={20} fill={1} style={{ color: '#d97706' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#92400e', fontFamily: '"Plus Jakarta Sans", sans-serif', margin: 0 }}>
                    {t('mandatoryCheckinTitle')}
                  </h3>
                  <p style={{ fontSize: '0.8125rem', color: '#78350f', fontFamily: 'Inter, sans-serif', margin: '0.2rem 0 0' }}>
                    {t('mandatoryCheckinDesc', { days: activeCase.days_since_last_interaction })}
                  </p>
                </div>
              </div>
              <button onClick={() => navigate('/victim/chat')} style={{
                padding: '0.625rem 1.25rem', borderRadius: '0.625rem',
                background: '#d97706', color: '#ffffff', border: 'none',
                fontWeight: 700, fontSize: '0.875rem', fontFamily: '"Plus Jakarta Sans", sans-serif',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{t('btnStartCheckin')}</button>
            </div>
          )}

          {/* ── Section 1: Greeting + Distress card ───────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

            {/* Greeting Card */}
            <div className="sanctuary-card" style={{
              borderRadius: '1rem', background: C.surfaceLowest,
              padding: '1.5rem', boxShadow: '0 2px 8px rgba(15,23,42,0.07)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', overflow: 'hidden', minHeight: '280px',
            }}>
              <div style={{ position: 'absolute', right: '-4rem', top: '-4rem', width: '16rem', height: '16rem', borderRadius: '9999px', background: `${C.primaryFixed}50`, filter: 'blur(48px)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: '-3rem', bottom: '-3rem', width: '12rem', height: '12rem', borderRadius: '9999px', background: `${C.secondaryCont}50`, filter: 'blur(40px)', pointerEvents: 'none' }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                {loading ? (
                  <Skeleton w="14rem" h="2.5rem" />
                ) : (
                  <>
                    <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', letterSpacing: '-0.03em', margin: 0 }}>
                      {t('welcomeUser', { name: firstName })}
                    </h1>
                    <p style={{ fontSize: '1rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', marginTop: '0.5rem', maxWidth: '520px', lineHeight: 1.6 }}>
                      {t('reassuranceText')}
                    </p>
                  </>
                )}

                {/* Clinician + Case ID chips */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                  {/* Clinician — only rendered when real data exists */}
                  <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: C.surfaceContLow }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                      {t('assignedClinician')}
                    </span>
                    {loading ? (
                      <Skeleton h="2rem" style={{ marginTop: '0.375rem' }} />
                    ) : clinicianName ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem' }}>
                        <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', background: C.primary, color: C.onPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem', fontFamily: '"Plus Jakarta Sans", sans-serif', flexShrink: 0 }}>
                          {initials(clinicianName)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{clinicianName}</div>
                          {clinicianRole && <div style={{ fontSize: '0.75rem', color: C.secondary, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>{clinicianRole}</div>}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                        {t('notAssigned')}
                      </div>
                    )}
                  </div>

                  {/* Case ID */}
                  <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: C.surfaceContLow }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                      {t('activeCase')}
                    </span>
                    {loading ? (
                      <Skeleton h="2rem" style={{ marginTop: '0.375rem' }} />
                    ) : isCaseRegistered ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem' }}>
                        <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', background: C.secondaryCont, color: C.onSecondaryCont, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="verified" size={20} fill={1} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{t('protectedCohort')}</div>
                          <div style={{ fontSize: '0.75rem', color: C.onSurfaceVar, fontFamily: '"JetBrains Mono", monospace' }}>
                            {caseIdShort}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem' }}>
                        <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', background: C.surfaceCont, color: C.onSurfaceVar, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="folder_off" size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.onSurfaceVar, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{t('noActiveCase')}</div>
                          <div style={{ fontSize: '0.75rem', color: C.outline, fontFamily: 'Inter, sans-serif' }}>
                            {t('grievanceNotFiled')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* CTA buttons */}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  id="talk-aavaz-btn"
                  onClick={() => navigate('/victim/chat')}
                  className="action-btn-primary"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.625rem 1.25rem', borderRadius: '0.75rem',
                    background: C.primary, color: C.onPrimary, border: 'none',
                    fontWeight: 600, fontSize: '0.875rem', fontFamily: '"Plus Jakarta Sans", sans-serif',
                    cursor: 'pointer', boxShadow: '0 4px 12px rgba(53,37,205,0.28)',
                    transition: 'filter 150ms ease',
                  }}
                >
                  <Icon name="mic" size={18} style={{ color: C.onPrimary }} />
                  {t('btnTalkAavaz')}
                </button>
                <button
                  id="connect-counsellor-btn"
                  onClick={() => navigate('/victim/chat')}
                  className="action-btn-secondary"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.625rem 1rem', borderRadius: '0.75rem',
                    background: C.surfaceContHigh, color: C.onSurface, border: 'none',
                    fontWeight: 600, fontSize: '0.875rem', fontFamily: '"Plus Jakarta Sans", sans-serif',
                    cursor: 'pointer', transition: 'background 150ms ease',
                  }}
                >
                  <Icon name="video_call" size={18} style={{ color: C.primary }} />
                  {t('btnConnectCounsellor')}
                </button>
              </div>
            </div>

            {/* Distress Load Card */}
            <div className="sanctuary-card" style={{
              borderRadius: '1rem', background: C.surfaceLowest,
              padding: '1.5rem', boxShadow: '0 2px 8px rgba(15,23,42,0.07)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                    {t('telemetryTitle')}
                  </span>
                  <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.125rem', fontWeight: 600, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                    {t('distressIndexTitle')}
                  </h2>
                </div>
                {status && (
                  <span style={{
                    padding: '0.25rem 0.625rem', borderRadius: '9999px',
                    background: status.bg, color: status.color,
                    fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: status.dot, animation: 'ping 1.5s ease infinite', display: 'inline-block' }} />
                    {status.label}
                  </span>
                )}
              </div>

              {/* Gauge — centered with flex: 1 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0' }}>
                {loading ? (
                  <Skeleton w="240px" h="160px" />
                ) : score != null ? (
                  <DistressGauge score={score} t={t} />
                ) : (
                  <div style={{
                    width: '100%', height: '160px', borderRadius: '0.75rem',
                    background: C.surfaceContLow, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif',
                  }}>
                    {t('noScoreYet')}
                  </div>
                )}
              </div>

              {/* Biomarker tiles or telemetry footer */}
              {biomarkers.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${biomarkers.length}, 1fr)`, gap: '0.5rem', marginTop: '0.75rem' }}>
                  {biomarkers.map(m => (
                    <div key={m.label} style={{ padding: '0.5rem', borderRadius: '0.75rem', background: C.surfaceContLow, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.625rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>{m.label}</div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: m.color, fontFamily: '"Plus Jakarta Sans", sans-serif', marginTop: '0.2rem' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
                  background: C.surfaceContLow, marginTop: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.6875rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif' }}>
                    <Icon name="verified_user" size={15} style={{ color: C.secondary }} />
                    <span>{t('telemetryActive')}</span>
                  </div>
                  <span style={{ fontSize: '0.625rem', fontFamily: '"JetBrains Mono", monospace', color: C.outline, fontWeight: 600 }}>NHAA 14566</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 1.5: Weekly Distress Trends & Deconstruction (Same as Mobile) ── */}
          <WeeklyTrendGraph />

          {/* ── Section 2: Grievance Wizard + Case Timeline ────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

            {/* Grievance Actions */}
            <div className="sanctuary-card" style={{ borderRadius: '1rem', background: C.surfaceLowest, padding: '1.5rem', boxShadow: '0 2px 8px rgba(15,23,42,0.07)' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.primary, fontFamily: 'Inter, sans-serif' }}>
                {t('fastTrackRedressal')}
              </span>
              <h2 style={{ margin: '0.25rem 0 1rem', fontSize: '1.125rem', fontWeight: 600, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                {t('legalWizardTitle')}
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { id: 'register-new', icon: 'edit_document', label: t('actionRegisterNew'), desc: t('actionRegisterNewDesc'), action: () => navigate('/victim/register-grievance'), primary: true },
                  { id: 'view-case',    icon: 'folder_open',   label: t('actionViewCase'),    desc: t('actionViewCaseDesc'),    action: () => navigate('/victim/case'),              primary: false },
                  { id: 'ai-chat',     icon: 'smart_toy',      label: t('actionAiChat'),      desc: t('actionAiChatDesc'),      action: () => navigate('/victim/chat'),              primary: false },
                ].map(item => (
                  <button
                    key={item.id}
                    id={item.id}
                    onClick={item.action}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                      padding: '0.875rem 1rem', borderRadius: '0.875rem',
                      background: item.primary ? `${C.primary}0f` : C.surfaceContLow,
                      border: item.primary ? `1px solid ${C.primary}22` : '1px solid transparent',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'background 150ms ease, border-color 150ms ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = item.primary ? `${C.primary}18` : C.surfaceContHigh; }}
                    onMouseLeave={e => { e.currentTarget.style.background = item.primary ? `${C.primary}0f` : C.surfaceContLow; }}
                  >
                    <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem', background: item.primary ? `${C.primary}20` : C.surfaceCont, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={item.icon} size={20} style={{ color: C.primary }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{item.label}</div>
                      <div style={{ fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', marginTop: '0.2rem', lineHeight: 1.45 }}>{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Case Timeline */}
            <div className="sanctuary-card" style={{ borderRadius: '1rem', background: C.surfaceLowest, padding: '1.5rem', boxShadow: '0 2px 8px rgba(15,23,42,0.07)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.125rem', fontWeight: 600, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  {t('caseTimelineTitle')}
                </h2>
                {caseIdShort && (
                  <div style={{ fontSize: '0.75rem', color: C.primary, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, marginBottom: '1.25rem' }}>{caseIdShort}</div>
                )}

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingLeft: '1.5rem', marginTop: '1rem' }}>
                    {[1, 2, 3].map(i => <Skeleton key={i} h="3rem" />)}
                  </div>
                ) : isCaseRegistered ? (
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '1rem', paddingLeft: '1.5rem', marginTop: '0.75rem' }}>
                    {/* Spine */}
                    <div style={{ position: 'absolute', left: '0.625rem', top: '0.75rem', bottom: '0.75rem', width: '2px', background: C.surfaceContHigh }} />
                    {timelineItems.map(item => (
                      <TimelineItem key={item.key} {...item} />
                    ))}
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', padding: '2rem 1rem',
                  }}>
                    <div style={{
                      width: '3.25rem', height: '3.25rem', borderRadius: '1rem',
                      background: C.surfaceContLow, color: C.primary,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: '1rem',
                    }}>
                      <Icon name="assignment_late" size={26} style={{ color: C.primary }} />
                    </div>
                    <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: C.onSurface, fontFamily: '"Plus Jakarta Sans", sans-serif', margin: 0 }}>
                      {t('noGrievanceYetTitle')}
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: C.onSurfaceVar, fontFamily: 'Inter, sans-serif', margin: '0.5rem 0 1.25rem', maxWidth: '320px', lineHeight: 1.5 }}>
                      {t('noGrievanceYetDesc')}
                    </p>
                    <button
                      id="timeline-register-btn"
                      onClick={() => navigate('/victim/register-grievance')}
                      className="action-btn-primary"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.625rem 1.25rem', borderRadius: '0.75rem',
                        background: C.primary, color: C.onPrimary, border: 'none',
                        fontWeight: 600, fontSize: '0.875rem', fontFamily: '"Plus Jakarta Sans", sans-serif',
                        cursor: 'pointer', boxShadow: '0 4px 12px rgba(53,37,205,0.25)',
                        transition: 'filter 150ms ease',
                      }}
                    >
                      <Icon name="edit_document" size={18} style={{ color: C.onPrimary }} />
                      {t('btnRegisterGrievanceNow')}
                    </button>
                  </div>
                )}
              </div>

              {isCaseRegistered && (
                <button
                  id="download-docket-btn"
                  style={{
                    marginTop: '1.25rem', width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    padding: '0.625rem 1rem', borderRadius: '0.75rem',
                    background: C.surfaceContHigh, color: C.onSurface, border: 'none',
                    fontWeight: 500, fontSize: '0.875rem', fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer', transition: 'background 150ms ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceCont}
                  onMouseLeave={e => e.currentTarget.style.background = C.surfaceContHigh}
                >
                  <Icon name="download" size={18} style={{ color: C.primary }} />
                  {t('btnDownloadDocket')}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
