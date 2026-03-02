import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { useWebSocket } from './hooks/useWebSocket';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { MembersPage } from './pages/MembersPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { WorkflowEditorPage } from './pages/WorkflowEditorPage';
import { InstancesPage } from './pages/InstancesPage';
import { InstanceDetailPage } from './pages/InstanceDetailPage';
import { TaskInboxPage } from './pages/TaskInboxPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { AdminPage } from './pages/AdminPage';
import { SlaPage } from './pages/SlaPage';
import { AuditPage } from './pages/AuditPage';
import { SharedLibraryPage } from './pages/SharedLibraryPage';
import { AppLayout } from './components/common/AppLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { ToastContainer } from './components/common/ToastContainer';

export function App() {
  const { isAuthenticated, isLoading, loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Connect WebSocket when authenticated
  useWebSocket(isAuthenticated);

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/library" element={<SharedLibraryPage />} />
            <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
            <Route path="/instances" element={<InstancesPage />} />
            <Route path="/instances/:id" element={<InstanceDetailPage />} />
            <Route path="/tasks" element={<TaskInboxPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/sla" element={<SlaPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
