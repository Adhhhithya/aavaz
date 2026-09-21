import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { FileText, User, MapPin, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';

const INPUT_CLASS = "w-full bg-canvas-surface border border-canvas-border rounded-xl px-4 py-3 text-text-primary focus:ring-2 focus:ring-primary-main outline-none transition-all placeholder:text-text-muted";
const LABEL_CLASS = "block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2";
const RADIO_CARD_CLASS = "flex flex-col p-4 border rounded-xl cursor-pointer transition-all duration-200";

const STEP_VARIANTS = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

export default function GrievanceRegistration() {
  const { authFetch, user } = useAuth();
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
      
      toast.success('Grievance registered successfully!');
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
        <h1 className="text-3xl font-black text-text-primary tracking-tight">Register Grievance</h1>
        <p className="text-text-secondary mt-1 font-medium">Please provide the details below to officially lodge your case.</p>
      </div>
      
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4 gap-4">
        {[
          { num: 1, label: 'Registration', icon: FileText },
          { num: 2, label: 'Personal', icon: User },
          { num: 3, label: 'Address', icon: MapPin },
          { num: 4, label: 'Details', icon: FileText },
          { num: 5, label: 'Review', icon: CheckCircle2 }
        ].map((s, i) => (
          <div key={s.num} className={`flex items-center gap-2 ${step === s.num ? 'text-primary-main' : step > s.num ? 'text-text-primary' : 'text-text-muted'} transition-colors`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= s.num ? 'border-primary-main bg-primary-muted' : 'border-canvas-border bg-canvas-surfaceSubtle'}`}>
              {s.num}
            </div>
            <span className="text-sm font-bold hidden md:block whitespace-nowrap">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="bg-canvas-surface border border-canvas-border rounded-2xl shadow-card overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="p-6 md:p-8 min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div key={step} variants={STEP_VARIANTS} initial="enter" animate="center" exit="exit" className="space-y-6">
                
                {/* STEP 1: GRIEVANCE REGISTRATION */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <label className={LABEL_CLASS}>Grievance Related To *</label>
                      <div className="flex gap-4 flex-wrap">
                        {['FIR', 'Relief', 'Charge Sheet', 'Corruption'].map(type => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="grievance_related_to" checked={formData.grievance_related_to === type} onChange={() => updateForm('grievance_related_to', type)} className="text-primary-main focus:ring-primary-main" />
                            <span className="font-medium text-text-primary">{type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className={LABEL_CLASS}>Do you have a registered FIR? *</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="has_fir" checked={formData.has_fir === true} onChange={() => updateForm('has_fir', true)} className="text-primary-main focus:ring-primary-main" />
                          <span className="font-medium text-text-primary">Yes</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="has_fir" checked={formData.has_fir === false} onChange={() => updateForm('has_fir', false)} className="text-primary-main focus:ring-primary-main" />
                          <span className="font-medium text-text-primary">No</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Registration of Grievance By *</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { id: 'informer', title: 'As an Informer', desc: 'Reporting on behalf of another person' },
                          { id: 'victim', title: 'As a Victim', desc: 'Directly affected and filing on your own behalf' },
                          { id: 'ngo', title: 'As an NGO', desc: 'Organisation filing for beneficiaries' }
                        ].map(role => (
                          <div key={role.id} onClick={() => updateForm('submitter_role', role.id)} className={`${RADIO_CARD_CLASS} ${formData.submitter_role === role.id ? 'border-primary-main bg-primary-muted' : 'border-canvas-border bg-canvas-surfaceSubtle hover:border-canvas-borderActive'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-text-primary">{role.title}</span>
                              <div className={`w-4 h-4 rounded-full border-2 ${formData.submitter_role === role.id ? 'border-primary-main bg-primary-main' : 'border-canvas-border'}`} />
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
                    <div>
                      <label className={LABEL_CLASS}>First Name *</label>
                      <input required value={formData.first_name} onChange={e => updateForm('first_name', e.target.value)} className={INPUT_CLASS} placeholder="First Name" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Middle Name</label>
                      <input value={formData.middle_name} onChange={e => updateForm('middle_name', e.target.value)} className={INPUT_CLASS} placeholder="Middle Name" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Last Name</label>
                      <input value={formData.last_name} onChange={e => updateForm('last_name', e.target.value)} className={INPUT_CLASS} placeholder="Last Name" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Father / Husband Name</label>
                      <input value={formData.father_name} onChange={e => updateForm('father_name', e.target.value)} className={INPUT_CLASS} placeholder="Father / Husband Name" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Date of Birth</label>
                      <input type="date" value={formData.dob} onChange={e => updateForm('dob', e.target.value)} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Aadhaar Number *</label>
                      <input required value={formData.aadhaar_number} onChange={e => updateForm('aadhaar_number', e.target.value)} className={INPUT_CLASS} placeholder="12-digit Aadhaar" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Category *</label>
                      <select required value={formData.category} onChange={e => updateForm('category', e.target.value)} className={INPUT_CLASS}>
                        <option>General</option>
                        <option>SC/ST</option>
                        <option>OBC</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Nationality *</label>
                      <input required value={formData.nationality} onChange={e => updateForm('nationality', e.target.value)} className={INPUT_CLASS} placeholder="Nationality" />
                    </div>
                  </div>
                )}

                {/* STEP 3: ADDRESS OF VICTIM */}
                {step === 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={LABEL_CLASS}>Pincode *</label>
                      <input required value={formData.pincode} onChange={e => updateForm('pincode', e.target.value)} className={INPUT_CLASS} placeholder="6-digit Pincode" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>State *</label>
                      <input required value={formData.state} onChange={e => updateForm('state', e.target.value)} className={INPUT_CLASS} placeholder="State" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>District *</label>
                      <input required value={formData.district} onChange={e => updateForm('district', e.target.value)} className={INPUT_CLASS} placeholder="District" />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Taluka</label>
                      <input value={formData.taluka} onChange={e => updateForm('taluka', e.target.value)} className={INPUT_CLASS} placeholder="Taluka" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={LABEL_CLASS}>Full Address *</label>
                      <textarea required value={formData.full_address} onChange={e => updateForm('full_address', e.target.value)} className={`${INPUT_CLASS} min-h-[100px] resize-y`} placeholder="House No., Street, Locality" />
                    </div>
                  </div>
                )}

                {/* STEP 4: GRIEVANCE DETAILS */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div>
                      <label className={LABEL_CLASS}>CNR Number (If Applicable)</label>
                      <input value={formData.cnr_number} onChange={e => updateForm('cnr_number', e.target.value)} className={INPUT_CLASS} placeholder="Enter 16-digit CNR Number (optional)" />
                      <p className="text-xs text-text-muted mt-2">If you have an existing court case, providing the CNR will automatically link court documents to this grievance.</p>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Grievance Description *</label>
                      <textarea required value={formData.grievance_description} onChange={e => updateForm('grievance_description', e.target.value)} className={`${INPUT_CLASS} min-h-[150px] resize-y`} placeholder="Please describe your grievance in detail..." />
                    </div>
                  </div>
                )}

                {/* STEP 5: REVIEW */}
                {step === 5 && (
                  <div className="space-y-6 text-sm text-text-primary">
                    <div className="bg-canvas-surfaceSubtle p-4 rounded-xl border border-canvas-border space-y-4">
                      <h3 className="font-bold text-primary-main">1. Registration Info</h3>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted">Type:</span><span>{formData.grievance_related_to}</span></div>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted">Role:</span><span className="capitalize">{formData.submitter_role}</span></div>
                    </div>
                    <div className="bg-canvas-surfaceSubtle p-4 rounded-xl border border-canvas-border space-y-4">
                      <h3 className="font-bold text-primary-main">2. Personal Info</h3>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted">Name:</span><span>{formData.first_name} {formData.last_name}</span></div>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted">Aadhaar:</span><span>{formData.aadhaar_number}</span></div>
                    </div>
                    <div className="bg-canvas-surfaceSubtle p-4 rounded-xl border border-canvas-border space-y-4">
                      <h3 className="font-bold text-primary-main">3. Case Info</h3>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted">CNR:</span><span>{formData.cnr_number || 'N/A'}</span></div>
                      <div className="grid grid-cols-2 gap-2"><span className="text-text-muted">Description:</span><span className="truncate">{formData.grievance_description}</span></div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
          
          <div className="p-4 bg-canvas-surfaceSubtle border-t border-canvas-border flex justify-between items-center">
            {step > 1 ? (
              <button type="button" onClick={prevStep} className="px-5 py-2.5 rounded-xl font-bold text-text-secondary hover:bg-canvas-border transition-colors flex items-center gap-2">
                <ChevronLeft size={18} /> Back
              </button>
            ) : <div />}
            
            <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-xl font-bold bg-primary-main text-white hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-50">
              {loading ? 'Submitting...' : step < 5 ? (
                <>Next <ChevronRight size={18} /></>
              ) : 'Submit Grievance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
