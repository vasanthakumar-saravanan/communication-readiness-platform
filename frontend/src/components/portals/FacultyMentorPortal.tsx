import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { useBackHandler } from '../../hooks/useBackHandler';
import { StudentHistoryModal } from '../common/StudentHistoryModal';
import { DeleteConfirmModal } from '../common/DeleteConfirmModal';
import { AssignSessionModal } from '../common/AssignSessionModal';
import { StudentDirectoryTable } from '../common/StudentDirectoryTable';
import type { DynamicProgram, InterviewAssignment } from '../../types';
import { 
  GraduationCap, 
  Search, 
  ShieldCheck, 
  Check, 
  UserPlus, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Trash2, 
  X,
  Plus,
  Mic,
  Headphones,
  Layers,
  Clock,
  ArrowRight
} from 'lucide-react';

export const FacultyMentorPortal: React.FC = () => {
  const { currentUser, verifyCriteriaTask, assignments, openStudentDashboard } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [mentees, setMentees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedOffMap, setSignedOffMap] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [inspectStudentId, setInspectStudentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; role: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'MENTEES' | 'DRILLS'>('MENTEES');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  // authorizedScopes: programs/subdivisions this faculty may target when creating drills.
  // Fetched from /api/faculty/my-scopes on mount. Empty = no backend scope configured yet.
  const [authorizedScopes, setAuthorizedScopes] = useState<any[]>([]);

  useBackHandler(createModalOpen, () => setCreateModalOpen(false));
  useBackHandler(Boolean(inspectStudentId), () => setInspectStudentId(null));
  useBackHandler(Boolean(deleteTarget), () => setDeleteTarget(null));
  useBackHandler(assignModalOpen, () => setAssignModalOpen(false));
  const [targetStudentForAssign, setTargetStudentForAssign] = useState<any | null>(null);
  const [stuName, setStuName] = useState('');
  const [stuEmail, setStuEmail] = useState('');
  const [stuRollNumber, setStuRollNumber] = useState('');
  const [stuDepartment, setStuDepartment] = useState('Computer Science & Engineering');
  const [stuBatchYear, setStuBatchYear] = useState(2026);
  const [programs, setPrograms] = useState<DynamicProgram[]>([]);
  const [selectedProgId, setSelectedProgId] = useState<string>('GENERAL');
  const [selectedSubProgram, setSelectedSubProgram] = useState<string>('');
  const [stuPassword, setStuPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchMentees = async () => {
    try {
      setLoading(true);
      const [list, progs, scopes] = await Promise.all([
        api.mentors.getMyStudents().then(students =>
          students.length > 0 ? students : api.admin.getMentorMentees()
        ).catch(() => api.admin.getMentorMentees()),
        api.college.getPrograms(currentUser?.collegeId || 'col-1'),
        // Load faculty-authorized scopes from backend (scope enforcement)
        api.faculty.getMyScopes().catch(() => [] as any[]),
      ]);
      if (list) {
        setMentees(list);
      }
      if (progs) {
        setPrograms(progs);
        if (progs.length > 0 && selectedProgId === 'GENERAL') {
          const firstProg = progs[0];
          if (firstProg) {
            setSelectedProgId(firstProg.id);
            if (firstProg.hasSubPrograms && firstProg.subPrograms && firstProg.subPrograms.length > 0) {
              setSelectedSubProgram(firstProg.subPrograms[0]);
            }
          }
        }
      }
      // scopes: list of { program_name, subdivision_name, ... } the faculty is authorised for
      if (Array.isArray(scopes)) {
        setAuthorizedScopes(scopes);
      }
    } catch (err: any) {
      console.warn('Error loading mentees or programs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMentees();
  }, []);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stuName.trim() || !stuEmail.trim() || !stuRollNumber.trim()) {
      setFeedback({ type: 'error', message: 'Name, Email, and Roll Number are required.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const activeProg = programs.find(p => p.id === selectedProgId);
      const progName = activeProg ? activeProg.name : 'General Track';
      const trackName = activeProg && activeProg.hasSubPrograms && selectedSubProgram
        ? `${activeProg.name} (${selectedSubProgram})`
        : progName;

      await api.admin.createStudentByMentor({
        name: stuName.trim(),
        email: stuEmail.trim(),
        rollNumber: stuRollNumber.trim(),
        department: stuDepartment,
        batchYear: Number(stuBatchYear),
        track: trackName,
        programId: activeProg?.id,
        programName: activeProg?.name,
        subProgramName: activeProg?.hasSubPrograms ? selectedSubProgram : undefined,
        domain: selectedSubProgram || activeProg?.name || stuDepartment,
        password: stuPassword.trim() || 'student123'
      });
      setFeedback({ type: 'success', message: `Student '${stuName}' enrolled in ${trackName} successfully!` });
      setStuName('');
      setStuEmail('');
      setStuRollNumber('');
      setStuPassword('');
      setCreateModalOpen(false);
      await fetchMentees();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to create student account.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOff = async (menteeId: string) => {
    setSignedOffMap(prev => ({ ...prev, [menteeId]: true }));
    try {
      await verifyCriteriaTask('crit-3');
    } catch {
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await api.admin.deleteUser(deleteTarget.id);
      setFeedback({ type: 'success', message: res.message || `${deleteTarget.name} removed successfully.` });
      setDeleteTarget(null);
      await fetchMentees();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to remove student.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const mentorAssignments = (assignments || []).filter((a: InterviewAssignment) => {
    if (a.assignedByRole === 'FACULTY_MENTOR') return true;
    if (a.targetScope === 'MY_MENTEES') return true;
    if (currentUser?.name && a.assignedByName && a.assignedByName.toLowerCase().includes(currentUser.name.toLowerCase())) return true;
    if (currentUser?.email && a.assignedById && a.assignedById.toLowerCase() === currentUser.email.toLowerCase()) return true;
    return false;
  });

  const filteredMentees = mentees.filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.rollNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8 animate-in fade-in duration-200">
      
      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  {currentUser?.name || 'Faculty Mentor'}
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-900 rounded border border-emerald-200 font-mono">
                  FACULTY MENTOR
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {currentUser?.email} · Assigned Mentee Roster ({mentees.length} Students) · {mentorAssignments.length} Drills Dispatched
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <button 
            type="button"
            onClick={() => { 
              setTargetStudentForAssign(null);
              setAssignModalOpen(true); 
              setFeedback(null); 
            }}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assign Assessment</span>
          </button>
          <button 
            onClick={() => { setCreateModalOpen(true); setFeedback(null); }}
            className="flex items-center space-x-1.5 bg-neutral-900 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Enroll Student</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-3.5 rounded-xl text-xs border flex items-center justify-between ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-neutral-700">✕</button>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex items-center space-x-2 border-b border-neutral-200 pb-3 text-xs">
        <button
          onClick={() => setActiveTab('MENTEES')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === 'MENTEES'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>My Assigned Mentees ({mentees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('DRILLS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-medium transition-all cursor-pointer ${
            activeTab === 'DRILLS'
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Assigned Drills &amp; Submissions ({mentorAssignments.length})</span>
        </button>
      </div>

      {activeTab === 'MENTEES' && (
        <StudentDirectoryTable
          students={mentees}
          onSelectStudent={(s) => openStudentDashboard(s)}
          onAssignStudent={(s) => {
            setTargetStudentForAssign(s);
            setAssignModalOpen(true);
          }}
          showAssignAction={true}
          title="Assigned Mentees"
          subtitle=""
        />
      )}

      {activeTab === 'DRILLS' && (
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                Assigned Practice Drills &amp; Mentee Submissions
              </h3>
            </div>
            <button
              onClick={() => {
                setTargetStudentForAssign(null);
                setAssignModalOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-neutral-900 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-medium transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Assign Assessment</span>
            </button>
          </div>

          {mentorAssignments.length === 0 ? (
            <div className="text-center py-12 text-neutral-400 text-xs">
              <Layers className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
              <p className="font-semibold text-neutral-700 text-sm">No drills dispatched yet.</p>
              <p className="mt-1 max-w-sm mx-auto text-neutral-500">
                Click "Dispatch New Drill" above to assign an interactive voice mock interview or listening lab to your mentees.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {mentorAssignments.map((asg) => {
                const isInterview = asg.sessionType === 'MOCK_INTERVIEW';
                const submissions = asg.submissions || [];
                return (
                  <div key={asg.id} className="border border-neutral-200/90 rounded-xl p-5 bg-neutral-50/50 hover:bg-neutral-50 transition-all space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isInterview
                              ? 'bg-neutral-900 text-white'
                              : 'bg-emerald-900 text-emerald-100'
                          }`}>
                            {isInterview ? <Mic className="w-3 h-3 text-emerald-400" /> : <Headphones className="w-3 h-3 text-emerald-300" />}
                            <span>{isInterview ? 'Technical Mock Interview' : 'Listening Comprehension Lab'}</span>
                          </span>

                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-200/80 text-neutral-800 font-mono">
                            {asg.targetScope.replace(/_/g, ' ')}
                          </span>

                          {asg.isMandatory ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">
                              Mandatory
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-600">
                              Optional Practice
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-neutral-900">{asg.title}</h4>
                        <p className="text-xs text-neutral-500">
                          Due: <span className="font-mono text-neutral-800">{asg.dueDate}</span>
                          {asg.domainOrTopic && <span> · Topic: <span className="font-semibold text-neutral-700">{asg.domainOrTopic}</span></span>}
                          {asg.difficulty && <span> · Difficulty: <span className="font-semibold text-neutral-700">{asg.difficulty}</span></span>}
                          {asg.listeningPassageId && <span> · Audio Passage: <span className="font-semibold text-neutral-700">{asg.listeningPassageId}</span></span>}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-bold text-neutral-900 block">
                            {submissions.length} / {mentees.length}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">Submissions</span>
                        </div>
                      </div>
                    </div>

                    {/* Submissions breakdown */}
                    {submissions.length > 0 ? (
                      <div className="bg-white rounded-lg border border-neutral-200/80 overflow-hidden">
                        <div className="px-3.5 py-2 bg-neutral-100/60 border-b border-neutral-200/60 flex items-center justify-between text-[11px] font-medium text-neutral-600">
                          <span>Mentee Submissions &amp; Scores</span>
                          <span className="font-mono">{submissions.length} completed</span>
                        </div>
                        <div className="divide-y divide-neutral-100 text-xs">
                          {submissions.map((sub, sIdx) => (
                            <div key={sIdx} className="px-3.5 py-2.5 flex items-center justify-between">
                              <div className="flex items-center space-x-2.5">
                                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold">
                                  ✓
                                </span>
                                <div>
                                  <span className="font-semibold text-neutral-900">{sub.studentName}</span>
                                  <span className="text-[10px] text-neutral-400 font-mono ml-2">({sub.studentRollNumber})</span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-3">
                                <span className="text-[11px] text-neutral-400 font-mono">
                                  {sub.submittedAt ? sub.submittedAt.split('T')[0] : 'Completed'}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] bg-neutral-900 text-white">
                                  {sub.score}/100
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-neutral-400 italic bg-white p-2.5 rounded-lg border border-neutral-200/60">
                        No mentee submissions yet. Mentees will see this session marked as pending on their dashboard.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold text-xs">
                  S
                </div>
                <h3 className="text-sm font-semibold text-neutral-900">Enroll College Student Account</h3>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="text-neutral-400 hover:text-neutral-600 text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Student Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aravind Kumar"
                  value={stuName}
                  onChange={(e) => setStuName(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Institutional Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="student@college.edu"
                    value={stuEmail}
                    onChange={(e) => setStuEmail(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Roll Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 22CS1001"
                    value={stuRollNumber}
                    onChange={(e) => setStuRollNumber(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Department</label>
                  <select
                    value={stuDepartment}
                    onChange={(e) => setStuDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:border-neutral-900"
                  >
                    <option value="Computer Science & Engineering">CSE</option>
                    <option value="Information Technology">IT</option>
                    <option value="AI & Data Science">AIDS</option>
                    <option value="Electronics & Communication">ECE</option>
                    <option value="Electrical & Electronics">EEE</option>
                    <option value="Mechanical Engineering">Mechanical</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Batch Year</label>
                  <input
                    type="number"
                    value={stuBatchYear}
                    onChange={(e) => setStuBatchYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Institutional Program *</label>
                {programs.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    No custom programs defined by Super Admin. Candidate will be assigned to General Track.
                  </div>
                ) : (
                  <select
                    value={selectedProgId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedProgId(newId);
                      const p = programs.find(pr => pr.id === newId);
                      if (p?.hasSubPrograms && p.subPrograms && p.subPrograms.length > 0) {
                        setSelectedSubProgram(p.subPrograms[0]);
                      } else {
                        setSelectedSubProgram('');
                      }
                    }}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:border-neutral-900"
                  >
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="GENERAL">General Stream</option>
                  </select>
                )}
              </div>

              {programs.find(p => p.id === selectedProgId)?.hasSubPrograms && (
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Sub-Program / Track Tier</label>
                  <select
                    value={selectedSubProgram}
                    onChange={(e) => setSelectedSubProgram(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-none focus:border-neutral-900"
                  >
                    {(programs.find(p => p.id === selectedProgId)?.subPrograms || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Initial Password</label>
                <input
                  type="password"
                  placeholder="Default: student123"
                  value={stuPassword}
                  onChange={(e) => setStuPassword(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 rounded-xl text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-black font-medium disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Enroll Student Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inspectStudentId && (
        <StudentHistoryModal
          studentIdOrUserId={inspectStudentId}
          onClose={() => setInspectStudentId(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title="Remove Mentee"
          userName={deleteTarget.name}
          userRole={deleteTarget.role}
          isDeleting={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {assignModalOpen && (
        <AssignSessionModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setTargetStudentForAssign(null);
          }}
          onSuccess={(newAsg) => {
            setFeedback({
              type: 'success',
              message: `Drill '${newAsg.title}' assigned successfully to your mentees!`
            });
            setAssignModalOpen(false);
            setTargetStudentForAssign(null);
          }}
          defaultRole="FACULTY_MENTOR"
          defaultTargetScope={targetStudentForAssign ? 'SPECIFIC_STUDENT' : 'MY_MENTEES'}
          menteesList={mentees}
          studentsList={mentees}
          targetStudent={targetStudentForAssign}
          authorizedPrograms={
            authorizedScopes.length > 0
              ? authorizedScopes
                  .filter(s => s.program_name)
                  .map(s => s.program_name as string)
              : undefined
          }
        />
      )}

    </div>
  );
};

export default FacultyMentorPortal;

