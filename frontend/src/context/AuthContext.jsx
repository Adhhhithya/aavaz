import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { name, role, id, token, etc. }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for saved session
    const storedUser = localStorage.getItem('sih_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // S2/S1: userData is expected to include a `token` field (the staff Supabase
  // access_token, or the victim session token issued after real OTP
  // verification) so authFetch below can attach it to subsequent requests.
  //
  // login/logout/authFetch are wrapped in useCallback so consumers can safely
  // list them in a useEffect dependency array without triggering a re-run on
  // every AuthProvider render (they'd otherwise be a new function identity
  // each time, which is exactly what the react-hooks/exhaustive-deps rule
  // flagged when the staff dashboard pages were wired to authFetch).
  const login = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem('sih_user', JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('sih_user');
  }, []);

  // Thin wrapper around fetch that attaches the current session's bearer
  // token, if any. Existing call sites using plain fetch() still work but
  // won't be authenticated — see docs/AAVAZ_IMPLEMENTATION_AUDIT.md for which
  // ones have been migrated to this helper.
  const authFetch = useCallback((url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (user?.token) {
      headers['Authorization'] = `Bearer ${user.token}`;
    }
    return fetch(url, { ...options, headers });
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, authFetch }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
