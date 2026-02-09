import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { getUserProfile, upsertUserProfile } from "../supabase/db";
import type { UserProfile } from "../types";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string | null, fallbackUser?: User | null) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const doc = await getUserProfile(uid);
    if (!doc && fallbackUser) {
      const displayName = fallbackUser.user_metadata?.display_name || fallbackUser.email || "Anonymous";
      const profileData: UserProfile = {
        id: uid,
        email: fallbackUser.email ?? "",
        display_name: displayName,
        photo_url: null
      };
      await upsertUserProfile(profileData);
      setProfile(profileData);
      return;
    }
    setProfile(doc);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);
      loadProfile(currentUser?.id ?? null, currentUser).finally(() => setLoading(false));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setLoading(true);
      loadProfile(nextUser?.id ?? null, nextUser).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      refreshProfile: async () => loadProfile(user?.id ?? null, user)
    }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
