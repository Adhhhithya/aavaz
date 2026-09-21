import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Search, Download, Plus, FileText, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import NumberFlow from '@number-flow/react';
import { motion, AnimatePresence } from 'motion/react';

const STAGES = [
  { id: 'registered', title: 'Case Registered', desc: 'Your complaint has been successfully recorded.' },
  { id: 'investigating', title: 'Investigation', desc: 'Active gathering of evidence and witness statements.' },
  { id: 'charge_sheet', title: 'Charge Sheet Filed', desc: 'Formal charges have been presented.' },
  { id: 'trial', title: 'Court Trial', desc: 'The legal proceedings are currently active.' },
  { id: 'resolved', title: 'Judgement & Resolution', desc: 'Final verdict and rehabilitation measures.' }
];

export default function VictimCase() {
  const { user, authFetch } = useAuth();
  const [activeCase, setActiveCase] = useState(null);
  const [caseProgress, setCaseProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cnrInput, setCnrInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [newCaseDesc, setNewCaseDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchCaseData() {
    setLoading(true);
    try {
      // 1. Fetch user cases
      const casesRes = await authFetch(`/api/v1/intake/app/cases/${user?.id}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!casesRes.ok) throw new Error('Failed to load cases');
      const casesData = await casesRes.json();

      if (casesData.cases && casesData.cases.length > 0) {
        const c = casesData.cases[0];
        setActiveCase(c);

        // 2. Fetch detailed progress for the active case
        const progRes = await authFetch(`/api/v1/cases/${c.id}/progress`, {
          headers: { 'ngrok-skip-browser-warning': '1' }
        });
        if (progRes.ok) {
          const progData = await progRes.json();
          setCaseProgress(progData);
        }
      } else {
        setActiveCase(null);
      }
    } catch (err) {
      toast.error('Failed to load case data');
      console.error(err);
    }
    setLoading(false);
  }

  const handleCnrSearch = async (e) => {
    e.preventDefault();
    if (!cnrInput.trim()) return;
    setIsSearching(true);

    try {
      const res = await authFetch('/api/v1/ecourts/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ cnr: cnrInput.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Case found and linked to your profile.');
        setCnrInput('');
        fetchCaseData(); // reload
      } else {
        throw new Error(data.detail || 'Search failed');
      }
    } catch (err) {
      toast.error(err.message || 'Could not find case. Check CNR and try again.');
    }
    setIsSearching(false);
  };

  const handleFileCase = async (e) => {
    e.preventDefault();
    if (!newCaseDesc.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await authFetch('/api/v1/intake/app/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ description: newCaseDesc })
      });

      if (res.ok) {
        toast.success('Complaint registered successfully.');
        setShowFileModal(false);
        setNewCaseDesc('');
        fetchCaseData(); // reload
      } else {
        throw new Error('Failed to submit case');
      }
    } catch (err) {
      toast.error(err.message);
    }
    setIsSubmitting(false);
  };

  const handleDownloadReport = async () => {
    if (!activeCase) return;
    const toastId = toast.loading('Generating official report...');

    try {
      const res = await authFetch(`/api/v1/cases/${activeCase.id}/report`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!res.ok) throw new Error('Report generation failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `case_report_${activeCase.cnr || activeCase.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success('Report downloaded', { id: toastId });
    } catch (err) {
      toast.error('Failed to download report', { id: toastId });
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-primary-muted border-t-primary-main rounded-full animate-spin" />
      </div>
    );
  }

  // Determine active stage index
  const currentStageId = caseProgress?.currentStage?.toLowerCase() || activeCase?.status?.toLowerCase() || 'registered';
  const currentIdx = STAGES.findIndex(s => s.id === currentStageId) === -1 ? 0 : STAGES.findIndex(s => s.id === currentStageId);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-[card-in_400ms_var(--ease-out-quint)_both]">

      {/* ─── Header & Actions ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-text-primary tracking-tight">Case Status</h1>
          <p className="text-text-secondary mt-1 font-medium">Manage your active legal matters.</p>
        </div>
        <div className="shrink-0 flex gap-3">
          <button
            onClick={() => setShowFileModal(true)}
            className="px-5 py-2.5 bg-primary-main text-white font-bold rounded-xl shadow-sm hover:-translate-y-0.5 hover:shadow-hover active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus size={18} />
            File Complaint
          </button>
        </div>
      </div>

      {/* ─── Link eCourts Case Card ────────────────────────────── */}
      <div className="bg-canvas-surface border border-canvas-border rounded-2xl p-6 shadow-card">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <Search size={16} /> Link eCourts Case
        </h2>
        <form onSubmit={handleCnrSearch} className="flex gap-3">
          <input
            type="text"
            value={cnrInput}
            onChange={(e) => setCnrInput(e.target.value)}
            placeholder="Enter 16-digit CNR Number"
            className="flex-1 px-4 py-2.5 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 font-medium transition-colors"
          />
          <button
            type="submit"
            disabled={isSearching || !cnrInput.trim()}
            className="px-6 py-2.5 bg-text-primary text-white font-bold rounded-xl hover:bg-black active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {!activeCase ? (
        <div className="text-center py-16 bg-canvas-surfaceSubtle border border-canvas-border border-dashed rounded-2xl">
          <FileText size={48} className="mx-auto text-canvas-borderActive mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-text-primary mb-2">No Active Case</h3>
          <p className="text-text-secondary font-medium">File a new complaint or link an existing eCourts case above.</p>
        </div>
      ) : (
        <>
          {/* ─── Case Summary Card ─────────────────────────────── */}
          <div className="bg-canvas-surface border border-canvas-border rounded-2xl p-6 md:p-8 shadow-card relative overflow-hidden">
            {/* Top decorative bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary-main" />

            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
              <div>
                <h2 className="text-2xl font-black text-text-primary mb-1">{activeCase.title || 'Case Report'}</h2>
                <p className="text-text-muted font-medium font-mono text-sm">
                  {activeCase.cnr ? `CNR: ${activeCase.cnr}` : `ID: ${activeCase.id}`}
                </p>
              </div>
              {caseProgress && (
                <div className="text-right">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Distress Index</p>
                  <div className="inline-flex items-baseline gap-1 text-3xl font-black text-accent-sos">
                    <NumberFlow value={caseProgress.latestScore || 0} />
                    <span className="text-sm font-bold text-text-muted">/100</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Status</p>
                <p className="text-base font-bold text-primary-main capitalize">{activeCase.status || 'Pending'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Date Filed</p>
                <p className="text-base font-bold text-text-primary">{activeCase.dateFiled || 'N/A'}</p>
              </div>
              {activeCase.ecourts_data && (
                <>
                  <div>
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Next Hearing</p>
                    <p className="text-base font-bold text-text-primary">{activeCase.ecourts_data.nextHearingDate || 'N/A'}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Court</p>
                    <p className="text-base font-bold text-text-primary">{activeCase.ecourts_data.courtCode || 'N/A'}</p>
                  </div>
                </>
              )}
            </div>

            {/* Extended Grievance Details */}
            {activeCase.grievance_related_to && (
              <div className="mt-6 pt-6 border-t border-canvas-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Grievance Type</p>
                  <p className="text-base font-bold text-text-primary">{activeCase.grievance_related_to}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Submitter Role</p>
                  <p className="text-base font-bold text-text-primary capitalize">{activeCase.submitter_role}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">FIR Registered</p>
                  <p className="text-base font-bold text-text-primary">{activeCase.has_fir ? 'Yes' : 'No'}</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm font-medium text-text-primary leading-relaxed">{activeCase.grievance_description}</p>
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-canvas-border flex justify-between items-center">
              <button
                onClick={handleDownloadReport}
                className="flex items-center gap-2 text-sm font-bold text-primary-main hover:text-primary-hover active:scale-95 transition-all"
              >
                <Download size={16} />
                Download Official Report PDF
              </button>
            </div>
          </div>

          {/* ─── Animated Timeline ─────────────────────────────── */}
          <div>
            <h2 className="text-xl font-bold text-text-primary mb-6">Lifecycle Progress</h2>
            <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-canvas-border">

              {STAGES.map((stage, idx) => {
                const isCompleted = idx < currentIdx;
                const isCurrent = idx === currentIdx;

                return (
                  <motion.div
                    key={stage.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active py-4"
                  >
                    {/* Circle Node */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas-base bg-canvas-surface shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors duration-300">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-accent-sage" />
                      ) : isCurrent ? (
                        <Circle className="w-5 h-5 text-primary-main fill-primary-main/20 animate-pulse" />
                      ) : (
                        <Circle className="w-5 h-5 text-canvas-borderActive" />
                      )}
                    </div>

                    {/* Content Card */}
                    <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border ${isCurrent ? 'bg-primary-muted border-primary-main shadow-sm' : 'bg-canvas-surface border-canvas-border'
                      } transition-colors duration-300`}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`font-bold ${isCurrent ? 'text-primary-main' : 'text-text-primary'}`}>
                          {stage.title}
                        </h3>
                      </div>
                      <p className="text-sm font-medium text-text-secondary">{stage.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ─── File New Case Modal ─────────────────────────────── */}
      <AnimatePresence>
        {showFileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-text-primary/40 backdrop-blur-sm"
              onClick={() => setShowFileModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="relative w-full max-w-md bg-canvas-surface rounded-2xl shadow-hover border border-canvas-border p-6"
            >
              <h2 className="text-2xl font-black text-text-primary mb-2">File a Complaint</h2>
              <p className="text-text-secondary text-sm font-medium mb-6">
                Describe your situation briefly. Our system will prioritize and assign it to a counsellor immediately.
              </p>
              <form onSubmit={handleFileCase}>
                <textarea
                  value={newCaseDesc}
                  onChange={e => setNewCaseDesc(e.target.value)}
                  placeholder="I want to report an incident regarding..."
                  className="w-full h-32 px-4 py-3 bg-canvas-base border border-canvas-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-main/20 resize-none font-medium mb-6"
                  required
                />
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFileModal(false)}
                    className="px-5 py-2.5 font-bold text-text-muted hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newCaseDesc.trim()}
                    className="px-5 py-2.5 bg-primary-main text-white font-bold rounded-xl active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Complaint'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
