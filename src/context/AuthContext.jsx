import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY_TOKEN = 'pvc_auth_token';
const STORAGE_KEY_USER = 'pvc_auth_user';

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getApiEndpoint(endpoint = 'login.php') {
  if (typeof window !== 'undefined' && window.location) {
    return `./api/${endpoint}`;
  }
  return `/api/${endpoint}`;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_TOKEN) || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch (err) {
      console.warn('Failed to clear auth storage:', err);
    }
    setToken(null);
    setUser(null);
  }, []);

  // Update user state and synchronize local storage
  const updateUserData = useCallback((updatedUserData) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedUserData };
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(merged));
      } catch (err) {
        console.warn('LocalStorage save failed:', err);
      }
      return merged;
    });
  }, []);

  // Check if session has expired based on access_expires_at timestamp
  const isSessionExpired = useCallback((currentUser) => {
    if (!currentUser || !currentUser.access_expires_at) return false;
    const expiryTime = new Date(currentUser.access_expires_at).getTime();
    if (Number.isNaN(expiryTime)) return false;
    return Date.now() > expiryTime;
  }, []);

  // Hydration and expiration check on mount
  useEffect(() => {
    if (user) {
      if (isSessionExpired(user)) {
        logout();
        setAuthError('Your account access has expired. Please contact an administrator.');
      }
    }
    setIsLoading(false);
  }, [user, isSessionExpired, logout]);

  // Periodic expiration guard
  useEffect(() => {
    if (!user || !user.access_expires_at) return;

    const interval = setInterval(() => {
      if (isSessionExpired(user)) {
        logout();
        setAuthError('Your session has expired.');
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [user, isSessionExpired, logout]);

  // Standard Username or Email / Password Login
  const login = async (identifier, password) => {
    setAuthError(null);
    try {
      const response = await fetch(getApiEndpoint('login.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          username: identifier.trim(),
          password
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !data.success) {
        const errorMsg = data?.message || `Authentication failed (HTTP ${response.status})`;
        setAuthError(errorMsg);
        return { success: false, message: errorMsg };
      }

      // Check client-side expiration safeguard
      if (isSessionExpired(data.user)) {
        const expiredMsg = 'Your account access has expired. Please contact an administrator.';
        setAuthError(expiredMsg);
        return { success: false, message: expiredMsg };
      }

      // Persist session
      const userToken = data.token || 'pvc_user_' + data.user.id + '_' + Date.now();
      const userData = data.user;

      try {
        localStorage.setItem(STORAGE_KEY_TOKEN, userToken);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
      } catch (err) {
        console.warn('LocalStorage save failed:', err);
      }

      setToken(userToken);
      setUser(userData);
      setAuthError(null);

      return { success: true, user: userData, token: userToken };
    } catch (err) {
      const netMsg = err.message || 'Network error connecting to login server';
      setAuthError(netMsg);
      return { success: false, message: netMsg };
    }
  };

  // Google OAuth Login
  const loginWithGoogle = async (credential) => {
    setAuthError(null);
    try {
      const response = await fetch(getApiEndpoint('google_auth.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ credential })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !data.success) {
        const errorMsg = data?.message || `Google sign-in failed (HTTP ${response.status})`;
        setAuthError(errorMsg);
        return { success: false, message: errorMsg };
      }

      const userToken = data.token || 'pvc_user_' + data.user.id + '_' + Date.now();
      const userData = data.user;

      try {
        localStorage.setItem(STORAGE_KEY_TOKEN, userToken);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
      } catch (err) {
        console.warn('LocalStorage save failed:', err);
      }

      setToken(userToken);
      setUser(userData);
      setAuthError(null);

      return { success: true, user: userData, token: userToken };
    } catch (err) {
      const netMsg = err.message || 'Network error during Google sign-in';
      setAuthError(netMsg);
      return { success: false, message: netMsg };
    }
  };

  // Request Password Reset Link
  const forgotPassword = async (identifier) => {
    try {
      const response = await fetch(getApiEndpoint('forgot_password.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ identifier: identifier.trim() })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.success) {
        return {
          success: false,
          message: data?.message || `Failed to send reset link (HTTP ${response.status})`
        };
      }

      return {
        success: true,
        message: data.message || 'Password reset link sent to your email.',
        debug: data.debug
      };
    } catch (err) {
      return {
        success: false,
        message: err.message || 'Network error requesting password reset.'
      };
    }
  };

  // Reset Password using Token
  const resetPassword = async (resetToken, newPassword) => {
    try {
      const response = await fetch(getApiEndpoint('reset_password.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          token: resetToken.trim(),
          new_password: newPassword
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.success) {
        return {
          success: false,
          message: data?.message || `Failed to reset password (HTTP ${response.status})`
        };
      }

      return {
        success: true,
        message: data.message || 'Password successfully updated.'
      };
    } catch (err) {
      return {
        success: false,
        message: err.message || 'Network error resetting password.'
      };
    }
  };

  // Mandatory Profile Setup & Personal Data Update
  const updateProfile = async ({ newPassword, fullName, email, phone }) => {
    try {
      const currentUserId = user?.id;
      const response = await fetch(getApiEndpoint('update_profile.php'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          user_id: currentUserId,
          new_password: newPassword,
          full_name: fullName,
          email,
          phone
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.success) {
        return {
          success: false,
          message: data?.message || `Failed to update profile (HTTP ${response.status})`
        };
      }

      if (data.user) {
        updateUserData(data.user);
      }

      return {
        success: true,
        message: data.message || 'Profile updated successfully.',
        user: data.user
      };
    } catch (err) {
      return {
        success: false,
        message: err.message || 'Network error updating profile.'
      };
    }
  };

  // Feature Gating Helper
  const hasFeature = useCallback(
    (featureKey) => {
      if (!user) return false;
      // Super Admin and Admin have complete access to all capabilities
      if (user.role === 'super_admin' || user.role === 'admin') return true;
      // Check user tier features array
      if (Array.isArray(user.features)) {
        return user.features.includes(featureKey);
      }
      // Fallback: Premium tier unlocks all
      if (user.subscription_tier === 'premium') return true;
      if (user.subscription_tier === 'basic') {
        const basicFeatures = ['dashboard_view', 'daily_sheet_view', 'daily_reconciliation', 'manual_entry', 'auto_reconcile', 'basic_excel_export', 'save_database'];
        return basicFeatures.includes(featureKey);
      }
      const freeFeatures = ['dashboard_view', 'daily_sheet_view', 'basic_excel_export'];
      return freeFeatures.includes(featureKey);
    },
    [user]
  );

  const isSuperAdmin = useCallback(() => user?.role === 'super_admin', [user]);
  const isAdmin = useCallback(() => user?.role === 'super_admin' || user?.role === 'admin', [user]);
  const isFirstLogin = useCallback(() => Boolean(user && Number(user.must_change_password) === 1), [user]);

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    isLoading,
    authError,
    setAuthError,
    login,
    loginWithGoogle,
    forgotPassword,
    resetPassword,
    updateProfile,
    updateUserData,
    logout,
    hasFeature,
    isSuperAdmin,
    isAdmin,
    isFirstLogin
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
