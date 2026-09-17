import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-canvas-base flex items-center justify-center text-text-muted">Checking access...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-canvas-base flex items-center justify-center p-4">
        <div className="bg-canvas-surface p-8 rounded-2xl shadow-card border border-canvas-border text-center max-w-md w-full">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Access Denied</h2>
          <p className="text-text-muted mb-6">Your role ({user.role}) does not have permission to view this page.</p>
          <button 
            onClick={() => window.history.back()}
            className="w-full bg-primary-main hover:bg-primary-hover text-white font-bold py-3 rounded-pill transition-colors shadow-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return children;
}
