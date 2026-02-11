import { supabase } from "./client";
import type {
  Friend,
  FriendRelation,
  FriendRelationState,
  FriendRequest,
  Friendship,
  Rating,
  Restaurant,
  Space,
  SpaceInvite,
  UserProfile
} from "../types";
type UserMini = { id: string; display_name: string; email: string };
type SpaceMemberRow = {
  user_id: string;
  role: "owner" | "member";
  user: UserMini | null;
};

function isMissingRpc(error: { code?: string } | null) {
  return error?.code === "PGRST202";
}

function isMissingRelation(error: { code?: string } | null) {
  return error?.code === "PGRST205";
}

export async function getUserProfile(id: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertUserProfile(profile: UserProfile) {
  const { error } = await supabase.from("users").upsert(profile, { onConflict: "id" });
  if (error) throw error;
}

export async function listSpaces(_userId: string): Promise<Space[]> {
  const { data, error } = await supabase.rpc("list_my_spaces");
  if (!error) return (data ?? []) as Space[];
  if (!isMissingRpc(error)) throw error;

  // Fallback for environments where SQL migration with list_my_spaces()
  // has not been applied yet.
  const { data: fallback, error: fallbackError } = await supabase
    .from("spaces")
    .select("*")
    .order("created_at", { ascending: false });
  if (fallbackError) throw fallbackError;
  return fallback ?? [];
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
  const escaped = name.trim().replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const { data, error } = await supabase
    .from("users")
    .select("id, display_name, email, photo_url")
    .ilike("display_name", pattern)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

function relationStateFromFriendship(row: Friendship, viewerId: string): FriendRelationState {
  if (row.status === "accepted") return "friends";
  return row.requested_by === viewerId ? "outgoing_pending" : "incoming_pending";
}

function relationFromFriendship(row: Friendship, viewerId: string): FriendRelation {
  return {
    other_user_id: row.user_a === viewerId ? row.user_b : row.user_a,
    state: relationStateFromFriendship(row, viewerId),
    requested_by: row.requested_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function listFriendRelations(userId: string): Promise<FriendRelation[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error && !isMissingRelation(error)) throw error;
  if (error && isMissingRelation(error)) {
    const [friends, incoming, outgoing] = await Promise.all([
      listFriends(userId),
      listIncomingFriendRequests(userId),
      listOutgoingFriendRequests(userId)
    ]);
    const merged = new Map<string, FriendRelation>();
    friends.forEach((friend) => {
      merged.set(friend.friend_id, {
        other_user_id: friend.friend_id,
        state: "friends",
        requested_by: userId,
        created_at: friend.created_at
      });
    });
    incoming.forEach((request) => {
      if (merged.has(request.requester_id)) return;
      merged.set(request.requester_id, {
        other_user_id: request.requester_id,
        state: "incoming_pending",
        requested_by: request.requester_id,
        created_at: request.created_at
      });
    });
    outgoing.forEach((request) => {
      if (merged.has(request.recipient_id)) return;
      merged.set(request.recipient_id, {
        other_user_id: request.recipient_id,
        state: "outgoing_pending",
        requested_by: userId,
        created_at: request.created_at
      });
    });
    return Array.from(merged.values());
  }
  return (data ?? []).map((row) => relationFromFriendship(row as Friendship, userId));
}

export async function countIncomingFriendInvites(userId: string): Promise<number> {
  const relations = await listFriendRelations(userId);
  return relations.filter((relation) => relation.state === "incoming_pending").length;
}

export async function sendFriendInvite(fromId: string, toId: string) {
  const { error } = await supabase.rpc("send_friend_invite", {
    p_from: fromId,
    p_to: toId
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;
  await createFriendRequest(fromId, toId);
}

export async function acceptFriendInvite(toId: string, fromId: string) {
  const { error } = await supabase.rpc("accept_friend_invite", {
    p_to: toId,
    p_from: fromId
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;

  const { data, error: selectError } = await supabase
    .from("friend_requests")
    .select("id")
    .eq("requester_id", fromId)
    .eq("recipient_id", toId)
    .eq("status", "pending")
    .maybeSingle();
  if (selectError) throw selectError;
  if (!data?.id) return;
  await respondToFriendRequest(data.id, "accepted");
  await addFriendPair(fromId, toId);
}

export async function declineFriendInvite(toId: string, fromId: string) {
  const { error } = await supabase.rpc("decline_friend_invite", {
    p_to: toId,
    p_from: fromId
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;
  const { error: legacyError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("requester_id", fromId)
    .eq("recipient_id", toId)
    .eq("status", "pending");
  if (legacyError) throw legacyError;
}

export async function cancelFriendInvite(fromId: string, toId: string) {
  const { error } = await supabase.rpc("cancel_friend_invite", {
    p_from: fromId,
    p_to: toId
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;
  const { error: legacyError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("requester_id", fromId)
    .eq("recipient_id", toId)
    .eq("status", "pending");
  if (legacyError) throw legacyError;
}

export async function createFriendRequest(requesterId: string, recipientId: string) {
  const { error } = await supabase.from("friend_requests").insert({
    requester_id: requesterId,
    recipient_id: recipientId,
    status: "pending"
  });
  if (!error) return;
  if (error.code !== "23505") throw error;

  const { data: existingPending, error: existingPendingError } = await supabase
    .from("friend_requests")
    .select("id")
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPendingError) throw existingPendingError;
  if (existingPending?.id) return;

  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({ status: "pending", created_at: new Date().toISOString() })
    .eq("requester_id", requesterId)
    .eq("recipient_id", recipientId)
    .in("status", ["declined", "accepted"]);
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

export async function listSpaceMembersWithUsers(spaceId: string): Promise<SpaceMemberRow[]> {
  const { data, error } = await supabase
    .from("space_members")
    .select("user_id, role")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const members = (data ?? []) as { user_id: string; role: "owner" | "member" }[];
  if (!members.length) return [];

  const userIds = members.map((member) => member.user_id);
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, display_name, email")
    .in("id", userIds);
  if (usersError) throw usersError;

  const byId = new Map((users ?? []).map((user: UserMini) => [user.id, user]));
  return members.map((member) => ({
    user_id: member.user_id,
    role: member.role,
    user: byId.get(member.user_id) ?? null
  }));
}

export async function listFriendUsers(userId: string): Promise<UserMini[]> {
  const relations = await listFriendRelations(userId);
  const friendIds = relations
    .filter((relation) => relation.state === "friends")
    .map((relation) => relation.other_user_id);
  if (!friendIds.length) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, display_name, email")
    .in("id", friendIds);
  if (error) throw error;
  return (data ?? []) as UserMini[];
}

export async function addSpaceMember(spaceId: string, userId: string) {
  const { error } = await supabase.from("space_members").upsert(
    {
      space_id: spaceId,
      user_id: userId,
      role: "member"
    },
    { onConflict: "space_id,user_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function removeSpaceMember(spaceId: string, userId: string) {
  const { error } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId);
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
  const { error } = await supabase.rpc("remove_friendship", {
    p_user: userId,
    p_other: friendId
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;

  const { error: legacyRpcError } = await supabase.rpc("remove_friend_pair", {
    p_user_id: userId,
    p_friend_id: friendId
  });
  if (!legacyRpcError) return;
  if (!isMissingRpc(legacyRpcError)) throw legacyRpcError;

  const { error: firstError } = await supabase.from("friends").delete().eq("user_id", userId).eq("friend_id", friendId);
  if (firstError) throw firstError;
  const { error: secondError } = await supabase
    .from("friends")
    .delete()
    .eq("user_id", friendId)
    .eq("friend_id", userId);
  if (secondError) throw secondError;
}

export async function addFriendToSpace(ownerId: string, friendId: string, spaceId: string) {
  const { error } = await supabase.rpc("add_friend_to_space", {
    p_owner: ownerId,
    p_friend: friendId,
    p_space: spaceId
  });
  if (!error) return;
  if (!isMissingRpc(error)) throw error;
  await addSpaceMember(spaceId, friendId);
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
