import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase.js';
import { getStudentProfile, resolveUsername } from '../lib/repository.js';

const AuthContext = createContext(null);

export function isAdminClaims(claims) {
  return claims?.admin === true || claims?.admin === 1 || claims?.isAdmin === true;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [claims, setClaims] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (firebaseUser) => {
    setLoading(true);
    setUser(firebaseUser);
    if (!firebaseUser) {
      setProfile(null);
      setClaims({});
      setLoading(false);
      return;
    }
    try {
      const token = await firebaseUser.getIdTokenResult();
      setClaims(token.claims || {});
    } catch {
      setClaims({});
    }
    try {
      setProfile(await getStudentProfile(firebaseUser.uid));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }), []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(doc(db, 'students', user.uid), (snapshot) => {
      if (snapshot.exists()) setProfile({ id: snapshot.id, ...snapshot.data() });
    }, () => {});
  }, [user?.uid]);

  const login = useCallback(async (identifier, password) => {
    const value = String(identifier || '').trim();
    let email = value;
    if (!value.includes('@')) {
      const record = await resolveUsername(value);
      if (!record?.email) throw new Error('We could not find that username. Use your email instead.');
      email = record.email;
    }
    await setPersistence(auth, browserLocalPersistence);
    return signInWithEmailAndPassword(auth, email.toLowerCase(), password);
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return {};
    const token = await auth.currentUser.getIdTokenResult(true);
    setClaims(token.claims || {});
    return token.claims || {};
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    claims,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: isAdminClaims(claims),
    login,
    logout,
    refreshClaims,
  }), [user, profile, claims, loading, login, logout, refreshClaims]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
