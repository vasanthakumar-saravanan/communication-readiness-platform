import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppContext } from './appContextInstance';
import {
  UserRole,
  StudentProfile,
  DiagnosticReport,
  TrainerTenure,
  InterviewAssignment,
  AssignmentSubmission,
  QuestionTurn,
  Difficulty,
  ParsedResume,
  AuthUser,
  CodingHandles,
  DynamicProgram,
  AppNotification,
  AdminPermission,
  ImprovementChecklistItem,
  College
} from '../types';
import {
  DEFAULT_CLEAN_STUDENT,
  INITIAL_STUDENT_PROFILE,
  INITIAL_CRITERIA_TASKS,
  MOCK_INTERVIEW_QUESTIONS,
  MOCK_TRAINER_TENURES,
  MOCK_ASSIGNMENTS,
  MOCK_MENTEES_LIST
} from '../data/mockData';
import { api } from '../services/api';
import { logger } from '../services/logger';
import { closeTopModal } from '../utils/modalManager';

export type AppView =
  | 'DASHBOARD'
  | 'INTERVIEW_ROOM'
  | 'LISTENING_ROOM'
  | 'REPORT_VIEW'
  | 'PROFILE'
  | 'PROGRAM_DETAIL'
  | 'PROGRAM_LOGS'
  | 'ASSESSMENT_ACTIVITY'
  | 'ASSESSMENT_SUBMISSIONS'
  | 'ACTIVATE_INVITE'
  | 'PASSWORD_RESET';

export const VIEW_TO_HASH: Record<AppView, string> = {
  DASHBOARD: '#/dashboard',
  INTERVIEW_ROOM: '#/interview',
  LISTENING_ROOM: '#/listening',
  REPORT_VIEW: '#/report',
  PROFILE: '#/profile',
  PROGRAM_DETAIL: '#/program-detail',
  PROGRAM_LOGS: '#/program-logs',
  ASSESSMENT_ACTIVITY: '#/assessment-activity',
  ASSESSMENT_SUBMISSIONS: '#/assessment-submissions',
  ACTIVATE_INVITE: '#/activate'
};

export const HASH_TO_VIEW: Record<string, AppView> = {
  '#/dashboard': 'DASHBOARD',
  '#/interview': 'INTERVIEW_ROOM',
  '#/listening': 'LISTENING_ROOM',
  '#/report': 'REPORT_VIEW',
  '#/profile': 'PROFILE',
  '#/program-detail': 'PROGRAM_DETAIL',
  '#/program-logs': 'PROGRAM_LOGS',
  '#/assessment-activity': 'ASSESSMENT_ACTIVITY',
  '#/assessment-submissions': 'ASSESSMENT_SUBMISSIONS',
  '#/activate': 'ACTIVATE_INVITE',
  '#dashboard': 'DASHBOARD',
  '#interview': 'INTERVIEW_ROOM',
  '#listening': 'LISTENING_ROOM',
  '#report': 'REPORT_VIEW',
  '#profile': 'PROFILE',
  '#program-detail': 'PROGRAM_DETAIL',
  '#program-logs': 'PROGRAM_LOGS',
  '#assessment-activity': 'ASSESSMENT_ACTIVITY',
  '#assessment-submissions': 'ASSESSMENT_SUBMISSIONS',
  '#activate': 'ACTIVATE_INVITE',
  '': 'DASHBOARD',
  '#/': 'DASHBOARD',
  '#': 'DASHBOARD'
};

interface InterviewSessionState {
  isActive: boolean;
  sessionId?: string;
  type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION';
  turnIndex: number;
  currentDifficulty: Difficulty;
  questions: QuestionTurn[];
  tabSwitches: number;
  isFlagged: boolean;
  isDisqualified?: boolean;
  disqualificationReason?: string;
  orbState: 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';
  liveTranscript: string;
  isCompletedAwaitingEvaluation?: boolean;
  /** Planned number of turns when the server drives the interview (questions grow one at a time). */
  totalTurns?: number;
}

export interface ImpersonationSession {
  originalUser: AuthUser;
  originalRole: UserRole;
  originalStudent?: StudentProfile;
  targetUser?: AuthUser;
  targetStudent?: StudentProfile;
}

export interface AppContextType {
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register' | 'register_institution';
  openAuthModal: (mode?: 'login' | 'register' | 'register_institution') => void;
  closeAuthModal: () => void;
  confirmSignOutOpen: boolean;
  setConfirmSignOutOpen: (open: boolean) => void;
  requestSignOut: () => void;
  cancelSignOut: () => void;
  confirmSignOut: () => void;
  abandonWarningOpen: boolean;
  requestExitAssessment: () => void;
  cancelAbandonWarning: () => void;
  confirmAbandonSession: () => void;
  loginUser: (email: string, password: string) => Promise<void>;
  loginWithAuthUser: (authUser: AuthUser, token?: string) => void;
  registerUser: (data: any) => Promise<void>;
  registerCandidate: (data: { name: string; email: string; password?: string }) => Promise<void>;
  registerInstitution: (data: {
    institutionName: string;
    institutionCode: string;
    campusCity: string;
    adminName: string;
    adminEmail: string;
    password?: string;
    contactPhone?: string;
  }) => Promise<{ college: College; user: AuthUser; token: string }>;
  completeInviteActivation: (token: string, password: string) => Promise<void>;
  registerExternalUser: (data: { name: string; email: string; password: string; department?: string; batchYear?: number }) => Promise<{ message: string; email: string; simulatedVerificationCode: string }>;
  verifyEmailAndLogin: (email: string, code: string) => Promise<void>;
  logout: () => void;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  activeView: AppView;
  setActiveView: (view: AppView, replace?: boolean) => void;
  triggerBackNavigation: () => void;
  student: StudentProfile;
  setStudent: React.Dispatch<React.SetStateAction<StudentProfile>>;
  interviewState: InterviewSessionState;
  startInterview: (type?: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION') => Promise<void>;
  submitAnswer: (answerText: string) => Promise<void>;
  applyLiveInterviewTurn: (turn: {
    transcript: string;
    technicalScore: number;
    communicationScore: number;
    feedback: string;
    strengths: string;
    weaknesses: string;
    nextDifficulty: Difficulty;
    nextQuestionText: string;
    paceWpm?: number;
    fillerCount?: number;
    keyPointsMissed?: string[];
  }) => void;
  endInterview: () => Promise<void>;
  completeAssessmentAwaitingEvaluation: (type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION', finalReport?: DiagnosticReport | null) => Promise<void>;
  isEvaluationPending: boolean;
  newReportNotification: { reportId: string; score: number; title: string; timestamp: number } | null;
  dismissNewReportNotification: () => void;
  recordTabSwitch: () => Promise<void>;
  latestReport: DiagnosticReport | null;
  trainerTenures: TrainerTenure[];
  onboardTrainer: (trainer: Omit<TrainerTenure, 'id' | 'isActive'>) => Promise<void>;
  revokeTrainer: (id: string) => Promise<void>;
  assignments: InterviewAssignment[];
  createAssignment: (assignment: Partial<InterviewAssignment>) => Promise<InterviewAssignment>;
  activeAssignment: InterviewAssignment | null;
  startAssignedSession: (assignment: InterviewAssignment) => Promise<void>;
  completeAssignmentSubmission: (assignmentId: string, score: number, sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' | 'BOTH', status?: 'COMPLETED' | 'FLAGGED' | 'DISQUALIFIED', reason?: string) => Promise<void>;
  isAssignmentDisqualified: (assignmentId: string) => boolean;
  disqualifyAssignment: (assignmentId: string, reason?: string) => Promise<void>;
  terminateDisqualifiedSession: (assignmentId?: string) => Promise<void>;
  disqualifiedAssignmentIds: string[];
  sessionCoinAtStake: boolean;
  restoreSessionCoin: () => void;
  forfeitSessionCoin: () => void;
  restoreStudentCoinsToFive: (studentId: string) => Promise<void>;
  simulateElapsedCooldown: (studentId: string) => void;
  toggleCriteriaTask: (taskId: string) => Promise<void>;
  verifyCriteriaTask: (taskId: string) => Promise<void>;
  uploadResumeData: (payload: FormData | { resumeText: string; fileName?: string } | ParsedResume) => Promise<ParsedResume>;
  updateCodingHandles: (handles: Partial<CodingHandles>) => Promise<void>;
  selectedProgram: DynamicProgram | null;
  setSelectedProgram: React.Dispatch<React.SetStateAction<DynamicProgram | null>>;
  viewProgramDetail: (prog: DynamicProgram) => void;
  viewProgramLogs: (prog?: DynamicProgram) => void;
  deleteAssignment: (id: string) => Promise<boolean>;
  selectedAssessmentId: string | null;
  setSelectedAssessmentId: React.Dispatch<React.SetStateAction<string | null>>;
  viewAssessmentActivity: () => void;
  viewAssessmentSubmissions: (asgId: string) => void;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  clearNotifications: () => void;
  impersonationSession: ImpersonationSession | null;
  inspectedStudent: StudentProfile | any | null;
  setInspectedStudent: React.Dispatch<React.SetStateAction<StudentProfile | any | null>>;
  openStudentDashboard: (studentOrId: string | any) => Promise<void>;
  openAdminDashboard: (targetAdmin: {
    role: UserRole;
    name: string;
    email: string;
    collegeId?: string;
    collegeName?: string;
    programName?: string;
    department?: string;
    permissions?: AdminPermission[];
  }) => void;
  returnToOriginalDashboard: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}


export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('auth_token');
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'register_institution'>('login');
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [abandonWarningOpen, setAbandonWarningOpen] = useState(false);
  const abandonWarningOpenRef = useRef<boolean>(abandonWarningOpen);
  abandonWarningOpenRef.current = abandonWarningOpen;
  const confirmSignOutOpenRef = useRef<boolean>(confirmSignOutOpen);
  const [inspectedStudent, setInspectedStudent] = useState<StudentProfile | any | null>(null);

  // Dark Mode Theme state with localStorage persistence & system preference detection
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('crp_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {}
    return 'light';
  });

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('crp_theme', newTheme);
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
      }
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    try {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
      }
    } catch {}
  }, [theme]);
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated);

  const [interviewState, setInterviewState] = useState<InterviewSessionState>({
    isActive: false,
    sessionId: undefined,
    type: 'MOCK_INTERVIEW',
    turnIndex: 0,
    currentDifficulty: 'EASY',
    questions: MOCK_INTERVIEW_QUESTIONS,
    tabSwitches: 0,
    isFlagged: false,
    isDisqualified: false,
    disqualificationReason: undefined,
    orbState: 'SPEAKING',
    liveTranscript: ''
  });
  const interviewStateRef = useRef<InterviewSessionState>(interviewState);
  interviewStateRef.current = interviewState;

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      if (saved) {
        return JSON.parse(saved).role || 'STUDENT';
      }
    } catch {}
    return 'STUDENT';
  });
  const getInitialView = (): AppView => {
    if (typeof window === 'undefined') return 'DASHBOARD';
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === 'activate' || params.has('invite_token')) {
      return 'ACTIVATE_INVITE';
    }
    if (params.has('reset_token')) {
      return 'PASSWORD_RESET';
    }
    const hash = window.location.hash;
    return HASH_TO_VIEW[hash] || 'DASHBOARD';
  };

  const [activeView, setActiveViewState] = useState<AppView>(getInitialView);
  const activeViewRef = useRef<AppView>(activeView);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  const lastBackActionTimeRef = useRef<number>(0);

  const setActiveView = (nextView: AppView, replace: boolean = false) => {
    if (nextView === activeViewRef.current) return;
    activeViewRef.current = nextView;
    setActiveViewState(nextView);
    logger.info('NAV', `View: ${nextView}`);

    const targetHash = VIEW_TO_HASH[nextView] || '#/dashboard';
    try {
      if (replace) {
        window.history.replaceState({ crpApp: true, view: nextView }, '', targetHash);
      } else {
        window.history.pushState({ crpApp: true, view: nextView }, '', targetHash);
      }
    } catch (err) {
      console.warn('History navigation error:', err);
    }
  };

  const triggerBackNavigation = useCallback(() => {
    const now = Date.now();
    if (now - lastBackActionTimeRef.current < 350) return;
    lastBackActionTimeRef.current = now;

    // A. If abandon warning is ALREADY open, KEEP IT OPEN!
    // Do NOT dismiss it, do NOT exit. It requires explicit candidate choice.
    if (abandonWarningOpenRef.current) {
      logger.info('NAV', 'Back action ignored: abandon warning dialog is staying open');
      return;
    }

    // B. If confirm sign out modal is ALREADY open, KEEP IT OPEN!
    if (confirmSignOutOpenRef.current) {
      logger.info('NAV', 'Back action ignored: confirm sign out dialog is staying open');
      return;
    }

    // 1. If any registered content modal is active in modalManager, dismiss it
    if (closeTopModal()) {
      logger.info('NAV', 'Back action: dismissed modal');
      return;
    }

    // 2. Direct modal fallbacks if any were not registered
    if (authModalOpen) {
      setAuthModalOpen(false);
      return;
    }
    if (inspectedStudent) {
      setInspectedStudent(null);
      return;
    }

    // 3. Active assessment session protection (INTERVIEW_ROOM or LISTENING_ROOM):
    // If user is inside an in-progress session, ask warning about forfeiting coin!
    if (
      (activeViewRef.current === 'INTERVIEW_ROOM' || activeViewRef.current === 'LISTENING_ROOM') &&
      !interviewStateRef.current.isCompletedAwaitingEvaluation
    ) {
      logger.info('NAV', 'Back action in active assessment -> opening abandon warning');
      lastBackActionTimeRef.current = Date.now() + 800;
      setAbandonWarningOpen(true);
      return;
    }

    // 4. Sub-view navigation: return to DASHBOARD (matches on-screen "Back to Dashboard" button)
    if (activeViewRef.current !== 'DASHBOARD') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      activeViewRef.current = 'DASHBOARD';
      setActiveViewState('DASHBOARD');
      logger.info('NAV', 'Back action: returned to DASHBOARD');

      try {
        window.history.pushState({ crpApp: true, view: 'DASHBOARD' }, '', '#/dashboard');
      } catch {}
      return;
    }

    // 5. On HOME PAGE (DASHBOARD):
    // When someone tries to go back from the home page, ask for signout to return to landing page!
    if (isAuthenticatedRef.current) {
      logger.info('NAV', 'Back action on home page -> asking for sign out');
      lastBackActionTimeRef.current = Date.now() + 800;
      setConfirmSignOutOpen(true);
    }
  }, [authModalOpen, inspectedStudent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initial = getInitialView();
    const targetHash = VIEW_TO_HASH[initial] || '#/dashboard';

    // Seed root guard if history stack does not have our markers
    if (!window.history.state || (!window.history.state.crpGuard && !window.history.state.crpApp)) {
      window.history.replaceState({ crpGuard: true }, '', window.location.href);
      window.history.pushState({ crpApp: true, view: initial }, '', targetHash);
    }

    const handlePopState = (event: PopStateEvent) => {
      const now = Date.now();
      if (now - lastBackActionTimeRef.current < 300) {
        return;
      }
      lastBackActionTimeRef.current = now;

      // A. If abandon warning is ALREADY open, KEEP IT OPEN! Re-push room hash so history stack stays pinned
      if (abandonWarningOpenRef.current) {
        const roomHash = VIEW_TO_HASH[activeViewRef.current] || '#/dashboard';
        window.history.pushState({ crpApp: true, view: activeViewRef.current }, '', roomHash);
        logger.info('NAV', 'PopState while abandon warning is active -> kept open');
        return;
      }

      // B. If confirm sign out modal is ALREADY open, KEEP IT OPEN! Re-push dashboard hash
      if (confirmSignOutOpenRef.current) {
        window.history.pushState({ crpApp: true, view: 'DASHBOARD' }, '', '#/dashboard');
        logger.info('NAV', 'PopState while sign out modal is active -> kept open');
        return;
      }

      // 1. Modal dismissal on back navigation for normal overlays
      if (closeTopModal()) {
        const targetHash = VIEW_TO_HASH[activeViewRef.current] || '#/dashboard';
        window.history.pushState({ crpApp: true, view: activeViewRef.current }, '', targetHash);
        return;
      }
      if (authModalOpen) {
        setAuthModalOpen(false);
        const targetHash = VIEW_TO_HASH[activeViewRef.current] || '#/dashboard';
        window.history.pushState({ crpApp: true, view: activeViewRef.current }, '', targetHash);
        return;
      }
      if (inspectedStudent) {
        setInspectedStudent(null);
        const targetHash = VIEW_TO_HASH[activeViewRef.current] || '#/dashboard';
        window.history.pushState({ crpApp: true, view: activeViewRef.current }, '', targetHash);
        return;
      }

      // 2. Active assessment room protection on back navigation:
      if (
        (activeViewRef.current === 'INTERVIEW_ROOM' || activeViewRef.current === 'LISTENING_ROOM') &&
        !interviewStateRef.current.isCompletedAwaitingEvaluation
      ) {
        const roomHash = VIEW_TO_HASH[activeViewRef.current] || '#/dashboard';
        window.history.pushState({ crpApp: true, view: activeViewRef.current }, '', roomHash);
        logger.info('NAV', 'Popstate in active assessment -> prompting abandon warning');
        lastBackActionTimeRef.current = Date.now() + 800;
        setAbandonWarningOpen(true);
        return;
      }

      // 3. Guard check: Root guard or outside app boundary
      if (!event.state || event.state.crpGuard || !event.state.crpApp) {
        window.history.pushState({ crpApp: true, view: 'DASHBOARD' }, '', '#/dashboard');
        if (activeViewRef.current !== 'DASHBOARD') {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
          }
          activeViewRef.current = 'DASHBOARD';
          setActiveViewState('DASHBOARD');
        } else {
          // While on the home page (DASHBOARD), asking for signout when user goes back!
          if (isAuthenticatedRef.current) {
            lastBackActionTimeRef.current = Date.now() + 800;
            setConfirmSignOutOpen(true);
          }
        }
        return;
      }

      // 4. Popped view navigation
      const poppedView = event.state.view as AppView;
      if (poppedView && poppedView !== activeViewRef.current) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        activeViewRef.current = poppedView;
        setActiveViewState(poppedView);
      } else if (!poppedView && activeViewRef.current !== 'DASHBOARD') {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        activeViewRef.current = 'DASHBOARD';
        setActiveViewState('DASHBOARD');
      } else if (activeViewRef.current === 'DASHBOARD' && isAuthenticatedRef.current) {
        // Popped back on home page: ask for signout
        lastBackActionTimeRef.current = Date.now() + 800;
        setConfirmSignOutOpen(true);
      }
    };

    // Helper: detect if pointer is inside a horizontally scrollable container with remaining scroll
    const isHorizontallyScrollable = (target: EventTarget | null): boolean => {
      let el = target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.scrollWidth > el.clientWidth + 8 && el.scrollLeft > 10) {
          const overflowX = window.getComputedStyle(el).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') {
            return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    };

    // Trackpad horizontal swipe back detection
    let accumulatedDeltaX = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let gestureCooldown = false;

    const handleWheel = (e: WheelEvent) => {
      // If either confirmation dialog is already open, ignore trackpad gestures entirely!
      if (abandonWarningOpenRef.current || confirmSignOutOpenRef.current) {
        accumulatedDeltaX = 0;
        return;
      }

      if (gestureCooldown) return;

      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // Must be primarily horizontal movement
      if (absX <= absY * 1.2 || absX < 12) {
        return;
      }

      // Only negative deltaX is swiping two fingers to the right (back gesture)
      if (e.deltaX >= 0) {
        accumulatedDeltaX = 0;
        return;
      }

      // Don't intercept if user is scrolling inside an inner horizontal container
      if (isHorizontallyScrollable(e.target)) {
        return;
      }

      accumulatedDeltaX += e.deltaX;

      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        accumulatedDeltaX = 0;
      }, 220);

      // Threshold: accumulated -60 or a single strong flick of -45
      if (accumulatedDeltaX <= -60 || e.deltaX <= -45) {
        accumulatedDeltaX = 0;
        gestureCooldown = true;
        setTimeout(() => {
          gestureCooldown = false;
        }, 450);

        triggerBackNavigation();
      }
    };

    // Touchscreen swipe back support (e.g. Surface or Windows touch displays)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (abandonWarningOpenRef.current || confirmSignOutOpenRef.current) {
        return;
      }

      if (e.changedTouches.length === 1) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - touchStartX;
        const deltaY = endY - touchStartY;
        const duration = Date.now() - touchStartTime;

        if (
          duration < 550 &&
          touchStartX < 90 &&
          deltaX > 70 &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.4
        ) {
          triggerBackNavigation();
        }
      }
    };

    // Keyboard Escape to dismiss modals
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (abandonWarningOpenRef.current) {
          setAbandonWarningOpen(false);
          lastBackActionTimeRef.current = Date.now() + 600;
          e.preventDefault();
          return;
        }
        if (confirmSignOutOpenRef.current) {
          setConfirmSignOutOpen(false);
          lastBackActionTimeRef.current = Date.now() + 600;
          e.preventDefault();
          return;
        }
        if (closeTopModal()) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [triggerBackNavigation]);
  // One-time restore: every account back to 5 coins in this browser (coins live in
  // localStorage). Bump the date to restore everyone again.
  const COINS_RESET_EPOCH = '2026-10-07';
  const restoreAllCoinsOnce = () => {
    try {
      if (localStorage.getItem('crp_coins_reset_epoch') === COINS_RESET_EPOCH) return;
      Object.keys(localStorage)
        .filter(key => key.startsWith('crp_student_coins_') || key.startsWith('crp_zero_coins_time_'))
        .forEach(key => localStorage.removeItem(key));
      localStorage.setItem('crp_coins_reset_epoch', COINS_RESET_EPOCH);
    } catch {}
  };

  const getInitialCoins = (id?: string): number => {
    restoreAllCoinsOnce();
    if (!id) return 5;
    try {
      const saved = localStorage.getItem(`crp_student_coins_${id}`);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) return Math.max(0, parsed);
      }
    } catch {}
    return 5;
  };

  const [student, setStudent] = useState<StudentProfile>(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.role === 'STUDENT') {
          const studentId = u.studentId || u.id || 'stu-21cs1084';
          return {
            id: studentId,
            name: u.name,
            rollNumber: u.rollNumber || '22CS1001',
            email: u.email,
            department: u.department || 'Computer Science & Engineering',
            batchYear: u.batchYear || 2026,
            track: u.track || 'General Track',
            mentorName: 'Dr. S. Ranganathan',
            mentorEmail: 'ranganathan.s@college.edu',
            codingHandles: { leetcodeSolved: 0, githubRepos: 0 },
            resume: null,
            criteriaTasks: INITIAL_CRITERIA_TASKS.map(t => ({ ...t, isCompleted: false, verifiedByMentor: false })),
            recentReports: [],
            coins: getInitialCoins(studentId)
          };
        }
      }
    } catch {}
    const defaultId = DEFAULT_CLEAN_STUDENT.id || 'stu-fresh';
    return {
      ...DEFAULT_CLEAN_STUDENT,
      coins: getInitialCoins(defaultId)
    };
  });

  const [sessionCoinAtStake, setSessionCoinAtStake] = useState<boolean>(false);

  // ── Session coins: the server's credit ledger is the source of truth (charged at
  // start, +2 capped at 5 on fair completion, lost on abandon/disqualification).
  // localStorage only caches the last known balance for the first paint.
  const listeningCoinRefRef = useRef<string | null>(null);

  const applyCoins = (coins: number) => {
    setStudent(prev => {
      const sKey = prev.id || 'stu-21cs1084';
      try {
        localStorage.setItem(`crp_student_coins_${sKey}`, String(coins));
        if (coins > 0) localStorage.removeItem(`crp_zero_coins_time_${sKey}`);
      } catch {}
      return {
        ...prev,
        coins,
        zeroCoinsAt: coins === 0 ? (prev.zeroCoinsAt ?? new Date().toISOString()) : undefined,
      };
    });
  };

  const refreshCoins = async () => {
    try {
      const { coins } = await api.coins.me();
      applyCoins(coins);
    } catch {
      // keep the last known balance
    }
  };

  // Fair completion: the server adds the reward; pick up the new balance
  const restoreSessionCoin = () => {
    setSessionCoinAtStake(false);
    void refreshCoins();
  };

  const settleCompletedSessionCoins = async (
    type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION',
    report?: DiagnosticReport | null
  ) => {
    setSessionCoinAtStake(false);
    if (type === 'LISTENING_COMPREHENSION' && listeningCoinRefRef.current) {
      const sessionRef = listeningCoinRefRef.current;
      listeningCoinRefRef.current = null;
      try {
        applyCoins((await api.coins.complete(sessionRef)).coins);
        return;
      } catch {
        // fall through to a plain refresh
      }
    }
    if (typeof report?.coins === 'number') {
      applyCoins(report.coins);
      return;
    }
    // The completion handler runs just after the final answer — give it a moment
    setTimeout(() => { void refreshCoins(); }, 1500);
  };

  // Abandoned: the coin charged at start is simply not given back
  const forfeitSessionCoin = () => {
    setSessionCoinAtStake(false);
    listeningCoinRefRef.current = null;
    void refreshCoins();
  };

  const requestExitAssessment = () => {
    if (interviewState.isCompletedAwaitingEvaluation) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setActiveView('DASHBOARD');
      return;
    }
    lastBackActionTimeRef.current = Date.now() + 800;
    setAbandonWarningOpen(true);
  };

  const cancelAbandonWarning = () => {
    lastBackActionTimeRef.current = Date.now() + 600;
    setAbandonWarningOpen(false);
  };

  const confirmAbandonSession = () => {
    lastBackActionTimeRef.current = Date.now() + 600;
    setAbandonWarningOpen(false);
    forfeitSessionCoin();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setInterviewState(prev => ({
      ...prev,
      isActive: false,
      orbState: 'IDLE'
    }));
    logger.info('ASSESS', 'Session abandoned: coin forfeited, returned to DASHBOARD');
    setActiveView('DASHBOARD');
  };

  // Only Super Admin can restore all 5 credits when institutional student goes to 0
  const restoreStudentCoinsToFive = async (studentId: string) => {
    try {
      await api.coins.restore(studentId, 5);
    } catch (err) {
      console.warn('Restoring coins on the server failed:', err);
    }
    try {
      localStorage.setItem(`crp_student_coins_${studentId}`, '5');
      localStorage.removeItem(`crp_zero_coins_time_${studentId}`);
    } catch {}

    setStudent(prev => {
      if (prev.id === studentId || prev.rollNumber === studentId) {
        return { ...prev, coins: 5, zeroCoinsAt: undefined };
      }
      return prev;
    });

    setInspectedStudent((prev: any) => {
      if (prev && (prev.id === studentId || prev.rollNumber === studentId)) {
        return { ...prev, coins: 5, zeroCoinsAt: undefined };
      }
      return prev;
    });

    try {
      await api.studentBatch.updateStudentDetails('col-1', studentId, {
        coins: 5
      });
    } catch {}

    logger.info('SUPER_ADMIN', `Super Admin restored all 5 credits for student ${studentId}`);
  };

  // Test / simulation helper for 3-day wait period
  const simulateElapsedCooldown = (studentId: string) => {
    const pastTime = Date.now() - (4 * 24 * 60 * 60 * 1000); // 4 days ago
    try {
      localStorage.setItem(`crp_zero_coins_time_${studentId}`, String(pastTime));
    } catch {}
    restoreStudentCoinsToFive(studentId);
  };

  // Sync coin balance from server whenever the authenticated student changes.
  // Covers the case where the user is already logged in on page load (token in
  // localStorage) and the localStorage-cached coin value is stale.
  useEffect(() => {
    if (isAuthenticated && student.id && currentUser?.role === 'STUDENT') {
      void refreshCoins();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, student.id]);

  // Re-sync coins whenever the tab becomes visible or the window regains focus.
  // This covers manual DB top-ups (e.g. add-coins.js) that happen while the app
  // is already loaded — no logout/reload needed.
  useEffect(() => {
    const sync = () => {
      if (isAuthenticated && currentUser?.role === 'STUDENT') void refreshCoins();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUser?.role]);

  // 3-Day wait period cooldown check for individually registered students
  useEffect(() => {
    const checkIndependentCooldown = () => {
      const isIndep = student.isIndependent || currentUser?.isIndependent || student.department?.includes('Independent') || student.track === 'EXTERNAL';
      if (isIndep && student.coins === 0) {
        const sKey = student.id || 'stu-21cs1084';
        const zeroStored = localStorage.getItem(`crp_zero_coins_time_${sKey}`);
        if (zeroStored) {
          const zeroTimestamp = parseInt(zeroStored, 10);
          const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
          if (!isNaN(zeroTimestamp) && Date.now() - zeroTimestamp >= THREE_DAYS_MS) {
            setStudent(prev => {
              const prevKey = prev.id || 'stu-21cs1084';
              try {
                localStorage.setItem(`crp_student_coins_${prevKey}`, '5');
                localStorage.removeItem(`crp_zero_coins_time_${prevKey}`);
              } catch {}
              return { ...prev, coins: 5, zeroCoinsAt: undefined };
            });
            logger.info('STUDENT', `3-day cooldown elapsed: Replenished 5 credits for independent student ${sKey}`);
          }
        } else {
          localStorage.setItem(`crp_zero_coins_time_${sKey}`, String(Date.now()));
        }
      }
    };

    checkIndependentCooldown();
    const timer = setInterval(checkIndependentCooldown, 5000);
    return () => clearInterval(timer);
  }, [student.isIndependent, student.department, student.track, student.coins, student.id]);
  const [trainerTenures, setTrainerTenures] = useState<TrainerTenure[]>(MOCK_TRAINER_TENURES);
  const [assignments, setAssignments] = useState<InterviewAssignment[]>(MOCK_ASSIGNMENTS);
  const [activeAssignment, setActiveAssignment] = useState<InterviewAssignment | null>(null);
  const [latestReport, setLatestReport] = useState<DiagnosticReport | null>(null);
  const [isEvaluationPending, setIsEvaluationPending] = useState<boolean>(false);
  const [newReportNotification, setNewReportNotification] = useState<{
    reportId: string;
    score: number;
    title: string;
    timestamp: number;
  } | null>(null);

  const dismissNewReportNotification = () => {
    setNewReportNotification(null);
  };
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 'notif-1',
      title: 'Mock Interview Assigned: Full Stack System Architecture',
      message: 'Evaluates clear technical communication, trade-off reasoning, and structured problem solving. Due Oct 05.',
      type: 'ASSIGNMENT_CREATED',
      assignmentId: 'asg-1',
      createdAt: '2026-09-20T10:00:00Z',
      read: false
    },
    {
      id: 'notif-2',
      title: 'Listening Lab Assigned: FinPay Transaction Gateway',
      message: 'Listen closely to transaction settlement flow narrative. Due Oct 08.',
      type: 'ASSIGNMENT_CREATED',
      assignmentId: 'asg-2',
      createdAt: '2026-09-22T11:30:00Z',
      read: false
    },
    {
      id: 'notif-3',
      title: 'Evaluation Completed: Mock Interview Turn',
      message: 'Your score for Full Stack System Architecture is 86%. Recommended: Placement Ready.',
      type: 'SESSION_COMPLETED',
      assignmentId: 'asg-1',
      createdAt: '2026-09-22T10:35:00Z',
      read: true
    }
  ]);

  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const viewAssessmentActivity = () => {
    setActiveView('ASSESSMENT_ACTIVITY');
  };

  const viewAssessmentSubmissions = (asgId: string) => {
    setSelectedAssessmentId(asgId);
    setActiveView('ASSESSMENT_SUBMISSIONS');
  };

  const deleteAssignment = async (id: string): Promise<boolean> => {
    try {
      await api.admin.deleteAssignment(id);
    } catch (e) {
      console.warn('API delete assignment failed, removing locally:', e);
    }
    setAssignments(prev => prev.filter(a => a.id !== id));
    logger.info('ASSIGN', `Revoked assignment: ${id}`);
    return true;
  };

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const list = await api.admin.getAssignments(currentUser?.collegeId);
        if (list && list.length > 0) {
          setAssignments(list);
        }
      } catch (e) {
        console.warn('Failed to load assignments:', e);
      }
    };
    fetchAssignments();
  }, [currentUser?.collegeId]);

  const [disqualifiedAssignmentIds, setDisqualifiedAssignmentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`crp_disqualified_assignments_${student.id || 'stu-21cs1084'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`crp_disqualified_assignments_${student.id || 'stu-21cs1084'}`);
      setDisqualifiedAssignmentIds(saved ? JSON.parse(saved) : []);
    } catch {
      setDisqualifiedAssignmentIds([]);
    }
  }, [student.id]);

  const isAssignmentDisqualified = (assignmentId: string): boolean => {
    if (!assignmentId) return false;
    if (disqualifiedAssignmentIds.includes(assignmentId)) return true;
    const asg = assignments.find(a => a.id === assignmentId);
    if (asg && asg.submissions) {
      return asg.submissions.some(s =>
        (s.studentId === student.id || s.studentRollNumber === student.rollNumber) &&
        (s.status === 'DISQUALIFIED' || s.isDisqualified)
      );
    }
    return false;
  };

  const completeAssignmentSubmission = async (
    assignmentId: string,
    score: number,
    sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' | 'BOTH',
    status: 'COMPLETED' | 'FLAGGED' | 'DISQUALIFIED' = 'COMPLETED',
    reason?: string
  ) => {
    const isDisq = status === 'DISQUALIFIED';
    const submission: AssignmentSubmission = {
      studentId: student.id || 'stu-21cs1084',
      studentName: student.name || 'Aravind Kumar',
      studentRollNumber: student.rollNumber || '21CS1084',
      score: isDisq ? 0 : score,
      sessionType,
      submittedAt: new Date().toISOString(),
      status,
      isDisqualified: isDisq,
      disqualificationReason: reason,
      recommendation: isDisq ? 'DISQUALIFIED' : (score >= 80 ? 'PLACEMENT_READY' : 'ON_TRACK')
    };
    try {
      const res = await api.admin.submitAssignment(assignmentId, submission);
      if (res && res.assignment) {
        setAssignments(prev => prev.map(a => a.id === assignmentId ? res.assignment : a));
      }
    } catch (e) {
      console.warn('Failed to record assignment submission:', e);
      setAssignments(prev => prev.map(a => {
        if (a.id === assignmentId) {
          const subs = a.submissions || [];
          return {
            ...a,
            submissions: [...subs.filter(s => s.studentId !== submission.studentId), submission]
          };
        }
        return a;
      }));
    }

    if (isDisq) {
      const alertNotif: AppNotification = {
        id: `notif-${Date.now()}`,
        title: `Disqualified: ${sessionType === 'LISTENING_COMPREHENSION' ? 'Listening Lab' : 'Mock Interview'}`,
        message: reason || 'Interview terminated due to exceeding tab switch limit (4 tab switches). Re-attending this interview is prohibited.',
        type: 'SYSTEM_ALERT',
        assignmentId,
        createdAt: new Date().toISOString(),
        read: false
      };
      setNotifications(prev => [alertNotif, ...prev]);
    } else {
      const scoreNotif: AppNotification = {
        id: `notif-${Date.now()}`,
        title: `Evaluation Completed: ${sessionType === 'LISTENING_COMPREHENSION' ? 'Listening Lab' : 'Mock Interview'}`,
        message: `Your score is ${score}%. ${score >= 75 ? 'Placement Ready benchmark achieved!' : 'Keep practicing to reach the 75% benchmark.'}`,
        type: 'SESSION_COMPLETED',
        assignmentId,
        createdAt: new Date().toISOString(),
        read: false
      };
      setNotifications(prev => [scoreNotif, ...prev]);
    }
  };

  const disqualifyAssignment = async (assignmentId: string, reason = 'Exceeded maximum permitted tab switches (4 tab switches recorded).') => {
    const studentKey = `crp_disqualified_assignments_${student.id || 'stu-21cs1084'}`;
    const updatedIds = Array.from(new Set([...disqualifiedAssignmentIds, assignmentId]));
    setDisqualifiedAssignmentIds(updatedIds);
    try {
      localStorage.setItem(studentKey, JSON.stringify(updatedIds));
    } catch {}

    const asg = assignments.find(a => a.id === assignmentId);
    await completeAssignmentSubmission(
      assignmentId,
      0,
      asg ? asg.sessionType : 'MOCK_INTERVIEW',
      'DISQUALIFIED',
      reason
    );
  };

  const terminateDisqualifiedSession = async (assignmentId?: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    const reason = 'Exceeded 4 tab switches during proctored interview. Session ended immediately.';
    const targetAsgId = assignmentId || activeAssignment?.id;

    if (targetAsgId) {
      await disqualifyAssignment(targetAsgId, reason);
    }

    const disqReport: DiagnosticReport = {
      id: `rep-disq-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().split('T')[0],
      sessionType: interviewState.type,
      overallScore: 0,
      technicalScore: 0,
      communicationScore: 0,
      averageWpm: 0,
      totalFillerWords: 0,
      fillerWordBreakdown: {},
      skillBreakdown: [
        { skill: 'Proctoring & Exam Integrity', score: 0, status: 'NEEDS_WORK', recommendation: 'Disqualified: Exceeded 4 tab switches limit.' }
      ],
      actionableNextSteps: [
        'Session ended due to exceeding the proctoring threshold (4 tab switches). Re-attending this interview is permanently revoked.'
      ],
      tabSwitches: 4,
      isFlagged: true,
      isDisqualified: true,
      disqualificationReason: reason
    };

    // Disqualified due to exceeding 4 tab switches: coin is forfeited and remains minused
    setSessionCoinAtStake(false);

    setLatestReport(disqReport);
    setStudent(prev => ({
      ...prev,
      recentReports: [disqReport, ...prev.recentReports]
    }));

    setInterviewState(prev => ({
      ...prev,
      isActive: false,
      tabSwitches: 4,
      isFlagged: true,
      isDisqualified: true,
      disqualificationReason: reason,
      orbState: 'IDLE'
    }));
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && interviewState.isActive) {
        const nextSwitches = interviewState.tabSwitches + 1;
        if (nextSwitches >= 4) {
          await terminateDisqualifiedSession(activeAssignment?.id);
        } else {
          setInterviewState(prev => ({
            ...prev,
            tabSwitches: nextSwitches,
            isFlagged: nextSwitches >= 4
          }));
          if (interviewState.sessionId) {
            api.interview.recordProctorEvent(interviewState.sessionId, 'TAB_SWITCH').catch(() => {});
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [interviewState.isActive, interviewState.tabSwitches, interviewState.sessionId, activeAssignment]);

  const startInterview = async (type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' = 'MOCK_INTERVIEW') => {
    if (activeAssignment && isAssignmentDisqualified(activeAssignment.id)) {
      alert("Access Revoked: You have been permanently disqualified from this interview due to exceeding the proctoring limit (4 tab switches). You cannot attend this interview again.");
      return;
    }

    const currentCoins = student.coins ?? 5;
    if (currentCoins < 1) {
      alert("Insufficient Coins: You need at least 1 coin to attend an interview or communication session. Your balance is 0 Coins.");
      return;
    }

    // Request fullscreen while the click's user activation is still valid
    try {
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}

    // Listening sessions are scored in the browser; the server still charges the coin
    if (type === 'LISTENING_COMPREHENSION') {
      try {
        const { sessionRef, coins } = await api.coins.spend('LISTENING_COMPREHENSION');
        listeningCoinRefRef.current = sessionRef;
        applyCoins(coins);
      } catch (err) {
        void refreshCoins();
        if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen().catch(() => {});
        alert(`Could not start the session: ${err instanceof Error ? err.message : 'the server is unavailable'}`);
        return;
      }
      setSessionCoinAtStake(true);
      setActiveView('LISTENING_ROOM');
      setInterviewState({
        isActive: true,
        sessionId: `ses_${Date.now()}`,
        type,
        turnIndex: 0,
        currentDifficulty: 'EASY',
        questions: MOCK_INTERVIEW_QUESTIONS,
        tabSwitches: 0,
        isFlagged: false,
        isDisqualified: false,
        orbState: 'SPEAKING',
        liveTranscript: '',
        isCompletedAwaitingEvaluation: false
      });
      return;
    }

    // Mock interview: the server charges the coin when it creates the session
    setSessionCoinAtStake(true);
    setActiveView('INTERVIEW_ROOM');
    try {
      const data = await api.interview.start(student.id, type, student.resume);
      applyCoins(data.coinsRemaining ?? Math.max(0, currentCoins - 1));
      setInterviewState({
        isActive: true,
        sessionId: data.sessionId,
        type,
        turnIndex: 0,
        currentDifficulty: data.firstQuestion.difficulty,
        questions: [data.firstQuestion],
        tabSwitches: 0,
        isFlagged: false,
        isDisqualified: false,
        orbState: 'SPEAKING',
        liveTranscript: '',
        isCompletedAwaitingEvaluation: false,
        totalTurns: data.maxTurns
      });
    } catch (err) {
      // No fallback to a made-up session. The server only charges a coin for a
      // session it actually created (and refunds it if setup then fails).
      void refreshCoins();
      setSessionCoinAtStake(false);
      setInterviewState(prev => ({ ...prev, isActive: false }));
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setActiveView('DASHBOARD');
      const reason = err instanceof Error ? err.message : 'the interview service is unavailable';
      alert(`Could not start the interview: ${reason}`);
    }
  };

  const completeAssessmentAwaitingEvaluation = async (
    type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION',
    providedReport?: DiagnosticReport | null
  ) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    const wasDisqualified = interviewState.isDisqualified || interviewState.tabSwitches >= 4;
    if (!wasDisqualified) {
      void settleCompletedSessionCoins(type, providedReport);
    } else {
      setSessionCoinAtStake(false);
      listeningCoinRefRef.current = null;
    }

    setInterviewState(prev => ({
      ...prev,
      isActive: false,
      orbState: 'IDLE',
      isCompletedAwaitingEvaluation: true
    }));

    setIsEvaluationPending(true);

    // Simulate asynchronous background LLM evaluation
    setTimeout(async () => {
      let report: DiagnosticReport | null = providedReport || null;

      if (!report && interviewState.sessionId) {
        try {
          report = await api.interview.finalize(interviewState.sessionId);
        } catch (err) {
          console.warn('Finalize error:', err);
        }
      }

      if (!report) {
        const turns = interviewState.questions;
        const turnCount = Math.max(1, turns.length);
        const avgTech = Math.round(turns.reduce((acc, t) => acc + (t.technicalScore || 80), 0) / turnCount);
        const avgComm = Math.round(turns.reduce((acc, t) => acc + (t.communicationScore || 78), 0) / turnCount);
        const avgWpm = Math.round(turns.reduce((acc, t) => acc + (t.wpm || 125), 0) / turnCount);
        const totalFillers = turns.reduce((acc, t) => acc + (t.fillerWords || 0), 0);

        report = {
          id: `rep-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().split('T')[0],
          sessionType: type,
          overallScore: Math.round(avgTech * 0.70 + avgComm * 0.30),
          technicalScore: avgTech,
          communicationScore: avgComm,
          averageWpm: avgWpm,
          totalFillerWords: totalFillers || 2,
          fillerWordBreakdown: { 'uh': Math.max(1, Math.round(totalFillers * 0.5)), 'like': Math.max(1, Math.round(totalFillers * 0.5)) },
          skillBreakdown: [
            { skill: `${student.track || 'General'} Core Competency`, score: avgTech, status: avgTech >= 80 ? 'STRONG' : 'MODERATE', recommendation: 'Consistent conceptual structure throughout the session.' },
            { skill: 'Verbal Delivery & Pacing', score: avgComm, status: avgComm >= 80 ? 'STRONG' : 'MODERATE', recommendation: `Pacing averaged ${avgWpm} WPM.` }
          ],
          actionableNextSteps: [
            `Your average pace was ${avgWpm} WPM. ${avgWpm >= 120 && avgWpm <= 150 ? 'Maintain this recruiter-optimal tempo.' : 'Aim for 120-150 WPM.'}`,
            `Total verbal fillers: ${totalFillers}. Replace verbal fillers with quiet 1-second pauses.`,
            `Articulate architectural trade-offs explicitly with space-time and fault tolerance analysis.`
          ],
          tabSwitches: interviewState.tabSwitches,
          isFlagged: interviewState.isFlagged
        };
      }

      setLatestReport(report);
      setStudent(prev => ({
        ...prev,
        recentReports: [report!, ...prev.recentReports]
      }));

      if (activeAssignment && report) {
        completeAssignmentSubmission(activeAssignment.id, report.overallScore, activeAssignment.sessionType);
      }

      // Add indication to notification list
      const notifId = `notif-${Date.now()}`;
      const newNotif: AppNotification = {
        id: notifId,
        title: type === 'LISTENING_COMPREHENSION' ? 'Listening Lab Evaluation Ready' : 'Interview Evaluation Ready',
        message: 'Your results are ready, click here to view results.',
        type: 'SESSION_COMPLETED',
        reportId: report.id,
        assignmentId: activeAssignment?.id,
        createdAt: new Date().toISOString(),
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);

      // Set banner notification
      setNewReportNotification({
        reportId: report.id,
        score: report.overallScore,
        title: activeAssignment?.title || (type === 'LISTENING_COMPREHENSION' ? 'Listening Comprehension Lab' : 'AI Mock Technical Interview'),
        timestamp: Date.now()
      });

      // Stack newly generated results onto Post-Interview Actionable Improvement Checklist
      try {
        const sKey = student.id || 'stu-21cs1084';
        const saved = localStorage.getItem(`student_improvement_checklist_${sKey}`);
        const currentList: ImprovementChecklistItem[] = saved ? JSON.parse(saved) : [];
        const newItems: ImprovementChecklistItem[] = (report.actionableNextSteps || []).map((step, idx) => ({
          id: `chk_${report!.id}_${idx}_${Date.now()}`,
          week: `Target ${currentList.length + idx + 1}`,
          title: step.length > 50 ? (step.split('.')[0] || step.slice(0, 48)) + '...' : step,
          description: step,
          category: (idx % 2 === 0 ? 'COMMUNICATION' : 'TECHNICAL') as any,
          isCompleted: false
        }));

        if (newItems.length > 0) {
          const updated = [...currentList, ...newItems];
          localStorage.setItem(`student_improvement_checklist_${sKey}`, JSON.stringify(updated));
          window.dispatchEvent(new Event('storage'));
        }
      } catch (err) {
        console.warn('Failed stacking report on checklist:', err);
      }

      setIsEvaluationPending(false);
    }, 4500);
  };

  const submitAnswer = async (answerText: string) => {
    setInterviewState(prev => ({ ...prev, orbState: 'THINKING' }));

    const sessId = interviewState.sessionId || `ses_${Date.now()}`;
    try {
      const res = await api.interview.submitAnswer(sessId, answerText);
      if (res) {
        if (res.isCompleted && res.finalReport) {
          await completeAssessmentAwaitingEvaluation('MOCK_INTERVIEW', res.finalReport);
          return;
        }

        if (res.nextQuestion && res.turnEvaluation) {
          setInterviewState(prev => {
            const updatedQuestions = [...prev.questions];
            updatedQuestions[prev.turnIndex] = res.turnEvaluation!;
            return {
              ...prev,
              turnIndex: prev.turnIndex + 1,
              currentDifficulty: res.nextQuestion!.difficulty as Difficulty,
              questions: [...updatedQuestions, res.nextQuestion!],
              orbState: 'SPEAKING',
              liveTranscript: ''
            };
          });
          return;
        }
      }
    } catch (e) {
      console.warn('[AppContext] Submit turn evaluation error:', e);
    }

    setInterviewState(prev => {
      const currentQ = prev.questions[prev.turnIndex];
      const updatedQ: QuestionTurn = {
        ...currentQ,
        studentAnswer: answerText,
        technicalScore: 85,
        communicationScore: 78,
        wpm: 124,
        fillerWords: 2,
        feedback: 'Good technical reasoning, articulated tradeoffs cleanly.'
      };

      const updatedQuestions = [...prev.questions];
      updatedQuestions[prev.turnIndex] = updatedQ;

      const nextTurn = prev.turnIndex + 1;
      if (nextTurn >= prev.questions.length) {
        setTimeout(() => endInterview(), 500);
        return {
          ...prev,
          questions: updatedQuestions,
          orbState: 'IDLE',
          liveTranscript: '',
          isCompletedAwaitingEvaluation: true
        };
      }

      let nextDifficulty: Difficulty = prev.currentDifficulty;
      if (prev.currentDifficulty === 'EASY') nextDifficulty = 'MEDIUM';
      else if (prev.currentDifficulty === 'MEDIUM') nextDifficulty = 'ADVANCED';

      return {
        ...prev,
        turnIndex: nextTurn,
        currentDifficulty: nextDifficulty,
        questions: updatedQuestions,
        orbState: 'SPEAKING',
        liveTranscript: ''
      };
    });
  };

  const applyLiveInterviewTurn = (turn: {
    transcript: string;
    technicalScore: number;
    communicationScore: number;
    feedback: string;
    strengths: string;
    weaknesses: string;
    nextDifficulty: Difficulty;
    nextQuestionText: string;
    paceWpm?: number;
    fillerCount?: number;
    keyPointsMissed?: string[];
  }) => {
    setInterviewState(previous => {
      const current = previous.questions[previous.turnIndex];
      if (!current) return previous;
      const evaluated: QuestionTurn = {
        ...current,
        studentAnswer: turn.transcript,
        technicalScore: turn.technicalScore,
        communicationScore: turn.communicationScore,
        feedback: turn.feedback,
        strengths: turn.strengths,
        weaknesses: turn.weaknesses,
        wpm: turn.paceWpm,
        fillerWords: turn.fillerCount,
        keyPointsMissed: turn.keyPointsMissed,
      };
      const questions = [...previous.questions];
      questions[previous.turnIndex] = evaluated;

      // The live gateway is authoritative: an empty next question means it has
      // completed the session, otherwise it supplies the next adaptive prompt.
      if (!turn.nextQuestionText) {
        return { ...previous, questions, orbState: 'IDLE', liveTranscript: '', isCompletedAwaitingEvaluation: true };
      }
      const next: QuestionTurn = {
        id: `live_q_${previous.turnIndex + 2}_${Date.now()}`,
        questionNumber: previous.turnIndex + 2,
        questionText: turn.nextQuestionText,
        difficulty: turn.nextDifficulty,
      };
      return {
        ...previous,
        questions: [...questions, next],
        turnIndex: previous.turnIndex + 1,
        currentDifficulty: turn.nextDifficulty,
        orbState: 'SPEAKING',
        liveTranscript: '',
      };
    });
  };

  const endInterview = async () => {
    await completeAssessmentAwaitingEvaluation(interviewState.type);
  };

  const recordTabSwitch = async () => {
    if (!interviewState.isActive) return;
    const newSwitches = interviewState.tabSwitches + 1;
    if (newSwitches >= 4) {
      await terminateDisqualifiedSession(activeAssignment?.id);
      return;
    }

    if (interviewState.sessionId) {
      try {
        await api.interview.recordProctorEvent(interviewState.sessionId, 'TAB_SWITCH');
      } catch {}
    }

    setInterviewState(prev => ({
      ...prev,
      tabSwitches: newSwitches,
      isFlagged: newSwitches >= 4
    }));
  };

  const onboardTrainer = async (trainer: Omit<TrainerTenure, 'id' | 'isActive'>) => {
    try {
      const created = await api.admin.onboardTrainer(trainer);
      setTrainerTenures(prev => [created, ...prev]);
    } catch {
      const newTrainer: TrainerTenure = {
        ...trainer,
        id: `trn-${Date.now()}`,
        isActive: true
      };
      setTrainerTenures(prev => [newTrainer, ...prev]);
    }
  };

  const revokeTrainer = async (id: string) => {
    try {
      await api.admin.revokeTrainer(id);
    } catch {
    }
    setTrainerTenures(prev => prev.map(t => t.id === id ? { ...t, isActive: false } : t));
  };

  const createAssignment = async (asg: Partial<InterviewAssignment>): Promise<InterviewAssignment> => {
    let createdAsg: InterviewAssignment;
    try {
      createdAsg = await api.admin.createAssignment(asg);
    } catch {
      createdAsg = {
        id: `asg-${Date.now()}`,
        title: asg.title || 'Practice Drill',
        sessionType: asg.sessionType || 'MOCK_INTERVIEW',
        assignedByRole: asg.assignedByRole || 'SUPER_ADMIN',
        assignedByName: asg.assignedByName || 'Placement Cell',
        targetScope: asg.targetScope || 'ALL_STUDENTS',
        targetDomainOrTrack: asg.targetDomainOrTrack || 'All Batches',
        dueDate: asg.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        isMandatory: asg.isMandatory ?? true,
        createdAt: new Date().toISOString(),
        submissions: [],
        ...asg
      };
    }
    setAssignments(prev => [createdAsg, ...prev]);

    // Dispatch real-time app notification
    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: `${createdAsg.sessionType === 'LISTENING_COMPREHENSION' ? 'Listening Lab' : createdAsg.sessionType === 'BOTH' ? 'Assessment Combo' : 'Mock Interview'} Assigned: ${createdAsg.title}`,
      message: `Assigned by ${createdAsg.assignedByName || 'Admin'}. Due: ${createdAsg.dueDate}${createdAsg.endTime ? ` at ${createdAsg.endTime}` : ''}.`,
      type: 'ASSIGNMENT_CREATED',
      assignmentId: createdAsg.id,
      createdAt: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);

    return createdAsg;
  };

  const startAssignedSession = async (assignment: InterviewAssignment) => {
    if (isAssignmentDisqualified(assignment.id)) {
      alert("Access Revoked: You have been permanently disqualified from this interview due to exceeding the proctoring limit (4 tab switches). You cannot attend this interview again.");
      return;
    }

    const currentCoins = student.coins ?? 5;
    if (currentCoins < 1) {
      alert("Insufficient Coins: You need at least 1 coin to attend an interview or communication session. Your balance is 0 Coins.");
      return;
    }

    try {
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}

    setActiveAssignment(assignment);
    if (assignment.sessionType === 'LISTENING_COMPREHENSION') {
      await startInterview('LISTENING_COMPREHENSION');
    } else {
      await startInterview('MOCK_INTERVIEW');
    }
  };

  const toggleCriteriaTask = async (taskId: string) => {
    setStudent(prev => ({
      ...prev,
      criteriaTasks: prev.criteriaTasks.map(t =>
        t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t
      )
    }));

    api.tasks.toggleTask(student.id || 'stu-21cs1084', taskId).catch(() => {});
  };

  const verifyCriteriaTask = async (taskId: string) => {
    try {
      await api.tasks.verifyTask(student.id, taskId);
    } catch {
    }
    setStudent(prev => ({
      ...prev,
      criteriaTasks: prev.criteriaTasks.map(t =>
        t.id === taskId ? { ...t, verifiedByMentor: true, verifiedAt: new Date().toISOString().split('T')[0] } : t
      )
    }));
  };

  const uploadResumeData = async (payload: FormData | { resumeText: string; fileName?: string } | ParsedResume): Promise<ParsedResume> => {
    let parsed: ParsedResume;
    try {
      parsed = await api.student.uploadResume(student.id || 'stu-21cs1084', payload);
    } catch {
      if ('skills' in payload && 'projects' in payload) {
        parsed = payload as ParsedResume;
      } else {
        parsed = {
          fileName: 'Uploaded_Resume.pdf',
          parsedAt: new Date().toISOString().split('T')[0],
          summary: 'Full-Stack Developer with hands-on experience in Java, Spring Boot, React, and scalable cloud applications.',
          skills: {
            languages: ['Java', 'TypeScript', 'SQL'],
            frameworks: ['Spring Boot', 'React', 'Tailwind CSS'],
            databases: ['PostgreSQL', 'Redis'],
            tools: ['Git', 'Docker']
          },
          projects: [
            {
              title: 'College Placement Readiness Engine',
              description: 'Real-time diagnostic assessment platform',
              techStack: ['React', 'Node.js', 'PostgreSQL']
            }
          ]
        };
      }
    }
    setStudent(prev => ({ ...prev, resume: parsed }));
    return parsed;
  };

  const updateCodingHandles = async (handles: Partial<CodingHandles>): Promise<void> => {
    setStudent(prev => {
      const updatedHandles: CodingHandles = {
        ...prev.codingHandles,
        ...handles
      };
      try {
        localStorage.setItem(`student_handles_${prev.id}`, JSON.stringify(updatedHandles));
      } catch {}
      return {
        ...prev,
        codingHandles: updatedHandles
      };
    });

    try {
      if (student.id) {
        await api.student.updateCodingHandles(student.id, handles as any);
      }
    } catch {}
  };

  const [selectedProgram, setSelectedProgram] = useState<DynamicProgram | null>(() => {
    try {
      const saved = sessionStorage.getItem('crp_selected_program');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const viewProgramDetail = (prog: DynamicProgram) => {
    setSelectedProgram(prog);
    try {
      sessionStorage.setItem('crp_selected_program', JSON.stringify(prog));
    } catch {}
    setActiveView('PROGRAM_DETAIL');
  };

  const viewProgramLogs = (prog?: DynamicProgram) => {
    if (prog) {
      setSelectedProgram(prog);
      try {
        sessionStorage.setItem('crp_selected_program', JSON.stringify(prog));
      } catch {}
    }
    setActiveView('PROGRAM_LOGS');
  };

  const openAuthModal = (mode: 'login' | 'register' | 'register_institution' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const loginUser = async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    const user = res.user;

    // Backend returns minimal user info: {id, name, email, role}
    // Additional fields are optional and will be undefined for now
    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      studentId: res.studentId || undefined,
      // Optional fields - backend doesn't provide these yet
      collegeId: undefined,
      collegeName: undefined,
      programId: undefined,
      programName: undefined,
      department: undefined,
      className: undefined,
      assignedClassName: undefined,
      assignedClasses: undefined,
      subProgramName: undefined,
      isIndependent: undefined,
      permissions: undefined
    };

    setCurrentUser(authUser);
    setActiveRole(user.role as UserRole);
    setIsAuthenticated(true);
    localStorage.setItem('auth_user', JSON.stringify(authUser));
    setAuthModalOpen(false);
    logger.info('AUTH', `Login: ${authUser.email} (${authUser.role})`);

    if (user.role === 'STUDENT') {
      try {
        const targetId = res.studentId || user.id;
        const prof = await api.student.getProfile(targetId);
        if (prof) {
          setStudent(prof);
          if (prof.recentReports && prof.recentReports.length > 0) {
            setLatestReport(prof.recentReports[0]);
          } else {
            setLatestReport(null);
          }
          // Sync the coin balance from the server right after profile load so
          // the localStorage-cached value is never shown for more than one paint.
          void refreshCoins();
        }
      } catch (err) {
        console.warn('Profile fetch after login:', err);
      }
    } else {
      setLatestReport(null);
    }
  };

  const loginWithAuthUser = (authUser: AuthUser, token?: string) => {
    if (token) api.setToken(token);
    setCurrentUser(authUser);
    setActiveRole(authUser.role);
    setIsAuthenticated(true);
    localStorage.setItem('auth_user', JSON.stringify(authUser));
    setAuthModalOpen(false);
  };

  const registerCandidate = async (data: { name: string; email: string; password?: string }) => {
    const res = await api.auth.registerCandidate(data);
    loginWithAuthUser(res.user, res.token);
    try {
      const prof = await api.student.getProfile(res.studentId);
      if (prof) {
        setStudent(prof);
        setLatestReport(null);
        void refreshCoins();
      }
    } catch (err) {
      console.warn('Profile fetch after candidate register:', err);
    }
  };

  const registerInstitution = async (data: {
    institutionName: string;
    institutionCode: string;
    campusCity: string;
    adminName: string;
    adminEmail: string;
    password?: string;
    contactPhone?: string;
  }) => {
    const res = await api.auth.registerInstitution(data);
    loginWithAuthUser(res.user, res.token);
    logger.info('INSTITUTION', `New institution self-registered: ${res.college.name} (${res.college.code}) by ${res.user.email}`);
    return res;
  };

  const completeInviteActivation = async (token: string, password: string) => {
    const res = await api.invites.completePasswordSetup(token, password);
    loginWithAuthUser(res.user, res.token);
  };

  const registerUser = async (data: any) => {
    const res = await api.auth.register(data);
    const user = res.user;
    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'STUDENT',
      rollNumber: data.rollNumber,
      department: data.department,
      track: data.track || 'General Track',
      studentId: res.studentId
    };
    setCurrentUser(authUser);
    setActiveRole('STUDENT');
    setIsAuthenticated(true);
    localStorage.setItem('auth_user', JSON.stringify(authUser));

    const freshProfile: StudentProfile = {
      id: res.studentId || user.id,
      name: data.name,
      email: data.email,
      rollNumber: data.rollNumber || 'PENDING',
      department: data.department || 'General Engineering',
      batchYear: Number(data.batchYear) || 2026,
      track: data.track || 'General Track',
      mentorName: 'Unassigned',
      mentorEmail: '',
      codingHandles: { leetcodeSolved: 0, githubRepos: 0 },
      resume: null,
      criteriaTasks: INITIAL_CRITERIA_TASKS.map(t => ({ ...t, isCompleted: false, verifiedByMentor: false })),
      recentReports: []
    };
    setStudent(freshProfile);
    setLatestReport(null);
    setAuthModalOpen(false);
  };

  const registerExternalUser = async (data: { name: string; email: string; password: string; department?: string; batchYear?: number }) => {
    return await api.auth.registerExternal(data);
  };

  const verifyEmailAndLogin = async (email: string, code: string) => {
    const res = await api.auth.verifyEmail(email, code);
    const user = res.user;
    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      track: 'EXTERNAL',
      studentId: res.studentId
    };
    setCurrentUser(authUser);
    setActiveRole('STUDENT');
    setIsAuthenticated(true);
    localStorage.setItem('auth_user', JSON.stringify(authUser));
    setAuthModalOpen(false);

    try {
      const targetId = res.studentId || user.id;
      const prof = await api.student.getProfile(targetId);
      if (prof) {
        setStudent(prof);
        setLatestReport(prof.recentReports?.[0] || null);
        void refreshCoins();
      }
    } catch (err) {
      console.warn('Profile fetch after verification:', err);
    }
  };

  const requestSignOut = () => {
    lastBackActionTimeRef.current = Date.now() + 800;
    setConfirmSignOutOpen(true);
  };

  const cancelSignOut = () => {
    lastBackActionTimeRef.current = Date.now() + 600;
    setConfirmSignOutOpen(false);
  };

  const confirmSignOut = () => {
    setConfirmSignOutOpen(false);
    logout();
  };

  const [impersonationSession, setImpersonationSession] = useState<ImpersonationSession | null>(null);

  const openStudentDashboard = async (studentOrId: string | any) => {
    let targetProfile: StudentProfile | null = null;

    if (typeof studentOrId === 'object' && studentOrId !== null) {
      const s = studentOrId;
      targetProfile = {
        id: s.id || `stu-${Date.now()}`,
        name: s.name || 'Candidate',
        rollNumber: s.rollNumber || s.roll_number || '22CS1001',
        email: s.email || `${(s.name || 'student').toLowerCase().replace(/\s+/g, '.')}@college.edu`,
        department: s.department || 'Computer Science & Engineering',
        batchYear: s.batchYear || s.batch_year || 2026,
        track: s.track || s.domain || 'General Track',
        programId: s.programId,
        programName: s.programName,
        subProgramName: s.subProgramName,
        mentorName: s.mentorName || s.mentor_name || 'Dr. S. Ranganathan',
        mentorEmail: s.mentorEmail || s.mentor_email || 'ranganathan.s@college.edu',
        codingHandles: s.codingHandles || { leetcodeSolved: 110, githubRepos: 12 },
        resume: s.resume || null,
        criteriaTasks: s.criteriaTasks || INITIAL_CRITERIA_TASKS,
        improvementChecklist: s.improvementChecklist || [
          { id: 'imp-1', week: 'Week 1', title: 'Speed & Fluency Modulation', description: 'Maintain 130-150 words per minute during system design intros.', isCompleted: true, completedAt: '2026-09-21' },
          { id: 'imp-2', week: 'Week 2', title: 'Database Composite Index Trade-offs', description: 'Articulate B-Tree left-prefix rule without filler words.', isCompleted: true, completedAt: '2026-09-24' },
          { id: 'imp-3', week: 'Week 3', title: 'Microservices Distributed Transaction', description: 'Explain Saga orchestration pattern with failure compensation steps.', isCompleted: false },
          { id: 'imp-4', week: 'Week 4', title: 'FAANG Executive Communication', description: 'Lead end-to-end cloud scalability architectural review under time pressure.', isCompleted: false }
        ],
        recentReports: s.recentReports || [
          {
            id: 'rep-001',
            date: '2026-09-26',
            sessionType: 'MOCK_INTERVIEW',
            overallScore: s.score || s.overallReadiness || 82,
            technicalScore: 86,
            communicationScore: 78,
            averageWpm: 124,
            totalFillerWords: 9,
            fillerWordBreakdown: { 'um': 4, 'like': 3, 'you know': 2 },
            skillBreakdown: [
              { skill: 'Core Technical Proficiency', score: 88, status: 'STRONG', recommendation: 'Clear mastery of architecture' },
              { skill: 'Verbal Fluency & Delivery', score: 76, status: 'MODERATE', recommendation: 'Reduce filler words during transitions' }
            ],
            actionableNextSteps: [
              'Pause 2 seconds before answering rather than saying "um"',
              'Practice explaining trade-offs concisely'
            ],
            tabSwitches: 0,
            isFlagged: false
          }
        ],
        overallReadiness: s.overallReadiness ?? s.score ?? 82,
        coins: getInitialCoins(s.id || s.studentId || s.rollNumber),
        zeroCoinsAt: s.zeroCoinsAt,
        isIndependent: Boolean(s.isIndependent || s.department?.includes('Independent') || s.track === 'EXTERNAL')
      };
    } else {
      const id = String(studentOrId);
      try {
        const p = await api.student.getProfile(id);
        if (p && p.name) targetProfile = p;
      } catch {}

      if (!targetProfile) {
        const all = await api.admin.getUsers({ role: 'STUDENT' }).then(users =>
          users.length > 0 ? users : api.admin.getStudents()
        ).catch(() => api.admin.getStudents());
        const found = all.find((item: any) => item.id === id || item.rollNumber === id);
        if (found) {
          return openStudentDashboard(found);
        }
      }
    }

    if (!targetProfile) {
      console.warn('Could not find student profile for', studentOrId);
      return;
    }

    // Open dedicated Student Management Dashboard modal without switching active user or portal
    setInspectedStudent(targetProfile);
    logger.info('NAV', `Opened student management dashboard: ${targetProfile.name} (${targetProfile.rollNumber})`);
  };

  const openAdminDashboard = (targetAdmin: {
    role: UserRole;
    name: string;
    email: string;
    collegeId?: string;
    collegeName?: string;
    programName?: string;
    department?: string;
    permissions?: AdminPermission[];
  }) => {
    if (!impersonationSession) {
      setImpersonationSession({
        originalUser: currentUser || { id: 'admin', name: 'Admin', email: 'admin@college.edu', role: activeRole },
        originalRole: activeRole,
        originalStudent: student,
        targetUser: {
          id: `usr-${targetAdmin.role.toLowerCase()}-${Date.now()}`,
          name: targetAdmin.name,
          email: targetAdmin.email,
          role: targetAdmin.role,
          collegeId: targetAdmin.collegeId || currentUser?.collegeId,
          collegeName: targetAdmin.collegeName || currentUser?.collegeName,
          programName: targetAdmin.programName,
          department: targetAdmin.department,
          permissions: targetAdmin.permissions
        }
      });
    }

    setCurrentUser({
      id: `usr-${targetAdmin.role.toLowerCase()}-${Date.now()}`,
      name: targetAdmin.name,
      email: targetAdmin.email,
      role: targetAdmin.role,
      collegeId: targetAdmin.collegeId || currentUser?.collegeId,
      collegeName: targetAdmin.collegeName || currentUser?.collegeName,
      programName: targetAdmin.programName,
      department: targetAdmin.department,
      permissions: targetAdmin.permissions
    });
    setActiveRole(targetAdmin.role);
    activeViewRef.current = 'DASHBOARD';
    setActiveViewState('DASHBOARD');
    try {
      window.history.pushState({ crpApp: true, view: 'DASHBOARD' }, '', '#/dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    logger.info('NAV', `Opened admin dashboard: ${targetAdmin.name} (${targetAdmin.role})`);
  };

  const returnToOriginalDashboard = () => {
    if (!impersonationSession) return;
    const { originalUser, originalRole, originalStudent } = impersonationSession;
    setCurrentUser(originalUser);
    setActiveRole(originalRole);
    if (originalStudent) {
      setStudent(originalStudent);
    }
    setImpersonationSession(null);
    activeViewRef.current = 'DASHBOARD';
    setActiveViewState('DASHBOARD');
    try {
      window.history.pushState({ crpApp: true, view: 'DASHBOARD' }, '', '#/dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    logger.info('NAV', `Returned to ${originalRole} dashboard`);
  };

  const logout = async () => {
    logger.info('AUTH', `Sign out: ${currentUser?.email || 'User'}`);

    // Call backend logout
    try {
      await api.auth.logout();
    } catch (error) {
      console.warn('Backend logout error:', error);
      // Continue with local cleanup
    }

    setCurrentUser(null);
    setIsAuthenticated(false);
    setActiveRole('STUDENT');
    setActiveView('DASHBOARD', true);
    setStudent(DEFAULT_CLEAN_STUDENT);
    setLatestReport(null);
    setConfirmSignOutOpen(false);
    setImpersonationSession(null);
  };

  return (
    <AppContext.Provider value={{
      isAuthenticated,
      currentUser,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      confirmSignOutOpen,
      setConfirmSignOutOpen,
      requestSignOut,
      cancelSignOut,
      confirmSignOut,
      abandonWarningOpen,
      requestExitAssessment,
      cancelAbandonWarning,
      confirmAbandonSession,
      loginUser,
      loginWithAuthUser,
      registerUser,
      registerCandidate,
      registerInstitution,
      completeInviteActivation,
      registerExternalUser,
      verifyEmailAndLogin,
      logout,
      activeRole,
      setActiveRole,
      activeView,
      setActiveView,
      triggerBackNavigation,
      student,
      setStudent,
      interviewState,
      startInterview,
      submitAnswer,
      applyLiveInterviewTurn,
      endInterview,
      completeAssessmentAwaitingEvaluation,
      isEvaluationPending,
      newReportNotification,
      dismissNewReportNotification,
      recordTabSwitch,
      latestReport,
      trainerTenures,
      onboardTrainer,
      revokeTrainer,
      assignments,
      createAssignment,
      activeAssignment,
      startAssignedSession,
      completeAssignmentSubmission,
      isAssignmentDisqualified,
      disqualifyAssignment,
      terminateDisqualifiedSession,
      disqualifiedAssignmentIds,
      sessionCoinAtStake,
      restoreSessionCoin,
      forfeitSessionCoin,
      restoreStudentCoinsToFive,
      simulateElapsedCooldown,
      toggleCriteriaTask,
      verifyCriteriaTask,
      uploadResumeData,
      updateCodingHandles,
      selectedProgram,
      setSelectedProgram,
      viewProgramDetail,
      viewProgramLogs,
      deleteAssignment,
      selectedAssessmentId,
      setSelectedAssessmentId,
      viewAssessmentActivity,
      viewAssessmentSubmissions,
      notifications,
      unreadNotificationCount,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      clearNotifications,
      impersonationSession,
      inspectedStudent,
      setInspectedStudent,
      openStudentDashboard,
      openAdminDashboard,
      returnToOriginalDashboard,
      theme,
      setTheme,
      toggleTheme
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
