import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { apiGet } from '@/services/api';
import { supabase } from '@/services/supabase';

interface AuthProfile {
  userId: string;
  email: string | null;
  displayName: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiGet<AuthProfile>('/auth/me');
      setProfile(data);
      setAuthError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load administrator profile.';
      setProfile(null);
      setAuthError(message);
      await supabase.auth.signOut();
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await loadProfile();
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void loadProfile();
      else setProfile(null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    setLoading(true);
    setAuthError(null);
    localStorage.setItem('ade-remember', remember ? 'true' : 'false');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw new Error(error.message || 'Invalid email or password.');
    }
    await loadProfile();
    setLoading(false);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    try {
      await apiGet('/auth/logout').catch(() => undefined);
    } finally {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const can = useCallback((permission: string) => Boolean(profile?.permissions.includes(permission)), [profile]);

  const value = useMemo<AuthContextValue>(() => ({
    session, profile, loading, authError, signIn, signOut, resetPassword, refreshProfile: loadProfile, can,
  }), [session, profile, loading, authError, signIn, signOut, resetPassword, loadProfile, can]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
