import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  User, 
  Mail, 
  Phone, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  LogOut,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function MandatoryProfileUpdate({ theme = 'dark' }) {
  const isLight = theme === 'light';
  const { user, updateProfile, logout } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Please provide a secure new password of at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match. Please verify both fields.');
      return;
    }

    setIsSubmitting(true);
    const result = await updateProfile({
      newPassword,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim()
    });
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.message || 'Failed to update profile. Please try again.');
    } else {
      setSuccessMessage('Password changed and profile saved! Launching application...');
    }
  };

  return (
    <div
      className={`min-h-screen ambient-glow flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 transition-colors duration-200 ${
        isLight ? 'bg-[#f8fafc] text-slate-900' : 'bg-[#0a0f1d] text-slate-100'
      }`}
    >
      <div className="w-full max-w-lg">
        {/* Header Icon & Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 brand-gradient text-white shadow-lg shadow-emerald-500/25 ring-4 ring-white/10">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-2xl font-black tracking-tight brand-gradient-text">
            Mandatory Profile &amp; Password Update
          </h1>
          <p className={`text-xs mt-1.5 font-medium max-w-md mx-auto ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Welcome <span className="font-bold text-emerald-400">{user?.username}</span>! This is your first login. You must set a new confidential password and confirm your operational details to unlock full access.
          </p>
        </div>

        {/* Card */}
        <div
          className={`p-6 sm:p-8 rounded-2xl border shadow-2xl transition-all duration-200 ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50 backdrop-blur-md'
              : 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-black/60 backdrop-blur-md'
          }`}
        >
          {errorMessage && (
            <div
              className="mb-5 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs bg-rose-500/10 border-rose-500/30 text-rose-500 animate-fadeIn"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div
              className="mb-5 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400 animate-fadeIn"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label
                htmlFor="profile-name"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="profile-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Eng. Khaled Taha"
                  className={`w-full text-xs font-medium pl-9 pr-3 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="profile-email"
                  className={`block text-xs font-semibold mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="profile-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@polymerops.com"
                    className={`w-full text-xs font-medium pl-9 pr-3 py-2.5 rounded-xl border outline-none transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                        : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="profile-phone"
                  className={`block text-xs font-semibold mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+20 100 000 0000"
                    className={`w-full text-xs font-medium pl-9 pr-3 py-2.5 rounded-xl border outline-none transition ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                        : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Mandatory New Password with Magic Eye */}
            <div>
              <label
                htmlFor="new-password"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                New Personal Password * <span className="text-[10px] text-emerald-400 font-normal">(Mandatory)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className={`w-full text-xs font-medium pl-9 pr-10 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-emerald-500 cursor-pointer"
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password with Magic Eye */}
            <div>
              <label
                htmlFor="confirm-password"
                className={`block text-xs font-semibold mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Confirm New Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className={`w-full text-xs font-medium pl-9 pr-10 py-2.5 rounded-xl border outline-none transition ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20'
                      : 'bg-slate-950/80 border-slate-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-emerald-500 cursor-pointer"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 brand-gradient brand-gradient-hover text-white shadow-md shadow-emerald-500/25 ring-1 ring-white/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-98 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Saving &amp; Activating Account...</span>
                </>
              ) : (
                <>
                  <span>Complete Setup &amp; Access App</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Sign Out Option */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 text-[11px]">
              Assigned Tier: <span className="font-bold uppercase text-emerald-400">{user?.subscription_tier || 'free'}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-slate-400 hover:text-rose-500 flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cancel &amp; Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
