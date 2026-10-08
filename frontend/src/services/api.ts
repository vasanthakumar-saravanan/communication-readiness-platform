import { 
  StudentProfile, 
  DiagnosticReport, 
  TrainerTenure, 
  InterviewAssignment, 
  AssignmentSubmission, 
  QuestionTurn, 
  ParsedResume,
  CodingHandles,
  College,
  DynamicProgram,
  DynamicDepartment,
  PendingInvite,
  AdminPermission,
  AuthUser,
  DepartmentClass,
  DepartmentStaffMember
} from '../types';
import { 
  DEFAULT_CLEAN_STUDENT,
  INITIAL_STUDENT_PROFILE, 
  INITIAL_CRITERIA_TASKS,
  MOCK_INTERVIEW_QUESTIONS, 
  MOCK_TRAINER_TENURES, 
  MOCK_ASSIGNMENTS, 
  MOCK_MENTEES_LIST,
  LISTENING_PASSAGES,
  MOCK_COLLEGES,
  MOCK_DYNAMIC_DEPARTMENTS,
  MOCK_DYNAMIC_PROGRAMS,
  MOCK_DEPARTMENT_CLASSES,
  MOCK_DEPARTMENT_STAFF
} from '../data/mockData';

function extractPrimarySkillsAndDomain(student: StudentProfile): {
  primaryLanguage: string;
  secondaryTech: string[];
  primaryProject: string;
  domainName: string;
} {
  const resume = student.resume;
  let primaryLanguage = 'Java';
  let secondaryTech = ['PostgreSQL', 'Docker', 'RESTful APIs'];
  let primaryProject = 'Distributed Services Architecture';
  let domainName = student.subProgramName || student.programName || student.specialization || student.department || 'Technical Architecture';

  if (resume?.skills?.languages && resume.skills.languages.length > 0) {
    primaryLanguage = resume.skills.languages[0];
    secondaryTech = [
      ...(resume.skills.frameworks || []),
      ...(resume.skills.databases || []),
      ...(resume.skills.tools || [])
    ].slice(0, 4);
  } else if (domainName.toLowerCase().includes('ai') || domainName.toLowerCase().includes('data')) {
    primaryLanguage = 'Python';
    secondaryTech = ['PyTorch', 'TensorFlow', 'FastAPI', 'Pandas'];
  } else if (domainName.toLowerCase().includes('cyber') || domainName.toLowerCase().includes('security')) {
    primaryLanguage = 'Python / Bash';
    secondaryTech = ['Wireshark', 'Metasploit', 'Cryptography', 'IAM'];
  } else if (domainName.toLowerCase().includes('cloud') || domainName.toLowerCase().includes('devops')) {
    primaryLanguage = 'Go / YAML';
    secondaryTech = ['Kubernetes', 'Terraform', 'AWS', 'Docker'];
  }

  if (resume?.projects && resume.projects.length > 0) {
    primaryProject = resume.projects[0].title;
  }

  return { primaryLanguage, secondaryTech, primaryProject, domainName };
}

function generateDynamicQuestions(student: StudentProfile): QuestionTurn[] {
  const { primaryLanguage, secondaryTech, primaryProject, domainName } = extractPrimarySkillsAndDomain(student);
  const techList = secondaryTech.length > 0 ? secondaryTech.join(', ') : 'modern design patterns';

  return [
    {
      id: `q_1_${Date.now()}`,
      questionNumber: 1,
      questionText: `Walk me through the architecture of your project "${primaryProject}". Specifically, how did you structure the components using ${primaryLanguage} and ${techList}, and what was the main engineering challenge you solved?`,
      difficulty: 'EASY',
      category: 'System Architecture & Core Principles'
    },
    {
      id: `q_2_${Date.now() + 1}`,
      questionNumber: 2,
      questionText: `In the context of ${domainName}, suppose query traffic or concurrent requests spike by 10x. How would you diagnose performance bottlenecks, optimize database query execution, and implement caching or asynchronous processing?`,
      difficulty: 'MEDIUM',
      category: 'Concurrency & Scalability'
    },
    {
      id: `q_3_${Date.now() + 2}`,
      questionNumber: 3,
      questionText: `What happens when network partitions or downstream microservice failures occur in your architecture? Explain how you maintain data consistency, handle error propagation, and implement resilient fallback mechanisms.`,
      difficulty: 'ADVANCED',
      category: 'Resilience & Distributed Trade-offs'
    }
  ];
}

function analyzeSpokenSpeech(text: string, durationSeconds = 18): {
  wordCount: number;
  wpm: number;
  fillers: Record<string, number>;
  totalFillers: number;
  detectedTechTerms: string[];
} {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const effectiveDuration = Math.max(durationSeconds, 6);
  const wpm = Math.max(70, Math.min(210, Math.round((wordCount / effectiveDuration) * 60)));

  const lower = text.toLowerCase();
  const commonFillers = ['uh', 'um', 'like', 'basically', 'actually', 'you know', 'sort of', 'kind of', 'i mean', 'right'];
  const fillers: Record<string, number> = {};
  let totalFillers = 0;

  for (const f of commonFillers) {
    const regex = new RegExp(`\\b${f}\\b`, 'g');
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      fillers[f] = matches.length;
      totalFillers += matches.length;
    }
  }

  const technicalKeywords = [
    'latency', 'throughput', 'concurrency', 'asynchronous', 'cache', 'caching',
    'redis', 'database', 'index', 'indexing', 'kafka', 'partition', 'microservice',
    'cluster', 'docker', 'kubernetes', 'scale', 'scaling', 'load balancer', 'algorithm',
    'architecture', 'tradeoff', 'idempotent', 'resilient', 'failover', 'pipeline',
    'encryption', 'thread', 'memory', 'query', 'payload', 'schema', 'transaction',
    'connection pool', 'distributed', 'event-driven', 'rest', 'api', 'state', 'grpc'
  ];

  const detectedTechTerms = technicalKeywords.filter(k => lower.includes(k));

  return { wordCount, wpm, fillers, totalFillers, detectedTechTerms };
}

function evaluateDynamicAnswer(
  question: QuestionTurn,
  studentAnswer: string,
  turnIndex: number,
  durationSeconds: number,
  student: StudentProfile
): {
  technicalScore: number;
  communicationScore: number;
  wpm: number;
  fillerWords: number;
  fillers: Record<string, number>;
  feedback: string;
  strengths: string;
  weaknesses: string;
  nextQuestionText?: string;
} {
  const { wordCount, wpm, fillers, totalFillers, detectedTechTerms } = analyzeSpokenSpeech(studentAnswer, durationSeconds);

  let technicalScore = 70;
  technicalScore += Math.min(18, detectedTechTerms.length * 4);
  if (wordCount >= 25) technicalScore += 4;
  if (wordCount >= 50) technicalScore += 4;
  if (wordCount < 15) technicalScore -= 10;
  technicalScore = Math.max(62, Math.min(96, technicalScore));

  let communicationScore = 86;
  if (wpm >= 120 && wpm <= 150) {
    communicationScore += 5;
  } else if (wpm < 110) {
    communicationScore -= 8;
  } else if (wpm > 160) {
    communicationScore -= 7;
  }
  communicationScore -= Math.min(18, totalFillers * 3);
  if (/\b(because|specifically|furthermore|in order to|therefore|for instance)\b/i.test(studentAnswer)) {
    communicationScore += 4;
  }
  communicationScore = Math.max(55, Math.min(96, communicationScore));

  const paceVerdict = wpm < 110 ? 'hesitant (<110 WPM)' : wpm > 155 ? 'rapid (>155 WPM)' : 'optimal (120–150 WPM)';
  const feedback = `Articulated at ${wpm} WPM (${paceVerdict}). Detected ${totalFillers} filler words. Technical concepts identified: ${
    detectedTechTerms.length > 0 ? detectedTechTerms.slice(0, 3).join(', ') : 'general conceptual flow'
  }.`;

  const strengths = detectedTechTerms.length > 0
    ? `Strong technical command highlighting ${detectedTechTerms.slice(0, 2).join(' and ')}.`
    : `Good conversational clarity and confident delivery tone.`;

  const topFiller = Object.keys(fillers).sort((a, b) => (fillers[b] || 0) - (fillers[a] || 0))[0];
  const weaknesses = totalFillers > 2
    ? `Watch frequency of verbal crutch "${topFiller}". Replace with deliberate 1-second silence.`
    : wpm < 110
    ? `Pace is slightly measured; practice continuous technical momentum.`
    : `Provide specific quantitative trade-offs (e.g. latency impact in milliseconds).`;

  let nextQuestionText: string | undefined = undefined;
  if (turnIndex === 0) {
    const term = detectedTechTerms[0] || 'your core services';
    nextQuestionText = `You mentioned how you implemented ${term}. In a high-traffic production scenario, how would you optimize data access and prevent latency degradation?`;
  } else if (turnIndex === 1) {
    const term = detectedTechTerms[0] || 'the primary subsystem';
    nextQuestionText = `Considering ${term}, what happens if network partitions occur or dependent downstream services time out? How do you ensure high availability and idempotency?`;
  }

  return {
    technicalScore,
    communicationScore,
    wpm,
    fillerWords: totalFillers,
    fillers,
    feedback,
    strengths,
    weaknesses,
    nextQuestionText
  };
}

function synthesizeDynamicReport(
  sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION',
  turns: QuestionTurn[],
  student: StudentProfile,
  tabSwitches: number
): DiagnosticReport {
  const turnCount = Math.max(1, turns.length);
  const avgTech = Math.round(turns.reduce((acc, t) => acc + (t.technicalScore || 80), 0) / turnCount);
  const avgComm = Math.round(turns.reduce((acc, t) => acc + (t.communicationScore || 78), 0) / turnCount);
  const overallScore = Math.round(avgTech * 0.70 + avgComm * 0.30);
  const avgWpm = Math.round(turns.reduce((acc, t) => acc + (t.wpm || 125), 0) / turnCount);

  const fillerWordBreakdown: Record<string, number> = {};
  let totalFillers = 0;
  turns.forEach(t => {
    totalFillers += (t.fillerWords || 0);
  });
  if (totalFillers === 0) {
    fillerWordBreakdown['uh'] = 1;
    totalFillers = 1;
  } else {
    fillerWordBreakdown['uh'] = Math.max(1, Math.round(totalFillers * 0.4));
    fillerWordBreakdown['like'] = Math.max(1, Math.round(totalFillers * 0.3));
    if (totalFillers > 2) fillerWordBreakdown['actually'] = Math.round(totalFillers * 0.3);
  }

  const { primaryLanguage, domainName } = extractPrimarySkillsAndDomain(student);
  const skillBreakdown = [
    {
      skill: `${primaryLanguage} & Architectural Mastery`,
      score: avgTech,
      status: (avgTech >= 85 ? 'STRONG' : avgTech >= 75 ? 'MODERATE' : 'NEEDS_WORK') as 'STRONG' | 'MODERATE' | 'NEEDS_WORK',
      recommendation: `Demonstrates solid command over ${primaryLanguage} core concurrency and structure.`
    },
    {
      skill: `${domainName} Scalability`,
      score: Math.min(95, Math.max(65, avgTech + (Math.random() > 0.5 ? 3 : -4))),
      status: (avgTech >= 80 ? 'STRONG' : 'MODERATE') as 'STRONG' | 'MODERATE' | 'NEEDS_WORK',
      recommendation: `Good awareness of horizontal scaling patterns and database indexing.`
    },
    {
      skill: 'Verbal Delivery & Speaking Pace',
      score: avgComm,
      status: (avgComm >= 85 ? 'STRONG' : avgComm >= 75 ? 'MODERATE' : 'NEEDS_WORK') as 'STRONG' | 'MODERATE' | 'NEEDS_WORK',
      recommendation: avgWpm >= 120 && avgWpm <= 150
        ? `Speaking pace of ${avgWpm} WPM is within the optimal recruiter hiring zone (120–150 WPM).`
        : `Pace (${avgWpm} WPM) requires modulation to maintain recruiter engagement.`
    },
    {
      skill: 'Distributed Resiliency & Failure Recovery',
      score: Math.max(60, avgTech - 5),
      status: (avgTech >= 82 ? 'STRONG' : 'NEEDS_WORK') as 'STRONG' | 'MODERATE' | 'NEEDS_WORK',
      recommendation: 'Review CAP theorem trade-offs and circuit breaker fallback strategies.'
    }
  ];

  const actionableNextSteps: string[] = [];
  if (avgWpm < 115) {
    actionableNextSteps.push(`Increase spoken momentum: Your pace of ${avgWpm} WPM is slightly slow. Aim for 120–150 WPM.`);
  } else if (avgWpm > 155) {
    actionableNextSteps.push(`Pace down your delivery: Speaking at ${avgWpm} WPM can overwhelm interviewers. Use intentional pauses.`);
  } else {
    actionableNextSteps.push(`Maintain your speaking pace! Your speed of ${avgWpm} WPM is right in the recruiter target band.`);
  }

  if (totalFillers > 3) {
    actionableNextSteps.push(`Reduce vocal fillers: Detected ${totalFillers} filler words. Practice replacing filler words with 1-second silence.`);
  } else {
    actionableNextSteps.push(`Great verbal economy: Very low filler word frequency recorded throughout the interview.`);
  }

  actionableNextSteps.push(`Deepen domain answers for ${domainName} with concrete metrics (e.g. latency reduced by 40ms, 99.9% uptime).`);

  return {
    id: `rep_${Date.now().toString().slice(-4)}`,
    date: new Date().toISOString().split('T')[0],
    sessionType,
    overallScore,
    technicalScore: avgTech,
    communicationScore: avgComm,
    averageWpm: avgWpm,
    totalFillerWords: totalFillers,
    fillerWordBreakdown,
    skillBreakdown,
    actionableNextSteps,
    tabSwitches,
    isFlagged: tabSwitches >= 4
  };
}

// Backend origin for a separately hosted frontend, e.g. https://api.example.com (no /api)
export const API_ORIGIN = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/api$/, '');

function parseParsedData(pd: any, fileName?: string): ParsedResume {
  // Support both old flat schema (skills: string[]) and new structured schema (skills: { languages, ... })
  const skillsRaw = pd.skills;
  const skillsIsObject = skillsRaw && !Array.isArray(skillsRaw) && typeof skillsRaw === 'object';
  return {
    fileName: fileName || pd.name || 'Resume',
    parsedAt: new Date().toISOString().split('T')[0],
    summary: pd.summary || '',
    skills: {
      languages: skillsIsObject ? (skillsRaw.languages || []) : (pd.languages || []),
      frameworks: skillsIsObject ? (skillsRaw.frameworks || []) : (Array.isArray(skillsRaw) ? skillsRaw : []),
      databases: skillsIsObject ? (skillsRaw.databases || []) : [],
      tools: skillsIsObject ? (skillsRaw.tools || []) : [],
    },
    projects: (pd.projects || []).map((p: any) => ({
      title: p.title || '',
      description: p.description || '',
      techStack: p.techStack || p.tech_stack || [],
    })),
    experience: (pd.experience || []).map((e: any) => ({
      title: e.title || '',
      company: e.company || '',
      duration: e.duration || '',
      description: e.description || '',
    })),
    education: (pd.education || []).map((e: any) => ({
      degree: e.degree || '',
      institution: e.institution || '',
      year: e.year || '',
    })),
    certifications: pd.certifications || [],
    phone: pd.phone || undefined,
    email: pd.email || undefined,
    links: pd.links
      ? {
          github: pd.links.github || null,
          linkedin: pd.links.linkedin || null,
          portfolio: pd.links.portfolio || null,
        }
      : undefined,
  };
}

class ApiClient {
  private token: string | null = null;
  // Same-origin '/api' (Vite proxy in dev, nginx in Docker) unless the frontend is hosted
  // separately (e.g. AWS Amplify): then VITE_API_BASE_URL is the backend origin.
  private readonly baseURL = `${API_ORIGIN}/api`;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  // Session coins saved for a student in this browser; new students start with 5
  private storedCoins(studentId: string): number {
    try {
      const saved = parseInt(localStorage.getItem(`crp_student_coins_${studentId}`) ?? '', 10);
      return Number.isNaN(saved) ? 5 : Math.max(0, saved);
    } catch {
      return 5;
    }
  }

  private getStorage<T>(key: string, defaultVal: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  private setStorage<T>(key: string, val: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn(`localStorage save error for ${key}:`, e);
    }
  }

  private async fetchAPI<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: response.statusText
      }));
      if (response.status === 401) {
        // Unauthorized - clear token; surface the server message (e.g. "Invalid email or password")
        this.setToken(null);
        throw new Error(errorData.message || 'Authentication required');
      }
      throw new Error(errorData.message || `API Error: ${response.status}`);
    }

    const body = await response.json();
    return body.data !== undefined ? body.data : body;
  }

  owner = {
    getColleges: async (): Promise<College[]> => {
      try {
        const response = await this.fetchAPI<{ institutions: any[] }>('/owner/institutions');
        // Map backend response to frontend College interface
        return response.institutions.map((inst: any) => ({
          id: inst.id,
          name: inst.name,
          code: inst.code,
          campusCity: inst.campus_city || '',
          createdAt: inst.created_at,
          // These fields will be populated when we fetch detailed info
          superAdminStatus: undefined,
          superAdminEmail: undefined,
          superAdminName: undefined
        }));
      } catch (error) {
        console.error('Failed to fetch institutions:', error);
        // Fallback to empty array instead of mock data
        return [];
      }
    },

    createCollege: async (data: { name: string; code: string; campusCity: string }): Promise<College> => {
      try {
        const response = await this.fetchAPI<{
          institution: any;
        }>('/owner/institutions', {
          method: 'POST',
          body: JSON.stringify({
            name: data.name,
            code: data.code.toUpperCase(),
            type: 'COLLEGE',
            campusCity: data.campusCity
          })
        });

        const inst = response.institution;
        return {
          id: inst.id,
          name: inst.name,
          code: inst.code,
          campusCity: inst.campusCity || inst.campus_city || '',
          createdAt: inst.createdAt || inst.created_at,
          superAdminStatus: 'PENDING_INVITE'
        };
      } catch (error) {
        console.error('Failed to create institution:', error);
        throw error;
      }
    },

    inviteSuperAdmin: async (collegeId: string, data: { firstName: string; lastName: string; email: string }): Promise<{ invite: PendingInvite; inviteUrl: string }> => {
      try {
        const response = await this.fetchAPI<{
          invite: any;
          inviteUrl: string;
        }>(`/owner/institutions/${collegeId}/invite`, {
          method: 'POST',
          body: JSON.stringify(data)
        });

        // Map backend invite to frontend PendingInvite
        const invite: PendingInvite = {
          token: response.invite.token,
          email: response.invite.email,
          firstName: data.firstName,
          lastName: data.lastName,
          name: response.invite.name,
          role: response.invite.role,
          collegeId: response.invite.institutionId,
          collegeName: response.invite.institutionName || '',
          permissions: [],
          createdAt: response.invite.createdAt,
          status: response.invite.status,
          expiresAt: response.invite.expiresAt
        };

        return { invite, inviteUrl: response.inviteUrl };
      } catch (error) {
        console.error('Failed to invite Super Admin:', error);
        throw error;
      }
    },

    getStats: async () => {
      try {
        const response = await this.fetchAPI<{
          totalInstitutions: number;
          totalSuperAdmins: number;
          activeSuperAdmins: number;
          totalStudents: number;
          totalPrograms: number;
          pendingInvites: number;
        }>('/owner/stats');

        return {
          totalColleges: response.totalInstitutions,
          activeSuperAdmins: response.activeSuperAdmins,
          totalStudents: response.totalStudents,
          totalPrograms: response.totalPrograms,
          pendingInvites: response.pendingInvites
        };
      } catch (error) {
        console.error('Failed to fetch platform stats:', error);
        // Return zero values on error
        return {
          totalColleges: 0,
          activeSuperAdmins: 0,
          totalStudents: 0,
          totalPrograms: 0,
          pendingInvites: 0
        };
      }
    },

    deleteCollege: async (collegeId: string): Promise<void> => {
      // Institution deletion is not implemented per team decision
      // See PLATFORM_OWNER_BACKEND_AUDIT_REPORT.md Section 5.2 Operation 12
      throw new Error('Institution deletion requires team architecture decision and is not currently supported. Please contact system administrator.');
    },

    getCollegeProfileMetrics: async (collegeId: string) => {
      try {
        const response = await this.fetchAPI<{
          institution: any;
          metrics: {
            programCount: number;
            studentCount: number;
            departmentCount: number;
          };
          superAdmin: any;
          superAdminStatus: string;
        }>(`/owner/institutions/${collegeId}`);

        // Map backend institution to frontend College interface
        const college: College = {
          id: response.institution.id,
          name: response.institution.name,
          code: response.institution.code,
          campusCity: response.institution.campus_city || '',
          createdAt: response.institution.created_at,
          superAdminStatus: response.superAdminStatus === 'ACTIVE' ? 'ACTIVE' :
                           response.superAdminStatus === 'PENDING_INVITE' ? 'PENDING_INVITE' :
                           undefined,
          superAdminEmail: response.superAdmin?.email,
          superAdminName: response.superAdmin?.name
        };

        // Fetch programs for this institution
        const programsResponse = await this.fetchAPI<{ programs: any[] }>(`/owner/institutions/${collegeId}/programs`);

        return {
          college,
          enrolledStudentsCount: response.metrics.studentCount,
          programsCreated: programsResponse.programs,
          programsCount: response.metrics.programCount,
          totalAssignmentsCount: 0, // Not tracked in backend yet
          tokenUsage: {
            // Token usage not implemented yet - return placeholder
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            audioMinutes: 0,
            whisperHours: 0,
            llmModel: 'Not tracked',
            status: 'Not implemented'
          }
        };
      } catch (error) {
        console.error('Failed to fetch institution metrics:', error);
        throw error;
      }
    }
  };

  college = {
    getDetails: async (collegeId = 'col-1'): Promise<College> => {
      try {
        const response = await this.fetchAPI<{
          institution: any;
          superAdmin: any;
          superAdminStatus: string;
        }>(`/owner/institutions/${collegeId}`);

        return {
          id: response.institution.id,
          name: response.institution.name,
          code: response.institution.code,
          campusCity: response.institution.campus_city || '',
          createdAt: response.institution.created_at,
          superAdminStatus: response.superAdminStatus === 'ACTIVE' ? 'ACTIVE' :
                           response.superAdminStatus === 'PENDING_INVITE' ? 'PENDING_INVITE' :
                           undefined,
          superAdminEmail: response.superAdmin?.email,
          superAdminName: response.superAdmin?.name
        };
      } catch (error) {
        console.error('Failed to fetch institution details:', error);
        // Fallback to localStorage for backward compatibility during transition
        const colleges = this.getStorage<College[]>('platform_colleges', MOCK_COLLEGES);
        return colleges.find(c => c.id === collegeId) || colleges[0];
      }
    },

    getDepartments: async (collegeId = 'col-1'): Promise<DynamicDepartment[]> => {
      try {
        const response = await this.fetchAPI<{ departments: any[] }>(`/owner/institutions/${collegeId}/departments`);
        return response.departments.map((dept: any) => ({
          id: dept.id,
          collegeId: collegeId,
          name: dept.name,
          code: dept.code,
          assignedAdminEmail: dept.assigned_admin_email,
          assignedAdminName: dept.assigned_admin_name,
          adminPermissions: dept.admin_permissions || ['CAN_VIEW_STUDENT_PROGRESS'],
          isActive: dept.is_active
        }));
      } catch (error) {
        console.error('Failed to fetch departments:', error);
        // Fallback to localStorage for backward compatibility
        const depts = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
        return depts.filter(d => d.collegeId === collegeId);
      }
    },

    createDepartment: async (collegeId: string, data: { name: string; code: string; assignedAdminEmail?: string; assignedAdminName?: string; adminPermissions?: AdminPermission[] }): Promise<DynamicDepartment> => {
      const depts = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
      const newDept: DynamicDepartment = {
        id: `dept_${Date.now()}`,
        collegeId,
        name: data.name,
        code: data.code.toUpperCase(),
        assignedAdminEmail: data.assignedAdminEmail,
        assignedAdminName: data.assignedAdminName,
        adminPermissions: data.adminPermissions || ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_MANAGE_STUDENTS']
      };
      depts.push(newDept);
      this.setStorage('platform_departments', depts);
      return newDept;
    },

    bulkCreateDepartments: async (collegeId: string, csvContent: string): Promise<{ created: number; departments: DynamicDepartment[]; errors: string[] }> => {
      const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const depts = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
      const users = this.getStorage<any[]>('college_registered_users', []);
      const newDepts: DynamicDepartment[] = [];
      const errors: string[] = [];

      let startIdx = 0;
      let headerCols: string[] = [];
      if (lines.length > 0) {
        const firstLineLower = lines[0].toLowerCase();
        if (firstLineLower.includes('dept') || firstLineLower.includes('name') || firstLineLower.includes('code') || firstLineLower.includes('admin') || firstLineLower.includes('email')) {
          headerCols = lines[0].split(',').map(c => c.trim().toLowerCase().replace(/["']/g, ''));
          startIdx = 1;
        }
      }

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 2) continue;

        let name = '';
        let code = '';
        let adminName = '';
        let adminEmail = '';

        if (headerCols.length > 0) {
          headerCols.forEach((colName, idx) => {
            const val = cols[idx] || '';
            if (colName.includes('name') && !colName.includes('admin')) name = val;
            else if (colName.includes('code')) code = val;
            else if (colName.includes('admin') && colName.includes('name')) adminName = val;
            else if (colName.includes('admin') && (colName.includes('mail') || colName.includes('email'))) adminEmail = val;
            else if (colName.includes('mail') || colName.includes('email')) adminEmail = val;
          });
        }

        // Positional fallbacks:
        if (!name) name = cols[0] || '';
        if (!code) code = cols[1] || '';
        if (!adminName && cols.length >= 3 && !cols[2].includes('@')) adminName = cols[2];
        if (!adminEmail) {
          const emailCol = cols.find(c => c.includes('@'));
          adminEmail = emailCol || (cols.length >= 4 ? cols[3] : '');
        }

        if (!name.trim() || !code.trim()) {
          errors.push(`Row ${i + 1}: Missing Department Name or Code.`);
          continue;
        }

        const deptCode = code.trim().toUpperCase();
        const deptName = name.trim();

        const exIdx = depts.findIndex(d => d.code.toUpperCase() === deptCode || d.name.toLowerCase() === deptName.toLowerCase());
        const deptId = `dept_${Date.now()}_${i}`;
        const newDeptObj: DynamicDepartment = {
          id: exIdx !== -1 ? depts[exIdx].id : deptId,
          collegeId,
          name: deptName,
          code: deptCode,
          assignedAdminName: adminName.trim() || undefined,
          assignedAdminEmail: adminEmail.trim() || undefined,
          adminPermissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_MANAGE_STUDENTS']
        };

        if (exIdx !== -1) {
          depts[exIdx] = newDeptObj;
        } else {
          depts.push(newDeptObj);
        }
        newDepts.push(newDeptObj);

        if (adminEmail && adminEmail.includes('@')) {
          const userIdx = users.findIndex(u => u.email.toLowerCase().trim() === adminEmail.toLowerCase().trim());
          const userObj = {
            id: `usr_pa_${Date.now()}_${i}`,
            name: adminName.trim() || `${deptName} Counselor`,
            email: adminEmail.toLowerCase().trim(),
            password: 'welcome@2026',
            role: 'PROGRAM_ADMIN' as const,
            collegeId,
            department: deptName,
            permissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_ASSIGN_INTERVIEWS', 'CAN_MANAGE_STUDENTS']
          };
          if (userIdx !== -1) {
            users[userIdx] = { ...users[userIdx], ...userObj };
          } else {
            users.push(userObj);
          }
        }
      }

      this.setStorage('platform_departments', depts);
      this.setStorage('college_registered_users', users);
      return { created: newDepts.length, departments: newDepts, errors };
    },

    updateDepartment: async (collegeId: string, deptId: string, updates: Partial<DynamicDepartment>): Promise<DynamicDepartment> => {
      const depts = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
      const idx = depts.findIndex(d => d.id === deptId);
      if (idx === -1) throw new Error('Department not found.');
      const current = depts[idx];
      const updatedDept: DynamicDepartment = {
        ...current,
        ...updates,
        code: updates.code ? updates.code.toUpperCase().trim() : current.code,
        name: updates.name ? updates.name.trim() : current.name
      };
      depts[idx] = updatedDept;
      this.setStorage('platform_departments', depts);

      // Sync registered user for department admin/counselor
      if (updates.assignedAdminEmail || updates.assignedAdminName || updates.name) {
        const users = this.getStorage<any[]>('college_registered_users', []);
        const uIdx = users.findIndex(u => u.email?.toLowerCase() === (current.assignedAdminEmail || '').toLowerCase());
        if (uIdx !== -1) {
          users[uIdx] = {
            ...users[uIdx],
            name: updates.assignedAdminName ? updates.assignedAdminName.trim() : users[uIdx].name,
            email: updates.assignedAdminEmail ? updates.assignedAdminEmail.toLowerCase().trim() : users[uIdx].email,
            department: updates.name ? updates.name.trim() : users[uIdx].department
          };
          this.setStorage('college_registered_users', users);
        }
      }

      return updatedDept;
    },

    deleteDepartment: async (collegeId: string, deptId: string): Promise<{ success: boolean }> => {
      let depts = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
      const target = depts.find(d => d.id === deptId);
      if (!target) throw new Error('Department not found.');

      const remaining = depts.filter(d => d.id !== deptId);
      this.setStorage('platform_departments', remaining);
      return { success: true };
    },

    getDepartmentStaff: async (departmentName: string, collegeId = 'col-1'): Promise<DepartmentStaffMember[]> => {
      const allStaff = this.getStorage<DepartmentStaffMember[]>('crp_department_staff', MOCK_DEPARTMENT_STAFF);
      const classes = this.getStorage<DepartmentClass[]>('crp_department_classes', MOCK_DEPARTMENT_CLASSES);
      
      const filtered = allStaff.filter(s => 
        !departmentName || 
        departmentName === 'ALL' ||
        s.department.toLowerCase().trim() === departmentName.toLowerCase().trim() ||
        departmentName.toLowerCase().includes(s.department.toLowerCase().trim()) ||
        s.department.toLowerCase().includes(departmentName.toLowerCase().trim())
      );

      // Dynamically compute assigned classes from crp_department_classes
      return filtered.map(s => {
        const assigned = classes.filter(c => 
          c.facultyInCharge && (
            c.facultyInCharge.toLowerCase().trim() === s.name.toLowerCase().trim() ||
            c.facultyInCharge.toLowerCase().includes(s.name.toLowerCase().trim())
          )
        ).map(c => c.name);
        return {
          ...s,
          assignedClasses: assigned.length > 0 ? assigned : (s.assignedClasses || [])
        };
      });
    },

    addDepartmentStaff: async (data: {
      name: string;
      email: string;
      designation: string;
      staffId?: string;
      department: string;
      collegeId?: string;
    }): Promise<{ staff: DepartmentStaffMember; activationLink: string }> => {
      const allStaff = this.getStorage<DepartmentStaffMember[]>('crp_department_staff', MOCK_DEPARTMENT_STAFF);
      const normalizedEmail = data.email.toLowerCase().trim();
      
      const existing = allStaff.find(s => s.email.toLowerCase().trim() === normalizedEmail);
      if (existing) {
        throw new Error(`A staff member with email "${data.email}" is already registered in ${existing.department}.`);
      }

      const token = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newStaff: DepartmentStaffMember = {
        id: `staff_${Date.now()}`,
        name: data.name.trim(),
        email: normalizedEmail,
        designation: data.designation.trim() || 'Faculty Member',
        staffId: data.staffId?.trim() || undefined,
        department: data.department.trim(),
        collegeId: data.collegeId || 'col-1',
        status: 'ACTIVE',
        activationToken: token,
        assignedClasses: [],
        createdAt: new Date().toISOString().split('T')[0]
      };

      allStaff.unshift(newStaff);
      this.setStorage('crp_department_staff', allStaff);

      // Register into college_registered_users with role COUNSELLOR and default password
      const users = this.getStorage<any[]>('college_registered_users', []);
      const uIdx = users.findIndex(u => u.email.toLowerCase().trim() === normalizedEmail);
      const userRecord = {
        id: `usr_${newStaff.id}`,
        name: newStaff.name,
        email: normalizedEmail,
        password: 'welcome@2026',
        role: 'COUNSELLOR',
        collegeId: newStaff.collegeId,
        department: newStaff.department,
        status: 'ACTIVE',
        permissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_ASSIGN_INTERVIEWS']
      };
      if (uIdx !== -1) {
        users[uIdx] = { ...users[uIdx], ...userRecord };
      } else {
        users.push(userRecord);
      }
      this.setStorage('college_registered_users', users);

      const activationLink = `${window.location.origin}?activateToken=${token}&email=${encodeURIComponent(normalizedEmail)}`;
      return { staff: newStaff, activationLink };
    },

    bulkAddDepartmentStaff: async (
      departmentName: string, 
      collegeId: string, 
      csvContent: string
    ): Promise<{ count: number; staff: DepartmentStaffMember[]; errors: string[] }> => {
      const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const allStaff = this.getStorage<DepartmentStaffMember[]>('crp_department_staff', MOCK_DEPARTMENT_STAFF);
      const users = this.getStorage<any[]>('college_registered_users', []);
      const createdStaff: DepartmentStaffMember[] = [];
      const errors: string[] = [];

      let startIdx = 0;
      let headerCols: string[] = [];
      if (lines.length > 0) {
        const first = lines[0].toLowerCase();
        if (first.includes('name') || first.includes('email') || first.includes('designation') || first.includes('staff')) {
          headerCols = lines[0].split(',').map(c => c.trim().toLowerCase().replace(/["']/g, ''));
          startIdx = 1;
        }
      }

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 2) continue;

        let name = '';
        let email = '';
        let designation = 'Assistant Professor';
        let staffId = '';

        if (headerCols.length > 0) {
          headerCols.forEach((col, idx) => {
            const val = cols[idx] || '';
            if (col.includes('name')) name = val;
            else if (col.includes('email') || col.includes('mail')) email = val;
            else if (col.includes('desig') || col.includes('role') || col.includes('title')) designation = val;
            else if (col.includes('id') || col.includes('emp')) staffId = val;
          });
        } else {
          name = cols[0] || '';
          email = cols[1] || '';
          if (cols.length >= 3) designation = cols[2];
          if (cols.length >= 4) staffId = cols[3];
        }

        if (!name.trim()) {
          errors.push(`Row ${i + 1}: Staff name is missing.`);
          continue;
        }
        if (!email.trim() || !email.includes('@')) {
          errors.push(`Row ${i + 1}: Valid email is required for "${name}".`);
          continue;
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existing = allStaff.find(s => s.email.toLowerCase().trim() === normalizedEmail);
        if (existing) {
          errors.push(`Row ${i + 1}: "${normalizedEmail}" is already registered.`);
          continue;
        }

        const token = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const member: DepartmentStaffMember = {
          id: `staff_${Date.now()}_${i}`,
          name: name.trim(),
          email: normalizedEmail,
          designation: designation.trim() || 'Assistant Professor',
          staffId: staffId.trim() || undefined,
          department: departmentName,
          collegeId: collegeId || 'col-1',
          status: 'ACTIVE',
          activationToken: token,
          assignedClasses: [],
          createdAt: new Date().toISOString().split('T')[0]
        };

        allStaff.unshift(member);
        createdStaff.push(member);

        const uIdx = users.findIndex(u => u.email.toLowerCase().trim() === normalizedEmail);
        const userRecord = {
          id: `usr_${member.id}`,
          name: member.name,
          email: normalizedEmail,
          password: 'welcome@2026',
          role: 'COUNSELLOR',
          collegeId,
          department: departmentName,
          status: 'ACTIVE',
          permissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_ASSIGN_INTERVIEWS']
        };
        if (uIdx !== -1) {
          users[uIdx] = { ...users[uIdx], ...userRecord };
        } else {
          users.push(userRecord);
        }
      }

      this.setStorage('crp_department_staff', allStaff);
      this.setStorage('college_registered_users', users);
      return { count: createdStaff.length, staff: createdStaff, errors };
    },

    removeDepartmentStaff: async (staffId: string): Promise<void> => {
      const allStaff = this.getStorage<DepartmentStaffMember[]>('crp_department_staff', MOCK_DEPARTMENT_STAFF);
      const target = allStaff.find(s => s.id === staffId);
      if (!target) return;

      const remaining = allStaff.filter(s => s.id !== staffId);
      this.setStorage('crp_department_staff', remaining);

      // Unlink from registered users
      const users = this.getStorage<any[]>('college_registered_users', []);
      const remainingUsers = users.filter(u => u.email.toLowerCase().trim() !== target.email.toLowerCase().trim());
      this.setStorage('college_registered_users', remainingUsers);
    },

    activateStaffAccount: async (token: string, email: string, password: string): Promise<boolean> => {
      const allStaff = this.getStorage<DepartmentStaffMember[]>('crp_department_staff', MOCK_DEPARTMENT_STAFF);
      const sIdx = allStaff.findIndex(s => s.email.toLowerCase().trim() === email.toLowerCase().trim() || s.activationToken === token);
      if (sIdx !== -1) {
        allStaff[sIdx].status = 'ACTIVE';
        this.setStorage('crp_department_staff', allStaff);
      }

      const users = this.getStorage<any[]>('college_registered_users', []);
      const uIdx = users.findIndex(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
      if (uIdx !== -1) {
        users[uIdx].password = password;
        users[uIdx].status = 'ACTIVE';
        this.setStorage('college_registered_users', users);
      }
      return true;
    },

    getPrograms: async (collegeId = 'col-1'): Promise<DynamicProgram[]> => {
      const progs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      return progs.filter(p => p.collegeId === collegeId);
    },

    createProgram: async (collegeId: string, data: Omit<DynamicProgram, 'id' | 'createdAt'>): Promise<DynamicProgram> => {
      const progs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      const newProg: DynamicProgram = {
        id: `prog_${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString()
      };
      progs.push(newProg);
      this.setStorage('platform_dynamic_programs', progs);
      return newProg;
    },

    updateProgram: async (collegeId: string, progId: string, updates: Partial<DynamicProgram>, verificationCode: string): Promise<DynamicProgram> => {
      const progs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      const idx = progs.findIndex(p => p.id === progId);
      if (idx === -1) throw new Error('Program not found.');
      const current = progs[idx];
      
      const validCode = current.name.trim().toLowerCase();
      const userCode = verificationCode.trim().toLowerCase();
      if (userCode !== validCode && userCode !== 'confirm_modify' && userCode !== current.code.trim().toLowerCase()) {
        throw new Error(`Safeguard Verification Failed: You must enter "${current.name}" or "CONFIRM_MODIFY" to update this live training program.`);
      }

      const updated = { ...current, ...updates };
      progs[idx] = updated;
      this.setStorage('platform_dynamic_programs', progs);
      return updated;
    },

    deleteProgram: async (collegeId: string, progId: string, verificationCode: string): Promise<{ success: boolean }> => {
      const progs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      const target = progs.find(p => p.id === progId);
      if (!target) throw new Error('Program not found.');

      const validCode = target.name.trim().toLowerCase();
      const userCode = verificationCode.trim().toLowerCase();
      if (userCode !== validCode && userCode !== 'confirm_modify' && userCode !== target.code.trim().toLowerCase()) {
        throw new Error(`Safeguard Verification Failed: You must enter "${target.name}" or "CONFIRM_MODIFY" to delete this live training program.`);
      }

      const filtered = progs.filter(p => p.id !== progId);
      this.setStorage('platform_dynamic_programs', filtered);
      return { success: true };
    },

    inviteProgramAdmin: async (collegeId: string, data: { firstName: string; lastName: string; email: string; programId?: string; department?: string; permissions: AdminPermission[] }): Promise<{ invite: PendingInvite; inviteUrl: string }> => {
      const token = `inv_pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      const colleges = this.getStorage<College[]>('platform_colleges', MOCK_COLLEGES);
      const college = colleges.find(c => c.id === collegeId) || colleges[0];

      const invite: PendingInvite = {
        token,
        email: data.email.toLowerCase().trim(),
        firstName: data.firstName,
        lastName: data.lastName,
        name: fullName,
        role: 'PROGRAM_ADMIN',
        collegeId: college.id,
        collegeName: college.name,
        programId: data.programId,
        department: data.department,
        permissions: data.permissions,
        createdAt: new Date().toISOString(),
        status: 'PENDING'
      };

      const invites = this.getStorage<PendingInvite[]>('platform_pending_invites', []);
      invites.push(invite);
      this.setStorage('platform_pending_invites', invites);

      if (data.programId) {
        const progs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
        const pIdx = progs.findIndex(p => p.id === data.programId);
        if (pIdx !== -1) {
          progs[pIdx].assignedAdminEmail = data.email.toLowerCase().trim();
          progs[pIdx].assignedAdminName = fullName;
          progs[pIdx].adminPermissions = data.permissions;
          this.setStorage('platform_dynamic_programs', progs);
        }
      }

      const admins = this.getStorage<any[]>('admin_program_admins', []);
      admins.push({
        id: `pa_${Date.now()}`,
        name: fullName,
        email: data.email.toLowerCase().trim(),
        role: 'PROGRAM_ADMIN',
        collegeId,
        programId: data.programId,
        department: data.department,
        permissions: data.permissions,
        status: 'INVITED',
        createdAt: new Date().toISOString().split('T')[0]
      });
      this.setStorage('admin_program_admins', admins);

      const inviteUrl = `${window.location.origin}/?page=activate&invite_token=${token}`;
      return { invite, inviteUrl };
    },

    bulkUploadProgramAdmins: async (collegeId: string, csvContent: string): Promise<{ created: number; errors: string[] }> => {
      const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let created = 0;
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (i === 0 && lines[i].toLowerCase().includes('email')) continue;
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length < 2) continue;
        const [name, email, targetEntity] = parts;
        if (!email.includes('@')) {
          errors.push(`Row ${i + 1}: Invalid email address ${email}`);
          continue;
        }

        const nameParts = name.split(' ');
        const firstName = nameParts[0] || 'Admin';
        const lastName = nameParts.slice(1).join(' ') || '';

        await this.college.inviteProgramAdmin(collegeId, {
          firstName,
          lastName,
          email,
          department: targetEntity,
          permissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_ASSIGN_INTERVIEWS', 'CAN_MANAGE_STUDENTS']
        });
        created++;
      }

      return { created, errors };
    }
  };

  invites = {
    getAll: async (): Promise<PendingInvite[]> => {
      try {
        const response = await this.fetchAPI<{ invites: any[] }>('/owner/invites');
        // Map backend invites to frontend PendingInvite interface
        return response.invites.map((inv: any) => ({
          token: inv.token,
          email: inv.email,
          firstName: inv.first_name,
          lastName: inv.last_name,
          name: inv.name,
          role: inv.role,
          collegeId: inv.institution_id,
          collegeName: '', // Will need to fetch institution name separately if needed
          programId: inv.program_id,
          department: inv.department,
          permissions: inv.permissions || [],
          createdAt: inv.created_at,
          status: inv.status,
          expiresAt: inv.expires_at
        }));
      } catch (error) {
        console.error('Failed to fetch invites:', error);
        return [];
      }
    },

    getByToken: async (token: string): Promise<PendingInvite | null> => {
      const invites = this.getStorage<PendingInvite[]>('platform_pending_invites', []);
      const found = invites.find(inv => inv.token === token);
      if (found) return found;
      if (token && token.toLowerCase().includes('demo')) {
        return {
          token,
          email: 'admin.new@college.edu',
          role: 'SUPER_ADMIN',
          collegeId: 'col-1',
          collegeName: 'National Institute of Technology',
          name: 'Dr. Sarah Jenkins',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000 * 3).toISOString()
        };
      }
      return null;
    },

    completePasswordSetup: async (token: string, password: string): Promise<{ user: AuthUser; token: string }> => {
      try {
        const response = await this.fetchAPI<{
          token: string;
          user: {
            id: string;
            name: string;
            email: string;
            role: string;
          };
          message: string;
        }>('/auth/accept-invite', {
          method: 'POST',
          body: JSON.stringify({ token, password })
        });

        // Store token
        this.setToken(response.token);

        // Map to AuthUser
        const userRecord: AuthUser = {
          id: response.user.id,
          name: response.user.name,
          email: response.user.email,
          role: response.user.role as any
        };

        localStorage.setItem('auth_user', JSON.stringify(userRecord));

        return { user: userRecord, token: response.token };
      } catch (error) {
        console.error('Failed to accept invitation:', error);
        throw error;
      }
    }
  };

  org = {
    getInstitutions: async (): Promise<any[]> => {
      try {
        const response = await fetch(`${this.baseURL}/org/institutions`);
        if (!response.ok) {
          throw new Error(`Failed to fetch institutions: ${response.statusText}`);
        }
        const data = await response.json();
        return data.items || [];
      } catch (error) {
        console.error('Get institutions error:', error);
        return [];
      }
    },

    getPrograms: async (institutionId?: string): Promise<any[]> => {
      try {
        const params = institutionId ? `?institution_id=${institutionId}` : '';
        const response = await fetch(`${this.baseURL}/org/programs${params}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch programs: ${response.statusText}`);
        }
        const data = await response.json();
        return data.items || [];
      } catch (error) {
        console.error('Get programs error:', error);
        return [];
      }
    },

    getBatches: async (programId?: string): Promise<any[]> => {
      try {
        const params = programId ? `?program_id=${programId}` : '';
        const response = await fetch(`${this.baseURL}/org/batches${params}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch batches: ${response.statusText}`);
        }
        const data = await response.json();
        return data.items || [];
      } catch (error) {
        console.error('Get batches error:', error);
        return [];
      }
    },

    getSubdivisions: async (batchId?: string): Promise<any[]> => {
      try {
        const params = batchId ? `?batch_id=${batchId}` : '';
        const response = await fetch(`${this.baseURL}/org/subdivisions${params}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch subdivisions: ${response.statusText}`);
        }
        const data = await response.json();
        return data.items || [];
      } catch (error) {
        console.error('Get subdivisions error:', error);
        return [];
      }
    }
  };

  studentBatch = {
    bulkImportAndAssignStudents: async (collegeId: string, csvContent: string, defaultBatchYear = 2028): Promise<{ 
      count: number; 
      students: any[]; 
      assignedToProgramCount: number; 
      assignedToDepartmentCount: number; 
      errors: string[] 
    }> => {
      const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const existing = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const registeredUsers = this.getStorage<any[]>('college_registered_users', []);
      const programs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      const departments = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
      const newStudents: any[] = [];
      const errors: string[] = [];
      let assignedToProgramCount = 0;
      let assignedToDepartmentCount = 0;

      let headerCols: string[] = [];
      let startIdx = 0;
      if (lines.length > 0) {
        const firstLineLower = lines[0].toLowerCase();
        if (firstLineLower.includes('name') || firstLineLower.includes('mail') || firstLineLower.includes('email') || firstLineLower.includes('program') || firstLineLower.includes('roll') || firstLineLower.includes('batch')) {
          headerCols = lines[0].split(',').map(c => c.trim().toLowerCase().replace(/["']/g, ''));
          startIdx = 1;
        }
      }

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 2) continue;

        let name = '';
        let email = '';
        let programVal = '';
        let deptVal = '';
        let rollNumber = '';
        let rowBatchYear = defaultBatchYear;

        if (headerCols.length > 0) {
          headerCols.forEach((colName, idx) => {
            const val = cols[idx] || '';
            if (colName.includes('name') && !colName.includes('program') && !colName.includes('dept')) name = val;
            else if (colName.includes('mail') || colName.includes('email')) email = val;
            else if (colName.includes('program')) programVal = val;
            else if (colName.includes('dept') || colName.includes('department')) deptVal = val;
            else if (colName.includes('roll')) rollNumber = val;
            else if (colName.includes('batch')) {
              const parsedBatch = parseInt(val, 10);
              if (!isNaN(parsedBatch) && parsedBatch >= 2000) rowBatchYear = parsedBatch;
            }
          });
        }

        // Positional fallbacks:
        if (!name) name = cols[0] || 'Candidate Student';
        if (!email) {
          const emailCol = cols.find(c => c.includes('@'));
          email = emailCol || (cols[1]?.includes('@') ? cols[1] : (cols[2]?.includes('@') ? cols[2] : ''));
        }
        if (!programVal && cols.length >= 3 && !cols[2].includes('@')) {
          programVal = cols[2];
        }
        if (!deptVal && cols.length >= 4) {
          deptVal = cols[3];
        }
        if (!rollNumber) {
          const rollCol = cols.find(c => /^[0-9]{2}[A-Za-z]{2,4}[0-9]{3,5}$/.test(c));
          rollNumber = rollCol || (cols.length >= 5 ? cols[4] : `22CS${1000 + existing.length + i}`);
        }
        if (cols.length >= 6) {
          const num = parseInt(cols[5], 10);
          if (!isNaN(num) && num >= 2000) rowBatchYear = num;
        }

        if (!email || !email.includes('@')) {
          errors.push(`Row ${i + 1}: Missing or invalid college email address "${email}"`);
          continue;
        }

        const studentId = `stu_${Date.now()}_${i}`;
        let assignedProgramName: string | undefined = undefined;
        let assignedProgramId: string | undefined = undefined;
        let assignedDepartment = deptVal || 'Computer Science & Engineering';
        let track = 'DEPARTMENT';

        // RULE: If program name is present in CSV, assign to that specific program
        if (programVal && programVal.trim().length > 0) {
          const pTrim = programVal.trim();
          const matchedProg = programs.find(p => 
            p.name.toLowerCase() === pTrim.toLowerCase() || 
            p.code.toLowerCase() === pTrim.toLowerCase() ||
            p.name.toLowerCase().includes(pTrim.toLowerCase())
          );
          assignedProgramName = matchedProg ? matchedProg.name : pTrim;
          assignedProgramId = matchedProg ? matchedProg.id : `prog_${Date.now()}_${i}`;
          track = assignedProgramName;
          if (matchedProg?.targetDepartment && !deptVal) {
            assignedDepartment = matchedProg.targetDepartment;
          }
          assignedToProgramCount++;
        } else if (deptVal && deptVal.trim().length > 0) {
          // RULE: Else if department name is given, assign to department
          const dTrim = deptVal.trim();
          const matchedDept = departments.find(d => 
            d.name.toLowerCase() === dTrim.toLowerCase() ||
            d.code.toLowerCase() === dTrim.toLowerCase() ||
            d.name.toLowerCase().includes(dTrim.toLowerCase())
          );
          assignedDepartment = matchedDept ? matchedDept.name : dTrim;
          track = 'DEPARTMENT';
          assignedToDepartmentCount++;
        }

        const studentObj = {
          id: studentId,
          name,
          rollNumber,
          email: email.toLowerCase(),
          collegeId,
          department: assignedDepartment,
          batchYear: rowBatchYear,
          track,
          programName: assignedProgramName,
          programId: assignedProgramId,
          score: 75,
          checklist: '2/5',
          status: 'ON_TRACK',
          mentorName: 'Faculty Counselor',
          mentorEmail: 'counselor@college.edu'
        };

        const exIdx = existing.findIndex(s => 
          (s.email && s.email.toLowerCase() === email.toLowerCase()) ||
          (s.rollNumber && s.rollNumber.toLowerCase() === rollNumber.toLowerCase())
        );

        if (exIdx !== -1) {
          existing[exIdx] = { ...existing[exIdx], ...studentObj, id: existing[exIdx].id };
          newStudents.push(existing[exIdx]);
        } else {
          existing.unshift(studentObj);
          newStudents.push(studentObj);
        }

        registeredUsers.push({
          id: `usr_${studentId}`,
          name,
          email: email.toLowerCase(),
          password: 'student123',
          role: 'STUDENT',
          rollNumber,
          collegeId,
          department: assignedDepartment,
          batchYear: rowBatchYear,
          track,
          programName: assignedProgramName,
          studentId
        });
      }

      this.setStorage('admin_students', existing);
      this.setStorage('college_registered_users', registeredUsers);

      return {
        count: newStudents.length,
        students: newStudents,
        assignedToProgramCount,
        assignedToDepartmentCount,
        errors
      };
    },

    purgeGraduatedBatch: async (collegeId: string, batchYear: number, confirmation: string): Promise<{ purgedCount: number; batchYear: number; message: string }> => {
      const year = Number(batchYear);
      if (isNaN(year) || year < 2000) {
        throw new Error('Invalid graduated batch year.');
      }
      const conf = confirmation.trim().toUpperCase();
      if (conf !== `PURGE ${year}` && conf !== `DELETE ${year}` && conf !== String(year)) {
        throw new Error(`Safeguard Verification Failed: You must type "PURGE ${year}" to confirm permanent removal.`);
      }

      const existingStudents = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const registeredUsers = this.getStorage<any[]>('college_registered_users', []);

      const toPurge = existingStudents.filter(s => Number(s.batchYear) === year);
      const remainingStudents = existingStudents.filter(s => Number(s.batchYear) !== year);

      const purgedStudentIds = new Set(toPurge.map(s => s.id));
      const remainingUsers = registeredUsers.filter(u => {
        if (Number(u.batchYear) === year) return false;
        if (u.studentId && purgedStudentIds.has(u.studentId)) return false;
        return true;
      });

      this.setStorage('admin_students', remainingStudents);
      this.setStorage('college_registered_users', remainingUsers);

      return {
        purgedCount: toPurge.length,
        batchYear: year,
        message: `Successfully purged ${toPurge.length} graduated candidates from Batch ${year}.`
      };
    },

    bulkEnroll: async (collegeId: string, csvContent: string): Promise<{ count: number; students: any[]; errors: string[] }> => {
      const res = await this.studentBatch.bulkImportAndAssignStudents(collegeId, csvContent);
      return {
        count: res.count,
        students: res.students,
        errors: res.errors
      };
    },

    enrollSingle: async (collegeId: string, studentData: {
      name: string;
      rollNumber: string;
      email: string;
      password?: string;
      department: string;
      batchYear?: number;
      programName?: string;
      subProgramName?: string;
    }): Promise<any> => {
      const existing = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const registeredUsers = this.getStorage<any[]>('college_registered_users', []);
      const studentId = `stu_${Date.now()}`;
      const studentObj = {
        id: studentId,
        name: studentData.name.trim(),
        rollNumber: studentData.rollNumber.trim().toUpperCase(),
        email: studentData.email.trim().toLowerCase(),
        collegeId,
        department: studentData.department,
        batchYear: studentData.batchYear || 2026,
        track: studentData.programName ? (studentData.subProgramName ? `${studentData.programName} (${studentData.subProgramName})` : studentData.programName) : 'General Department',
        programName: studentData.programName || undefined,
        subProgramName: studentData.subProgramName || undefined,
        score: 75,
        checklist: '2/5',
        status: 'ON_TRACK',
        mentorName: 'Faculty Counselor',
        mentorEmail: 'counselor@college.edu'
      };

      existing.unshift(studentObj);
      registeredUsers.push({
        id: `usr_${studentId}`,
        name: studentData.name.trim(),
        email: studentData.email.trim().toLowerCase(),
        password: studentData.password || 'welcome@2026',
        role: 'STUDENT',
        rollNumber: studentData.rollNumber.trim().toUpperCase(),
        collegeId,
        department: studentData.department,
        track: studentObj.track,
        studentId
      });

      this.setStorage('admin_students', existing);
      this.setStorage('college_registered_users', registeredUsers);
      return studentObj;
    },

    updateStudentDetails: async (collegeId: string, studentId: string, updates: {
      name?: string;
      rollNumber?: string;
      email?: string;
      department?: string;
      programName?: string;
      programId?: string;
      batchYear?: number;
      className?: string;
      password?: string;
      track?: string;
      status?: string;
      score?: number;
      coins?: number;
      zeroCoinsAt?: string;
    }): Promise<any> => {
      const existing = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const registeredUsers = this.getStorage<any[]>('college_registered_users', []);
      const idx = existing.findIndex(s => 
        s.id === studentId || 
        s.studentId === studentId || 
        (updates.email && s.email?.toLowerCase() === updates.email.toLowerCase())
      );

      let updatedStudent = null;
      if (idx !== -1) {
        existing[idx] = {
          ...existing[idx],
          ...updates,
          name: updates.name ? updates.name.trim() : existing[idx].name,
          rollNumber: updates.rollNumber ? updates.rollNumber.trim().toUpperCase() : existing[idx].rollNumber,
          email: updates.email ? updates.email.trim().toLowerCase() : existing[idx].email,
          programName: updates.programName !== undefined ? updates.programName : existing[idx].programName,
          department: updates.department || existing[idx].department,
          batchYear: updates.batchYear || existing[idx].batchYear,
          className: updates.className !== undefined ? updates.className : existing[idx].className,
          track: updates.programName ? updates.programName : existing[idx].track
        };
        updatedStudent = existing[idx];
        this.setStorage('admin_students', existing);
      }

      const uIdx = registeredUsers.findIndex(u => 
        u.studentId === studentId || 
        u.id === studentId || 
        (updates.email && u.email?.toLowerCase() === updates.email.toLowerCase())
      );
      if (uIdx !== -1) {
        registeredUsers[uIdx] = {
          ...registeredUsers[uIdx],
          name: updates.name || registeredUsers[uIdx].name,
          email: updates.email ? updates.email.toLowerCase() : registeredUsers[uIdx].email,
          department: updates.department || registeredUsers[uIdx].department,
          programName: updates.programName !== undefined ? updates.programName : registeredUsers[uIdx].programName,
          password: updates.password ? updates.password : registeredUsers[uIdx].password
        };
        this.setStorage('college_registered_users', registeredUsers);
      }

      return updatedStudent;
    },

    bulkAssignPrograms: async (collegeId: string, csvContent: string): Promise<{ count: number; updated: any[]; errors: string[] }> => {
      const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const programs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      let count = 0;
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (i === 0 && (lines[i].toLowerCase().includes('roll') || lines[i].toLowerCase().includes('program'))) continue;
        const [identifier, progName, subProg] = lines[i].split(',').map(s => s?.trim());
        if (!identifier || !progName) continue;

        const idClean = identifier.toLowerCase();
        const student = students.find(s => 
          (s.rollNumber && s.rollNumber.toLowerCase() === idClean) || 
          (s.email && s.email.toLowerCase() === idClean)
        );

        if (!student) {
          errors.push(`Student identifier "${identifier}" not found in college student pool.`);
          continue;
        }

        const matchedProg = programs.find(p => p.name.toLowerCase().includes(progName.toLowerCase()) || p.code.toLowerCase() === progName.toLowerCase());

        student.programId = matchedProg?.id || `prog_${Date.now()}`;
        student.programName = matchedProg?.name || progName;
        student.subProgramName = subProg || undefined;
        student.track = subProg ? `${student.programName} (${subProg})` : student.programName;

        count++;
      }

      this.setStorage('admin_students', students);
      return { count, updated: students, errors };
    },

    assignProgramManually: async (studentId: string, programId: string, subProgramName?: string): Promise<any> => {
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const programs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      const student = students.find(s => s.id === studentId);
      if (!student) throw new Error('Student not found');

      const prog = programs.find(p => p.id === programId);
      student.programId = programId;
      student.programName = prog ? prog.name : 'Assigned Program';
      student.subProgramName = subProgramName;
      student.track = subProgramName ? `${student.programName} (${subProgramName})` : student.programName;

      this.setStorage('admin_students', students);
      return student;
    }
  };

  auth = {
    login: async (email: string, password: string) => {
      try {
        // Call real backend authentication
        const response = await this.fetchAPI<{
          token: string;
          user: { id: string; name: string; email: string; role: string };
          studentId: string | null;
        }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        // Store token
        this.setToken(response.token);
        localStorage.setItem('auth_user', JSON.stringify(response.user));

        return {
          user: response.user,
          token: response.token,
          studentId: response.studentId
        };
      } catch (error) {
        console.error('Login error:', error);
        throw new Error(error instanceof Error ? error.message : 'Login failed');
      }
    },

    logout: async () => {
      try {
        // Call backend logout to invalidate token
        await this.fetchAPI('/auth/logout', {
          method: 'POST'
        });
      } catch (error) {
        console.warn('Logout backend call failed:', error);
        // Continue with local cleanup even if backend call fails
      }

      // Clear local storage
      this.setToken(null);
      localStorage.removeItem('auth_user');
    },

    getMe: async () => {
      try {
        const response = await this.fetchAPI<{
          user: { id: string; name: string; email: string; role: string };
          studentId: string | null;
        }>('/auth/me');

        localStorage.setItem('auth_user', JSON.stringify(response.user));
        return response;
      } catch (error) {
        console.error('Get current user error:', error);
        throw error;
      }
    },

    registerCandidate: async (candidateData: { name: string; email: string; password?: string }) => {
      const users = this.getStorage<any[]>('college_registered_users', []);
      const studentId = `cand_${Date.now().toString().slice(-4)}`;
      const newUser: AuthUser = {
        id: `usr_${Date.now()}`,
        name: candidateData.name || 'Independent Candidate',
        email: candidateData.email.toLowerCase().trim(),
        role: 'STUDENT',
        studentId,
        department: 'Independent Study',
        batchYear: 2026,
        track: 'EXTERNAL',
        isIndependent: true
      };

      users.push({ ...newUser, password: candidateData.password });
      this.setStorage('college_registered_users', users);

      const freshProfile: StudentProfile = {
        id: studentId,
        name: newUser.name,
        email: newUser.email,
        rollNumber: `IND-${Math.floor(1000 + Math.random() * 9000)}`,
        department: 'Independent / Self-Registered',
        batchYear: 2026,
        track: 'EXTERNAL',
        isIndependent: true,
        mentorName: 'Self-Paced Practice',
        mentorEmail: 'open@platform.com',
        codingHandles: { leetcodeSolved: 0, githubRepos: 0 },
        resume: null,
        criteriaTasks: DEFAULT_CLEAN_STUDENT.criteriaTasks,
        recentReports: [],
        coins: 5
      };

      this.setStorage(`student_profile_${studentId}`, freshProfile);
      this.setStorage('student_profile', freshProfile);

      const token = `jwt_dyn_${Date.now()}`;
      this.setToken(token);
      localStorage.setItem('auth_user', JSON.stringify(newUser));

      return { user: newUser, token, studentId };
    },

    register: async (userData: any) => {
      const users = this.getStorage<any[]>('college_registered_users', []);
      const studentId = `stu_${Date.now().toString().slice(-4)}`;
      const newUser: AuthUser = {
        id: `usr_${Date.now()}`,
        name: userData.name || 'New Candidate',
        email: userData.email,
        role: userData.role || 'STUDENT',
        studentId,
        department: userData.department || 'Computer Science & Engineering',
        batchYear: userData.batchYear || 2026,
        track: userData.track || 'General Track',
        isIndependent: userData.isIndependent || false
      };

      users.push(newUser);
      this.setStorage('college_registered_users', users);

      const freshProfile: StudentProfile = {
        id: studentId,
        name: newUser.name,
        email: newUser.email,
        rollNumber: userData.rollNumber || `22CS${Math.floor(1000 + Math.random() * 9000)}`,
        department: newUser.department || 'General',
        batchYear: newUser.batchYear || 2026,
        track: newUser.track || 'General Track',
        mentorName: 'Dr. S. Ranganathan',
        mentorEmail: 'ranganathan.s@college.edu',
        codingHandles: { leetcodeSolved: 0, githubRepos: 0 },
        resume: null,
        criteriaTasks: DEFAULT_CLEAN_STUDENT.criteriaTasks,
        recentReports: [],
        coins: 5
      };
      this.setStorage(`student_profile_${studentId}`, freshProfile);
      this.setStorage('student_profile', freshProfile);

      const token = `jwt_dyn_${Date.now()}`;
      this.setToken(token);
      localStorage.setItem('auth_user', JSON.stringify(newUser));

      return { user: newUser, token, studentId };
    },

    registerExternal: async (userData: { name: string; email: string; password?: string; department?: string; batchYear?: number }) => {
      const res = await this.auth.registerCandidate(userData);
      return {
        message: 'Registration verification code generated',
        email: userData.email,
        simulatedVerificationCode: '123456',
        ...res
      };
    },

    verifyEmail: async (email: string, _code: string) => {
      return this.auth.registerCandidate({ name: email.split('@')[0], email });
    },

    requestPasswordReset: async (email: string) => {
      const response = await fetch(`${this.baseURL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to request password reset');
      }
      return {
        success: true,
        email,
        message: data.message || 'If an account with that email exists, a password reset link has been sent.'
      };
    },

    resetPassword: async (data: { token: string; newPassword: string }) => {
      const response = await fetch(`${this.baseURL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to reset password');
      }
      return {
        success: true,
        message: result.message || 'Password reset successful. You can now log in with your new password.'
      };
    },

    registerInstitution: async (data: {
      institutionName: string;
      institutionCode: string;
      campusCity: string;
      adminName: string;
      adminEmail: string;
      password?: string;
      contactPhone?: string;
    }): Promise<{ college: College; user: AuthUser; token: string }> => {
      const cleanInstName = data.institutionName.trim();
      const cleanInstCode = data.institutionCode.toUpperCase().trim();
      const cleanCity = data.campusCity.trim();
      const cleanAdminName = data.adminName.trim();
      const cleanAdminEmail = data.adminEmail.toLowerCase().trim();
      const pwd = (data.password && data.password.trim()) || 'admin123';

      if (!cleanInstName) throw new Error('Institution name is required.');
      if (!cleanInstCode) throw new Error('Institution short code is required.');
      if (!cleanCity) throw new Error('Campus city or location is required.');
      if (!cleanAdminName) throw new Error('Administrator name is required.');
      if (!cleanAdminEmail || !cleanAdminEmail.includes('@')) {
        throw new Error('A valid administrator email address is required.');
      }

      const colleges = this.getStorage<College[]>('platform_colleges', MOCK_COLLEGES);
      const existingCollege = colleges.find(c => 
        c.name.toLowerCase() === cleanInstName.toLowerCase() ||
        c.code.toLowerCase() === cleanInstCode.toLowerCase()
      );
      if (existingCollege) {
        throw new Error(`An institution with name "${cleanInstName}" or code "${cleanInstCode}" is already registered.`);
      }

      const users = this.getStorage<any[]>('college_registered_users', []);
      const existingUser = users.find(u => u.email.toLowerCase().trim() === cleanAdminEmail);
      if (existingUser) {
        throw new Error(`An account with email "${cleanAdminEmail}" is already registered. Please sign in or use a different administrator email.`);
      }

      const collegeId = `col-${Date.now()}`;
      const newCollege: College = {
        id: collegeId,
        name: cleanInstName,
        code: cleanInstCode,
        campusCity: cleanCity,
        createdAt: new Date().toISOString(),
        superAdminEmail: cleanAdminEmail,
        superAdminName: cleanAdminName,
        superAdminStatus: 'ACTIVE'
      };
      colleges.push(newCollege);
      this.setStorage('platform_colleges', colleges);

      // Create foundational departments for this institution
      const depts = this.getStorage<DynamicDepartment[]>('platform_departments', MOCK_DYNAMIC_DEPARTMENTS);
      const initialDepts: DynamicDepartment[] = [
        { id: `dept_${Date.now()}_1`, collegeId, name: 'Computer Science & Engineering', code: 'CSE', adminPermissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_MANAGE_STUDENTS'] },
        { id: `dept_${Date.now()}_2`, collegeId, name: 'Information Technology', code: 'IT', adminPermissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_MANAGE_STUDENTS'] },
        { id: `dept_${Date.now()}_3`, collegeId, name: 'Electronics & Communication Engineering', code: 'ECE', adminPermissions: ['CAN_VIEW_STUDENT_PROGRESS'] }
      ];
      this.setStorage('platform_departments', [...depts, ...initialDepts]);

      // Create Super Admin user record
      const userRecord: AuthUser = {
        id: `usr_sup_${Date.now()}`,
        name: cleanAdminName,
        email: cleanAdminEmail,
        role: 'SUPER_ADMIN',
        collegeId,
        collegeName: cleanInstName,
        permissions: ['CAN_VIEW_STUDENT_PROGRESS', 'CAN_ASSIGN_INTERVIEWS', 'CAN_ASSIGN_LISTENING', 'CAN_MANAGE_STUDENTS']
      };
      users.push({ ...userRecord, password: pwd });
      this.setStorage('college_registered_users', users);

      const token = `jwt_dyn_${Date.now()}`;
      this.setToken(token);
      localStorage.setItem('auth_user', JSON.stringify(userRecord));

      return {
        college: newCollege,
        user: userRecord,
        token
      };
    },

    me: async () => {
      const saved = localStorage.getItem('auth_user');
      if (saved) {
        const u = JSON.parse(saved);
        return { user: u, studentId: u.studentId || 'stu-21cs1084' };
      }
      return {
        user: { id: 'usr_guest', name: 'Aravind Kumar', email: 'aravind.k@college.edu', role: 'STUDENT' },
        studentId: 'stu-21cs1084'
      };
    }
  };

  student = {
    getProfile: async (studentId?: string): Promise<StudentProfile> => {
      try {
        // Call real backend API
        const endpoint = studentId ? `/students/${studentId}` : '/students/me';
        const response = await this.fetchAPI<{ student: any }>(endpoint);
        const s = response.student;

        // Map backend response to frontend StudentProfile model
        const profile: StudentProfile = {
          id: s.id,
          name: s.name,
          email: s.email,
          rollNumber: s.roll_number || '',
          department: s.department || 'Computer Science & Engineering',
          batchYear: s.batch_year || 2026,
          track: s.track || 'General Track',
          programId: s.program_id,
          programName: s.program_name,
          subProgramName: s.sub_program_name,
          mentorName: s.mentor_name || 'Not Assigned',
          mentorEmail: s.mentor_email || '',
          codingHandles: s.coding_handles || { leetcodeSolved: 0, githubRepos: 0 },
          resume: s.resume_parsed_data
            ? parseParsedData(s.resume_parsed_data, s.resume_file_name)
            : null,
          criteriaTasks: INITIAL_CRITERIA_TASKS, // Backend doesn't have this yet
          improvementChecklist: [], // Backend doesn't have this yet
          recentReports: s.recent_reports || [],
          overallReadiness: s.overall_readiness || 0,
          // The server profile has no coin balance; coins are kept per student in this
          // browser (default 5). Falling back to 0 here emptied every account on login.
          coins: typeof s.coins === 'number' ? s.coins : this.storedCoins(s.id)
        };

        // Cache in localStorage as backup
        this.setStorage(`student_profile_${profile.id}`, profile);
        return profile;
      } catch (error) {
        console.error('Failed to fetch student profile from backend:', error);

        // Fallback to localStorage if backend fails
        const key = studentId ? `student_profile_${studentId}` : 'student_profile';
        const stored = localStorage.getItem(key);
        if (stored) {
          try { return JSON.parse(stored); } catch {}
        }

        // Last resort: return initial profile
        return INITIAL_STUDENT_PROFILE;
      }
    },

    // LeetCode stats are fetched server-side (leetcode.com blocks browser/CORS requests)
    leetcodeStats: async (username: string): Promise<{ username: string; solved: number }> =>
      this.fetchAPI(`/students/coding-stats/leetcode/${encodeURIComponent(username)}`),

    updateProfile: async (studentId: string, updates: Partial<StudentProfile>): Promise<StudentProfile> => {
      try {
        // Update via backend API
        const response = await this.fetchAPI<{ student: any }>(`/students/${studentId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });

        const updated = await this.student.getProfile(studentId);
        return updated;
      } catch (error) {
        console.error('Failed to update student profile:', error);

        // Fallback to localStorage
        const current = await this.student.getProfile(studentId);
        const updated = { ...current, ...updates };
        this.setStorage(`student_profile_${studentId}`, updated);
        this.setStorage('student_profile', updated);
        return updated;
      }
    },

    updateCodingHandles: async (studentId: string, handles: CodingHandles): Promise<void> => {
      try {
        // Update via backend API
        await this.fetchAPI(`/students/${studentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ codingHandles: handles }),
        });

        // Update localStorage cache
        const current = await this.student.getProfile(studentId);
        current.codingHandles = { ...current.codingHandles, ...handles };
        this.setStorage(`student_profile_${studentId}`, current);
        this.setStorage('student_profile', current);
      } catch (error) {
        console.error('Failed to update coding handles:', error);

        // Fallback to localStorage only
        const current = await this.student.getProfile(studentId);
        current.codingHandles = { ...current.codingHandles, ...handles };
        this.setStorage(`student_profile_${studentId}`, current);
        this.setStorage('student_profile', current);
      }
    },

    uploadResume: async (
      studentId: string,
      payload: FormData | { resumeText: string; fileName?: string } | ParsedResume
    ): Promise<ParsedResume> => {
      try {
        // If payload is FormData, upload to backend
        if (payload instanceof FormData) {
          const headers: HeadersInit = {};
          if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
          }

          const response = await fetch(`${this.baseURL}/students/${studentId}/resume`, {
            method: 'PATCH',
            headers,
            body: payload, // Don't set Content-Type, let browser set multipart boundary
          });

          if (!response.ok) {
            throw new Error(`Resume upload failed: ${response.statusText}`);
          }

          const data = await response.json();
          const pd = data?.data?.parsedData;

          // Use parsed_data returned directly in the upload response (parsed synchronously by AI service).
          if (pd) {
            return parseParsedData(pd, data?.data?.fileName);
          }

          // Fallback: refresh profile (e.g. if AI service was slow/unavailable)
          const updated = await this.student.getProfile(studentId);
          return updated.resume || {
            fileName: data?.data?.fileName || 'Uploaded Resume',
            parsedAt: new Date().toISOString().split('T')[0],
            summary: 'Resume uploaded successfully. Parsing in progress.',
            skills: { languages: [], frameworks: [], databases: [], tools: [] },
            projects: []
          };
        }

        // Otherwise, use client-side parsing (fallback/mock behavior)
        let parsed: ParsedResume;

        if ('skills' in payload && 'projects' in payload) {
          parsed = payload as ParsedResume;
        } else {
          const rawText = (payload as any)?.resumeText || '';
          const fileName = (payload as any)?.fileName || 'Uploaded_Resume.pdf';

          const extractedLanguages: string[] = [];
          const langMap = ['Python', 'Java', 'TypeScript', 'JavaScript', 'C++', 'Go', 'Rust', 'SQL', 'C#', 'PHP'];
          langMap.forEach(l => {
            if (new RegExp(`\\b${l}\\b`, 'i').test(rawText)) extractedLanguages.push(l);
          });

          const extractedFrameworks: string[] = [];
          const frameMap = ['React', 'Node.js', 'Spring Boot', 'FastAPI', 'Express', 'Django', 'Docker', 'Kubernetes', 'Tailwind', 'Next.js', 'PyTorch', 'TensorFlow'];
          frameMap.forEach(f => {
            if (new RegExp(`\\b${f.replace('.', '\\.')}\\b`, 'i').test(rawText)) extractedFrameworks.push(f);
          });

          parsed = {
            fileName,
            parsedAt: new Date().toISOString().split('T')[0],
            summary: extractedLanguages.length > 0
              ? `Specialized candidate with expertise in ${extractedLanguages.join(', ')}${extractedFrameworks.length > 0 ? ' and ' + extractedFrameworks.slice(0, 3).join(', ') : ''}.`
              : rawText.trim() ? 'Resume parsed. Please review extracted information.' : 'No content extracted from resume.',
            skills: {
              languages: extractedLanguages, // CRITICAL FIX: Empty array if no extraction (no fake data)
              frameworks: extractedFrameworks, // CRITICAL FIX: Empty array if no extraction (no fake data)
              databases: [], // CRITICAL FIX: Empty, not fake data
              tools: [] // CRITICAL FIX: Empty, not fake data
            },
            projects: [] // CRITICAL FIX: Empty projects, not fake data
          };
        }

        const current = await this.student.getProfile(studentId);
        current.resume = parsed;
        this.setStorage(`student_profile_${studentId}`, current);
        this.setStorage('student_profile', current);
        return parsed;
      } catch (error) {
        console.error('Failed to upload resume:', error);
        throw error;
      }
    },

    getResume: async (studentId: string): Promise<{ id?: string; fileName?: string; parsedData?: any; parsedAt?: string } | null> => {
      try {
        const response = await this.request<{ id?: string; fileName?: string; parsedData?: any; parsedAt?: string }>(`/students/${studentId}/resume`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        // Resume doesn't exist yet - return null
        console.log('No resume found for student');
        return null;
      }
    }
  };

  tasks = {
    toggleTask: async (studentId: string, taskId: string): Promise<boolean> => {
      const current = await this.student.getProfile(studentId);
      let isCompleted = false;
      current.criteriaTasks = current.criteriaTasks.map(t => {
        if (t.id === taskId) {
          isCompleted = !t.isCompleted;
          return { ...t, isCompleted };
        }
        return t;
      });
      this.setStorage(`student_profile_${studentId}`, current);
      this.setStorage('student_profile', current);
      return isCompleted;
    },

    verifyTask: async (studentId: string, taskId: string): Promise<void> => {
      const current = await this.student.getProfile(studentId);
      current.criteriaTasks = current.criteriaTasks.map(t => {
        if (t.id === taskId) {
          return { ...t, verifiedByMentor: true, verifiedAt: new Date().toISOString().split('T')[0] };
        }
        return t;
      });
      this.setStorage(`student_profile_${studentId}`, current);
      this.setStorage('student_profile', current);
    }
  };

  interview = {
    // The server identifies the student from the JWT; studentId is kept for call-site compatibility.
    // The parsed resume grounds the interviewer's questions in the candidate's own projects.
    start: async (
      _studentId: string,
      type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' | 'PRACTICE' = 'MOCK_INTERVIEW',
      resume?: ParsedResume | null
    ): Promise<{ sessionId: string; firstQuestion: QuestionTurn; maxTurns?: number; coinsRemaining?: number }> => {
      const skills = resume ? [
        ...(resume.skills?.languages || []),
        ...(resume.skills?.frameworks || []),
        ...(resume.skills?.databases || []),
        ...(resume.skills?.tools || []),
      ] : [];
      const projects = (resume?.projects || []).map(p => ({
        title: p.title,
        techStack: p.techStack || [],
        description: p.description || '',
      }));
      const response = await this.fetchAPI<any>('/interview/sessions', {
        method: 'POST',
        body: JSON.stringify({
          sessionType: type,
          ...(skills.length || projects.length ? { resume: { skills: skills.slice(0, 40), projects: projects.slice(0, 10) } } : {})
        })
      });
      const session = response.session || response;
      const question = response.firstQuestion || response.question || session.firstQuestion || session.currentQuestion;
      if (!session.sessionId || !question) {
        throw new Error('The interview service did not return an initial question.');
      }
      return {
        sessionId: session.sessionId,
        maxTurns: session.maxTurns,
        coinsRemaining: session.coinsRemaining,
        firstQuestion: {
          id: question.id || question.questionId,
          questionNumber: question.questionNumber || question.sequenceNo || 1,
          questionText: question.questionText || question.question_text,
          difficulty: question.difficulty || 'EASY',
          category: question.category
        }
      };
    },

    recordProctorEvent: async (sessionId: string, _eventType: 'TAB_SWITCH' | 'FULLSCREEN_EXIT') => {
      const sess = this.getStorage<any>(`interview_${sessionId}`, { tabSwitches: 0 });
      sess.tabSwitches = (sess.tabSwitches || 0) + 1;
      const isFlagged = sess.tabSwitches >= 4;
      this.setStorage(`interview_${sessionId}`, sess);
      return { tabSwitches: sess.tabSwitches, isFlagged };
    },

    submitAnswer: async (sessionId: string, studentAnswer: string, durationSeconds = 20) => {
      const sess = this.getStorage<any>(`interview_${sessionId}`, {
        turnIndex: 0,
        questions: [],
        plannedTurns: [],
        tabSwitches: 0
      });

      const student = await this.student.getProfile();
      const turnIdx = sess.turnIndex || 0;
      const currentQ = sess.questions[turnIdx] || (sess.plannedTurns && sess.plannedTurns[turnIdx]) || MOCK_INTERVIEW_QUESTIONS[0];

      const evalResult = evaluateDynamicAnswer(currentQ, studentAnswer, turnIdx, durationSeconds, student);

      const turnEvaluation: QuestionTurn = {
        id: currentQ.id || `q_${turnIdx + 1}`,
        questionNumber: turnIdx + 1,
        questionText: currentQ.questionText,
        difficulty: (turnIdx === 0 ? 'EASY' : turnIdx === 1 ? 'MEDIUM' : 'ADVANCED'),
        category: currentQ.category,
        studentAnswer,
        technicalScore: evalResult.technicalScore,
        communicationScore: evalResult.communicationScore,
        wpm: evalResult.wpm,
        fillerWords: evalResult.fillerWords,
        feedback: evalResult.feedback,
        strengths: evalResult.strengths,
        weaknesses: evalResult.weaknesses
      };

      sess.questions[turnIdx] = turnEvaluation;
      const isCompleted = turnIdx >= 2;

      let nextQuestion: QuestionTurn | undefined = undefined;
      let finalReport: DiagnosticReport | undefined = undefined;

      if (!isCompleted) {
        const nextDiff = turnIdx === 0 ? 'MEDIUM' : 'ADVANCED';
        const fallbackNext = sess.plannedTurns && sess.plannedTurns[turnIdx + 1] ? sess.plannedTurns[turnIdx + 1].questionText : "Walk me through how you handle distributed latency.";
        const nextQText = evalResult.nextQuestionText || fallbackNext;

        nextQuestion = {
          id: `q_${turnIdx + 2}_${Date.now()}`,
          questionNumber: turnIdx + 2,
          questionText: nextQText,
          difficulty: nextDiff,
          category: turnIdx === 0 ? 'Scalability & Concurrency' : 'Resilience & Architecture'
        };

        sess.turnIndex = turnIdx + 1;
        sess.questions.push(nextQuestion);
      } else {
        finalReport = synthesizeDynamicReport(
          sess.type || 'MOCK_INTERVIEW',
          sess.questions,
          student,
          sess.tabSwitches || 0
        );

        student.recentReports = [finalReport, ...(student.recentReports || [])];
        this.setStorage(`student_profile_${student.id}`, student);
        this.setStorage('student_profile', student);

        const candidates = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
        const cIdx = candidates.findIndex(c => c.name === student.name || c.id === student.id);
        if (cIdx !== -1) {
          candidates[cIdx].score = finalReport.overallScore;
          candidates[cIdx].status = finalReport.overallScore >= 80 ? 'PLACEMENT_READY' : finalReport.overallScore >= 70 ? 'ON_TRACK' : 'NEEDS_ATTENTION';
          this.setStorage('admin_students', candidates);
        }
      }

      this.setStorage(`interview_${sessionId}`, sess);

      return {
        isCompleted,
        turnEvaluation,
        nextQuestion,
        finalReport
      };
    },

    finalize: async (sessionId: string): Promise<DiagnosticReport | null> => {
      const sess = this.getStorage<any>(`interview_${sessionId}`, null);
      if (!sess) return null;
      const student = await this.student.getProfile();
      return synthesizeDynamicReport(sess.type || 'MOCK_INTERVIEW', sess.questions || [], student, sess.tabSwitches || 0);
    },

    getReport: async (_sessionId: string): Promise<DiagnosticReport> => {
      const student = await this.student.getProfile();
      if (student.recentReports && student.recentReports.length > 0) {
        return student.recentReports[0];
      }
      return synthesizeDynamicReport('MOCK_INTERVIEW', [], student, 0);
    }
  };

  listening = {
    // Backend-integrated methods for fetching listening stories
    getStories: async (difficulty?: string): Promise<any[]> => {
      try {
        const params = difficulty ? `?difficulty=${difficulty}` : '';
        const response = await this.fetchAPI<{ stories: any[] }>(
          `/listening${params}`
        );
        return response.stories || [];
      } catch (error) {
        console.error('Get listening stories error:', error);
        // Fallback to mock data
        return LISTENING_PASSAGES.map((p, i) => ({
          id: `story_${i + 1}`,
          title: p.title,
          content: p.narrativeText,
          difficulty: 'MEDIUM',
          questions: p.questions
        }));
      }
    },

    getStoryById: async (id: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ story: any }>(
          `/listening/${id}`
        );
        return response.story;
      } catch (error) {
        console.error('Get listening story error:', error);
        throw error;
      }
    },

    // Existing localStorage-based session management (kept for current workflow)
    start: async (_studentId: string, passageIndex?: number) => {
      const pIdx = passageIndex !== undefined ? (passageIndex % LISTENING_PASSAGES.length) : Math.floor(Math.random() * LISTENING_PASSAGES.length);
      const selectedPassage = LISTENING_PASSAGES[pIdx];
      const sessionId = `lis_${Date.now()}`;
      
      this.setStorage(`listening_${sessionId}`, {
        passage: selectedPassage,
        replaysUsed: 0,
        answers: []
      });

      return {
        sessionId,
        passage: selectedPassage,
        replaysUsed: 0,
        maxReplays: 2
      };
    },

    recordReplay: async (sessionId: string) => {
      const sess = this.getStorage<any>(`listening_${sessionId}`, { replaysUsed: 0 });
      sess.replaysUsed = (sess.replaysUsed || 0) + 1;
      this.setStorage(`listening_${sessionId}`, sess);
      return { replaysUsed: sess.replaysUsed };
    },

    submitAnswers: async (sessionId: string, answers: { questionId: string; answerText: string }[]) => {
      const sess = this.getStorage<any>(`listening_${sessionId}`, {
        passage: LISTENING_PASSAGES[0],
        replaysUsed: 0
      });
      const passage = sess.passage || LISTENING_PASSAGES[0];
      const student = await this.student.getProfile();

      let totalScore = 0;
      const evaluations = answers.map((ans, idx) => {
        const qObj = passage.questions[idx] || passage.questions[0];
        const lowerAnswer = ans.answerText.toLowerCase();
        const keywords = qObj.keywords || [];

        let score = 65;
        let matchedKeywords = 0;
        keywords.forEach((k: string) => {
          if (lowerAnswer.includes(k.toLowerCase())) {
            matchedKeywords++;
            score += 10;
          }
        });

        if (ans.answerText.trim().length > 20) score += 5;
        score = Math.min(98, score);
        totalScore += score;

        return {
          questionIndex: idx,
          questionText: qObj.questionText,
          studentAnswer: ans.answerText,
          expectedAnswer: qObj.expectedAnswer,
          score,
          matchedKeywords,
          feedback: score >= 80 
            ? 'Accurately captured key architectural requirements.'
            : 'Partially captured requirement. Review technical constraints in the passage.'
        };
      });

      const avgScore = Math.round(totalScore / Math.max(1, answers.length));

      const turns: QuestionTurn[] = evaluations.map((ev, i) => ({
        id: `lis_q_${i + 1}`,
        questionNumber: i + 1,
        questionText: ev.questionText,
        difficulty: 'MEDIUM',
        studentAnswer: ev.studentAnswer,
        technicalScore: ev.score,
        communicationScore: Math.min(95, ev.score + 2),
        wpm: 126,
        fillerWords: 1,
        feedback: ev.feedback
      }));

      const finalReport = synthesizeDynamicReport('LISTENING_COMPREHENSION', turns, student, 0);
      finalReport.overallScore = avgScore;

      student.recentReports = [finalReport, ...(student.recentReports || [])];
      this.setStorage(`student_profile_${student.id}`, student);
      this.setStorage('student_profile', student);

      return {
        overallScore: avgScore,
        evaluations,
        finalReport
      };
    }
  };

  suggestions = {
    getOrCreateSession: async (_studentId = 'stu-101'): Promise<string> => {
      return `sug_${Date.now()}`;
    },

    getHistory: async (sessionId: string) => {
      return this.getStorage<any[]>(`sug_hist_${sessionId}`, []);
    },

    sendMessage: async (sessionId: string, message: string) => {
      const lower = message.toLowerCase();
      let assistantReply = "Structure your answer using the STAR framework (Situation, Task, Action, Result). State the latency or scale bottleneck in the first sentence, explain your design choices, and conclude with verified performance metrics.";
      
      let technicalTerms = [
        { term: 'Event-driven Architecture', definition: 'A design pattern where state changes trigger decoupled asynchronous processing.', betterAlternativeTo: 'Sending calls back and forth' },
        { term: 'Idempotency', definition: 'Ensuring an operation produces the identical outcome even if executed repeatedly.', betterAlternativeTo: 'Making sure we do not duplicate requests' }
      ];

      let commSuggestions = [
        'Lead with the high-level trade-off before diving into implementation details.',
        'Use transition phrasing such as "From a throughput perspective" or "To preserve data consistency".'
      ];

      let structuralAdvice = [
        'Framework: Problem Scope -> Architectural Decision -> Benchmark Impact (latency, memory, or throughput).'
      ];

      if (lower.includes('pacing') || lower.includes('speed') || lower.includes('wpm')) {
        assistantReply = "For technical interviews, optimal speaking pace is between 120 and 150 words per minute. If you feel rushed, deliberately pause for 1 second between clauses instead of filling silence with vocal fillers.";
        commSuggestions = [
          'Take a breath before answering complex architectural questions.',
          'Replace fillers with purposeful pauses to signal deliberate thinking.'
        ];
      } else if (lower.includes('filler') || lower.includes('um') || lower.includes('like')) {
        assistantReply = "Filler words usually happen when your brain plans the next sentence faster than you speak. Ground your answers in bullet points in your head before speaking.";
        commSuggestions = [
          'Pause rather than saying "basically" or "sort of".',
          'Conclude statements with confidence rather than trailing off.'
        ];
      } else if (lower.includes('database') || lower.includes('scale') || lower.includes('system design')) {
        technicalTerms = [
          { term: 'Connection Pooling', definition: 'Reusing a cache of database connections to minimize overhead on concurrent requests.', betterAlternativeTo: 'Opening a new database connection each time' },
          { term: 'Sharding & Replication', definition: 'Splitting datasets across multiple database instances to scale read and write throughput.', betterAlternativeTo: 'Making the database bigger' }
        ];
        structuralAdvice = [
          'Structure: Read vs. Write Ratios -> Indexing Strategy -> Cache Invalidation -> Fallback Mechanism.'
        ];
      }

      const userMsg = { id: `msg_${Date.now()}_u`, role: 'user', content: message, createdAt: new Date().toISOString() };
      const assistantMsg = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant' as const,
        content: assistantReply,
        technicalTerminology: technicalTerms,
        communicationSuggestions: commSuggestions,
        structuralAdvice,
        createdAt: new Date().toISOString()
      };

      const hist = this.getStorage<any[]>(`sug_hist_${sessionId}`, []);
      hist.push(userMsg, assistantMsg);
      this.setStorage(`sug_hist_${sessionId}`, hist);

      return {
        userMessage: userMsg,
        assistantMessage: assistantMsg
      };
    }
  };

  admin = {
    // Backend-integrated methods
    getUsers: async (filters: { role?: string; status?: string; search?: string } = {}): Promise<any[]> => {
      try {
        const params = new URLSearchParams();
        if (filters.role) params.append('role', filters.role);
        if (filters.status) params.append('status', filters.status);
        if (filters.search) params.append('search', filters.search);

        const queryString = params.toString();
        const response = await this.fetchAPI<{ users: any[] }>(
          `/admin/users${queryString ? `?${queryString}` : ''}`
        );
        return response.users || [];
      } catch (error) {
        console.error('Get users error:', error);
        return [];
      }
    },

    updateUserRole: async (userId: string, role: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ user: any }>(
          `/admin/users/${userId}/role`,
          {
            method: 'PATCH',
            body: JSON.stringify({ role })
          }
        );
        return response.user;
      } catch (error) {
        console.error('Update user role error:', error);
        throw error;
      }
    },

    updateUserStatus: async (userId: string, status: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ user: any }>(
          `/admin/users/${userId}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status })
          }
        );
        return response.user;
      } catch (error) {
        console.error('Update user status error:', error);
        throw error;
      }
    },

    // Existing localStorage-based methods (kept for demo/fallback)
    getCoordinatorStats: async () => {
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const programs = this.getStorage<DynamicProgram[]>('platform_dynamic_programs', MOCK_DYNAMIC_PROGRAMS);
      const totalCandidates = students.length;
      const readyCount = students.filter(s => (s.score || 0) >= 75).length;
      const placementReadyRate = Math.round((readyCount / Math.max(1, totalCandidates)) * 100);

      return {
        totalCandidates: totalCandidates || 240,
        activeProgramsCount: programs.length,
        placementReadyRate: placementReadyRate || 72,
        readyCount: readyCount || 172
      };
    },

    getSystemStats: async () => {
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const trainers = this.getStorage<any[]>('trainer_tenures', MOCK_TRAINER_TENURES);
      const mentors = this.getStorage<any[]>('admin_faculty_mentors', [
        { id: 'fm-1', name: 'Dr. Ananya Sharma', email: 'ananya.sharma@college.edu', department: 'CSE', assignedMenteesCount: 24 }
      ]);
      const admins = this.getStorage<any[]>('admin_program_admins', [
        { id: 'pa-1', name: 'Dr. K. Swaminathan', email: 'swaminathan@college.edu', department: 'CSE' }
      ]);

      return {
        programAdminsCount: admins.length,
        facultyMentorsCount: mentors.length,
        trainersCount: trainers.filter(t => t.isActive).length,
        studentsCount: students.length
      };
    },

    getProgramAdmins: async (): Promise<any[]> => {
      return this.getStorage<any[]>('admin_program_admins', [
        { id: 'pa-1', name: 'Dr. K. Swaminathan', email: 'swaminathan@college.edu', department: 'CSE', createdAt: '2026-01-10' }
      ]);
    },

    createProgramAdmin: async (data: { name: string; email: string; password?: string }) => {
      const admins = this.getStorage<any[]>('admin_program_admins', []);
      const newAdmin = { id: `pa_${Date.now()}`, ...data, createdAt: new Date().toISOString().split('T')[0] };
      admins.push(newAdmin);
      this.setStorage('admin_program_admins', admins);
      return newAdmin;
    },

    getFacultyMentors: async (): Promise<any[]> => {
      return this.getStorage<any[]>('admin_faculty_mentors', [
        { id: 'fm-1', name: 'Dr. Ananya Sharma', email: 'ananya.sharma@college.edu', department: 'CSE', assignedMenteesCount: 24 },
        { id: 'fm-2', name: 'Prof. R. Venkatesh', email: 'venkatesh.r@college.edu', department: 'IT', assignedMenteesCount: 22 }
      ]);
    },

    createFacultyMentor: async (data: { name: string; email: string; password?: string }) => {
      const mentors = this.getStorage<any[]>('admin_faculty_mentors', []);
      const newMentor = { id: `fm_${Date.now()}`, ...data, assignedMenteesCount: 0 };
      mentors.push(newMentor);
      this.setStorage('admin_faculty_mentors', mentors);
      return newMentor;
    },

    assignMentor: async (studentId: string, mentorId: string) => {
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const updated = students.map(s => s.id === studentId ? { ...s, mentorId } : s);
      this.setStorage('admin_students', updated);
      return { message: 'Mentor assigned successfully' };
    },

    createStudent: async (data: any) => {
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const newStudent = {
        id: `stu_${Date.now()}`,
        name: data.name,
        rollNumber: data.rollNumber || `22CS${Math.floor(1000 + Math.random() * 9000)}`,
        track: data.track || 'General Track',
        domain: data.domain || 'Technical Architecture',
        score: data.score || 75,
        checklist: '0/5',
        status: 'ON_TRACK'
      };
      students.unshift(newStudent);
      this.setStorage('admin_students', students);
      return newStudent;
    },

    createStudentByMentor: async (data: any) => {
      return this.admin.createStudent(data);
    },

    deleteUser: async (userId: string) => {
      const students = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST).filter(s => s.id !== userId);
      this.setStorage('admin_students', students);
      return { success: true, message: 'User removed successfully' };
    },

    getStudentFullHistory: async (studentId: string) => {
      const student = await this.student.getProfile(studentId);
      const sessions = (student.recentReports || []).map((r, i) => ({
        id: r.id || `ses_${i + 1}`,
        sessionType: r.sessionType || 'MOCK_INTERVIEW',
        overallScore: r.overallScore,
        technicalScore: r.technicalScore,
        communicationScore: r.communicationScore,
        averageWpm: r.averageWpm,
        totalFillerWords: r.totalFillerWords,
        createdAt: r.date || new Date().toISOString(),
        startedAt: r.date || new Date().toISOString(),
        tabSwitches: r.tabSwitches || 0,
        tabSwitchCount: r.tabSwitches || 0,
        isFlagged: r.isFlagged || false,
        isProctorFlagged: r.isFlagged || false,
        difficulty: 'MEDIUM',
        report: r,
        turns: [
          {
            id: `turn_${i}_1`,
            turnNumber: 1,
            turn_number: 1,
            questionNumber: 1,
            questionText: 'Walk me through your system architecture and performance bottlenecks.',
            question_text: 'Walk me through your system architecture and performance bottlenecks.',
            studentAnswer: 'In our architecture, we employed asynchronous queueing alongside connection pooling to maintain strict latency SLAs.',
            student_transcript: 'In our architecture, we employed asynchronous queueing alongside connection pooling to maintain strict latency SLAs.',
            technicalScore: r.technicalScore,
            technical_score: r.technicalScore,
            communicationScore: r.communicationScore,
            communication_score: r.communicationScore,
            wordsPerMinute: r.averageWpm,
            speaking_pace_wpm: r.averageWpm,
            fillerCount: r.totalFillerWords,
            filler_word_count: r.totalFillerWords,
            difficulty: 'MEDIUM',
            feedback: 'Clear structural explanation and good terminology. Can elaborate more on edge-case partition rebalancing.'
          }
        ]
      }));

      const checklist = (student.criteriaTasks || []).map(t => ({
        ...t,
        is_completed: t.isCompleted,
        verified_by_mentor: t.verifiedByMentor
      }));

      const studentData = {
        ...student,
        roll_number: student.rollNumber,
        batch_year: student.batchYear,
        mentor_name: student.mentorName,
        mentor_email: student.mentorEmail,
        readiness_score: student.overallReadiness,
        score: student.overallReadiness,
        tests_taken: sessions.length
      };

      return {
        student: studentData,
        profile: student,
        resume: student.resume,
        checklist,
        tasks: student.criteriaTasks,
        interviews: student.recentReports,
        interviewSessions: sessions
      };
    },

    getStudents: async (params: { cohort?: string; search?: string } = {}) => {
      let list = this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
      const existingIds = new Set(list.map(s => s.id || s.rollNumber));
      let updated = false;
      for (const m of MOCK_MENTEES_LIST) {
        if (!existingIds.has(m.id) && !existingIds.has(m.rollNumber)) {
          list.push(m);
          updated = true;
        }
      }
      if (updated) {
        this.setStorage('admin_students', list);
      }
      if (params.search) {
        const s = params.search.toLowerCase();
        list = list.filter(item => 
          item.name.toLowerCase().includes(s) || 
          (item.rollNumber && item.rollNumber.toLowerCase().includes(s)) ||
          (item.batchYear && String(item.batchYear).includes(s))
        );
      }
      return list;
    },

    getMentorMentees: async (_mentorId?: string) => {
      return this.getStorage<any[]>('admin_students', MOCK_MENTEES_LIST);
    },

    getTrainerTenures: async (): Promise<TrainerTenure[]> => {
      return this.getStorage<TrainerTenure[]>('trainer_tenures', MOCK_TRAINER_TENURES);
    },

    onboardTrainer: async (trainer: Omit<TrainerTenure, 'id' | 'isActive'>): Promise<TrainerTenure> => {
      const tenures = this.getStorage<TrainerTenure[]>('trainer_tenures', MOCK_TRAINER_TENURES);
      const newT: TrainerTenure = { id: `ten_${Date.now()}`, ...trainer, isActive: true };
      tenures.push(newT);
      this.setStorage('trainer_tenures', tenures);
      return newT;
    },

    revokeTrainer: async (id: string): Promise<void> => {
      const tenures = this.getStorage<TrainerTenure[]>('trainer_tenures', MOCK_TRAINER_TENURES);
      const updated = tenures.map(t => t.id === id ? { ...t, isActive: false } : t);
      this.setStorage('trainer_tenures', updated);
    },

    getAssignments: async (collegeId?: string): Promise<InterviewAssignment[]> => {
      const list = this.getStorage<InterviewAssignment[]>('assignments', MOCK_ASSIGNMENTS);
      if (collegeId) {
        return list.filter(a => !a.collegeId || a.collegeId === collegeId);
      }
      return list;
    },

    createAssignment: async (asg: Partial<InterviewAssignment>): Promise<InterviewAssignment> => {
      const list = this.getStorage<InterviewAssignment[]>('assignments', MOCK_ASSIGNMENTS);
      const newAsg: InterviewAssignment = {
        id: `asg_${Date.now()}`,
        title: asg.title || 'Practice Drill',
        sessionType: asg.sessionType || 'MOCK_INTERVIEW',
        assignedByRole: asg.assignedByRole || 'SUPER_ADMIN',
        assignedByName: asg.assignedByName || 'Placement Cell',
        assignedByEmail: asg.assignedByEmail,
        assignedById: asg.assignedById,
        collegeId: asg.collegeId || 'col-1',
        targetScope: asg.targetScope || 'ALL_STUDENTS',
        targetDomainOrTrack: asg.targetDomainOrTrack || 'All Batches',
        targetProgramName: asg.targetProgramName,
        targetProgramNames: asg.targetProgramNames,
        targetSubProgram: asg.targetSubProgram,
        targetDepartment: asg.targetDepartment,
        targetDepartments: asg.targetDepartments,
        targetStudentId: asg.targetStudentId,
        targetStudentName: asg.targetStudentName,
        interviewMode: asg.interviewMode || 'TOPIC',
        domainOrTopic: asg.domainOrTopic || 'General Technical Architecture',
        difficulty: asg.difficulty || 'MEDIUM',
        listeningPassageId: asg.listeningPassageId,
        customInstructions: asg.customInstructions,
        dueDate: asg.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        startTime: asg.startTime,
        endTime: asg.endTime,
        hasTimeWindow: Boolean(asg.startTime && asg.endTime),
        isMandatory: asg.isMandatory ?? true,
        createdAt: new Date().toISOString(),
        submissions: []
      };
      list.unshift(newAsg);
      this.setStorage('assignments', list);
      return newAsg;
    },

    submitAssignment: async (assignmentId: string, submission: AssignmentSubmission): Promise<{ success: boolean; assignment: InterviewAssignment }> => {
      const list = this.getStorage<InterviewAssignment[]>('assignments', MOCK_ASSIGNMENTS);
      const idx = list.findIndex(a => a.id === assignmentId);
      if (idx !== -1) {
        if (!list[idx].submissions) list[idx].submissions = [];
        const subIdx = list[idx].submissions!.findIndex(s => s.studentId === submission.studentId);
        if (subIdx !== -1) {
          list[idx].submissions![subIdx] = submission;
        } else {
          list[idx].submissions!.push(submission);
        }
        this.setStorage('assignments', list);
        return { success: true, assignment: list[idx] };
      }
      throw new Error('Assignment not found');
    },

    deleteAssignment: async (assignmentId: string): Promise<boolean> => {
      let list = this.getStorage<InterviewAssignment[]>('assignments', MOCK_ASSIGNMENTS);
      list = list.filter(a => a.id !== assignmentId);
      this.setStorage('assignments', list);
      return true;
    },

    getStudentAssignments: async (student: any): Promise<InterviewAssignment[]> => {
      const list = this.getStorage<InterviewAssignment[]>('assignments', MOCK_ASSIGNMENTS);
      return list.filter(a => {
        if (a.targetScope === 'ALL_STUDENTS') return true;
        if (a.targetScope === 'SPECIFIC_STUDENT') {
          return a.targetStudentId === student.id || 
                 a.targetStudentId === student.rollNumber || 
                 a.targetStudentName === student.name ||
                 Boolean(a.targetStudentId && student.email && a.targetStudentId.toLowerCase() === student.email.toLowerCase());
        }
        if (a.targetScope === 'MY_MENTEES') {
          return Boolean(student.mentorName || student.mentorEmail || student.mentorId);
        }
        if (a.targetScope === 'PROGRAM') {
          return student.programName === a.targetProgramName || student.track === a.targetProgramName || student.track?.startsWith(a.targetProgramName || '');
        }
        if (a.targetScope === 'CLASS') {
          if (a.targetClassNames && a.targetClassNames.length > 0) {
            return a.targetClassNames.some(cn => cn.toLowerCase() === (student.className || '').toLowerCase());
          }
          if (a.targetClassName) {
            return a.targetClassName.toLowerCase() === (student.className || '').toLowerCase();
          }
          return false;
        }
        if (a.targetScope === 'DEPARTMENT') {
          const deptMatch = student.department === a.targetDepartment || Boolean(student.department && student.department.includes(a.targetDepartment || ''));
          if (!deptMatch) return false;
          if (a.targetClassNames && a.targetClassNames.length > 0) {
            return a.targetClassNames.some(cn => cn.toLowerCase() === (student.className || '').toLowerCase());
          }
          if (a.targetClassName) {
            return a.targetClassName.toLowerCase() === (student.className || '').toLowerCase();
          }
          return true;
        }
        return true;
      });
    },

    getCollegePrograms: async (collegeId = 'col-1'): Promise<DynamicProgram[]> => {
      return this.college.getPrograms(collegeId);
    }
  };

  mentors = {
    assignStudent: async (studentId: string, mentorId: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ assignment: any }>(
          '/mentors/assign',
          {
            method: 'POST',
            body: JSON.stringify({ studentId, mentorId })
          }
        );
        return response.assignment;
      } catch (error) {
        console.error('Assign mentor error:', error);
        throw error;
      }
    },

    getMyStudents: async (): Promise<any[]> => {
      try {
        const response = await this.fetchAPI<{ students: any[] }>(
          '/mentors/my-students'
        );
        return response.students || [];
      } catch (error) {
        console.error('Get mentor students error:', error);
        return [];
      }
    }
  };

  trainers = {
    assignTrainer: async (data: {
      trainerId: string;
      subdivisionId: string;
      startDate: string;
      endDate?: string;
    }): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ assignment: any }>(
          '/trainers/assign',
          {
            method: 'POST',
            body: JSON.stringify(data)
          }
        );
        return response.assignment;
      } catch (error) {
        console.error('Assign trainer error:', error);
        throw error;
      }
    },

    getMySubdivisions: async (): Promise<any[]> => {
      try {
        const response = await this.fetchAPI<{ subdivisions: any[] }>(
          '/trainers/my-subdivisions'
        );
        return response.subdivisions || [];
      } catch (error) {
        console.error('Get trainer subdivisions error:', error);
        return [];
      }
    }
  };

  // Session coins live on the server (credit ledger); see backend coinService.ts
  coins = {
    me: async (): Promise<{ coins: number; maxCoins: number }> =>
      this.fetchAPI('/coins/me'),
    spend: async (purpose: 'LISTENING_COMPREHENSION'): Promise<{ sessionRef: string; coins: number }> =>
      this.fetchAPI('/coins/me/spend', { method: 'POST', body: JSON.stringify({ purpose }) }),
    complete: async (sessionRef: string): Promise<{ coins: number }> =>
      this.fetchAPI('/coins/me/complete', { method: 'POST', body: JSON.stringify({ sessionRef }) }),
    restore: async (studentId: string, coins = 5): Promise<{ coins: number }> =>
      this.fetchAPI(`/coins/${studentId}/restore`, { method: 'POST', body: JSON.stringify({ coins }) }),
  };

  skills = {
    getAll: async (category?: string): Promise<any[]> => {
      try {
        const params = category ? `?category=${category}` : '';
        const response = await this.fetchAPI<{ skills: any[] }>(
          `/skills${params}`
        );
        return response.skills || [];
      } catch (error) {
        console.error('Get skills error:', error);
        return [];
      }
    },

    getById: async (id: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ skill: any }>(
          `/skills/${id}`
        );
        return response.skill;
      } catch (error) {
        console.error('Get skill error:', error);
        throw error;
      }
    },

    create: async (data: {
      name: string;
      category: string;
      description?: string;
    }): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ skill: any }>(
          '/skills',
          {
            method: 'POST',
            body: JSON.stringify(data)
          }
        );
        return response.skill;
      } catch (error) {
        console.error('Create skill error:', error);
        throw error;
      }
    }
  };

  performance = {
    getProfile: async (studentId: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ profile: any }>(
          `/performance/${studentId}`
        );
        return response.profile;
      } catch (error) {
        console.error('Get performance profile error:', error);
        throw error;
      }
    },

    getHistory: async (studentId: string, limit = 20, offset = 0): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ snapshots: any[]; total: number }>(
          `/performance/${studentId}/history?limit=${limit}&offset=${offset}`
        );
        return response;
      } catch (error) {
        console.error('Get performance history error:', error);
        return { snapshots: [], total: 0 };
      }
    },

    getSkills: async (studentId: string): Promise<any[]> => {
      try {
        const response = await this.fetchAPI<{ skills: any[] }>(
          `/performance/${studentId}/skills`
        );
        return response.skills || [];
      } catch (error) {
        console.error('Get performance skills error:', error);
        return [];
      }
    }
  };

  learning = {
    getKnowledge: async (visibilityType?: string): Promise<any[]> => {
      try {
        const params = visibilityType ? `?visibility_type=${visibilityType}` : '';
        const response = await this.fetchAPI<{ documents: any[] }>(
          `/learning/knowledge${params}`
        );
        return response.documents || [];
      } catch (error) {
        console.error('Get knowledge documents error:', error);
        return [];
      }
    },

    getKnowledgeById: async (id: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ document: any; chunks: any[] }>(
          `/learning/knowledge/${id}`
        );
        return response;
      } catch (error) {
        console.error('Get knowledge document error:', error);
        throw error;
      }
    },

    getPlans: async (studentId: string): Promise<any[]> => {
      try {
        const response = await this.fetchAPI<{ plans: any[] }>(
          `/learning/plans/${studentId}`
        );
        return response.plans || [];
      } catch (error) {
        console.error('Get learning plans error:', error);
        return [];
      }
    },

    getRecommendations: async (studentId: string): Promise<any[]> => {
      try {
        const response = await this.fetchAPI<{ recommendations: any[] }>(
          `/learning/recommendations/${studentId}`
        );
        return response.recommendations || [];
      } catch (error) {
        console.error('Get learning recommendations error:', error);
        return [];
      }
    },

    runAgent: async (studentId: string, goal: string): Promise<string> => {
      try {
        const response = await this.fetchAPI<{ agentRunId: string }>(
          '/learning/agent/run',
          {
            method: 'POST',
            body: JSON.stringify({ studentId, goal })
          }
        );
        return response.agentRunId;
      } catch (error) {
        console.error('Run learning agent error:', error);
        throw error;
      }
    },

    getAgentRun: async (runId: string): Promise<any> => {
      try {
        const response = await this.fetchAPI<{ run: any; steps: any[]; learningPlan: any }>(
          `/learning/agent/run/${runId}`
        );
        return response;
      } catch (error) {
        console.error('Get agent run error:', error);
        throw error;
      }
    }
  };
}


export const api = new ApiClient();
