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

function getLoginEndpoint() {
  if (typeof window !== 'undefined' && window.location) {
    return './api/login.php';
  }
  return '/api/login.php';
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

  const login = async (username, password) => {
    setAuthError(null);
    try {
      const response = await fetch(getLoginEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
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
      const userToken = data.token || 'pvc_session_' + Date.now();
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

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    isLoading,
    authError,
    setAuthError,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
