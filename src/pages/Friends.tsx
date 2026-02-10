import { useEffect, useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { useLanguage } from "../app/LanguageProvider";
import { useAuth } from "../app/AuthProvider";
import {
  addFriendPair,
  addSpaceMember,
  createFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  listOwnedSpaces,
  removeFriendPair,
  respondToFriendRequest,
  searchUserByDisplayName
} from "../supabase/db";
import { supabase } from "../supabase/client";
import type { Friend, FriendRequest, Space } from "../types";

export function FriendsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<{ id: string; display_name: string; email: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState("");
  const [spaceTarget, setSpaceTarget] = useState<string | null>(null);

  const loadAll = async () => {
    if (!user) return;
    const [friendsData, incomingData, outgoingData] = await Promise.all([
      listFriends(user.id),
      listIncomingFriendRequests(user.id),
      listOutgoingFriendRequests(user.id)
    ]);
    setFriends(friendsData);
    setIncoming(incomingData);
    setOutgoing(outgoingData);

    const ids = new Set<string>();
    friendsData.forEach((f) => ids.add(f.friend_id));
    incomingData.forEach((r) => ids.add(r.requester_id));
    outgoingData.forEach((r) => ids.add(r.recipient_id));

    if (ids.size) {
      const { data } = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", Array.from(ids));
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: { id: string; display_name: string }) => {
        map[row.id] = row.display_name;
      });
      setNames(map);
    }
  };

  const loadSpaces = async () => {
    if (!user) return;
    const data = await listOwnedSpaces(user.id);
    setSpaces(data);
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  useEffect(() => {
    if (spaceModalOpen) loadSpaces();
  }, [spaceModalOpen]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("friends-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends" },
        () => loadAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSearch = async () => {
    if (!user) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const results = await searchUserByDisplayName(query.trim());
      const filtered = results.filter((r) => r.id !== user.id);
      if (!filtered.length) {
        setError(t("friendNotFound"));
        return;
      }
      setSearchResults(filtered);
      setSelectedUser(filtered.length === 1 ? filtered[0].id : null);
    } catch {
      setError(t("friendNotFound"));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError("");
    setMessage("");
    if (!query.trim()) return;

    let results = searchResults;
    if (!results.length) {
      setLoading(true);
      try {
        const fetched = await searchUserByDisplayName(query.trim());
        results = fetched.filter((r) => r.id !== user.id);
        if (!results.length) {
          setError(t("friendNotFound"));
          return;
        }
        setSearchResults(results);
        setSelectedUser(results.length === 1 ? results[0].id : null);
      } catch {
        setError(t("friendNotFound"));
        return;
      } finally {
        setLoading(false);
      }
    }

    const targetId = selectedUser ?? (results.length === 1 ? results[0].id : null);
    if (!targetId) {
      setError(t("friendSelectUser"));
      return;
    }

    setLoading(true);
    try {
      await createFriendRequest(user.id, targetId);
      setMessage(t("friendRequestSent"));
      setQuery("");
      setSearchResults([]);
      setSelectedUser(null);
      setOpen(false);
      await loadAll();
    } catch {
      setError(t("friendRequestFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (req: FriendRequest) => {
    if (!user) return;
    await respondToFriendRequest(req.id, "accepted");
    await addFriendPair(req.requester_id, req.recipient_id);
    await loadAll();
  };

  const handleDecline = async (req: FriendRequest) => {
    try {
      await respondToFriendRequest(req.id, "declined");
      await loadAll();
    } catch {
      setError(t("friendRequestFailed"));
    }
  };

  const handleRemove = async (friendId: string) => {
    if (!user) return;
    await removeFriendPair(user.id, friendId);
    await loadAll();
  };

  const handleAddToSpace = async () => {
    if (!spaceTarget || !selectedSpace) return;
    await addSpaceMember(selectedSpace, spaceTarget);
    setSpaceModalOpen(false);
    setSelectedSpace("");
    setSpaceTarget(null);
  };

  const friendsList = useMemo(
    () =>
      friends.map((f) => ({
        id: f.friend_id,
        name: names[f.friend_id] || "User"
      })),
    [friends, names]
  );

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{t("friendsTitle")}</h1>
          <p className="muted">{t("friends")}</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          {t("addFriend")}
        </button>
      </div>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      {incoming.length > 0 && (
        <div className="card">
          <h3>{t("friendInvites")}</h3>
          <div className="invite-list">
            {incoming.map((req) => (
              <div key={req.id} className="invite-row">
                <span>{names[req.requester_id] || "User"}</span>
                <div className="inline-actions">
                  <button className="btn btn-ghost" onClick={() => handleDecline(req)}>
                    {t("friendDecline")}
                  </button>
                  <button className="btn" onClick={() => handleAccept(req)}>
                    {t("friendAccept")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card space-invites">
          <h3>{t("outgoingTitle")}</h3>
          <div className="invite-list">
            {outgoing.map((req) => (
              <div key={req.id} className="invite-row">
                <span>{names[req.recipient_id] || "User"}</span>
                <span className="muted">pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-invites">
        <h3>{t("friendsTitle")}</h3>
        {friendsList.length ? (
          <div className="invite-list">
            {friendsList.map((friend) => (
              <div key={friend.id} className="invite-row">
                <span>{friend.name}</span>
                <div className="user-menu">
                  <button className="btn btn-ghost" onClick={() => setMenuOpen(menuOpen === friend.id ? null : friend.id)}>
                    ⋯
                  </button>
                  {menuOpen === friend.id && (
                    <div className="menu">
                      <button className="menu-item" onClick={() => handleRemove(friend.id)}>
                        {t("friendRemove")}
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setSpaceTarget(friend.id);
                          setSpaceModalOpen(true);
                        }}
                      >
                        {t("friendAddToSpace")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{t("friendsEmpty")}</p>
        )}
      </div>

      <Modal title={t("addFriend")} open={open} onClose={() => setOpen(false)}>
        <form className="form" onSubmit={handleSend}>
          <label className="field">
            <span>{t("friendSearchLabel")}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} required />
          </label>
          {searchResults.length > 1 && (
            <div className="friend-results">
              {searchResults.map((res) => (
                <label key={res.id} className="friend-result">
                  <input
                    type="radio"
                    name="friend"
                    value={res.id}
                    checked={selectedUser === res.id}
                    onChange={() => setSelectedUser(res.id)}
                  />
                  <span>{res.display_name} ({res.email})</span>
                </label>
              ))}
            </div>
          )}
          <div className="form-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? t("loading") : t("friendSend")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={t("addToSpaceTitle")} open={spaceModalOpen} onClose={() => setSpaceModalOpen(false)}>
        <div className="form">
          <label className="field">
            <span>{t("addToSpaceSelect")}</span>
            <select value={selectedSpace} onChange={(event) => setSelectedSpace(event.target.value)}>
              <option value="">--</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-footer">
            <button className="btn btn-ghost" onClick={() => setSpaceModalOpen(false)}>
              {t("cancel")}
            </button>
            <button className="btn" onClick={handleAddToSpace} disabled={!selectedSpace}>
              {t("save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
