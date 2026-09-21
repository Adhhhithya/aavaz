import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Database, Trash2, RefreshCw, AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/ui/AdminLayout';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';

const TABLES = ['users', 'cases', 'interactions', 'sos_events', 'case_updates'];

export default function SuperAdminDashboard() {
  const { authFetch } = useAuth();
  const [activeTable, setActiveTable] = useState('users');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTable = async (tableName) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/v1/dashboards/superadmin/tables/${tableName}`, {
        headers: { 'ngrok-skip-browser-warning': '1' }
      });
      if (!res.ok) throw new Error('Failed to fetch table');
      const json = await res.json();
      setData(json.data || []);
    } catch (err) {
      console.error(err);
      toast.error(`Could not load ${tableName}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTable(activeTable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTable]);

  const handleDelete = (id) => {
    toast(`Delete row ${id}?`, {
      description: 'This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            const res = await authFetch(`/api/v1/dashboards/superadmin/tables/${activeTable}/${id}`, {
              method: 'DELETE',
              headers: { 'ngrok-skip-browser-warning': '1' }
            });
            if (!res.ok) throw new Error('Delete failed');
            toast.success('Row deleted successfully');
            fetchTable(activeTable);
          } catch (err) {
            toast.error('Failed to delete row');
          }
        },
      },
      cancel: { label: 'Cancel' }
    });
  };

  return (
    <AdminLayout level="superadmin">
      <div className="animate-[card-in_400ms_var(--ease-out-quint)_both] space-y-8">
        <PageHeader 
          title="System Database Explorer"
          subtitle="RESTRICTED AREA. Direct manipulation of underlying tables."
          right={
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-accent-sos uppercase tracking-widest flex items-center gap-1.5 px-3 py-1 bg-accent-sosBg rounded-full border border-accent-sosLight/30">
                <AlertOctagon size={14} /> Production DB
              </span>
              <button 
                onClick={() => fetchTable(activeTable)}
                className="p-2 bg-canvas-surface border border-canvas-border hover:bg-canvas-surfaceSubtle rounded-lg transition-colors active:scale-95"
              >
                <RefreshCw size={18} className={`text-text-primary ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap gap-2">
          {TABLES.map(t => (
            <button
              key={t}
              onClick={() => setActiveTable(t)}
              className={`px-4 py-2 text-sm font-bold capitalize rounded-xl transition-colors ${
                activeTable === t 
                  ? 'bg-accent-sos text-white' 
                  : 'bg-canvas-surface border border-canvas-border text-text-muted hover:text-text-primary hover:bg-canvas-surfaceSubtle'
              }`}
            >
              <Database size={14} className="inline mr-2" />
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-canvas-surfaceSubtle">
                <tr>
                  {data.length > 0 ? (
                    Object.keys(data[0]).map(k => (
                      <th key={k} className="px-4 py-3 font-bold text-text-secondary border-b border-canvas-border tracking-wider whitespace-nowrap">
                        {k}
                      </th>
                    ))
                  ) : (
                    <th className="px-4 py-3 font-bold text-text-secondary border-b border-canvas-border">Data</th>
                  )}
                  <th className="px-4 py-3 font-bold text-text-secondary border-b border-canvas-border text-right sticky right-0 bg-canvas-surfaceSubtle shadow-[-4px_0_12px_rgba(0,0,0,0.02)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-canvas-border">
                {loading ? (
                  <tr>
                    <td colSpan="100%" className="py-12 text-center text-text-muted">Loading...</td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan="100%" className="py-12 text-center text-text-muted">Table is empty.</td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id} className="hover:bg-canvas-surfaceSubtle transition-colors">
                      {Object.entries(row).map(([key, val]) => (
                        <td key={key} className="px-4 py-3 text-text-primary whitespace-nowrap max-w-[200px] truncate" title={String(val)}>
                          {val === null ? <span className="text-text-muted italic">null</span> : String(val)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right sticky right-0 bg-canvas-surface hover:bg-canvas-surfaceSubtle transition-colors shadow-[-4px_0_12px_rgba(0,0,0,0.02)]">
                        <button 
                          onClick={() => handleDelete(row.id)}
                          className="p-1.5 text-text-muted hover:text-accent-sos hover:bg-accent-sosBg rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
