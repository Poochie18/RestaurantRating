import { supabase } from "./client";
import type { Friend, FriendRequest, Rating, Restaurant, Space, SpaceInvite, UserProfile } from "../types";

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

export async function searchUserByDisplayName(name: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, display_name, email, photo_url")
    .ilike("display_name", name);
  if (error) throw error;
  return data ?? [];
}

export async function createFriendRequest(requesterId: string, recipientId: string) {
  const { error } = await supabase.from("friend_requests").insert({
    requester_id: requesterId,
    recipient_id: recipientId,
    status: "pending"
  });
  if (!error) return;
  if (error.code !== "23505") throw error;
  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({ status: "pending" })
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .eq("status", "declined");
  if (updateError) throw updateError;
}

export async function listIncomingFriendRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("recipient_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listOutgoingFriendRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("requester_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function respondToFriendRequest(requestId: string, status: "accepted" | "declined") {
  if (status === "declined") {
    const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("friend_requests").update({ status }).eq("id", requestId);
  if (error) throw error;
}

export async function listFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from("friends")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listOwnedSpaces(userId: string): Promise<Space[]> {
  const { data, error } = await supabase.from("spaces").select("*").eq("created_by", userId);
  if (error) throw error;
  return data ?? [];
}

export async function addSpaceMember(spaceId: string, userId: string) {
  const { error } = await supabase.from("space_members").upsert(
    {
      space_id: spaceId,
      user_id: userId,
      role: "member"
    },
    { onConflict: "space_id,user_id" }
  );
  if (error) throw error;
}

export async function addFriendPair(userId: string, friendId: string) {
  const { error } = await supabase.from("friends").insert([
    { user_id: userId, friend_id: friendId },
    { user_id: friendId, friend_id: userId }
  ]);
  if (error) throw error;
}

export async function removeFriendPair(userId: string, friendId: string) {
  const { error: firstError } = await supabase
    .from("friends")
    .delete()
    .eq("user_id", userId)
    .eq("friend_id", friendId);
  if (firstError) throw firstError;

  const { error: secondError } = await supabase
    .from("friends")
    .delete()
    .eq("user_id", friendId)
    .eq("friend_id", userId);
  if (secondError) throw secondError;
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
