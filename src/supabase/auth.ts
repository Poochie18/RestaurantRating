import { supabase } from "./client";
import type { UserProfile } from "../types";

export async function registerWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName }
    }
  });
  if (error) throw error;

  const user = data.user;
  if (user) {
    const profile: UserProfile = {
      id: user.id,
      email: user.email ?? email,
      display_name: displayName,
      photo_url: null
    };
    const { error: profileError } = await supabase.from("users").insert(profile);
    if (profileError) throw profileError;
  }

  return data.user;
}

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function updateDisplayName(userId: string, displayName: string) {
  const { error: authError } = await supabase.auth.updateUser({
    data: { display_name: displayName }
  });
  if (authError) throw authError;

  const { error } = await supabase
    .from("users")
    .update({ display_name: displayName })
    .eq("id", userId);
  if (error) throw error;
}
