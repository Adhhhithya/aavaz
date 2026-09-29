import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { FileText, User, MapPin, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';
import { cn } from '../../lib/utils';

const RADIO_CARD_CLASS = "flex flex-col p-4 border rounded-xl cursor-pointer transition-all duration-200";

const STEP_VARIANTS = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

export default function GrievanceRegistration() {
  const { authFetch, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    grievance_related_to: 'FIR',
    has_fir: false,
    submitter_role: 'victim',
    
    first_name: user?.name?.split(' ')[0] || '',
    middle_name: '',
    last_name: user?.name?.split(' ').slice(1).join(' ') || '',
    father_name: '',
    dob: '',
    category: 'General',
    nationality: 'Indian',
    aadhaar_number: '',
    
    pincode: '',
    state: '',
    district: '',
    taluka: '',
    full_address: '',
    
    cnr_number: '',
    grievance_description: ''
  });

  const updateForm = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 5));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 5) {
      nextStep();
      return;
    }
    
    setLoading(true);
    try {
      const res = await authFetch('/api/v1/intake/app/grievance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('Submission failed');
      
      toast.success(t('btnSaved') || 'Grievance registered successfully!');
      navigate('/victim/dashboard');
    } catch (err) {
      toast.error('Failed to submit grievance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-main tracking-tight">{t('grievanceRegTitle')}</h1>
        <p className="text-text-secondary mt-1 font-medium">{t('grievanceRegSubtitle')}</p>
      </div>
      
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4 gap-4">
        {[
          { num: 1, label: t('stepRegistration'), icon: FileText },
          { num: 2, label: t('stepPersonal'), icon: User },
          { num: 3, label: t('stepAddress'), icon: MapPin },
          { num: 4, label: t('stepDetails'), icon: FileText },
          { num: 5, label: t('stepReview'), icon: CheckCircle2 }
        ].map((s) => (
          <div key={s.num} className={cn("flex items-center gap-2 transition-colors", step === s.num ? 'text-primary-base' : step > s.num ? 'text-text-main' : 'text-text-muted')}>
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2", step >= s.num ? 'border-primary-base bg-primary-muted' : 'border-border bg-surface-hover')}>
              {s.num}
            </div>
            <span className="text-sm font-bold hidden md:block whitespace-nowrap">{s.label}</span>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="p-6 md:p-8 min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div key={step} variants={STEP_VARIANTS} initial="enter" animate="center" exit="exit" className="space-y-6">
                
                {/* STEP 1: GRIEVANCE REGISTRATION */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label>{t('grievanceRelatedTo')} <span className="text-danger-base">*</span></Label>
                      <div className="flex gap-4 flex-wrap">
                        {['FIR', 'Relief', 'Charge Sheet', 'Corruption'].map(type => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="grievance_related_to" checked={formData.grievance_related_to === type} onChange={() => updateForm('grievance_related_to', type)} className="text-primary-base focus:ring-primary-base" />
                            <span className="font-medium text-text-main">{type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label>{t('hasFirQuestion')} <span className="text-danger-base">*</span></Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="has_fir" checked={formData.has_fir === true} onChange={() => updateForm('has_fir', true)} className="text-primary-base focus:ring-primary-base" />
                          <span className="font-medium text-text-main">{t('yes')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="has_fir" checked={formData.has_fir === false} onChange={() => updateForm('has_fir', false)} className="text-primary-base focus:ring-primary-base" />
                          <span className="font-medium text-text-main">{t('no')}</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>{t('registrationBy')} <span className="text-danger-base">*</span></Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { id: 'informer', title: t('asInformer'), desc: t('asInformerDesc') },
                          { id: 'victim', title: t('asVictim'), desc: t('asVictimDesc') },
                          { id: 'ngo', title: t('asNgo'), desc: t('asNgoDesc') }
                        ].map(role => (
                          <div key={role.id} onClick={() => updateForm('submitter_role', role.id)} className={cn(RADIO_CARD_CLASS, formData.submitter_role === role.id ? 'border-primary-base bg-primary-muted' : 'border-border bg-surface-hover hover:border-text-muted')}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-text-main">{role.title}</span>
                              <div className={cn("w-4 h-4 rounded-full border-2", formData.submitter_role === role.id ? 'border-primary-base bg-primary-base' : 'border-border')} />
                            </div>
                            <span className="text-xs text-text-secondary">{role.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: PERSONAL INFORMATION */}
                {step === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">{t('firstName')} <span className="text-danger-base">*</span></Label>
                      <Input id="first_name" required value={formData.first_name} onChange={e => updateForm('first_name', e.target.value)} placeholder={t('firstName')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="middle_name">{t('middleName')}</Label>
                      <Input id="middle_name" value={formData.middle_name} onChange={e => updateForm('middle_name', e.target.value)} placeholder={t('middleName')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">{t('lastName')}</Label>
                      <Input id="last_name" value={formData.last_name} onChange={e => updateForm('last_name', e.target.value)} placeholder={t('lastName')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="father_name">{t('fatherName')}</Label>
                      <Input id="father_name" value={formData.father_name} onChange={e => updateForm('father_name', e.target.value)} placeholder={t('fatherName')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dob">{t('dob')}</Label>
                      <Input id="dob" type="date" value={formData.dob} onChange={e => updateForm('dob', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aadhaar_number">{t('aadhaarNumber')} <span className="text-danger-base">*</span></Label>
                      <Input id="aadhaar_number" required value={formData.aadhaar_number} onChange={e => updateForm('aadhaar_number', e.target.value)} placeholder="12-digit Aadhaar" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">{t('category')} <span className="text-danger-base">*</span></Label>
                      <select id="category" required value={formData.category} onChange={e => updateForm('category', e.target.value)} className="w-full h-11 px-3 py-2 rounded-lg border border-border bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary-base focus:border-transparent transition-shadow">
                        <option>General</option>
                        <option>SC/ST</option>
                        <option>OBC</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nationality">{t('nationality')} <span className="text-danger-base">*</span></Label>
                      <Input id="nationality" required value={formData.nationality} onChange={e => updateForm('nationality', e.target.value)} placeholder={t('nationality')} />
                    </div>
                  </div>
                )}

                {/* STEP 3: ADDRESS OF VICTIM */}
                {step === 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="pincode">{t('pincode')} <span className="text-danger-base">*</span></Label>
                      <Input id="pincode" required value={formData.pincode} onChange={e => updateForm('pincode', e.target.value)} placeholder={t('pincode')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">{t('state')} <span className="text-danger-base">*</span></Label>
                      <Input id="state" required value={formData.state} onChange={e => updateForm('state', e.target.value)} placeholder={t('state')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="district">{t('district')} <span className="text-danger-base">*</span></Label>
                      <Input id="district" required value={formData.district} onChange={e => updateForm('district', e.target.value)} placeholder={t('district')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="taluka">{t('taluka')}</Label>
                      <Input id="taluka" value={formData.taluka} onChange={e => updateForm('taluka', e.target.value)} placeholder={t('taluka')} />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="full_address">{t('fullAddress')} <span className="text-danger-base">*</span></Label>
                      <textarea id="full_address" required value={formData.full_address} onChange={e => updateForm('full_address', e.target.value)} className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-border bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary-base focus:border-transparent transition-shadow resize-y" placeholder="House No., Street, Locality" />
                    </div>
                  </div>
                )}

                {/* STEP 4: GRIEVANCE DETAILS */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="cnr_number">{t('cnrNumber')}</Label>
                      <Input id="cnr_number" value={formData.cnr_number} onChange={e => updateForm('cnr_number', e.target.value)} placeholder={t('cnrPlaceholder')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grievance_description">{t('incidentDescription')} <span className="text-danger-base">*</span></Label>
                      <textarea id="grievance_description" required value={formData.grievance_description} onChange={e => updateForm('grievance_description', e.target.value)} className="w-full min-h-[150px] px-3 py-2 rounded-lg border border-border bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary-base focus:border-transparent transition-shadow resize-y" placeholder="Please describe your grievance in detail..." />
                    </div>
                  </div>
                )}

                {/* STEP 5: REVIEW */}
                {step === 5 && (
                  <div className="space-y-6 text-sm text-text-main">
                    <div className="bg-surface-hover p-4 rounded-xl border border-border space-y-4">
                      <h3 className="font-bold text-primary-base">1. {t('stepRegistration')}</h3>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted font-medium">{t('grievanceTypeLabel')}:</span><span className="font-semibold">{formData.grievance_related_to}</span></div>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted font-medium">{t('submitterRoleLabel')}:</span><span className="capitalize font-semibold">{formData.submitter_role}</span></div>
                    </div>
                    <div className="bg-surface-hover p-4 rounded-xl border border-border space-y-4">
                      <h3 className="font-bold text-primary-base">2. {t('stepPersonal')}</h3>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted font-medium">{t('profileDisplayName')}:</span><span className="font-semibold">{formData.first_name} {formData.last_name}</span></div>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted font-medium">{t('aadhaarNumber')}:</span><span className="font-semibold">{formData.aadhaar_number}</span></div>
                    </div>
                    <div className="bg-surface-hover p-4 rounded-xl border border-border space-y-4">
                      <h3 className="font-bold text-primary-base">3. {t('stepDetails')}</h3>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted font-medium">{t('cnrNumber')}:</span><span className="font-semibold">{formData.cnr_number || 'N/A'}</span></div>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted font-medium">{t('descriptionLabel')}:</span><span className="truncate font-semibold">{formData.grievance_description}</span></div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
          
          <div className="p-4 bg-surface border-t border-border flex justify-between items-center">
            {step > 1 ? (
              <Button type="button" variant="ghost" onClick={prevStep} className="gap-2">
                <ChevronLeft size={18} /> {t('btnBack')}
              </Button>
            ) : <div />}
            
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? t('btnSearching') : step < 5 ? (
                <>{t('btnNext')} <ChevronRight size={18} /></>
              ) : t('btnSubmitGrievance')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
