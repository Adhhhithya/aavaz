import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Filter, ArrowRight, Clock, ShieldCheck, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import NumberFlow from '@number-flow/react';
import RiskBadge from '../../components/ui/RiskBadge';
import PageHeader from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { supabase } from '../../config/supabase';
import useAlertStore from '../../store/alertStore';

export default function CounsellorQueue() {
  const { user, logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user?.id) return;

    const fetchQueue = () => {
      setLoading(true);
      authFetch(`/api/v1/dashboards/counsellor/queue/${user.id}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      })
        .then((res) => {
          if (res.status === 401) { logout(); navigate('/login'); return null; }
          if (res.status === 403) return null;
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (data?.queue) {
            const mapped = data.queue.map((c) => {
              const score = Math.round(c.current_distress_score || 0);
              let risk = 'low';
              if (score >= 85) risk = 'critical';
              else if (score >= 70) risk = 'high';
              else if (score >= 40) risk = 'medium';

              return {
                id: c.id,
                user_name: c.user_name || 'Anonymous Victim',
                type: (c.case_type || 'unclassified').replace(/_/g, ' '),
                score, risk,
                has_sos: Boolean(c.has_sos),
                time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
              };
            });
            // Sort by score descending
            mapped.sort((a, b) => b.score - a.score);
            setCases(mapped);
          }
        })
        .catch((err) => console.error('Error loading counsellor queue:', err))
        .finally(() => setLoading(false));
    };

    fetchQueue();

    // Supabase Realtime Subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cases',
          filter: `assigned_counsellor_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Realtime case update received!', payload);
          useAlertStore.getState().addAlert({
            title: 'Case Updated',
            message: 'A case in your queue was just updated with new distress signals.',
            type: 'warning'
          });
          fetchQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, authFetch, logout, navigate]);

  const filteredCases = cases.filter((c) => {
    if (filter === 'sos') return c.has_sos;
    if (filter === 'critical') return c.risk === 'critical' || c.risk === 'high';
    return true;
  });

  const highPriorityCount = cases.filter((c) => c.score >= 70 || c.has_sos).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      


      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8 animate-in fade-in duration-300">
        <PageHeader 
          title="Triage Queue"
          subtitle={`You have ${highPriorityCount} priority case${highPriorityCount !== 1 ? 's' : ''} requiring review.`}
          right={
            <Button 
              variant={filter !== 'all' ? 'default' : 'outline'}
              onClick={() => setFilter(f => f === 'all' ? 'critical' : f === 'critical' ? 'sos' : 'all')}
              className={cn("gap-2 rounded-full", filter !== 'all' && "bg-primary-base text-white")}
            >
              <Filter size={16} /> {filter === 'all' ? 'All Cases' : filter === 'critical' ? 'High Risk' : 'SOS Only'}
            </Button>
          }
        />

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary-muted border-t-primary-base rounded-full animate-spin" />
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="text-center py-20 bg-surface-hover rounded-2xl border border-border border-dashed">
            <div className="flex justify-center text-primary-base mb-3"><CheckCircle size={40} strokeWidth={1.5} /></div>
            <h3 className="text-xl font-bold text-text-main mb-1">Queue is Clear</h3>
            <p className="text-text-secondary font-medium">No cases match the current filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 relative">
            <AnimatePresence mode="popLayout">
              {filteredCases.map((c, idx) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                  transition={{ delay: idx * 0.05, type: 'spring', stiffness: 320, damping: 28 }}
                  className="group relative"
                >
                  <Link to={`/counsellor/case/${c.id}`} className="block outline-none">
                    <Card
                      className={cn("relative overflow-hidden isolate p-0 transition-all duration-300 hover:border-primary-base/50 hover:shadow-md", c.has_sos && "border-critical-base/50 bg-critical-muted")}
                    >
                      {/* Hover Spotlight Glow */}
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--color-primary-base),0.1)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 pointer-events-none" />

                      <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="text-xs font-black text-text-secondary uppercase tracking-wider">{c.id.substring(0, 13)}</span>
                            {c.has_sos && <RiskBadge risk="critical" />}
                            {c.risk === 'high' && !c.has_sos && <RiskBadge risk="high" />}
                            {c.risk === 'medium' && !c.has_sos && <RiskBadge risk="medium" />}
                            {c.risk === 'low' && !c.has_sos && <RiskBadge risk="low" />}
                            <span className="text-xs font-bold text-text-muted flex items-center gap-1"><Clock size={12}/> {c.time}</span>
                          </div>
                          <h2 className="text-xl font-bold text-text-main mb-1 group-hover:text-primary-base transition-colors">{c.user_name}</h2>
                          <p className="text-text-muted font-medium text-sm capitalize">{c.type}</p>
                        </div>

                        <div className="flex items-center gap-8 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-8">
                          <div>
                            <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1 text-center">Distress Score</div>
                            <div className={`text-3xl font-black text-center ${
                              c.score >= 80 ? 'text-critical-base' : c.score >= 60 ? 'text-warning-base' : 'text-primary-base'
                            }`}>
                              <NumberFlow value={c.score} />
                            </div>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted group-hover:bg-primary-base group-hover:text-white transition-colors duration-[var(--duration-fast)]">
                            <ArrowRight size={18} />
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
