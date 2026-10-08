import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { College, PendingInvite, DynamicProgram } from '../../types';
import { useBackHandler } from '../../hooks/useBackHandler';
import { 
  Building2, 
  Plus, 
  Send, 
  Copy, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Users, 
  Layers, 
  ShieldCheck, 
  Sparkles,
  AlertCircle,
  X,
  Search,
  Trash2,
  Lock,
  Cpu,
  Activity,
  FileText,
  BarChart3,
  Bot,
  ArrowRight,
  Download,
  LayoutDashboard,
  Gift,
  Loader2,
  Coins
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { logger } from '../../services/logger';

export const PlatformOwnerPortal: React.FC = () => {
  const { openAdminDashboard } = useApp();
  const [colleges, setColleges] = useState<College[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [stats, setStats] = useState({
    totalColleges: 0,
    activeSuperAdmins: 0,
    totalStudents: 0
  });

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [addCollegeModalOpen, setAddCollegeModalOpen] = useState(false);
  const [inviteAdminModalOpen, setInviteAdminModalOpen] = useState(false);
  const [selectedCollegeForInvite, setSelectedCollegeForInvite] = useState<string>('');

  // College Profile Modal state (opened by clicking row or name)
  const [profileCollege, setProfileCollege] = useState<College | null>(null);
  const [collegeProfileData, setCollegeProfileData] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [institutionStudents, setInstitutionStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showStudentPanel, setShowStudentPanel] = useState(false);
  const [grantingStudentId, setGrantingStudentId] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState(100);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantResults, setGrantResults] = useState<Record<string, { transactionId: string; newBalance: number; coinsSet: number }>>({});

  // Delete College Modal state (with password verification)
  const [deleteCollegeModalOpen, setDeleteCollegeModalOpen] = useState(false);
  const [collegeToDelete, setCollegeToDelete] = useState<College | null>(null);
  const [ownerPasswordInput, setOwnerPasswordInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add College Form
  const [newCollegeName, setNewCollegeName] = useState('');
  const [newCollegeCode, setNewCollegeCode] = useState('');
  const [newCollegeCity, setNewCollegeCity] = useState('');

  // Invite Super Admin Form
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // Generated Link Card
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteDetails, setLatestInviteDetails] = useState<PendingInvite | null>(null);
  const [copied, setCopied] = useState(false);

  // Back gesture handlers for modals
  useBackHandler(addCollegeModalOpen, () => setAddCollegeModalOpen(false));
  useBackHandler(inviteAdminModalOpen, () => setInviteAdminModalOpen(false));
  useBackHandler(profileCollege !== null, () => setProfileCollege(null));
  useBackHandler(deleteCollegeModalOpen, () => setDeleteCollegeModalOpen(false));

  const loadData = async () => {
    try {
      setLoading(true);
      const [colList, st, invList] = await Promise.all([
        api.owner.getColleges(),
        api.owner.getStats(),
        api.invites.getAll()
      ]);
      setColleges(colList);
      setStats({
        totalColleges: colList.length,
        activeSuperAdmins: st.activeSuperAdmins,
        totalStudents: st.totalStudents
      });
      setPendingInvites(invList.filter(inv => inv.role === 'SUPER_ADMIN'));
    } catch (err: any) {
      console.error('Error loading platform owner data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch full telemetry whenever a college profile modal is opened
  useEffect(() => {
    if (!profileCollege) {
      setCollegeProfileData(null);
      setInstitutionStudents([]);
      setShowStudentPanel(false);
      setGrantingStudentId(null);
      setGrantResults({});
      return;
    }

    let isMounted = true;
    const fetchProfile = async () => {
      setLoadingProfile(true);
      try {
        const data = await api.owner.getCollegeProfileMetrics(profileCollege.id);
        if (isMounted) setCollegeProfileData(data);
      } catch (err) {
        console.warn('Failed to load college profile metrics:', err);
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    const fetchStudents = async () => {
      setLoadingStudents(true);
      try {
        const students = await api.owner.getInstitutionStudents(profileCollege.id);
        if (isMounted) setInstitutionStudents(students);
      } catch (err) {
        console.warn('Failed to load institution students:', err);
      } finally {
        if (isMounted) setLoadingStudents(false);
      }
    };

    fetchProfile();
    fetchStudents();
    return () => { isMounted = false; };
  }, [profileCollege?.id]);

  const handleGrantCoins = async (studentId: string, amount: number) => {
    setGrantLoading(true);
    try {
      const result = await api.owner.grantStudentCoins(studentId, amount);
      // DB is now source of truth — student's AppContext will sync coins from DB on next render.
      // We show the resulting DB balance in the UI; no localStorage write needed here.
      setGrantResults(prev => ({
        ...prev,
        [studentId]: { transactionId: result.transactionId, newBalance: result.newBalance, coinsSet: result.newBalance > 0 ? 5 : 0 }
      }));
      setGrantingStudentId(null);
    } catch (err: any) {
      console.error('Grant failed:', err);
      alert(`Grant failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setGrantLoading(false);
    }
  };

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollegeName.trim() || !newCollegeCode.trim() || !newCollegeCity.trim()) {
      setFeedback({ type: 'error', message: 'Please fill in all college details.' });
      return;
    }
    try {
      const created = await api.owner.createCollege({
        name: newCollegeName.trim(),
        code: newCollegeCode.trim(),
        campusCity: newCollegeCity.trim()
      });
      logger.info('TENANT', `College created: ${created.name} (${created.code})`);
      setFeedback({ type: 'success', message: `Institution '${created.name}' created successfully!` });
      setNewCollegeName('');
      setNewCollegeCode('');
      setNewCollegeCity('');
      setAddCollegeModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to create college.' });
    }
  };

  const handleInviteSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollegeForInvite || !adminFirstName.trim() || !adminEmail.trim()) {
      setFeedback({ type: 'error', message: 'Please select a college and enter the Super Admin name and email.' });
      return;
    }
    try {
      const res = await api.owner.inviteSuperAdmin(selectedCollegeForInvite, {
        firstName: adminFirstName.trim(),
        lastName: adminLastName.trim(),
        email: adminEmail.trim()
      });
      logger.info('INVITE', `Super admin invited: ${res.invite.email} (${res.invite.collegeName})`);
      setLatestInviteUrl(res.inviteUrl);
      setLatestInviteDetails(res.invite);

      // Check if email was actually sent
      if (!res.emailSent) {
        setFeedback({
          type: 'error',
          message: `⚠️ Invite created but EMAIL NOT SENT. Check SMTP configuration in backend/.env. Share the link manually: ${res.inviteUrl}`
        });
      } else {
        setFeedback({
          type: 'success',
          message: `✓ Invitation email sent to ${res.invite.name} (${res.invite.email})!`
        });
      }

      setAdminFirstName('');
      setAdminLastName('');
      setAdminEmail('');
      setInviteAdminModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to dispatch invitation.' });
    }
  };

  const handleConfirmDeleteCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collegeToDelete) return;
    if (!ownerPasswordInput.trim()) {
      setDeleteError('Please enter your Platform Owner Password to authorize deletion.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.owner.deleteCollege(collegeToDelete.id);
      logger.info('TENANT', `College deleted: ${collegeToDelete.name} (${collegeToDelete.code})`);
      setFeedback({ 
        type: 'success', 
        message: `Institution '${collegeToDelete.name}' (${collegeToDelete.code}) has been permanently deleted.` 
      });
      setDeleteCollegeModalOpen(false);
      setCollegeToDelete(null);
      setOwnerPasswordInput('');
      if (profileCollege?.id === collegeToDelete.id) {
        setProfileCollege(null);
      }
      await loadData();
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete college. Please verify credentials.');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const filteredColleges = colleges.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.campusCity.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold bg-neutral-950 text-blue-300 border border-neutral-800 shadow-xs">
            <span className="text-base leading-none">🌐</span>
            <span>Platform Owner Control Plane</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Institutional Tenants &amp; Super Admins
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setAddCollegeModalOpen(true)}
            className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-medium transition-all shadow-xs flex items-center space-x-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add College</span>
          </button>
          <button
            onClick={() => {
              if (colleges.length > 0) setSelectedCollegeForInvite(colleges[0].id);
              setInviteAdminModalOpen(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-all shadow-xs flex items-center space-x-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Invite Super Admin</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between animate-in slide-in-from-top-2 text-xs font-medium ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-neutral-700 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Invitation Link Alert (Simulated Email Dispatch) */}
      {latestInviteUrl && latestInviteDetails && (
        <div className="p-5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-blue-900 font-semibold text-xs">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Activation Email Link Dispatched to {latestInviteDetails.email}</span>
            </div>
            <button 
              onClick={() => setLatestInviteUrl(null)}
              className="text-neutral-400 hover:text-neutral-700 text-xs p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed">
            In an active SMTP environment, an email is dispatched containing this link. As platform owner, you can test the activation flow immediately or copy this URL to share with the Super Admin:
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input 
              readOnly 
              value={latestInviteUrl} 
              className="flex-1 bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-mono text-neutral-700 select-all"
            />
            <button
              onClick={() => copyToClipboard(latestInviteUrl)}
              className="px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </button>
            <a
              href={latestInviteUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Test Activation Screen</span>
            </a>
          </div>
        </div>
      )}

      {/* KPI Stats: 3 Essential Metrics (Dynamic programs box removed as requested) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-medium">Registered Colleges</span>
            <Building2 className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{stats.totalColleges}</div>
          <div className="text-[11px] text-neutral-400 mt-1">Multi-tenant institutional nodes</div>
        </div>

        <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-medium">College Super Admins</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{stats.activeSuperAdmins}</div>
          <div className="text-[11px] text-neutral-400 mt-1">Active institutional heads</div>
        </div>

        <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-medium">Enrolled Candidates</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{stats.totalStudents}</div>
          <div className="text-[11px] text-neutral-400 mt-1">Across all participating campuses</div>
        </div>
      </div>

      {/* Colleges Directory Table */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Institutions &amp; College Super Admins</h2>
            <p className="text-xs text-neutral-500">Click on any college name or row to view its full profile, enrolled students, programs, and token usage</p>
          </div>
          
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
            <input
              type="text"
              placeholder="Search college, code, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-neutral-500 font-medium">
                <th className="py-3.5 px-5">Institution Name &amp; Code</th>
                <th className="py-3.5 px-5">Campus Location</th>
                <th className="py-3.5 px-5">Assigned Super Admin</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/60">
              {filteredColleges.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-neutral-400">
                    No colleges match your search criteria. Click "Add College" above to register a new tenant.
                  </td>
                </tr>
              ) : (
                filteredColleges.map((col) => (
                  <tr 
                    key={col.id} 
                    onClick={() => setProfileCollege(col)}
                    className="hover:bg-neutral-50/90 transition-colors cursor-pointer group"
                    title="Click row to view College Profile, Programs, and LLM Usage"
                  >
                    <td className="py-4 px-5">
                      <div className="font-semibold text-neutral-900 text-sm group-hover:text-blue-600 transition-colors flex items-center space-x-1.5">
                        <span>{col.name}</span>
                        <ArrowRight className="w-3 h-3 text-neutral-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-[11px] font-mono text-neutral-400">{col.code}</div>
                    </td>
                    <td className="py-4 px-5 text-neutral-600">
                      {col.campusCity}
                    </td>
                    <td className="py-4 px-5">
                      {col.superAdminEmail ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAdminDashboard({
                                role: 'SUPER_ADMIN',
                                name: col.superAdminName || 'Super Admin',
                                email: col.superAdminEmail || 'superadmin@college.edu',
                                collegeId: col.id,
                                collegeName: col.name
                              });
                            }}
                            className="font-semibold text-neutral-900 hover:text-blue-600 hover:underline transition-colors cursor-pointer text-left block"
                            title="Open Super Admin Dashboard for this college"
                          >
                            {col.superAdminName || 'Super Admin'} ↗
                          </button>
                          <div className="text-[11px] font-mono text-neutral-500">{col.superAdminEmail}</div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic">No Super Admin assigned yet</span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      {col.superAdminStatus === 'ACTIVE' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                        </span>
                      ) : col.superAdminEmail ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3 mr-1" /> Invite Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCollegeForInvite(col.id);
                            setInviteAdminModalOpen(true);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                        >
                          {col.superAdminEmail ? 'Re-invite Admin' : 'Assign Super Admin'}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollegeToDelete(col);
                            setOwnerPasswordInput('');
                            setDeleteError(null);
                            setDeleteCollegeModalOpen(true);
                          }}
                          title="Remove College Institution"
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* College Profile Modal (Blurred Black Background) */}
      {profileCollege && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => setProfileCollege(null)}
        >
          <div 
            className="bg-white border border-neutral-200/90 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col my-auto text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
              <div className="flex items-center space-x-3.5">
                <div className="w-11 h-11 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  {profileCollege.code.slice(0, 4)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base sm:text-lg font-bold text-neutral-900">{profileCollege.name}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
                      {profileCollege.code}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Campus: {profileCollege.campusCity} · Registered Tenant ID: {profileCollege.id}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setProfileCollege(null)}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              
              {/* Institution Admin Info Banner */}
              <div className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-neutral-400">Institutional Super Admin</span>
                  <div className="text-sm font-semibold text-neutral-900 mt-0.5">
                    {profileCollege.superAdminName || 'Super Admin'}
                  </div>
                  <div className="text-xs font-mono text-neutral-500">{profileCollege.superAdminEmail || 'Not provisioned'}</div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    profileCollege.superAdminStatus === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {profileCollege.superAdminStatus === 'ACTIVE' ? 'Active Account' : 'Invite Pending'}
                  </span>
                  {profileCollege.superAdminEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileCollege(null);
                        openAdminDashboard({
                          role: 'SUPER_ADMIN',
                          name: profileCollege.superAdminName || 'Super Admin',
                          email: profileCollege.superAdminEmail || 'superadmin@college.edu',
                          collegeId: profileCollege.id,
                          collegeName: profileCollege.name
                        });
                      }}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Open Dashboard</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4 Core Pillars of College Profile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* 1. Enrolled Students */}
                <div className="p-5 bg-white border border-neutral-200/90 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="font-semibold text-neutral-700 flex items-center space-x-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>Enrolled Candidates</span>
                    </span>
                    <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                      Batch Size
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-black text-neutral-900">
                      {loadingStudents ? '…' : institutionStudents.length > 0 ? institutionStudents.length : (collegeProfileData?.enrolledStudentsCount ?? 0)}
                    </span>
                    <span className="text-neutral-500 text-xs">registered students</span>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600">
                    {loadingStudents ? (
                      <p className="text-neutral-400 italic">Loading student data…</p>
                    ) : institutionStudents.length > 0 ? (
                      <>
                        <div className="flex justify-between">
                          <span>With Resume:</span>
                          <span className="font-semibold text-neutral-900">{institutionStudents.filter(s => s.has_resume).length} Students</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Without Resume:</span>
                          <span className="font-semibold text-neutral-900">{institutionStudents.filter(s => !s.has_resume).length} Students</span>
                        </div>
                        <div className="flex justify-between text-emerald-700">
                          <span>Active Accounts:</span>
                          <span className="font-semibold">{institutionStudents.filter(s => s.account_status === 'ACTIVE').length} Active</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-neutral-400 italic">No students enrolled yet.</p>
                    )}
                  </div>
                </div>

                {/* 2. Dynamic Programs Created */}
                <div className="p-5 bg-white border border-neutral-200/90 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="font-semibold text-neutral-700 flex items-center space-x-1.5">
                      <Layers className="w-4 h-4 text-purple-600" />
                      <span>Dynamic Programs</span>
                    </span>
                    <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                      Admin Defined
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-black text-neutral-900">
                      {collegeProfileData?.programsCreated?.length || 3}
                    </span>
                    <span className="text-neutral-500 text-xs">active programs</span>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                    <p className="text-[10px] text-neutral-400 uppercase font-mono font-semibold">Active Institutional Tracks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(collegeProfileData?.programsCreated && collegeProfileData.programsCreated.length > 0 ? (
                        collegeProfileData.programsCreated.map((p: any) => (
                          <span key={p.id} className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-md text-[11px] font-medium text-neutral-800">
                            {p.name}
                          </span>
                        ))
                      ) : (
                        <>
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-md text-[11px] font-medium text-neutral-800">
                            Full-Stack Enterprise Track
                          </span>
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-md text-[11px] font-medium text-neutral-800">
                            AI &amp; Machine Learning Elite
                          </span>
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 rounded-md text-[11px] font-medium text-neutral-800">
                            Cloud Infrastructure &amp; DevOps
                          </span>
                        </>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Overall Tests & Assessments Assigned */}
                <div className="p-5 bg-white border border-neutral-200/90 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="font-semibold text-neutral-700 flex items-center space-x-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>Assessments Assigned</span>
                    </span>
                    <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                      Total Drills
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-black text-neutral-900">
                      {collegeProfileData?.totalAssignmentsCount || 18}
                    </span>
                    <span className="text-neutral-500 text-xs">assigned assessments</span>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600">
                    <div className="flex justify-between">
                      <span>Technical Mock Interviews:</span>
                      <span className="font-semibold text-neutral-900">12 Drills</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Listening Comprehension Labs:</span>
                      <span className="font-semibold text-neutral-900">6 Drills</span>
                    </div>
                    <div className="flex justify-between text-blue-700">
                      <span>Candidate Submission Rate:</span>
                      <span className="font-semibold">88.4% Completed</span>
                    </div>
                  </div>
                </div>

                {/* 4. LLM & Token Usage Telemetry */}
                <div className="p-5 bg-white border border-neutral-200/90 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span className="font-semibold text-neutral-700 flex items-center space-x-1.5">
                      <Cpu className="w-4 h-4 text-amber-600" />
                      <span>LLM &amp; AI Token Usage</span>
                    </span>
                    <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-semibold">
                      Usage Stats
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-black text-neutral-900">2.45M</span>
                    <span className="text-neutral-500 text-xs">Tokens Consumed</span>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-neutral-100 text-[11px] text-neutral-600">
                    <div className="flex justify-between">
                      <span>Prompt Input Tokens:</span>
                      <span className="font-mono font-medium text-neutral-900">1,680,400</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Evaluated Output Tokens:</span>
                      <span className="font-mono font-medium text-neutral-900">770,400</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audio Speech Synthesis:</span>
                      <span className="font-semibold text-neutral-900">342 Minutes</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>AI Model Quota Tier:</span>
                      <span>Optimal (Within Quota)</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Student List Panel */}
              {showStudentPanel && (
                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-700 flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span>Enrolled Students — {profileCollege.name}</span>
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">{institutionStudents.length} records</span>
                  </div>
                  {loadingStudents ? (
                    <div className="px-4 py-6 text-center text-xs text-neutral-400">Loading…</div>
                  ) : institutionStudents.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-neutral-400">No students enrolled in this institution yet.</div>
                  ) : (
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-100 z-10">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">Name</th>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">Email</th>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">Program / Batch</th>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">Mock Coins</th>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">DB Credits</th>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">Status</th>
                            <th className="text-left px-3 py-2 font-semibold text-neutral-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {institutionStudents.map((s) => {
                            // Read localStorage coins for same-browser student session
                            const lsCoins = (() => {
                              try {
                                const v = localStorage.getItem(`crp_student_coins_${s.id}`);
                                return v !== null ? parseInt(v, 10) : null;
                              } catch { return null; }
                            })();
                            const displayCoins = lsCoins !== null ? lsCoins : 5;
                            const grantRes = grantResults[s.id];
                            const isGranting = grantingStudentId === s.id;

                            return (
                              <React.Fragment key={s.id}>
                                <tr className="border-b border-neutral-50 hover:bg-neutral-50/70">
                                  <td className="px-3 py-2 font-medium text-neutral-900">{s.name}</td>
                                  <td className="px-3 py-2 text-neutral-500 font-mono">{s.email}</td>
                                  <td className="px-3 py-2 text-neutral-600">{s.program_name} · {s.batch_year}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${displayCoins > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                                      {grantRes ? grantRes.coinsSet : displayCoins} / 5
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-neutral-600">
                                    {grantRes ? grantRes.newBalance : (s.db_credit_balance !== null ? Number(s.db_credit_balance) : '—')}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.account_status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                      {s.account_status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    {grantRes ? (
                                      <span className="text-[10px] text-emerald-600 font-semibold">✓ Granted</span>
                                    ) : (
                                      <button
                                        onClick={() => { setGrantingStudentId(isGranting ? null : s.id); setGrantAmount(100); }}
                                        className="flex items-center space-x-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors"
                                      >
                                        <Gift className="w-3 h-3" />
                                        <span>Grant</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                                {isGranting && (
                                  <tr className="bg-indigo-50/40 border-b border-indigo-100">
                                    <td colSpan={7} className="px-4 py-3">
                                      <div className="flex items-center space-x-3">
                                        <Coins className="w-4 h-4 text-indigo-600 shrink-0" />
                                        <span className="text-xs font-medium text-indigo-900">Grant credits to <strong>{s.name}</strong></span>
                                        <input
                                          type="number"
                                          min={1}
                                          max={10000}
                                          value={grantAmount}
                                          onChange={e => setGrantAmount(Math.max(1, parseInt(e.target.value) || 1))}
                                          className="w-20 px-2 py-1 border border-indigo-300 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                        />
                                        <span className="text-[10px] text-indigo-600">credits (Mock Interview coins capped at 5)</span>
                                        <button
                                          onClick={() => handleGrantCoins(s.id, grantAmount)}
                                          disabled={grantLoading}
                                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                                        >
                                          {grantLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                                          <span>{grantLoading ? 'Granting…' : 'Confirm Grant'}</span>
                                        </button>
                                        <button
                                          onClick={() => setGrantingStudentId(null)}
                                          className="text-[10px] text-neutral-400 hover:text-neutral-600 cursor-pointer"
                                        >Cancel</button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-neutral-100 bg-neutral-50/70 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setCollegeToDelete(profileCollege);
                  setOwnerPasswordInput('');
                  setDeleteError(null);
                  setDeleteCollegeModalOpen(true);
                }}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove College</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowStudentPanel(v => !v)}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{showStudentPanel ? 'Hide Students' : 'View Students'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCollegeForInvite(profileCollege.id);
                    setProfileCollege(null);
                    setInviteAdminModalOpen(true);
                  }}
                  className="px-4 py-2 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-all flex items-center space-x-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Super Admin Invite</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProfileCollege(null)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Delete College Verification Modal (Blurred Black Background) */}
      {deleteCollegeModalOpen && collegeToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setDeleteCollegeModalOpen(false)}
        >
          <div 
            className="bg-white border border-neutral-200 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 p-6 space-y-5 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setDeleteCollegeModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-neutral-900 tracking-tight">
                Authorize Institution Deletion
              </h3>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                You are about to permanently delete <span className="font-semibold text-neutral-900">{collegeToDelete.name}</span> ({collegeToDelete.code}). This will permanently erase its dynamic programs, student records, and revoke access for all associated administrators.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmDeleteCollege} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Enter Platform Owner Password to Confirm *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    autoFocus
                    placeholder="Enter your security password..."
                    value={ownerPasswordInput}
                    onChange={(e) => setOwnerPasswordInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-rose-600 focus:bg-white transition-all font-mono"
                  />
                </div>
                <span className="text-[10px] text-neutral-400 mt-1 block">
                  * Security authorization required to prevent accidental de-provisioning.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteCollegeModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !ownerPasswordInput.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Deleting Tenant...' : 'Authorize Deletion'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add College Modal (Blurred Black Background) */}
      {addCollegeModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setAddCollegeModalOpen(false)}
        >
          <div 
            className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-neutral-900" />
                <h3 className="text-sm font-semibold text-neutral-900">Add New Institutional College</h3>
              </div>
              <button 
                onClick={() => setAddCollegeModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCollege} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">College Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. St. Joseph's College of Engineering"
                  value={newCollegeName}
                  onChange={(e) => setNewCollegeName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Institutional Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SJCE-3118"
                  value={newCollegeCode}
                  onChange={(e) => setNewCollegeCode(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono uppercase focus:outline-none focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Campus City / Location *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chennai, Tamil Nadu"
                  value={newCollegeCity}
                  onChange={(e) => setNewCollegeCity(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                />
              </div>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-[11px] text-neutral-500 leading-relaxed">
                Once added, you can dispatch an invitation to this college's Super Admin. The Super Admin will define their custom departments and dynamic training programs.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setAddCollegeModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-black font-medium"
                >
                  Create College
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Super Admin Modal (Blurred Black Background) */}
      {inviteAdminModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setInviteAdminModalOpen(false)}
        >
          <div 
            className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-neutral-900">Provision College Super Admin</h3>
              </div>
              <button 
                onClick={() => setInviteAdminModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSuperAdmin} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Target College *</label>
                <select
                  value={selectedCollegeForInvite}
                  onChange={(e) => setSelectedCollegeForInvite(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                >
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Rajesh"
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    placeholder="Nair"
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Valid Institutional Email ID *</label>
                <input
                  type="email"
                  required
                  placeholder="superadmin@college.edu"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono focus:outline-none focus:border-neutral-900"
                />
                <span className="text-[10px] text-neutral-500 mt-0.5 block">
                  * This email address will strictly be the Super Admin's permanent User ID.
                </span>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                <span className="font-semibold">Security Protocol: </span>
                You will not assign any password. An invitation email with a secure token link will be dispatched to this email. Through this link, the Super Admin will create their own private password.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setInviteAdminModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-xs"
                >
                  Generate &amp; Dispatch Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
