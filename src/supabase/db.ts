import { supabase } from "./client";
import type { Rating, Restaurant, Space, SpaceInvite, UserProfile } from "../types";

export async function getUserProfile(id: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertUserProfile(profile: UserProfile) {
  const { error } = await supabase.from("users").upsert(profile, { onConflict: "id" });
  if (error) throw error;
}

export async function listSpaces(userId: string): Promise<Space[]> {
  const { data, error } = await supabase
    .from("space_members")
    .select("space:spaces(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.space) as Space[];
}

export async function getSpace(id: string): Promise<Space | null> {
  const { data, error } = await supabase.from("spaces").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createSpace(input: Pick<Space, "name" | "created_by">) {
  const { data, error } = await supabase.from("spaces").insert(input).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return;
  const { error: memberError } = await supabase.from("space_members").insert({
    space_id: data.id,
    user_id: input.created_by,
    role: "owner"
  });
  if (memberError) throw memberError;
}

export async function listSpaceInvites(spaceId: string): Promise<SpaceInvite[]> {
  const { data, error } = await supabase
    .from("space_invites")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSpaceInvite(spaceId: string, email: string, invitedBy: string) {
  const { error } = await supabase.from("space_invites").insert({
    space_id: spaceId,
    email,
    invited_by: invitedBy,
    status: "pending"
  });
  if (error) throw error;
}

export async function deleteSpaceInvite(inviteId: string) {
  const { error } = await supabase.from("space_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

export async function updateSpace(id: string, name: string) {
  const { error } = await supabase.from("spaces").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteSpace(id: string) {
  const { error } = await supabase.from("spaces").delete().eq("id", id);
  if (error) throw error;
}

export async function listRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase.from("restaurants").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSpaceRestaurants(spaceId: string): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createRestaurant(input: Pick<Restaurant, "name" | "location" | "created_by" | "space_id">) {
  const { error } = await supabase.from("restaurants").insert(input);
  if (error) throw error;
}

export async function updateRestaurant(id: string, input: Pick<Restaurant, "name" | "location">) {
  const { error } = await supabase.from("restaurants").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteRestaurant(id: string) {
  const { error } = await supabase.from("restaurants").delete().eq("id", id);
  if (error) throw error;
}

export async function getRestaurant(id: string) {
  const { data, error } = await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listRatings(restaurantId: string): Promise<Rating[]> {
  const { data, error } = await supabase
    .from("ratings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listRatingsForRestaurants(restaurantIds: string[]): Promise<Rating[]> {
  if (!restaurantIds.length) return [];
  const { data, error } = await supabase
    .from("ratings")
    .select("*")
    .in("restaurant_id", restaurantIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getUserRating(restaurantId: string, userId: string) {
  const { data, error } = await supabase
    .from("ratings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertRating(input: Omit<Rating, "id" | "created_at" | "updated_at">) {
  const { error } = await supabase.from("ratings").upsert(input, {
    onConflict: "restaurant_id,user_id"
  });
  if (error) throw error;
}
