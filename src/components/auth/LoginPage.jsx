import React, { useState, useEffect, useRef } from 'react';
import { 
  Factory, 
  Lock, 
  User, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  Sun, 
  Moon, 
  Languages, 
  Eye, 
  EyeOff, 
  KeyRound, 
  Mail, 
  CheckCircle2, 
  X,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage({ lang = 'en', setLang, theme = 'dark', toggleTheme }) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';
  const { login, loginWithGoogle, forgotPassword, resetPassword, authError, setAuthError } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  // Google OAuth State
  const [googleClientId, setGoogleClientId] = useState(() => {
    return import.meta.env?.VITE_GOOGLE_CLIENT_ID || '';
  });
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const googleBtnContainerRef = useRef(null);

  // Forgot Password Modal State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [forgotStatus, setForgotStatus] = useState(null); // { type: 'success' | 'error', message: string, debug?: any }

  // Reset Password Modal State (triggered by ?reset_token=... in URL)
  const [resetToken, setResetToken] = useState(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [resetStatus, setResetStatus] = useState(null); // { type: 'success' | 'error', message: string }

  // Check URL query parameters for reset_token
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const tokenFromUrl = params.get('reset_token');
      if (tokenFromUrl) {
        setResetToken(tokenFromUrl);
        setIsResetModalOpen(true);
      }
    }
  }, []);

  // Fetch Google Client ID if not loaded via Vite env
  useEffect(() => {
    let isMounted = true;
    async function loadAuthConfig() {
      try {
        const resp = await fetch('./api/auth_config.php');
        const data = await resp.json().catch(() => null);
        if (isMounted && data && data.google_client_id) {
          setGoogleClientId(data.google_client_id);
        }
      } catch (err) {
        console.warn('Could not fetch auth_config:', err);
      }
    }
    if (!googleClientId) {
      loadAuthConfig();
    }
    return () => {
      isMounted = false;
    };
  }, [googleClientId]);

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    if (!googleClientId || googleClientId.includes('YOUR_')) return;

    // Load GIS script if not present
    const scriptId = 'google-gsi-client';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initGoogleGsi();
      document.body.appendChild(script);
    } else {
      initGoogleGsi();
    }

    function initGoogleGsi() {
      if (typeof window.google === 'undefined' || !window.google.accounts) return;

      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: isLight ? 'outline' : 'filled_black',
            size: 'large',
            width: '100%',
            text: 'continue_with',
            shape: 'pill'
          });
        }
      } catch (err) {
        console.warn('Google GSI init notice:', err);
      }
    }
  }, [googleClientId, isLight]);

  // Handle Google Credential Callback
  const handleGoogleCredentialResponse = async (response) => {
    if (!response || !response.credential) return;
    setIsGoogleLoading(true);
    setLocalError('');
    if (setAuthError) setAuthError(null);

    const res = await loginWithGoogle(response.credential);
    setIsGoogleLoading(false);
    if (!res.success) {
      setLocalError(res.message || 'Google sign-in failed');
    }
  };

  // Standard Username / Email Login Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (setAuthError) setAuthError(null);

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setLocalError('Please enter your username or registered email');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    const result = await login(cleanIdentifier, password);
    setIsSubmitting(false);

    if (!result.success) {
      setLocalError(result.message || 'Authentication failed');
    }
  };

  // Forgot Password Submit
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotStatus(null);
    const cleanId = forgotIdentifier.trim();
    if (!cleanId) {
      setForgotStatus({ type: 'error', message: 'Please enter your email address or username.' });
      return;
    }

    setIsSubmittingForgot(true);
    const res = await forgotPassword(cleanId);
    setIsSubmittingForgot(false);

    if (res.success) {
      setForgotStatus({
        type: 'success',
        message: res.message,
        debug: res.debug
      });
    } else {
      setForgotStatus({
        type: 'error',
        message: res.message || 'Failed to send reset link.'
      });
    }
  };

  // Reset Password Submit (From Token)
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setResetStatus(null);

    if (!newResetPassword || newResetPassword.length < 6) {
      setResetStatus({ type: 'error', message: 'Password must be at least 6 characters long.' });
      return;
    }

    if (newResetPassword !== confirmResetPassword) {
      setResetStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setIsSubmittingReset(true);
    const res = await resetPassword(resetToken, newResetPassword);
    setIsSubmittingReset(false);

    if (res.success) {
      setResetStatus({
        type: 'success',
        message: 'Password reset successful! You may now sign in with your new password.'
      });
      // Remove reset_token from URL
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset_token');
        window.history.replaceState({}, document.title, url.toString());
      }
      setTimeout(() => {
        setIsResetModalOpen(false);
      }, 2500);
    } else {
      setResetStatus({
        type: 'error',
        message: res.message || 'Failed to reset password.'
      });
    }
  };

  const displayedError = localError || authError;

  return (
    <div
      className={`min-h-screen ambient-glow flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 transition-colors duration-200 ${
        isLight ? 'bg-[#f8fafc] text-slate-900' : 'bg-[#0a0f1d] text-slate-100'
      }`}
    >
      {/* Top Controls Bar */}
      <div className="absolute top-4 right-4 rtl:left-4 rtl:right-auto flex items-center gap-2">
        {setLang && (
          <button
            type="button"
            onClick={() => setLang(isAr ? 'en' : 'ar')}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
              isLight
                ? 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
            title="Toggle Language"
          >
            <Languages className="w-4 h-4 text-cyan-500" />
            <span className="font-mono text-xs">{isAr ? 'English' : 'AR'}</span>
          </button>
        )}

        {toggleTheme && (
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-2 rounded-xl transition cursor-pointer shadow-xs ${
              isLight
                ? 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
            }`}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-teal-500" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>
        )}
      </div>

      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 brand-gradient text-white shadow-lg shadow-emerald-500/25 ring-4 ring-white/10">
            <Factory className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-2xl font-black tracking-tight brand-gradient-text">
            PVC Pipe Production Suite
          </h1>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Extrusion Intelligence &amp; Shift Management System
          </p>
        </div>

        {/* Login Card */}
        <div
          className={`p-6 sm:p-8 rounded-2xl border shadow-2xl transition-all duration-200 ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50 backdrop-blur-md'
              : 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-black/60 backdrop-blur-md'
          }`}
        >
          <div className="mb-5">
            <h2 className="text-lg font-bold">
              Sign in to your account
            </h2>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Enter your username or email address to proceed
            </p>
          </div>

          {displayedError && (
            <div
              className="mb-5 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs bg-rose-500/10 border-rose-500/30 text-rose-500 animate-fadeIn"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{displayedError}</div>
            </div>
          )}

          {/* Google Sign-in Section */}
          <div className="mb-5">
            {googleClientId && !googleClientId.includes('YOUR_') ? (
              <div ref={googleBtnContainerRef} className="w-full flex justify-center min-h-[42px]" />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLocalError('Google OAuth Client ID is not configured in .env yet.');
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-2xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>
            )}

            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
              </div>
              <div className={`relative px-3 text-[11px] uppercase tracking-wider font-semibold ${isLight ? 'bg-white text-slate-400' : 'bg-slate-900 text-slate-500'}`}>
                or sign in with credentials
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email Input */}
            <div>
              <label
                htmlFor="login-identifier"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Username or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 pl-3 rtl:pl-0 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="e.g. admin or operator@polymerops.com"
                  className={`w-full text-xs font-medium pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                  required
                />
              </div>
            </div>

            {/* Password Input with Magic Eye */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className={`block text-xs font-semibold ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotStatus(null);
                    setForgotIdentifier(identifier);
                    setIsForgotModalOpen(true);
                  }}
                  className="text-[11px] font-semibold text-emerald-500 hover:text-emerald-400 transition cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 pl-3 rtl:pl-0 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="••••••••"
                  className={`w-full text-xs font-medium pl-9 pr-10 rtl:pl-10 rtl:pr-9 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                  required
                />
                {/* Magic Eye Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 pr-3 rtl:pr-0 rtl:pl-3 flex items-center text-slate-400 hover:text-emerald-500 transition cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleLoading}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 brand-gradient brand-gradient-hover text-white shadow-md shadow-emerald-500/25 ring-1 ring-white/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-98 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </>
              )}
            </button>
          </form>

          {/* Setup note */}
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              Hostinger MySQL Central Authentication &middot; RBAC &amp; Tiered Access
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fadeIn">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                <KeyRound className="w-5 h-5" />
                <span>Password Recovery</span>
              </div>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs mb-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Enter your registered username or email address. We will generate a secure recovery token and dispatch a reset link to your email.
            </p>

            {forgotStatus && (
              <div
                className={`mb-4 p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                  forgotStatus.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {forgotStatus.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-medium leading-relaxed">
                  {forgotStatus.message}
                  {forgotStatus.debug?.reset_url && (
                    <div className="mt-2 p-2 rounded bg-slate-950 border border-slate-800 text-[10px] break-all">
                      <span className="text-amber-400 font-bold">Local Dev Reset URL: </span>
                      <a href={forgotStatus.debug.reset_url} className="text-cyan-400 underline">
                        {forgotStatus.debug.reset_url}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Email or Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="user@polymerops.com"
                    className={`w-full text-xs font-medium pl-9 pr-3 py-2 rounded-xl border outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(false)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForgot}
                  className="flex-1 py-2 rounded-xl text-xs font-bold brand-gradient text-white shadow-md shadow-emerald-500/20 disabled:opacity-50 transition cursor-pointer"
                >
                  {isSubmittingForgot ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal (from email link ?reset_token=...) */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fadeIn">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                <KeyRound className="w-5 h-5" />
                <span>Set New Password</span>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs mb-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Please enter your new confidential password. This will replace your old password and reactivate standard access.
            </p>

            {resetStatus && (
              <div
                className={`mb-4 p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                  resetStatus.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {resetStatus.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-medium leading-relaxed">{resetStatus.message}</div>
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="space-y-4">
              {/* New Password with Magic Eye */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  New Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className={`w-full text-xs font-medium pl-9 pr-10 py-2 rounded-xl border outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-emerald-500 transition cursor-pointer"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Confirm Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    value={confirmResetPassword}
                    onChange={(e) => setConfirmResetPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className={`w-full text-xs font-medium pl-9 pr-10 py-2 rounded-xl border outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  className="flex-1 py-2 rounded-xl text-xs font-bold brand-gradient text-white shadow-md shadow-emerald-500/20 disabled:opacity-50 transition cursor-pointer"
                >
                  {isSubmittingReset ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
