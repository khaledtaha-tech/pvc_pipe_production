import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  Calendar, 
  Clock, 
  RefreshCw, 
  X, 
  AlertCircle,
  KeyRound,
  Lock,
  ChevronDown,
  Sparkles,
  CreditCard,
  Ban,
  Check,
  Mail,
  Phone,
  User as UserIcon,
  Crown
} from 'lucide-react';

function getApiUrl(endpoint = 'users.php') {
  if (typeof window !== 'undefined' && window.location) {
    return `./api/${endpoint}`;
  }
  return `/api/${endpoint}`;
}

function getAuthHeaders(extraHeaders = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pvc_auth_token') : null;
  const headers = {
    Accept: 'application/json',
    ...extraHeaders
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function formatDateDisplay(dtString) {
  if (!dtString) return 'Unlimited';
  const d = new Date(dtString);
  if (Number.isNaN(d.getTime())) return dtString;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isDateExpired(dtString) {
  if (!dtString) return false;
  const t = new Date(dtString).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
}

export default function AdminUserManagementModal({ isOpen, onClose, currentUser, theme = 'dark' }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }

  // New user form state
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newTier, setNewTier] = useState('free');
  const [newIsActive, setNewIsActive] = useState(true);
  const [newMustChangePassword, setNewMustChangePassword] = useState(true); // Default to true per requirement
  const [newExpiryPreset, setNewExpiryPreset] = useState('unlimited');
  const [newCustomExpiry, setNewCustomExpiry] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Active custom expiry picker target
  const [customExpiryUserId, setCustomExpiryUserId] = useState(null);
  const [customExpiryValue, setCustomExpiryValue] = useState('');

  // Password reset target
  const [passwordResetUserId, setPasswordResetUserId] = useState(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin';

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3800);
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const data = await resp.json().catch(() => null);

      let userList = [];
      if (Array.isArray(data)) {
        userList = data;
      } else if (data && Array.isArray(data.users)) {
        userList = data.users;
      } else if (data && data.data && Array.isArray(data.data.users)) {
        userList = data.data.users;
      } else if (data && Array.isArray(data.data)) {
        userList = data.data;
      }

      if (resp.ok && data && data.success !== false) {
        setUsers(userList);
      } else {
        const errorMsg = data?.message || (data?.code ? `Database Error: ${data.code}` : `Failed to load user list (HTTP ${resp.status})`);
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error fetching users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchUsers();
    }
  }, [isOpen, isAdmin, fetchUsers]);

  if (!isOpen) return null;

  // Access control safeguard
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
        <div className={`p-6 rounded-2xl max-w-sm w-full border ${theme === 'light' ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800 text-white'}`}>
          <div className="flex items-center gap-3 text-rose-500 mb-3">
            <AlertCircle className="w-6 h-6" />
            <h3 className="font-bold text-base">Access Restricted</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Only users with Administrator or Super Administrator roles can access the User Management panel.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Handle Quick Allow / Suspend (Ban) Toggle
  const handleToggleStatus = async (user) => {
    if (user.username === 'admin') {
      showToast('The primary Super Admin account cannot be suspended.', 'error');
      return;
    }

    const nextStatus = user.is_active ? 0 : 1;
    const actionName = nextStatus ? 'Allowed' : 'Suspended';

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          is_active: nextStatus
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(`User ${user.username} is now ${actionName}`);
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to update user status', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error updating user', 'error');
    }
  };

  // Handle Role Change
  const handleRoleChange = async (user, newRoleValue) => {
    if (user.role === newRoleValue) return;
    if (user.username === 'admin' && newRoleValue !== 'super_admin') {
      showToast('Primary Super Admin role cannot be demoted.', 'error');
      return;
    }

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          role: newRoleValue
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(`Updated role for ${user.username} to ${newRoleValue}`);
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to update role', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error updating role', 'error');
    }
  };

  // Handle Subscription Tier Change
  const handleTierChange = async (user, newTierValue) => {
    if (user.subscription_tier === newTierValue) return;

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          subscription_tier: newTierValue
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(`Updated subscription tier for ${user.username} to ${newTierValue.toUpperCase()}`);
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to update subscription tier', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error updating tier', 'error');
    }
  };

  // Handle First-Time Password Reset Flag Toggle
  const handleToggleMustChangePassword = async (user) => {
    const nextFlag = user.must_change_password ? 0 : 1;
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          must_change_password: nextFlag
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(nextFlag ? `Forced password change on next login for ${user.username}` : `Cleared password change requirement for ${user.username}`);
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to update password change flag', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error updating user', 'error');
    }
  };

  // Handle Expiration Extension
  const handleExtendExpiry = async (user, days) => {
    let formattedDate = null;
    if (days !== null) {
      const targetTime = Date.now() + days * 86400000;
      formattedDate = new Date(targetTime).toISOString().slice(0, 19).replace('T', ' ');
    }

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          access_expires_at: formattedDate
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          days === null
            ? `Set ${user.username} to Unlimited Access`
            : `Extended ${user.username} access by ${days} days`
        );
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to update access duration', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error updating expiry', 'error');
    }
  };

  // Handle Custom Expiry Submission
  const handleSaveCustomExpiry = async (userId) => {
    if (!customExpiryValue) return;
    const formatted = customExpiryValue.replace('T', ' ') + ':00';
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: userId,
          access_expires_at: formatted
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast('Access expiration updated successfully');
        setCustomExpiryUserId(null);
        setCustomExpiryValue('');
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to update custom expiry', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error', 'error');
    }
  };

  // Handle Password Reset
  const handleResetPassword = async (userId) => {
    if (!newResetPassword || newResetPassword.trim().length < 4) {
      showToast('Password must be at least 4 characters long', 'error');
      return;
    }
    setIsSubmittingReset(true);
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: userId,
          password: newResetPassword.trim()
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast('Password reset successfully');
        setPasswordResetUserId(null);
        setNewResetPassword('');
      } else {
        showToast(data?.message || 'Failed to reset password', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error resetting password', 'error');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Handle User Deletion
  const handleDeleteUser = async (user) => {
    if (user.username === 'admin') {
      showToast('Primary Super Admin account cannot be deleted.', 'error');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to permanently delete user "${user.username}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const resp = await fetch(getApiUrl(`users.php?id=${user.id}`), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(`User ${user.username} deleted successfully`);
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to delete user', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error deleting user', 'error');
    }
  };

  // Handle Add New User Submission
  const handleCreateUser = async (e) => {
    e.preventDefault();
    const cleanUsername = newUsername.trim();
    if (!cleanUsername) {
      showToast('Username is required', 'error');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      showToast('Password must be at least 4 characters long', 'error');
      return;
    }

    let accessExpiresAt = null;
    if (newExpiryPreset === '7days') {
      accessExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    } else if (newExpiryPreset === '30days') {
      accessExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    } else if (newExpiryPreset === 'custom' && newCustomExpiry) {
      accessExpiresAt = newCustomExpiry.replace('T', ' ') + ':00';
    }

    setIsSubmittingNew(true);
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          username: cleanUsername,
          password: newPassword,
          email: newEmail.trim() || null,
          full_name: newFullName.trim() || null,
          phone: newPhone.trim() || null,
          role: newRole,
          subscription_tier: newTier,
          is_active: newIsActive ? 1 : 0,
          must_change_password: newMustChangePassword ? 1 : 0,
          access_expires_at: accessExpiresAt
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(`User ${cleanUsername} created successfully`);
        setNewUsername('');
        setNewPassword('');
        setNewEmail('');
        setNewFullName('');
        setNewPhone('');
        setNewRole('operator');
        setNewTier('free');
        setNewIsActive(true);
        setNewMustChangePassword(true);
        setNewExpiryPreset('unlimited');
        setNewCustomExpiry('');
        setIsAddFormOpen(false);
        fetchUsers();
      } else {
        showToast(data?.message || 'Failed to create user', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error creating user', 'error');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div
        className={`w-full max-w-6xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          theme === 'light'
            ? 'bg-white border-stone-200 text-stone-900 shadow-stone-300'
            : 'bg-slate-900 border-slate-800 text-slate-100 shadow-black'
        }`}
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            theme === 'light' ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                theme === 'light' ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
              }`}
            >
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Super Admin User &amp; Tier Management</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  Full RBAC &amp; Tiers
                </span>
              </div>
              <p className={`text-xs ${theme === 'light' ? 'text-stone-500' : 'text-slate-400'}`}>
                Allow or suspend accounts, grant roles, assign Free/Basic/Premium subscription tiers, and control password policies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchUsers}
              disabled={isLoading}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="Refresh User List"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddFormOpen((v) => !v)}
              className="px-3 py-1.5 brand-gradient text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isAddFormOpen ? 'Close Form' : 'Register New User'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                theme === 'light' ? 'hover:bg-stone-200 text-stone-500' : 'hover:bg-slate-800 text-slate-400'
              }`}
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast Notification Banner */}
        {toast && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all ${
              toast.type === 'error'
                ? 'bg-rose-500/15 border-b border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-400'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Add User Drawer / Collapsible Form */}
        {isAddFormOpen && (
          <div
            className={`px-6 py-4 border-b transition-all ${
              theme === 'light' ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-emerald-400">
              <UserPlus className="w-4 h-4" />
              <span>Register New System User (With First-Time Setup Enforcement)</span>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. eng_ahmed"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Initial default password"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@polymerops.com"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. Eng. Ahmed Salem"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Role (RBAC)</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="operator">Operator (Line Data Entry)</option>
                    <option value="supervisor">Supervisor (Shift Follow)</option>
                    <option value="admin">Admin (Operational &amp; Data)</option>
                    <option value="super_admin">Super Admin (Complete Privileges)</option>
                    <option value="viewer">Viewer (Read Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Subscription Tier</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="free">Free Tier ($0/mo &middot; 2 Lines)</option>
                    <option value="basic">Basic Tier ($49/mo &middot; 7 Lines)</option>
                    <option value="premium">Premium Tier ($149/mo &middot; Full Suite)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Access Duration</label>
                  <select
                    value={newExpiryPreset}
                    onChange={(e) => setNewExpiryPreset(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="unlimited">Unlimited / Permanent</option>
                    <option value="7days">7 Days</option>
                    <option value="30days">30 Days</option>
                    <option value="custom">Custom Date &amp; Time</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newMustChangePassword}
                      onChange={(e) => setNewMustChangePassword(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-emerald-400">
                      Force Password Update on First Login
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="py-2 px-5 brand-gradient hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  {isSubmittingNew ? 'Registering User...' : 'Save & Register User'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* User Table Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="w-full overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={`${theme === 'light' ? 'bg-stone-100 text-stone-700' : 'bg-slate-950 text-slate-300'} font-semibold border-b border-slate-800`}>
                  <th className="py-3 px-4">User Details</th>
                  <th className="py-3 px-4">Role (RBAC)</th>
                  <th className="py-3 px-4">Subscription Tier</th>
                  <th className="py-3 px-4">Account Status (Allow / Suspend)</th>
                  <th className="py-3 px-4">First-Time Setup</th>
                  <th className="py-3 px-4">Access Expiration</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      {isLoading ? 'Loading user database...' : 'No users found in database.'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isExpired = isDateExpired(u.access_expires_at);
                    const isSelf = u.id === currentUser?.id;
                    const isRoot = u.username === 'admin';

                    return (
                      <tr
                        key={u.id}
                        className={`transition-colors ${
                          theme === 'light'
                            ? 'hover:bg-stone-50 text-stone-800'
                            : 'hover:bg-slate-800/40 text-slate-200'
                        }`}
                      >
                        {/* User Details */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg brand-gradient text-white flex items-center justify-center font-bold text-xs shrink-0">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold flex items-center gap-1.5">
                                <span>{u.username}</span>
                                {isRoot && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    Root Super Admin
                                  </span>
                                )}
                                {isSelf && !isRoot && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {u.email || 'No email attached'} {u.full_name ? `(${u.full_name})` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Selector */}
                        <td className="py-3 px-4">
                          <select
                            value={u.role || 'operator'}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            disabled={isRoot}
                            className={`text-xs px-2 py-1 rounded-md border font-medium outline-none cursor-pointer ${
                              u.role === 'super_admin'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800/80 font-bold'
                                : u.role === 'admin'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 font-bold'
                                : u.role === 'supervisor'
                                ? 'bg-teal-950/60 text-teal-300 border-teal-800/80'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="operator">Operator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </td>

                        {/* Subscription Tier Selector */}
                        <td className="py-3 px-4">
                          <select
                            value={u.subscription_tier || 'free'}
                            onChange={(e) => handleTierChange(u, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-md border font-semibold outline-none cursor-pointer ${
                              u.subscription_tier === 'premium'
                                ? 'bg-purple-950/60 text-purple-300 border-purple-800'
                                : u.subscription_tier === 'basic'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <option value="free">Free ($0/mo)</option>
                            <option value="basic">Basic ($49/mo)</option>
                            <option value="premium">Premium ($149/mo)</option>
                          </select>
                        </td>

                        {/* Account Status (Allow / Suspend Toggle) */}
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            disabled={isRoot}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              u.is_active
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/60'
                                : 'bg-rose-950 text-rose-400 border border-rose-800 hover:bg-rose-900/60'
                            }`}
                            title={isRoot ? 'Cannot suspend primary Super Admin' : (u.is_active ? 'Click to Suspend (Ban) this user' : 'Click to Allow (Reactivate) this user')}
                          >
                            {u.is_active ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Allowed (Active)</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>Suspended (Banned)</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* First-Time Setup Flag Toggle */}
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleMustChangePassword(u)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer border ${
                              u.must_change_password
                                ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                                : 'bg-slate-800/60 text-slate-400 border-slate-700'
                            }`}
                            title="Click to toggle mandatory profile & password update requirement"
                          >
                            {u.must_change_password ? 'Required' : 'Completed'}
                          </button>
                        </td>

                        {/* Access Expiration */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`font-mono text-xs font-semibold ${
                                isExpired
                                  ? 'text-rose-400'
                                  : u.access_expires_at
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {formatDateDisplay(u.access_expires_at)}
                              {isExpired && (
                                <span className="ml-1 text-[10px] uppercase font-bold text-rose-500">
                                  (Expired)
                                </span>
                              )}
                            </span>

                            {/* Quick Extensions */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleExtendExpiry(u, 7)}
                                className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title="Add 7 Days"
                              >
                                +7d
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExtendExpiry(u, 30)}
                                className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title="Add 30 Days"
                              >
                                +30d
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExtendExpiry(u, null)}
                                className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title="Clear Expiry (Unlimited Access)"
                              >
                                &infin;
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomExpiryUserId(u.id);
                                  setCustomExpiryValue(u.access_expires_at ? u.access_expires_at.slice(0, 16) : '');
                                }}
                                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title="Pick Custom Date &amp; Time"
                              >
                                <Calendar className="w-3 h-3 text-cyan-400" />
                              </button>
                            </div>

                            {/* Inline Custom Date Picker */}
                            {customExpiryUserId === u.id && (
                              <div className="mt-1 flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-700">
                                <input
                                  type="datetime-local"
                                  value={customExpiryValue}
                                  onChange={(e) => setCustomExpiryValue(e.target.value)}
                                  className="text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCustomExpiry(u.id)}
                                  className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-bold hover:bg-emerald-500 cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCustomExpiryUserId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Password Reset Trigger */}
                            <button
                              type="button"
                              onClick={() => {
                                setPasswordResetUserId(passwordResetUserId === u.id ? null : u.id);
                                setNewResetPassword('');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                              title="Reset Password"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {/* Delete User */}
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              disabled={isRoot || isSelf}
                              className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                              title={isRoot ? 'Cannot delete Super Admin' : (isSelf ? 'Cannot delete your own account' : 'Delete User')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Inline Password Reset Box */}
                          {passwordResetUserId === u.id && (
                            <div className="mt-2 p-2 bg-slate-950 rounded-lg border border-slate-700 text-left">
                              <label className="block text-[10px] text-slate-400 mb-1">
                                New Password for {u.username}:
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="password"
                                  placeholder="Min 4 chars"
                                  value={newResetPassword}
                                  onChange={(e) => setNewResetPassword(e.target.value)}
                                  className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white w-28"
                                />
                                <button
                                  type="button"
                                  disabled={isSubmittingReset}
                                  onClick={() => handleResetPassword(u.id)}
                                  className="px-2 py-1 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded font-bold cursor-pointer"
                                >
                                  {isSubmittingReset ? '...' : 'Reset'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPasswordResetUserId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white cursor-pointer px-1"
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer info */}
        <div
          className={`px-6 py-3 border-t flex items-center justify-between text-[11px] ${
            theme === 'light' ? 'bg-stone-50 border-stone-200 text-stone-500' : 'bg-slate-950/60 border-slate-800 text-slate-400'
          }`}
        >
          <span>Total Registered Accounts: {users.length}</span>
          <span>Security &amp; RBAC: Bcrypt &middot; Super Admin Protected &middot; Tier Feature Gating Active</span>
        </div>
      </div>
    </div>
  );
}
