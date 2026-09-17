import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';

const STAGES = [
  { id: 'registered', title: 'Case Registered', desc: 'Your complaint has been successfully recorded in the system.' },
  { id: 'investigation', title: 'Police Investigation', desc: 'Active gathering of evidence and witness statements.' },
  { id: 'charge_sheet', title: 'Charge Sheet Filed', desc: 'Formal charges have been presented to the court.' },
  { id: 'trial', title: 'Court Trial', desc: 'The legal proceedings are currently active.' },
  { id: 'judgement', title: 'Judgement & Compensation', desc: 'Final verdict and rehabilitation measures.' }
];

export default function VictimCase() {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Mock fetch case for MVP
  useEffect(() => {
    setTimeout(() => {
      setCaseData({
        id: 'CASE-2026-891',
        type: 'Witness Intimidation',
        currentStage: 'investigation',
        assignedCounsellor: 'Dr. Jane Smith',
        startDate: '2026-09-14',
        ecourts: {
          nextHearingDate: '2026-10-05',
          lastVerdict: 'Bail hearing scheduled. Protection requested.',
          currentStatus: 'Pending Investigation'
        },
        updates: [
          { date: '2026-09-14', note: 'FIR registered at District HQ.' },
          { date: '2026-09-15', note: 'Initial counsellor assessment completed.' }
        ]
      });
      setLoading(false);
    }, 800);
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-text-muted font-medium">Loading case details...</div>;
  }

  const currentIdx = STAGES.findIndex(s => s.id === caseData.currentStage);

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="mb-10">
        <h1 className="text-3xl font-black text-text-primary tracking-tight">Case Status</h1>
        <p className="text-text-muted font-medium mt-1">ID: {caseData.id}</p>
      </div>

      <div className="bg-canvas-surface rounded-2xl p-6 border border-canvas-border shadow-card mb-8">
        <h2 className="text-xl font-bold text-text-primary mb-6">Case Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Case Started On</div>
            <div className="text-base font-bold text-text-primary">{caseData.startDate}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Current Legal Stage</div>
            <div className="text-base font-bold text-primary-main uppercase">{caseData.ecourts.currentStatus}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Next Hearing Date</div>
            <div className="text-base font-bold text-text-primary">{caseData.ecourts.nextHearingDate}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Last Hearing Outcome</div>
            <div className="text-base font-bold text-text-primary">{caseData.ecourts.lastVerdict}</div>
          </div>
          <div className="sm:col-span-2 pt-4 border-t border-canvas-border mt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Assigned Counsellor</div>
                <div className="text-lg font-bold text-text-primary">{caseData.assignedCounsellor}</div>
              </div>
              <button className="bg-primary-muted text-primary-main hover:bg-primary-main hover:text-white font-bold px-4 py-2 rounded-pill transition-colors text-sm">
                Contact
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical Timeline */}
      <h2 className="text-xl font-bold text-text-primary mb-6">Lifecycle Progress</h2>
      <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-canvas-border">
        
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          
          return (
            <div key={stage.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-canvas-base bg-canvas-surface shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                {isCompleted ? (
                  <CheckCircle2 size={20} className="text-accent-sage" />
                ) : isCurrent ? (
                  <div className="w-3 h-3 bg-primary-main rounded-full shadow-[0_0_0_4px_rgba(138,121,184,0.2)]"></div>
                ) : (
                  <Circle size={16} className="text-canvas-border" />
                )}
              </div>
              
              <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border transition-all ${
                isCurrent 
                  ? 'bg-canvas-surface border-primary-main shadow-hover' 
                  : 'bg-canvas-surface/50 border-canvas-border shadow-sm'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-bold ${isCurrent ? 'text-primary-main' : 'text-text-primary'}`}>{stage.title}</h3>
                </div>
                <div className="text-sm font-medium text-text-muted">{stage.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-bold text-text-primary mb-4">Recent Updates</h2>
        <div className="space-y-3">
          {caseData.updates.map((update, i) => (
            <div key={i} className="flex gap-4 items-start p-4 bg-canvas-base rounded-xl border border-canvas-border">
              <div className="text-xs font-bold text-text-secondary w-20 pt-0.5">{update.date}</div>
              <div className="text-sm font-medium text-text-primary flex-1">{update.note}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
