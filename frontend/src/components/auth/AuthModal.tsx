import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { BrandIcon } from '../common/BrandLogo';
import { 
  X, 
  Lock, 
  Mail, 
  User, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  KeyRound, 
  ArrowRight,
  Eye,
  EyeOff,
  Building2,
  MapPin,
  Phone
} from 'lucide-react';
import { useBackHandler } from '../../hooks/useBackHandler';

export const AuthModal: React.FC = () => {
  const { 
    authModalOpen, 
    authModalMode, 
    closeAuthModal, 
    loginUser, 
    loginWithAuthUser,
    registerCandidate,
    registerInstitution,
    setActiveView
  } = useApp();

  useBackHandler(authModalOpen, closeAuthModal);

  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD' | 'REGISTER_INSTITUTION'>('LOGIN');

  // Sign in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Candidate Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Institution Registration State
  const [instName, setInstName] = useState('');
  const [instCode, setInstCode] = useState('');
  const [instCity, setInstCity] = useState('');
  const [instAdminName, setInstAdminName] = useState('');
  const [instAdminEmail, setInstAdminEmail] = useState('');
  const [instPassword, setInstPassword] = useState('');
  const [showInstPassword, setShowInstPassword] = useState(false);
  const [instConfirmPassword, setInstConfirmPassword] = useState('');
  const [showInstConfirmPassword, setShowInstConfirmPassword] = useState(false);
  const [instPhone, setInstPhone] = useState('');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'REQUEST_RESET' | 'RESET_SENT'>('REQUEST_RESET');
  const [showForgotPwd, setShowForgotPwd] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync mode from context
  useEffect(() => {
    if (authModalMode === 'register_institution') {
      setActiveTab('REGISTER_INSTITUTION');
    } else if (authModalMode === 'register') {
      setActiveTab('REGISTER');
    } else if (activeTab !== 'FORGOT_PASSWORD') {
      setActiveTab('LOGIN');
    }
  }, [authModalMode]);

  if (!authModalOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginUser(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('Please fill in your name, email, and password.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please re-enter your confirm password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await registerCandidate({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword
      });
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName.trim() || !instCode.trim() || !instCity.trim() || !instAdminName.trim() || !instAdminEmail.trim()) {
      setError('Please fill in all required institution and administrator fields.');
      return;
    }
    if (!instPassword || instPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (instPassword !== instConfirmPassword) {
      setError('Passwords do not match. Please re-enter your confirm password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await registerInstitution({
        institutionName: instName.trim(),
        institutionCode: instCode.trim(),
        campusCity: instCity.trim(),
        adminName: instAdminName.trim(),
        adminEmail: instAdminEmail.trim(),
        password: instPassword,
        contactPhone: instPhone.trim() || undefined
      });
      closeAuthModal();
    } catch (err: any) {
      setError(err?.message || 'Failed to register institution. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.requestPasswordReset(forgotEmail.trim());
      setForgotStep('RESET_SENT');
      setSuccessMsg(res.message || 'Password reset link sent! Check your email.');
    } catch (err: any) {
      setError(err?.message || 'Failed to request password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-neutral-200 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/70 shrink-0">
          <div className="flex items-center space-x-3.5">
            <BrandIcon size="md" />
            <div>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${activeTab === 'REGISTER_INSTITUTION' ? 'bg-blue-600' : 'bg-neutral-900'}`} />
                <h3 className="text-sm font-semibold tracking-tight text-neutral-900">
                  {activeTab === 'LOGIN' && 'Portal Sign In'}
                  {activeTab === 'REGISTER' && 'Candidate Self-Registration'}
                  {activeTab === 'REGISTER_INSTITUTION' && 'Register Your Institution'}
                  {activeTab === 'FORGOT_PASSWORD' && 'Reset Account Password'}
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {activeTab === 'LOGIN' && 'Access your institutional dashboard or independent candidate studio.'}
                {activeTab === 'REGISTER' && 'Open registration for self-paced mock interviews & listening comprehension.'}
                {activeTab === 'REGISTER_INSTITUTION' && 'Self-serve college onboarding for Deans, Principals & Academic Directors.'}
                {activeTab === 'FORGOT_PASSWORD' && 'Universal account recovery for students, faculty staff, counsellors & administrators.'}
              </p>
            </div>
          </div>
          <button 
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 px-6 pt-3 bg-white shrink-0 space-x-4 sm:space-x-6 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => { setActiveTab('LOGIN'); setError(null); setSuccessMsg(null); }}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'LOGIN' 
                ? 'border-neutral-900 text-neutral-900 font-semibold' 
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setActiveTab('REGISTER'); setError(null); setSuccessMsg(null); }}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'REGISTER' 
                ? 'border-neutral-900 text-neutral-900 font-semibold' 
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            Student Sign Up
          </button>
          <button
            onClick={() => { setActiveTab('REGISTER_INSTITUTION'); setError(null); setSuccessMsg(null); }}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer shrink-0 flex items-center space-x-1.5 ${
              activeTab === 'REGISTER_INSTITUTION' 
                ? 'border-neutral-900 text-neutral-900 font-semibold' 
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Register Institution</span>
          </button>
          {activeTab === 'FORGOT_PASSWORD' && (
            <button
              onClick={() => { setActiveTab('FORGOT_PASSWORD'); setError(null); }}
              className="pb-2.5 border-b-2 border-neutral-900 text-neutral-900 font-semibold cursor-pointer shrink-0"
            >
              Reset Password
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start space-x-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: LOGIN */}
          {activeTab === 'LOGIN' && (
            <div className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Email / User ID</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@college.edu or name@example.com"
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-neutral-700">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setActiveTab('FORGOT_PASSWORD');
                        setForgotStep('REQUEST_OTP');
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-neutral-900 hover:bg-black text-white text-xs font-medium py-2.5 rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <span>Sign In to Designated Portal</span>
                  )}
                </button>
              </form>

              {/* Institution Self-Service Registration Banner */}
              <div className="pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('REGISTER_INSTITUTION');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full p-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">Representing a College or University?</p>
                      <p className="text-[11px] text-neutral-500">Register your institution &amp; start as Super Admin</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Register</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CANDIDATE REGISTRATION */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegisterCandidate} className="space-y-3.5">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
                <strong>Independent Candidate Mode: </strong>
                Open practice environment with 100% full access to adaptive AI voice interviews, speech metrics, audio listening tests, and resume-grounded questions. No faculty approval required.
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Full Name *</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Full name"
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Email Address *</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Password *</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-9 pr-9 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type={showRegConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-type your password"
                    className="w-full pl-9 pr-9 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showRegConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-neutral-900 hover:bg-black text-white text-xs font-medium py-2.5 rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating your Studio Account...</span>
                  </>
                ) : (
                  <span>Register &amp; Launch Practice</span>
                )}
              </button>
            </form>
          )}

          {/* TAB 3: UNIVERSAL FORGOT PASSWORD */}
          {activeTab === 'FORGOT_PASSWORD' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl text-[11px] text-neutral-600 leading-relaxed">
                <strong>Universal Account Recovery:</strong> Enter your registered email address (students, faculty staff, counsellors, or administrators). We will send you a secure password reset link via email.
              </div>

              {forgotStep === 'REQUEST_RESET' ? (
                <form onSubmit={handleRequestPasswordReset} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Registered Email Address *</label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="e.g. staff@college.edu or student@college.edu"
                        className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !forgotEmail.trim()}
                    className="w-full bg-neutral-900 hover:bg-black text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Reset Link...</span>
                      </>
                    ) : (
                      <span>Send Password Reset Link</span>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('LOGIN'); setError(null); setSuccessMsg(null); }}
                      className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
                    >
                      ← Remember your password? Back to Sign In
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-start space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-green-900 mb-1">Email Sent!</p>
                        <p className="text-xs text-green-700 leading-relaxed">
                          If an account exists for <strong>{forgotEmail}</strong>, you will receive a password reset link shortly. Please check your inbox and follow the instructions in the email.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-[11px] text-neutral-600">
                    <p className="font-semibold mb-1">What to do next:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-neutral-600">
                      <li>Check your email inbox (and spam folder)</li>
                      <li>Click the password reset link in the email</li>
                      <li>The link expires in 15 minutes</li>
                      <li>After reset, return here to sign in</li>
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => { setForgotStep('REQUEST_RESET'); setForgotEmail(''); setError(null); setSuccessMsg(null); }}
                      className="text-neutral-500 hover:text-neutral-900 cursor-pointer"
                    >
                      ← Send to a different email
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('LOGIN'); setError(null); setSuccessMsg(null); }}
                      className="text-neutral-500 hover:text-neutral-900 cursor-pointer font-medium"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REGISTER INSTITUTION */}
          {activeTab === 'REGISTER_INSTITUTION' && (
            <form onSubmit={handleRegisterInstitution} className="space-y-4">
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs text-neutral-900 space-y-1">
                <div className="flex items-center space-x-2 font-bold text-neutral-900">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Institutional Self-Serve Onboarding</span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Register your college or university to immediately unlock dedicated tenant databases, pre-configured foundational departments (CSE, IT, ECE), and full Super Administrator portal privileges.
                </p>
              </div>

              {/* Institution Information */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">1. Institution Details</p>
                
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Institution / College Name *</label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="text"
                      required
                      value={instName}
                      onChange={(e) => setInstName(e.target.value)}
                      placeholder="College or University name"
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Short Code *</label>
                    <input
                      type="text"
                      required
                      value={instCode}
                      onChange={(e) => setInstCode(e.target.value.toUpperCase())}
                      placeholder="e.g. MIT"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono uppercase focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Campus City / Location *</label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="text"
                        required
                        value={instCity}
                        onChange={(e) => setInstCity(e.target.value)}
                        placeholder="City, State"
                        className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Administrator Information */}
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">2. Super Administrator Credentials</p>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Principal / Dean / Admin Full Name *</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="text"
                      required
                      value={instAdminName}
                      onChange={(e) => setInstAdminName(e.target.value)}
                      placeholder="Full name"
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Official Administrator Email *</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="email"
                      required
                      value={instAdminEmail}
                      onChange={(e) => setInstAdminEmail(e.target.value)}
                      placeholder="admin@college.edu"
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">This email will serve as your primary Super Admin login.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Account Password *</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type={showInstPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={instPassword}
                      onChange={(e) => setInstPassword(e.target.value)}
                      placeholder="Create a strong password (min 6 characters)"
                      className="w-full pl-9 pr-9 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowInstPassword(!showInstPassword)}
                      className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                    >
                      {showInstPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Confirm Password *</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type={showInstConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={instConfirmPassword}
                      onChange={(e) => setInstConfirmPassword(e.target.value)}
                      placeholder="Re-type your password"
                      className="w-full pl-9 pr-9 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowInstConfirmPassword(!showInstConfirmPassword)}
                      className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                    >
                      {showInstConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Contact Phone (Optional)</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
                    <input
                      type="tel"
                      value={instPhone}
                      onChange={(e) => setInstPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-900 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-neutral-900 hover:bg-black text-white text-xs font-semibold py-3 rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>Configuring Institutional Tenancy...</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Register &amp; Launch Institution Portal</span>
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setActiveTab('LOGIN'); setError(null); setSuccessMsg(null); }}
                  className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
                >
                  Already have an account? Back to Sign In
                </button>
              </div>
            </form>
          )}

        </div>


      </div>
    </div>
  );
};

export default AuthModal;
