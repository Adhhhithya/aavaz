import { create } from 'zustand';
import { toast } from 'sonner';

const useAlertStore = create((set, get) => ({
  alerts: [],
  
  // Add an alert to the global state and optionally show a Sonner toast
  addAlert: (alert) => {
    const id = Date.now().toString();
    const newAlert = { id, ...alert, read: false };
    
    set((state) => ({
      alerts: [newAlert, ...state.alerts]
    }));

    // If it's high priority, automatically trigger a toast
    if (alert.priority === 'high' || alert.priority === 'critical') {
      toast.error(alert.title, {
        description: alert.message,
        duration: 5000,
      });
    } else if (alert.type === 'success') {
      toast.success(alert.title, {
        description: alert.message,
      });
    } else {
      toast(alert.title, {
        description: alert.message,
      });
    }

    return id;
  },

  // Mark specific alert as read
  markAsRead: (id) => {
    set((state) => ({
      alerts: state.alerts.map((a) => 
        a.id === id ? { ...a, read: true } : a
      )
    }));
  },

  // Mark all as read
  markAllAsRead: () => {
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, read: true }))
    }));
  },

  // Remove an alert entirely
  removeAlert: (id) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id)
    }));
  },
  
  // Clear all
  clearAlerts: () => {
    set({ alerts: [] });
  }
}));

export default useAlertStore;
