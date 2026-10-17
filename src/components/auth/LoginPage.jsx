import React, { useState } from 'react';
import { Factory, Lock, User, AlertCircle, Loader2, ArrowRight, Sun, Moon, Languages } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage({ lang = 'en', setLang, theme = 'dark', toggleTheme }) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';
  const { login, authError, setAuthError } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (setAuthError) setAuthError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setLocalError('Please enter your username');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    const result = await login(cleanUsername, password);
    setIsSubmitting(false);

    if (!result.success) {
      setLocalError(result.message || 'Authentication failed');
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 brand-gradient text-white shadow-lg shadow-emerald-500/25 ring-4 ring-white/10">
            <Factory className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-2xl font-black tracking-tight brand-gradient-text">
            PVC Pipe Production Suite
          </h1>
          <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Extrusion Intelligence & Shift Management System
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
          <div className="mb-6">
            <h2 className="text-lg font-bold">
              Sign in to your account
            </h2>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Enter your operational credentials to proceed
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label
                htmlFor="login-username"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 pl-3 rtl:pl-0 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="e.g. admin or shift_supervisor"
                  className={`w-full text-xs font-medium pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label
                htmlFor="login-password"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 pl-3 rtl:pl-0 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="••••••••"
                  className={`w-full text-xs font-medium pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                  required
                />
              </div>
            </div>

            {/* Submit Button with Unified Brand Gradient */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 brand-gradient brand-gradient-hover text-white shadow-md shadow-emerald-500/25 ring-1 ring-white/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-98"
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
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              Hostinger MySQL Central Authentication &middot; v2.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
