import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';

import VictimLayout from './pages/Victim/Layout';
import VictimDashboard from './pages/Victim/Dashboard';
import VictimCase from './pages/Victim/CaseLifecycle';
import VictimChatbot from './pages/Victim/Chatbot';
import BreathingExercise from './pages/Victim/BreathingExercise';

import CounsellorQueue from './pages/Counsellor/Queue';
import CaseDetail from './pages/Counsellor/CaseDetail';

import DistrictAdmin from './pages/Admin/DistrictDashboard';
import StateAdmin from './pages/Admin/StateDashboard';
import NationalAdmin from './pages/Admin/NationalDashboard';

export default function App() {
  return (
    <AuthProvider>
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
            <Route path="breathe" element={<BreathingExercise />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Counsellor Routes */}
          <Route 
            path="/counsellor/*" 
            element={
              <ProtectedRoute allowedRoles={['counsellor']}>
                {/* Normally we'd use a layout here, but returning an Outlet or fragments is fine */}
                <React.Fragment>
                  <Routes>
                    <Route path="queue" element={<CounsellorQueue />} />
                    <Route path="case/:caseId" element={<CaseDetail />} />
                    <Route index element={<Navigate to="queue" replace />} />
                  </Routes>
                </React.Fragment>
              </ProtectedRoute>
            } 
          />

          {/* Admin Routes */}
          <Route 
            path="/admin/district" 
            element={
              <ProtectedRoute allowedRoles={['admin_district', 'admin_state', 'admin_national']}>
                <DistrictAdmin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/state" 
            element={
              <ProtectedRoute allowedRoles={['admin_state', 'admin_national']}>
                <StateAdmin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/national" 
            element={
              <ProtectedRoute allowedRoles={['admin_national']}>
                <NationalAdmin />
              </ProtectedRoute>
            } 
          />

          {/* Default Route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
