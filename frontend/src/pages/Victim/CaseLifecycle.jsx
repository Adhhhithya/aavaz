import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Search, Download, Plus, FileText, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import NumberFlow from '@number-flow/react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { cn } from '../../lib/utils';

export default function VictimCase() {
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const [activeCase, setActiveCase] = useState(null);
  const [caseProgress, setCaseProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  const STAGES = [
    { id: 'registered', title: t('stageRegistered'), desc: t('stageRegisteredDesc') },
    { id: 'investigating', title: t('stageInvestigating'), desc: t('stageInvestigatingDesc') },
    { id: 'charge_sheet', title: t('stageChargeSheet'), desc: t('stageChargeSheetDesc') },
    { id: 'trial', title: t('stageTrial'), desc: t('stageTrialDesc') },
    { id: 'resolved', title: t('stageResolved'), desc: t('stageResolvedDesc') }
  ];

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
        const foundReal = casesData.cases.find(c =>
          c.grievance_related_to || c.grievance_description || c.cnr || c.cnr_number || (c.case_type && c.case_type.toLowerCase() !== 'unspecified')
        );
        if (foundReal) {
          setActiveCase(foundReal);
          const progRes = await authFetch(`/api/v1/cases/${foundReal.id}/progress`, {
            headers: { 'ngrok-skip-browser-warning': '1' }
          });
          if (progRes.ok) {
            const progData = await progRes.json();
            setCaseProgress(progData);
          }
        } else {
          setActiveCase(null);
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
        <div className="w-8 h-8 border-4 border-primary-muted border-t-primary-base rounded-full animate-spin" />
      </div>
    );
  }

  // Determine active stage index
  const currentStageId = caseProgress?.currentStage?.toLowerCase() || activeCase?.status?.toLowerCase() || 'registered';
  const currentIdx = STAGES.findIndex(s => s.id === currentStageId) === -1 ? 0 : STAGES.findIndex(s => s.id === currentStageId);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">

      {/* ─── Header & Actions ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-main tracking-tight">{t('caseStatusTitle')}</h1>
          <p className="text-text-secondary mt-1 font-medium">{t('caseStatusSubtitle')}</p>
        </div>
        <div className="shrink-0 flex gap-3">
          <Button onClick={() => setShowFileModal(true)} className="gap-2">
            <Plus size={18} />
            {t('btnFileComplaint')}
          </Button>
        </div>
      </div>

      {/* ─── Link eCourts Case Card ────────────────────────────── */}
      <Card className="p-6">
        <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <Search size={16} /> {t('linkEcourtsTitle')}
        </h2>
        <form onSubmit={handleCnrSearch} className="flex gap-3">
          <Input
            type="text"
            value={cnrInput}
            onChange={(e) => setCnrInput(e.target.value)}
            placeholder={t('cnrPlaceholder')}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={isSearching || !cnrInput.trim()}
          >
            {isSearching ? t('btnSearching') : t('btnSearch')}
          </Button>
        </form>
      </Card>

      {!activeCase ? (
        <div className="text-center py-16 bg-surface-hover border border-border border-dashed rounded-2xl">
          <FileText size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-text-main mb-2">{t('noActiveCaseTitle')}</h3>
          <p className="text-text-secondary font-medium">{t('noActiveCaseDesc')}</p>
        </div>
      ) : (
        <>
          {/* ─── Case Summary Card ─────────────────────────────── */}
          <Card className="p-6 md:p-8 relative overflow-hidden">
            {/* Top decorative bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary-base" />

            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-text-main mb-1">{activeCase.title || t('caseReport')}</h2>
                <p className="text-text-muted font-medium font-mono text-sm">
                  {activeCase.cnr ? `CNR: ${activeCase.cnr}` : `ID: ${activeCase.id}`}
                </p>
              </div>
              {caseProgress && (
                <div className="text-right">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('distressIndexLabel')}</p>
                  <div className="inline-flex items-baseline gap-1 text-3xl font-black text-critical-base">
                    <NumberFlow value={caseProgress.latestScore || 0} />
                    <span className="text-sm font-bold text-text-muted">/100</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('statusLabel')}</p>
                <p className="text-base font-bold text-primary-base capitalize">{activeCase.status || 'Pending'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('dateFiledLabel')}</p>
                <p className="text-base font-bold text-text-main">{activeCase.dateFiled || 'N/A'}</p>
              </div>
              {activeCase.ecourts_data && (
                <>
                  <div>
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('nextHearingLabel')}</p>
                    <p className="text-base font-bold text-text-main">{activeCase.ecourts_data.nextHearingDate || 'N/A'}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('courtLabel')}</p>
                    <p className="text-base font-bold text-text-main">{activeCase.ecourts_data.courtCode || 'N/A'}</p>
                  </div>
                </>
              )}
            </div>

            {/* Extended Grievance Details */}
            {activeCase.grievance_related_to && (
              <div className="mt-6 pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('grievanceTypeLabel')}</p>
                  <p className="text-base font-bold text-text-main">{activeCase.grievance_related_to}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('submitterRoleLabel')}</p>
                  <p className="text-base font-bold text-text-main capitalize">{activeCase.submitter_role}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('firRegisteredLabel')}</p>
                  <p className="text-base font-bold text-text-main">{activeCase.has_fir ? t('yes') : t('no')}</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">{t('descriptionLabel')}</p>
                  <p className="text-sm font-medium text-text-main leading-relaxed">{activeCase.grievance_description}</p>
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-border flex justify-between items-center">
              <Button
                variant="ghost"
                onClick={handleDownloadReport}
                className="gap-2 font-bold text-primary-base hover:text-primary-hover px-0"
              >
                <Download size={16} />
                {t('btnDownloadReport')}
              </Button>
            </div>
          </Card>

          {/* ─── Animated Timeline ─────────────────────────────── */}
          <div>
            <h2 className="text-xl font-bold text-text-main mb-6">{t('lifecycleProgressTitle')}</h2>
            <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-border">

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
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-surface shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors duration-300">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-success-base" />
                      ) : isCurrent ? (
                        <Circle className="w-5 h-5 text-primary-base fill-primary-base/20 animate-pulse" />
                      ) : (
                        <Circle className="w-5 h-5 text-text-muted" />
                      )}
                    </div>

                    {/* Content Card */}
                    <div className={cn("w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border transition-colors duration-300", 
                      isCurrent ? 'bg-primary-muted border-primary-base shadow-sm' : 'bg-surface border-border'
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={cn("font-bold", isCurrent ? 'text-primary-base' : 'text-text-main')}>
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
              className="absolute inset-0 bg-text-main/40 backdrop-blur-sm"
              onClick={() => setShowFileModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="relative w-full max-w-md bg-surface rounded-2xl shadow-lg border border-border p-6"
            >
              <h2 className="text-2xl font-bold text-text-main mb-2">{t('fileComplaintModalTitle')}</h2>
              <p className="text-text-secondary text-sm font-medium mb-6">
                {t('fileComplaintModalDesc')}
              </p>
              <form onSubmit={handleFileCase}>
                <textarea
                  value={newCaseDesc}
                  onChange={e => setNewCaseDesc(e.target.value)}
                  placeholder={t('fileComplaintPlaceholder')}
                  className="w-full h-32 px-4 py-3 bg-background border border-border rounded-xl text-text-main focus:outline-none focus:ring-2 focus:ring-primary-base/20 resize-none font-medium mb-6"
                  required
                />
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowFileModal(false)}
                  >
                    {t('btnCancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !newCaseDesc.trim()}
                  >
                    {isSubmitting ? t('btnSearching') : t('btnSubmitComplaint')}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
