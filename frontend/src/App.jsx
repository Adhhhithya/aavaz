import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';

import VictimLayout from './pages/Victim/Layout';
import VictimDashboard from './pages/Victim/Dashboard';
import VictimCase from './pages/Victim/CaseLifecycle';
import VictimChatbot from './pages/Victim/Chatbot';
import GrievanceRegistration from './pages/Victim/GrievanceRegistration';

import GlobalLayout from './components/ui/GlobalLayout';

import CounsellorQueue from './pages/Counsellor/Queue';
import CaseDetail from './pages/Counsellor/CaseDetail';

import DistrictAdmin from './pages/Admin/DistrictDashboard';
import StateAdmin from './pages/Admin/StateDashboard';
import NationalAdmin from './pages/Admin/NationalDashboard';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-canvas-base flex items-center justify-center text-text-muted">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  if (user.role === 'victim') return <Navigate to="/victim/dashboard" replace />;
  if (user.role === 'counsellor') return <Navigate to="/counsellor/queue" replace />;
  if (user.role === 'admin_district') return <Navigate to="/admin/district" replace />;
  if (user.role === 'admin_state') return <Navigate to="/admin/state" replace />;
  if (user.role === 'admin_national') return <Navigate to="/admin/national" replace />;
  
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Router>
          <Routes>
          <Route path="/login" element={<Login />} />

          {/* Victim Routes */}
          <Route
            path="/victim"
            element={
              <ProtectedRoute allowedRoles={['victim']}>
                <VictimLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<VictimDashboard />} />
            <Route path="case" element={<VictimCase />} />
            <Route path="chat" element={<VictimChatbot />} />
            <Route path="register-grievance" element={<GrievanceRegistration />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Admin & Counsellor Routes with Global Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <GlobalLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RootRedirect />} />

            {/* Counsellor */}
            <Route
              path="counsellor"
              element={
                <ProtectedRoute allowedRoles={['counsellor']}>
                  <OutletWrapper />
                </ProtectedRoute>
              }
            >
              <Route path="queue" element={<CounsellorQueue />} />
              <Route path="case/:caseId" element={<CaseDetail />} />
              <Route index element={<Navigate to="queue" replace />} />
            </Route>

            {/* Admin */}
            <Route
              path="admin/district"
              element={
                <ProtectedRoute allowedRoles={['admin_district', 'admin_state', 'admin_national']}>
                  <DistrictAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/state"
              element={
                <ProtectedRoute allowedRoles={['admin_state', 'admin_national']}>
                  <StateAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/national"
              element={
                <ProtectedRoute allowedRoles={['admin_national']}>
                  <NationalAdmin />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Default Route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
      </LanguageProvider>
    </AuthProvider>
  );
}

import { Outlet } from 'react-router-dom';
function OutletWrapper() {
  return <Outlet />;
}
