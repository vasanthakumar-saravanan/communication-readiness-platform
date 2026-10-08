import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { LISTENING_PASSAGES, MOCK_DEPARTMENT_CLASSES } from '../../data/mockData';
import { InterviewAssignment, DynamicProgram } from '../../types';
import { 
  Mic, 
  Headphones, 
  X, 
  Calendar, 
  Clock, 
  AlertCircle,
  FileText,
  Sparkles,
  Layers,
  Building2,
  Globe,
  Check,
  CheckCircle2,
  User,
  Users
} from 'lucide-react';
import { useBackHandler } from '../../hooks/useBackHandler';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';
import { DifficultySelect } from './DifficultySelect';
import { PassageSelect } from './PassageSelect';

export interface AssignSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (asg: InterviewAssignment) => void;
  defaultRole?: 'SUPER_ADMIN' | 'PLACEMENT_COORDINATOR' | 'PROGRAM_ADMIN' | 'FACULTY_MENTOR' | 'DEPARTMENT_ADMIN' | 'COUNSELLOR';
  defaultTargetScope?: 'ALL_STUDENTS' | 'PROGRAM' | 'DEPARTMENT' | 'MY_MENTEES' | 'SPECIFIC_STUDENT' | 'CLASS';
  defaultProgramName?: string;
  defaultDepartment?: string;
  defaultDomain?: string;
  defaultClassName?: string;
  defaultClassNames?: string[];
  menteesList?: any[];
  studentsList?: any[];
  targetStudent?: { id: string; name: string; rollNumber?: string; department?: string; email?: string; className?: string } | null;
  lockProgramScope?: boolean;
  lockDepartmentScope?: boolean;
  lockClassScope?: boolean;
  /**
   * When provided (non-empty), restricts the PROGRAM scope dropdown to only these
   * program names. Used by FacultyMentorPortal to enforce backend-defined scopes.
   * If undefined or empty, all programs are shown (existing behaviour).
   */
  authorizedPrograms?: string[];
}

export const AssignSessionModal: React.FC<AssignSessionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultRole,
  defaultTargetScope,
  defaultProgramName,
  defaultDepartment,
  defaultDomain,
  defaultClassName,
  defaultClassNames,
  menteesList,
  studentsList,
  targetStudent,
  lockProgramScope,
  lockDepartmentScope,
  lockClassScope,
  authorizedPrograms,
}) => {
  useBackHandler(isOpen, onClose);

  const isProgramLocked = Boolean(lockProgramScope || (defaultRole === 'PROGRAM_ADMIN' && defaultProgramName));
  const isClassLocked = Boolean(lockClassScope || defaultRole === 'COUNSELLOR');
  const isDepartmentLocked = Boolean(!isClassLocked && (lockDepartmentScope || defaultRole === 'DEPARTMENT_ADMIN'));

  const { currentUser, createAssignment } = useApp();
  const activeRole = defaultRole || (currentUser?.role as any) || 'SUPER_ADMIN';

  // 1. Session Type: Technical, Listening, or Both
  const [sessionType, setSessionType] = useState<'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' | 'BOTH'>('MOCK_INTERVIEW');
  
  // 2. Title (No suggestions)
  const [title, setTitle] = useState('');

  // 3. Target Scope
  const initialScope = defaultTargetScope === 'SPECIFIC_STUDENT'
    ? 'SPECIFIC_STUDENT'
    : defaultTargetScope === 'MY_MENTEES'
    ? 'MY_MENTEES'
    : isClassLocked
    ? 'CLASS'
    : (defaultTargetScope === 'DEPARTMENT' || defaultDepartment || isDepartmentLocked) 
    ? 'DEPARTMENT' 
    : (defaultTargetScope === 'ALL_STUDENTS') 
    ? 'ALL_STUDENTS' 
    : 'PROGRAM';

  const [targetScope, setTargetScope] = useState<'ALL_STUDENTS' | 'PROGRAM' | 'DEPARTMENT' | 'MY_MENTEES' | 'SPECIFIC_STUDENT' | 'CLASS'>(initialScope);

  const [programs, setPrograms] = useState<DynamicProgram[]>([]);
  const [selectedProgNames, setSelectedProgNames] = useState<string[]>([]);

  // When authorizedPrograms is provided, restrict the visible program list.
  // This enforces the backend-defined scope for FACULTY_MENTOR roles.
  const displayedPrograms = programs.filter(p =>
    !authorizedPrograms || authorizedPrograms.length === 0
      ? true
      : authorizedPrograms.includes(p.name)
  );

  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    defaultDepartment ? [defaultDepartment] : ['Computer Science & Engineering']
  );

  // Class Selection state within the department
  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => {
    if (defaultClassNames && defaultClassNames.length > 0) return defaultClassNames;
    if (defaultClassName) return [defaultClassName];
    return [];
  });

  // Load available department classes
  const [allDepartmentClasses, setAllDepartmentClasses] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('crp_department_classes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return MOCK_DEPARTMENT_CLASSES;
  });

  // Filter classes belonging to the selected department
  const targetDept = defaultDepartment || selectedDepartments[0] || '';
  const departmentClasses = allDepartmentClasses.filter((c: any) => 
    !targetDept || 
    (c.department && c.department.toLowerCase().includes(targetDept.toLowerCase())) ||
    (targetDept.toLowerCase().includes(c.department?.toLowerCase() || ''))
  );

  // 4. Session Configuration
  // Mode: Custom Domain Topic VS Personal Resume-based
  const [interviewMode, setInterviewMode] = useState<'TOPIC' | 'RESUME_BASED'>('TOPIC');
  const [domainOrTopic, setDomainOrTopic] = useState(defaultDomain || 'Full Stack & Web Systems');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'ADVANCED' | 'FAANG'>('MEDIUM');
  const [listeningPassageId, setListeningPassageId] = useState(LISTENING_PASSAGES[0]?.id || 'pass-finpay');

  // 5. Schedule & Active Window (with No Time Limit toggle)
  const [hasTimeLimit, setHasTimeLimit] = useState(true);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ALL_DEPARTMENTS = [
    'Computer Science & Engineering',
    'Information Technology',
    'AI & Data Science',
    'Electronics & Communication',
    'Electrical & Electronics',
    'Mechanical Engineering'
  ];

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (defaultTargetScope === 'SPECIFIC_STUDENT') {
        setTargetScope('SPECIFIC_STUDENT');
      } else if (isClassLocked) {
        setTargetScope('CLASS');
        if (defaultClassName) {
          setSelectedClasses([defaultClassName]);
        }
      } else if (defaultTargetScope === 'MY_MENTEES' || defaultTargetScope === 'DEPARTMENT' || defaultTargetScope === 'ALL_STUDENTS' || defaultTargetScope === 'PROGRAM') {
        setTargetScope(defaultTargetScope);
      } else if (defaultDepartment) {
        setTargetScope('DEPARTMENT');
      } else if (defaultProgramName) {
        setTargetScope('PROGRAM');
      }

      if (defaultDepartment) {
        setSelectedDepartments([defaultDepartment]);
      }
      if (defaultClassName) {
        setSelectedClasses([defaultClassName]);
      } else if (defaultClassNames && defaultClassNames.length > 0) {
        setSelectedClasses(defaultClassNames);
      }

      api.college.getPrograms(currentUser?.collegeId || 'col-1').then(progs => {
        if (progs && progs.length > 0) {
          setPrograms(progs);
          if (defaultProgramName && progs.some(p => p.name === defaultProgramName)) {
            setSelectedProgNames([defaultProgramName]);
          } else {
            setSelectedProgNames([progs[0].name]);
          }
        } else {
          setPrograms([]);
          setSelectedProgNames([]);
          // If in PROGRAM scope but no programs exist, auto-fallback to DEPARTMENT so user is never blocked!
          if (!defaultProgramName && (defaultTargetScope === 'PROGRAM' || !defaultTargetScope)) {
            setTargetScope('DEPARTMENT');
          }
        }
      }).catch(() => {});
    }
  }, [isOpen, defaultTargetScope, defaultProgramName, defaultDepartment, currentUser?.collegeId]);

  if (!isOpen) return null;

  // Toggle Program multi-selection
  const toggleProgram = (progName: string) => {
    if (selectedProgNames.includes(progName)) {
      if (selectedProgNames.length > 1) {
        setSelectedProgNames(selectedProgNames.filter(p => p !== progName));
      }
    } else {
      setSelectedProgNames([...selectedProgNames, progName]);
    }
  };

  const selectAllPrograms = () => {
    if (selectedProgNames.length === displayedPrograms.length) {
      setSelectedProgNames([displayedPrograms[0]?.name || '']);
    } else {
      setSelectedProgNames(displayedPrograms.map(p => p.name));
    }
  };

  // Toggle Department multi-selection
  const toggleDepartment = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      if (selectedDepartments.length > 1) {
        setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
      }
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
    }
  };

  const selectAllDepartments = () => {
    if (selectedDepartments.length === ALL_DEPARTMENTS.length) {
      setSelectedDepartments([ALL_DEPARTMENTS[0]]);
    } else {
      setSelectedDepartments([...ALL_DEPARTMENTS]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter the assessment title.');
      return;
    }

    if (targetScope === 'PROGRAM') {
      if (displayedPrograms.length === 0) {
        setError(
          authorizedPrograms && authorizedPrograms.length > 0
            ? 'None of your authorised programs are configured yet. Contact your Program Admin.'
            : 'No institutional programs available yet. Please select Department-Wise or College-Wide.'
        );
        return;
      }
      if (selectedProgNames.length === 0) {
        setError('Please select at least one program.');
        return;
      }
    }

    if (targetScope === 'DEPARTMENT' && selectedDepartments.length === 0) {
      setError('Please select at least one department.');
      return;
    }

    setSubmitting(true);
    setError(null);

    let targetDomainOrTrack = 'All Batches (2026)';
    if (isClassLocked) {
      const clsName = defaultClassName || selectedClasses[0] || 'My Class';
      targetDomainOrTrack = targetStudent 
        ? `${targetStudent.name} (${clsName})`
        : `${selectedDepartments[0] || defaultDepartment || 'Department'} · Class: ${clsName}`;
    } else if (targetScope === 'PROGRAM') {
      targetDomainOrTrack = selectedProgNames.length === 1 
        ? selectedProgNames[0]
        : `${selectedProgNames.length} Programs Selected (${selectedProgNames.join(', ')})`;
    } else if (targetScope === 'DEPARTMENT' || targetScope === 'CLASS') {
      if (selectedClasses.length > 0) {
        targetDomainOrTrack = `${selectedDepartments[0] || 'Department'} · Classes: ${selectedClasses.join(', ')}`;
      } else {
        targetDomainOrTrack = selectedDepartments.length === 1 
          ? `${selectedDepartments[0]} (All Classes)`
          : `${selectedDepartments.length} Depts (${selectedDepartments.join(', ')})`;
      }
    } else if (targetScope === 'SPECIFIC_STUDENT') {
      targetDomainOrTrack = targetStudent ? `${targetStudent.name} (${targetStudent.rollNumber || 'Direct'})` : 'Individual Candidate';
    } else if (targetScope === 'MY_MENTEES') {
      targetDomainOrTrack = 'Assigned Faculty Mentees';
    }

    try {
      const created = await createAssignment({
        title: title.trim(),
        sessionType,
        assignedByRole: activeRole,
        assignedByName: currentUser?.name || (isClassLocked ? 'Class Counsellor' : 'Placement Cell Officer'),
        assignedByEmail: currentUser?.email,
        assignedById: currentUser?.id,
        collegeId: currentUser?.collegeId || 'col-1',
        targetScope: isClassLocked ? (targetStudent ? 'SPECIFIC_STUDENT' : 'CLASS') : targetScope,
        targetDomainOrTrack,
        targetProgramName: targetScope === 'PROGRAM' ? selectedProgNames[0] : undefined,
        targetProgramNames: targetScope === 'PROGRAM' ? selectedProgNames : undefined,
        targetDepartment: (targetScope === 'DEPARTMENT' || targetScope === 'CLASS' || isClassLocked) ? (selectedDepartments[0] || defaultDepartment) : undefined,
        targetDepartments: (targetScope === 'DEPARTMENT' || targetScope === 'CLASS' || isClassLocked) ? (selectedDepartments.length > 0 ? selectedDepartments : [defaultDepartment || 'Information Technology']) : undefined,
        targetClassName: (isClassLocked || targetScope === 'CLASS') ? (defaultClassName || selectedClasses[0]) : (selectedClasses.length === 1 ? selectedClasses[0] : (selectedClasses.length > 1 ? selectedClasses.join(', ') : undefined)),
        targetClassNames: (isClassLocked || targetScope === 'CLASS') ? [defaultClassName || selectedClasses[0]] : (selectedClasses.length > 0 ? selectedClasses : undefined),
        targetStudentId: (targetScope === 'SPECIFIC_STUDENT' || Boolean(targetStudent)) ? (targetStudent?.id || targetStudent?.rollNumber) : undefined,
        targetStudentName: (targetScope === 'SPECIFIC_STUDENT' || Boolean(targetStudent)) ? targetStudent?.name : undefined,
        interviewMode,
        domainOrTopic: interviewMode === 'RESUME_BASED' ? 'Personal Resume & Projects' : domainOrTopic,
        difficulty,
        listeningPassageId: (sessionType === 'LISTENING_COMPREHENSION' || sessionType === 'BOTH') ? listeningPassageId : undefined,
        dueDate,
        startTime: hasTimeLimit ? startTime : undefined,
        endTime: hasTimeLimit ? endTime : undefined,
        hasTimeWindow: hasTimeLimit,
        isMandatory: true
      });

      if (onSuccess) {
        onSuccess(created);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch assessment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border border-neutral-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 my-6">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
              {sessionType === 'MOCK_INTERVIEW' ? (
                <Mic className="w-5 h-5 text-emerald-400" />
              ) : sessionType === 'LISTENING_COMPREHENSION' ? (
                <Headphones className="w-5 h-5 text-purple-400" />
              ) : (
                <Sparkles className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">Assign Assessment / Practice Session</h2>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Session Type Selection: Technical, Listening, or Both */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-neutral-800 uppercase tracking-wider text-[10px]">
              1. Select Session Format *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              
              {/* Option 1: Technical Mock Interview */}
              <button
                type="button"
                onClick={() => setSessionType('MOCK_INTERVIEW')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  sessionType === 'MOCK_INTERVIEW'
                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                    : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    sessionType === 'MOCK_INTERVIEW' ? 'bg-neutral-800 text-emerald-400' : 'bg-neutral-100 text-neutral-700'
                  }`}>
                    <Mic className="w-4 h-4" />
                  </div>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                    sessionType === 'MOCK_INTERVIEW' ? 'bg-neutral-800 text-emerald-300' : 'bg-neutral-100 text-neutral-600'
                  }`}>
                    VOICE AI
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-xs">Technical Mock Interview</h4>
                  <p className={`text-[10px] mt-0.5 leading-snug ${
                    sessionType === 'MOCK_INTERVIEW' ? 'text-neutral-300' : 'text-neutral-500'
                  }`}>
                    Verbal technical turns evaluating architecture and logic.
                  </p>
                </div>
              </button>

              {/* Option 2: Listening Comprehension */}
              <button
                type="button"
                onClick={() => setSessionType('LISTENING_COMPREHENSION')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  sessionType === 'LISTENING_COMPREHENSION'
                    ? 'border-purple-900 bg-purple-950 text-white shadow-xs'
                    : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    sessionType === 'LISTENING_COMPREHENSION' ? 'bg-purple-900 text-purple-300' : 'bg-neutral-100 text-neutral-700'
                  }`}>
                    <Headphones className="w-4 h-4" />
                  </div>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                    sessionType === 'LISTENING_COMPREHENSION' ? 'bg-purple-900 text-purple-300' : 'bg-neutral-100 text-neutral-600'
                  }`}>
                    AUDIO ONLY
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-xs">Listening Comprehension</h4>
                  <p className={`text-[10px] mt-0.5 leading-snug ${
                    sessionType === 'LISTENING_COMPREHENSION' ? 'text-purple-200' : 'text-neutral-500'
                  }`}>
                    Listening comprehension and recall practice without visual text.
                  </p>
                </div>
              </button>

              {/* Option 3: Both Sessions */}
              <button
                type="button"
                onClick={() => setSessionType('BOTH')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  sessionType === 'BOTH'
                    ? 'border-amber-900 bg-amber-950 text-white shadow-xs ring-1 ring-amber-400/50'
                    : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    sessionType === 'BOTH' ? 'bg-amber-900 text-amber-300' : 'bg-neutral-100 text-neutral-700'
                  }`}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                    sessionType === 'BOTH' ? 'bg-amber-900 text-amber-200' : 'bg-amber-50 text-amber-800'
                  }`}>
                    BOTH DRILLS
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-xs">Both (Combined)</h4>
                  <p className={`text-[10px] mt-0.5 leading-snug ${
                    sessionType === 'BOTH' ? 'text-amber-200' : 'text-neutral-500'
                  }`}>
                    Both Technical Mock Interview and Listening Comprehension.
                  </p>
                </div>
              </button>

            </div>
          </div>

          {/* 2. Assessment Title (No suggestions) */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-neutral-800 uppercase tracking-wider text-[10px]">
              2. Assessment Title *
            </label>
            <input
              type="text"
              required
              placeholder="Enter assessment title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-neutral-900 text-xs focus:outline-none focus:border-neutral-900"
            />
          </div>

          {/* 3. Target Audience / Cohort */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-neutral-800 uppercase tracking-wider text-[10px]">
                3. Target Students / Batch *
              </label>
              <span className="text-[10px] text-neutral-500">Multi-selection supported</span>
            </div>

            {/* Targeted Student or Mentee Banner (if specific student target) */}
            {targetScope === 'SPECIFIC_STUDENT' && targetStudent && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Individual Class Student Drill: <strong>{targetStudent.name}</strong> ({targetStudent.rollNumber || 'Candidate'}) · Class: <strong>{defaultClassName || targetStudent.className || 'Assigned Class'}</strong>
                  </span>
                </div>
                {isClassLocked ? (
                  <span className="text-[10px] font-mono font-bold bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full">
                    Class Student
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTargetScope('DEPARTMENT')}
                    className="text-[11px] text-emerald-800 hover:text-emerald-950 underline font-medium cursor-pointer"
                  >
                    Change Scope
                  </button>
                )}
              </div>
            )}

            {targetScope === 'MY_MENTEES' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Assigning to your Mentee Students ({menteesList?.length || 0} active mentees).</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetScope('DEPARTMENT')}
                  className="text-[11px] text-blue-800 hover:text-blue-950 underline font-medium cursor-pointer"
                >
                  Change Scope
                </button>
              </div>
            )}

            {/* Scope Selection Tabs or Locked Program / Department / Class Banner */}
            {isClassLocked ? (
              <div className="p-3 bg-emerald-950 text-white rounded-xl flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Target Group: Locked to <strong>{defaultClassName || selectedClasses[0] || 'Assigned Class'}</strong> students only
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-900 text-emerald-200 font-mono font-bold">
                  MY CLASS ONLY
                </span>
              </div>
            ) : isProgramLocked ? (
              <div className="p-3 bg-neutral-900 text-white rounded-xl flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Target Group: Locked to <strong>{defaultProgramName} Training Program</strong> students only</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-emerald-300 font-mono font-bold">
                  PROGRAM ONLY
                </span>
              </div>
            ) : isDepartmentLocked ? (
              <div className="p-3 bg-purple-950 text-white rounded-xl flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-purple-300 shrink-0" />
                  <span>Target Group: Locked to <strong>{defaultDepartment || selectedDepartments[0]}</strong> department only</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-purple-900 text-purple-200 font-mono font-bold">
                  DEPARTMENT ONLY
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetScope('PROGRAM')}
                  className={`p-2.5 rounded-xl border text-center font-medium transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                    targetScope === 'PROGRAM' ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs' : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">Program Students</span>
                  </div>
                  <span className={`text-[10px] ${targetScope === 'PROGRAM' ? 'text-neutral-300' : 'text-neutral-400'}`}>
                    {displayedPrograms.length > 0 ? `${displayedPrograms.length} available` : (authorizedPrograms && authorizedPrograms.length > 0 ? 'No scoped programs' : 'Configure in Programs tab')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetScope('DEPARTMENT')}
                  className={`p-2.5 rounded-xl border text-center font-medium transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                    targetScope === 'DEPARTMENT' ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs' : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">Department-Wise</span>
                  </div>
                  <span className={`text-[10px] ${targetScope === 'DEPARTMENT' ? 'text-neutral-300' : 'text-neutral-400'}`}>
                    Multi-department select
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetScope('ALL_STUDENTS')}
                  className={`p-2.5 rounded-xl border text-center font-medium transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                    targetScope === 'ALL_STUDENTS' ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs' : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">College-Wide</span>
                  </div>
                  <span className={`text-[10px] ${targetScope === 'ALL_STUDENTS' ? 'text-neutral-300' : 'text-neutral-400'}`}>
                    All enrolled batches
                  </span>
                </button>
              </div>
            )}

            {/* Multi-Select Programs — restricted to authorizedPrograms when set */}
            {targetScope === 'PROGRAM' && !isProgramLocked && (
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200/90 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-800">
                    Select Target Programs ({selectedProgNames.length} selected)
                    {authorizedPrograms && authorizedPrograms.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-100 text-amber-900 border border-amber-200">
                        Scope-restricted
                      </span>
                    )}
                  </label>
                  {displayedPrograms.length > 1 && (
                    <button
                      type="button"
                      onClick={selectAllPrograms}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                    >
                      {selectedProgNames.length === displayedPrograms.length ? 'Deselect Extra' : 'Select All'}
                    </button>
                  )}
                </div>

                {displayedPrograms.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                    <p className="text-amber-900 font-semibold">
                      No institutional dynamic programs configured yet.
                    </p>
                    <p className="text-amber-800 text-[11px]">
                      You can define custom programs in the Programs tab, or assign this assessment immediately to departments or college-wide.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setTargetScope('DEPARTMENT')}
                        className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        Switch to Department-Wise
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetScope('ALL_STUDENTS')}
                        className="px-3 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Switch to College-Wide
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {displayedPrograms.map(p => {
                        const isSelected = selectedProgNames.includes(p.name);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleProgram(p.name)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border text-left flex items-center space-x-2 ${
                              isSelected
                                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                                : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-neutral-300'}`}></span>
                            <span>{p.name}</span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-500'
                            }`}>
                              {p.code}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Multi-Select Departments & Classes */}
            {targetScope === 'DEPARTMENT' && !isClassLocked && (
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200/90 space-y-4">
                {!isDepartmentLocked ? (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-neutral-800">
                        Select Target Departments ({selectedDepartments.length} selected)
                      </label>
                      <button
                        type="button"
                        onClick={selectAllDepartments}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                      >
                        {selectedDepartments.length === ALL_DEPARTMENTS.length ? 'Deselect Extra' : 'Select All Departments'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_DEPARTMENTS.map((dept) => {
                        const isSelected = selectedDepartments.includes(dept);
                        return (
                          <button
                            key={dept}
                            type="button"
                            onClick={() => toggleDepartment(dept)}
                            className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                                : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-neutral-300'}`}></span>
                              <span>{dept}</span>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-3 bg-white border border-purple-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-purple-950 block">{selectedDepartments[0] || defaultDepartment}</span>
                        <span className="text-[10px] text-purple-700">Strictly locked to your department students and classes.</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full border border-purple-200">
                      Active Department
                    </span>
                  </div>
                )}

                {/* Class / Section Selection: allows changing classes by selection */}
                {(isDepartmentLocked || selectedDepartments.length === 1) && (
                  <div className="pt-3 border-t border-neutral-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Users className="w-3.5 h-3.5 text-purple-700" />
                        <label className="text-xs font-bold text-neutral-900">
                          Target Classes in {selectedDepartments[0] || defaultDepartment}
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        {selectedClasses.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedClasses([])}
                            className="text-[11px] text-purple-700 hover:text-purple-900 font-semibold cursor-pointer"
                          >
                            Reset to All Classes
                          </button>
                        )}
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-200/80 rounded-md font-semibold text-neutral-700">
                          {selectedClasses.length === 0 ? 'All Classes Selected' : `${selectedClasses.length} Selected`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedClasses([])}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-2 ${
                          selectedClasses.length === 0
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs ring-2 ring-neutral-900/10'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedClasses.length === 0 ? 'bg-emerald-400' : 'bg-neutral-300'}`} />
                        <span>🏢 All Classes in {selectedDepartments[0] || defaultDepartment}</span>
                        {selectedClasses.length === 0 && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
                      </button>

                      {departmentClasses.map((cls) => {
                        const isSelected = selectedClasses.includes(cls.name);
                        return (
                          <button
                            key={cls.id || cls.name}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedClasses(selectedClasses.filter(c => c !== cls.name));
                              } else {
                                setSelectedClasses([...selectedClasses, cls.name]);
                              }
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-2 ${
                              isSelected
                                ? 'bg-purple-950 text-white border-purple-900 shadow-xs ring-2 ring-purple-900/20'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-neutral-300'}`} />
                            <span>{cls.name}</span>
                            {cls.batchYear && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-purple-800 text-purple-200' : 'bg-neutral-100 text-neutral-500'}`}>
                                Batch {cls.batchYear}
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Locked Class Scope Card for Class Counsellor */}
            {isClassLocked && targetScope !== 'SPECIFIC_STUDENT' && (
              <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">{defaultClassName || selectedClasses[0] || 'My Class'}</span>
                      <span className="text-[11px] text-emerald-700">Class Counsellor Restriction: Drill will be dispatched exclusively to enrolled students of your class.</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-emerald-200 text-emerald-900 px-2.5 py-1 rounded-full border border-emerald-300">
                    Class Scope Locked
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 4. Session Configuration (Domain VS Resume-based interview option) */}
          <div className="space-y-4 p-4 bg-neutral-50/80 rounded-2xl border border-neutral-200/80">
            <span className="block font-semibold text-neutral-800 uppercase tracking-wider text-[10px]">
              4. Session Configuration &amp; Interview Rubric
            </span>

            {/* For Mock Interview or Both: Choose between Custom Topic OR Resume-based */}
            {(sessionType === 'MOCK_INTERVIEW' || sessionType === 'BOTH') && (
              <div className="space-y-3">
                <label className="block text-[11px] font-semibold text-neutral-800">
                  Technical Interview Generation Source:
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setInterviewMode('TOPIC')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start space-x-2.5 ${
                      interviewMode === 'TOPIC'
                        ? 'border-neutral-900 bg-white ring-2 ring-neutral-900 shadow-xs'
                        : 'border-neutral-200 bg-white/70 hover:bg-white text-neutral-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg mt-0.5 ${interviewMode === 'TOPIC' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-neutral-900">Custom Domain / Topic</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">Focus questions on specific technical stack (e.g. Full Stack, Java, Systems)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInterviewMode('RESUME_BASED')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start space-x-2.5 ${
                      interviewMode === 'RESUME_BASED'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600 shadow-xs'
                        : 'border-neutral-200 bg-white/70 hover:bg-white text-neutral-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg mt-0.5 ${interviewMode === 'RESUME_BASED' ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-emerald-950">Personal Resume-Based</div>
                      <div className="text-[10px] text-emerald-800/80 mt-0.5">Questions dynamically generated strictly from each candidate&apos;s uploaded resume &amp; projects</div>
                    </div>
                  </button>
                </div>

                {interviewMode === 'TOPIC' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Focus Technical Domain *
                      </label>
                      <input
                        type="text"
                        value={domainOrTopic}
                        onChange={(e) => setDomainOrTopic(e.target.value)}
                        placeholder="e.g. Full Stack & Web Systems, DevOps, Data Engineering"
                        className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 shadow-2xs font-medium"
                      />
                    </div>
                    <div>
                      <DifficultySelect
                        label="Target Difficulty *"
                        value={difficulty}
                        onChange={setDifficulty}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-900 text-xs">
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Each candidate will be interviewed specifically on their parsed resume projects, tech stack, and experience.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* For Listening Comprehension or Both: Select Passage */}
            {(sessionType === 'LISTENING_COMPREHENSION' || sessionType === 'BOTH') && (
              <div className="pt-2 border-t border-neutral-200/60">
                <PassageSelect
                  label="Spoken Briefing Audio Passage *"
                  value={listeningPassageId}
                  onChange={setListeningPassageId}
                />
                <p className="text-[10px] text-neutral-500 mt-1.5">
                  Audio passage spoken aloud by the voice engine without subtitles, testing candidate oral comprehension recall.
                </p>
              </div>
            )}
          </div>

          {/* 5. Schedule & Time Limit Window */}
          <div className="space-y-4 p-4.5 bg-neutral-50/80 rounded-2xl border border-neutral-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-neutral-900 font-semibold text-xs">
                <Calendar className="w-4 h-4 text-neutral-700" />
                <span>5. Schedule &amp; Assessment Window</span>
              </div>

              {/* Time Restriction Toggle: Strict Window vs No Time Limit */}
              <div className="inline-flex items-center bg-white border border-neutral-200 rounded-xl p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setHasTimeLimit(true)}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1.5 ${
                    hasTimeLimit ? 'bg-neutral-900 text-white shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Strict Time Window</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHasTimeLimit(false)}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1.5 ${
                    !hasTimeLimit ? 'bg-emerald-600 text-white shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>No Time Limit (Anytime)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Modern Calendar Date Input */}
              <div className="sm:col-span-1">
                <DatePicker
                  label="Assessment Due Date *"
                  value={dueDate}
                  onChange={(val) => setDueDate(val)}
                  minDate={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Time Inputs (Shown if hasTimeLimit is true) */}
              {hasTimeLimit ? (
                <>
                  <div>
                    <TimePicker
                      label="Active From (Start Time) *"
                      required={hasTimeLimit}
                      value={startTime}
                      onChange={setStartTime}
                    />
                  </div>

                  <div>
                    <TimePicker
                      label="Active Until (End Time) *"
                      required={hasTimeLimit}
                      value={endTime}
                      onChange={setEndTime}
                      align="right"
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 flex items-center">
                  <div className="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Flexible / No Time Limit Enabled:</strong> Candidates can start and complete this drill anytime on or before <strong>{dueDate}</strong> without strict hourly lockouts.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {hasTimeLimit && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] flex items-start space-x-2">
                <Clock className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Strict Timer Active:</strong> Accessible strictly between <strong>{startTime}</strong> and <strong>{endTime}</strong> on {dueDate}. Unsubmitted turns beyond this window expire.
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-neutral-200 rounded-xl text-neutral-700 hover:bg-neutral-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-neutral-900 hover:bg-black text-white font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
            >
              {sessionType === 'MOCK_INTERVIEW' ? (
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
              ) : sessionType === 'LISTENING_COMPREHENSION' ? (
                <Headphones className="w-3.5 h-3.5 text-purple-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>
                {submitting ? 'Assigning Assessment...' : `Dispatch ${
                  sessionType === 'MOCK_INTERVIEW' ? 'Mock Interview' : sessionType === 'LISTENING_COMPREHENSION' ? 'Listening Assessment' : 'Both Assessments'
                }`}
              </span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
