import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/common/Navbar';
import { LandingPage } from './components/landing/LandingPage';
import { AuthModal } from './components/auth/AuthModal';
import { StudentDashboard } from './components/student/StudentDashboard';
import { MockInterviewRoom } from './components/student/MockInterviewRoom';
import { ListeningRoom } from './components/student/ListeningRoom';
import { DiagnosticReportView } from './components/student/DiagnosticReportView';
import { SuperAdminPortal } from './components/portals/SuperAdminPortal';
import { PlatformOwnerPortal } from './components/portals/PlatformOwnerPortal';
import { PlacementCoordinatorPortal } from './components/portals/PlacementCoordinatorPortal';
import { ProgramAdminPortal } from './components/portals/ProgramAdminPortal';
import { FacultyMentorPortal } from './components/portals/FacultyMentorPortal';
import { DepartmentAdminPortal } from './components/portals/DepartmentAdminPortal';
import { CounsellorPortal } from './components/portals/CounsellorPortal';
import { UserProfilePage } from './components/profile/UserProfilePage';
import { SignOutConfirmModal } from './components/common/SignOutConfirmModal';
import { AbandonSessionModal } from './components/common/AbandonSessionModal';
import { ProgramDetailPage } from './components/program/ProgramDetailPage';
import { ProgramActivityLogsPage } from './components/program/ProgramActivityLogsPage';
import { AssessmentActivityPage } from './components/assessment/AssessmentActivityPage';
import { AssessmentSubmissionsPage } from './components/assessment/AssessmentSubmissionsPage';
import { StudentManagementDashboardModal } from './components/common/StudentManagementDashboardModal';
import { InviteActivationPage } from './components/auth/InviteActivationPage';
import { PasswordResetPage } from './components/auth/PasswordResetPage';

const MainContent: React.FC = () => {
  const { isAuthenticated, activeRole, activeView, currentUser } = useApp();

  if (activeView === 'ACTIVATE_INVITE') {
    return <InviteActivationPage />;
  }

  if (activeView === 'PASSWORD_RESET') {
    return <PasswordResetPage />;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  if (activeView === 'PROFILE') {
    return <UserProfilePage />;
  }

  if (activeView === 'PROGRAM_DETAIL') {
    return <ProgramDetailPage />;
  }

  if (activeView === 'PROGRAM_LOGS') {
    return <ProgramActivityLogsPage />;
  }

  if (activeView === 'ASSESSMENT_ACTIVITY') {
    return <AssessmentActivityPage />;
  }

  if (activeView === 'ASSESSMENT_SUBMISSIONS') {
    return <AssessmentSubmissionsPage />;
  }

  if (activeRole === 'STUDENT') {
    switch (activeView) {
      case 'INTERVIEW_ROOM':
        return <MockInterviewRoom />;
      case 'LISTENING_ROOM':
        return <ListeningRoom />;
      case 'REPORT_VIEW':
        return <DiagnosticReportView />;
      case 'DASHBOARD':
      default:
        return <StudentDashboard />;
    }
  }

  switch (activeRole) {
    case 'PLATFORM_OWNER':
      return <PlatformOwnerPortal />;
    case 'SUPER_ADMIN':
      return <SuperAdminPortal />;
    case 'DEPARTMENT_ADMIN':
      return <DepartmentAdminPortal />;
    case 'COUNSELLOR':
      return <CounsellorPortal />;
    case 'PROGRAM_ADMIN':
      if (currentUser?.department && !currentUser?.programName) {
        return <DepartmentAdminPortal />;
      }
      return <ProgramAdminPortal />;
    case 'PLACEMENT_COORDINATOR':
      return <PlacementCoordinatorPortal />;
    case 'FACULTY_MENTOR':
      return <FacultyMentorPortal />;
    default:
      return <StudentDashboard />;
  }
};

const AppLayout: React.FC = () => {
  const { 
    isAuthenticated, 
    impersonationSession, 
    returnToOriginalDashboard, 
    activeRole, 
    currentUser, 
    student,
    activeView,
    inspectedStudent,
    setInspectedStudent
  } = useApp();

  const isAssessmentRoom = activeView === 'INTERVIEW_ROOM' || activeView === 'LISTENING_ROOM';

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0d0d0d] text-neutral-900 dark:text-[#f5f5f5] flex flex-col antialiased selection:bg-neutral-900 dark:selection:bg-white selection:text-white dark:selection:text-neutral-900 w-full">
      {/* Impersonation / View-As Return Bar */}
      {impersonationSession && !isAssessmentRoom && (
        <aside aria-label="Impersonation Status" className="bg-neutral-950 text-white px-4 sm:px-6 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 shadow-md sticky top-0 z-50 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-medium text-neutral-300">
              Viewing <strong className="text-white">{activeRole === 'STUDENT' ? 'Student' : (currentUser?.programName ? `${currentUser.programName} Admin` : (currentUser?.assignedClassName ? `${currentUser.assignedClassName} Counsellor` : (currentUser?.department ? `${currentUser.department} Department` : activeRole.replace(/_/g, ' '))))}</strong> Dashboard:
            </span>
            <span className="font-bold text-white bg-neutral-800/90 px-2 py-0.5 rounded-md border border-neutral-700">
              {currentUser?.name || student?.name}
            </span>
            <span className="text-neutral-400 font-mono text-[11px] hidden md:inline">
              ({currentUser?.email || student?.email})
            </span>
          </div>
          <button
            type="button"
            onClick={returnToOriginalDashboard}
            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer hover:scale-105 shrink-0"
          >
            <span>← Return to {impersonationSession.originalRole.replace(/_/g, ' ')} Dashboard</span>
          </button>
        </aside>
      )}

      {isAuthenticated && activeView !== 'ACTIVATE_INVITE' && !isAssessmentRoom && <Navbar />}
      <main className="flex-1 w-full">
        <MainContent />
      </main>
      <AuthModal />
      <SignOutConfirmModal />
      <AbandonSessionModal />

      {/* Dedicated Student Details & Management Dashboard Modal */}
      {inspectedStudent && (
        <StudentManagementDashboardModal
          student={inspectedStudent}
          onClose={() => setInspectedStudent(null)}
          onStudentUpdated={(updated) => {
            setInspectedStudent(updated);
          }}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
};

export default App;

