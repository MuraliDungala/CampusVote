import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { CollegeAdminRegisterPage } from './pages/public/CollegeAdminRegisterPage';
import { OtpVerificationPage } from './pages/public/OtpVerificationPage';
import { QrScannerPage } from './pages/public/QrScannerPage';
import { ElectionsPage } from './pages/public/ElectionsPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentNominationsPage } from './pages/student/StudentNominationsPage';
import { StudentElectionDetailPage } from './pages/student/StudentElectionDetailPage';
import { BallotPage } from './pages/student/BallotPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { StudentListPage } from './pages/admin/StudentListPage';
import { RosterImportPage } from './pages/admin/RosterImportPage';
import { AdminElectionListPage } from './pages/admin/AdminElectionListPage';
import { CreateElectionWizard } from './pages/admin/CreateElectionWizard';
import { AdminElectionDetailPage } from './pages/admin/AdminElectionDetailPage';
import { ElectionMonitoringDashboard } from './pages/admin/ElectionMonitoringDashboard';
import { ElectionSecurityMonitorDashboard } from './pages/admin/ElectionSecurityMonitorDashboard';
import { ElectionResultsDashboard } from './pages/admin/ElectionResultsDashboard';
import { PublicElectionResultsPage } from './pages/public/PublicElectionResultsPage';
import { AuditorDashboard } from './pages/auditor/AuditorDashboard';
import { UnauthorizedPage } from './components/layout/UnauthorizedPage';
import { ProtectedRoute, RoleGuard } from './components/layout/RouteGuards';
import { ErrorState } from './components/ui/ErrorState';

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Public Routes */}
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="register/college-admin" element={<CollegeAdminRegisterPage />} />
        <Route path="login/verify" element={<OtpVerificationPage />} />
        <Route path="login/qr" element={<QrScannerPage />} />
        <Route path="elections" element={<ElectionsPage />} />
        <Route path="elections/:id" element={<StudentElectionDetailPage />} />
        <Route path="elections/:id/results" element={<PublicElectionResultsPage />} />
        <Route
          path="elections/:id/ballot"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['STUDENT']}>
                <BallotPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route path="unauthorized" element={<UnauthorizedPage />} />

        {/* Protected Student Portal (STUDENT and SUPER_ADMIN) */}
        <Route
          path="student/dashboard"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['STUDENT']}>
                <StudentDashboard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="student/nominations"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['STUDENT']}>
                <StudentNominationsPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Protected Admin Portal (ELECTION_ADMIN and SUPER_ADMIN) */}
        <Route
          path="admin/dashboard"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <AdminDashboard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/students"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <StudentListPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/students/import"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <RosterImportPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/elections"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <AdminElectionListPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/elections/new"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <CreateElectionWizard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/elections/:id"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <AdminElectionDetailPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/elections/:id/monitor"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <ElectionMonitoringDashboard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/elections/:id/security-monitor"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN']}>
                <ElectionSecurityMonitorDashboard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/elections/:id/results"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['ELECTION_ADMIN', 'AUDITOR']}>
                <ElectionResultsDashboard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Protected Auditor Portal (AUDITOR and SUPER_ADMIN) */}
        <Route
          path="auditor/dashboard"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={['AUDITOR']}>
                <AuditorDashboard />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Catch-all 404 */}
        <Route
          path="*"
          element={
            <div className="flex-1 flex items-center justify-center p-8">
              <ErrorState
                title="Page Not Found"
                message="The requested route does not exist or has moved."
              />
            </div>
          }
        />
      </Route>
    </Routes>
  );
};

export default App;
