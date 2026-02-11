import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { useLanguage } from "../app/LanguageProvider";
import { useAuth } from "../app/AuthProvider";
import {
  acceptFriendInvite,
  addFriendToSpace,
  cancelFriendInvite,
  declineFriendInvite,
  listFriendRelations,
  listOwnedSpaces,
  removeFriendPair,
  searchUserByDisplayName,
  sendFriendInvite
} from "../supabase/db";
import { supabase } from "../supabase/client";
import type { FriendRelation, Space } from "../types";

type UserSearchResult = { id: string; display_name: string; email: string };
const FRIENDS_CACHE_PREFIX = "friends-cache-v1:";

type FriendsCache = {
  relations: FriendRelation[];
  names: Record<string, string>;
  relationsSig: string;
  namesSig: string;
};

function readFriendsCache(userId: string): FriendsCache | null {
  try {
    const raw = window.localStorage.getItem(`${FRIENDS_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FriendsCache;
    if (!parsed || !Array.isArray(parsed.relations) || typeof parsed.names !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeFriendsCache(userId: string, payload: FriendsCache) {
  try {
    window.localStorage.setItem(`${FRIENDS_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch {
    // Best-effort cache.
  }
}

function mergeRelations(prev: FriendRelation[], next: FriendRelation[]): FriendRelation[] {
  const prevById = new Map(prev.map((item) => [item.other_user_id, item]));
  let changed = prev.length !== next.length;
  const merged = next.map((item) => {
    const existing = prevById.get(item.other_user_id);
    if (
      existing &&
      existing.state === item.state &&
      existing.requested_by === item.requested_by &&
      existing.created_at === item.created_at &&
      existing.updated_at === item.updated_at
    ) {
      return existing;
    }
    changed = true;
    return item;
  });
  return changed ? merged : prev;
}

export function FriendsPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [relations, setRelations] = useState<FriendRelation[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState("");
  const [spaceTarget, setSpaceTarget] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const relationsSigRef = useRef("");
  const namesSigRef = useRef("");
  const spacesSigRef = useRef("");
  const namesRef = useRef<Record<string, string>>({});

  const relationByUser = useMemo(
    () => Object.fromEntries(relations.map((relation) => [relation.other_user_id, relation])),
    [relations]
  );
  const notifyFriendshipsChanged = (incomingCount?: number) => {
    window.dispatchEvent(
      new CustomEvent("friendships-changed", {
        detail: typeof incomingCount === "number" ? { incomingCount } : {}
      })
    );
  };

  const incoming = useMemo(
    () => relations.filter((relation) => relation.state === "incoming_pending"),
    [relations]
  );
  const outgoing = useMemo(
    () => relations.filter((relation) => relation.state === "outgoing_pending"),
    [relations]
  );
  const friends = useMemo(
    () => relations.filter((relation) => relation.state === "friends"),
    [relations]
  );

  const loadAll = async () => {
    if (!user) return;
    const relationData = await listFriendRelations(user.id);
    const incomingCount = relationData.filter((relation) => relation.state === "incoming_pending").length;
    notifyFriendshipsChanged(incomingCount);
    const nextRelationsSig = relationData
      .map((item) => `${item.other_user_id}|${item.state}|${item.requested_by ?? ""}|${item.updated_at ?? ""}|${item.created_at ?? ""}`)
      .join("||");
    let namesMap: Record<string, string> = namesRef.current;
    if (nextRelationsSig !== relationsSigRef.current) {
      relationsSigRef.current = nextRelationsSig;
      setRelations((prev) => mergeRelations(prev, relationData));
    }

    const ids = new Set<string>();
    relationData.forEach((relation) => ids.add(relation.other_user_id));
    if (!ids.size) {
      if (namesSigRef.current !== "") {
        namesSigRef.current = "";
        namesMap = {};
        namesRef.current = namesMap;
        setNames(namesMap);
      }
      writeFriendsCache(user.id, {
        relations: relationData,
        names: namesMap,
        relationsSig: relationsSigRef.current,
        namesSig: namesSigRef.current
      });
      return;
    }

    const { data, error: usersError } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", Array.from(ids));
    if (usersError) {
      // Keep previously known names instead of dropping to "User".
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((row: { id: string; display_name: string }) => {
      map[row.id] = row.display_name;
    });
    const mergedNames: Record<string, string> = {};
    Array.from(ids).forEach((id) => {
      mergedNames[id] = map[id] ?? namesRef.current[id] ?? "";
    });
    const nextNamesSig = Object.entries(mergedNames)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, name]) => `${id}|${name}`)
      .join("||");
    if (nextNamesSig !== namesSigRef.current) {
      namesSigRef.current = nextNamesSig;
      namesMap = mergedNames;
      namesRef.current = namesMap;
      setNames((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(mergedNames);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => prev[key] === mergedNames[key])
        ) {
          return prev;
        }
        return mergedNames;
      });
    } else {
      namesMap = namesRef.current;
    }
    writeFriendsCache(user.id, {
      relations: relationData,
      names: namesMap,
      relationsSig: relationsSigRef.current,
      namesSig: namesSigRef.current
    });
  };

  const loadSpaces = async () => {
    if (!user) return;
    const data = await listOwnedSpaces(user.id);
    const nextSpacesSig = data
      .map((space) => `${space.id}|${space.name}|${space.updated_at ?? ""}|${space.created_at ?? ""}`)
      .join("||");
    if (nextSpacesSig !== spacesSigRef.current) {
      spacesSigRef.current = nextSpacesSig;
      setSpaces(data);
    }
  };

  useEffect(() => {
    if (!user) return;
    const cached = readFriendsCache(user.id);
    if (cached) {
      relationsSigRef.current = cached.relationsSig ?? "";
      namesSigRef.current = cached.namesSig ?? "";
      namesRef.current = cached.names ?? {};
      setRelations(cached.relations ?? []);
      setNames(cached.names ?? {});
      notifyFriendshipsChanged((cached.relations ?? []).filter((relation) => relation.state === "incoming_pending").length);
    }
    loadAll();
  }, [user]);

  useEffect(() => {
    if (spaceModalOpen) loadSpaces();
  }, [spaceModalOpen]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const refreshAll = () => {
      if (!active) return;
      loadAll();
    };

    const channel = supabase
      .channel(`friends-page-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, refreshAll)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refreshAll();
      });

    const interval = window.setInterval(refreshAll, 8000);

    return () => {
      active = false;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !spaceModalOpen) return;
    let active = true;

    const refreshSpaces = () => {
      if (!active) return;
      loadSpaces();
    };

    const channel = supabase
      .channel(`spaces-page-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "spaces", filter: `created_by=eq.${user.id}` }, refreshSpaces)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refreshSpaces();
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user, spaceModalOpen]);

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
        results = fetched.filter((result) => result.id !== user.id);
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

    const normalizedQuery = query.trim().toLowerCase();
    const exactMatch = results.find((result) => result.display_name.trim().toLowerCase() === normalizedQuery);
    const targetId = selectedUser ?? exactMatch?.id ?? (results.length === 1 ? results[0].id : null);
    if (!targetId) {
      setError(t("friendSelectUser"));
      return;
    }

    const existing = relationByUser[targetId];
    if (existing?.state === "friends") {
      setMessage(t("friendAlreadyFriends"));
      return;
    }
    if (existing?.state === "outgoing_pending") {
      setMessage(t("friendAlreadyPendingOutgoing"));
      return;
    }
    if (existing?.state === "incoming_pending") {
      setMessage(t("friendIncomingExists"));
      return;
    }

    setLoading(true);
    try {
      await sendFriendInvite(user.id, targetId);
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

  const handleAccept = async (fromId: string) => {
    if (!user) return;
    setError("");
    try {
      await acceptFriendInvite(user.id, fromId);
      await loadAll();
    } catch {
      setError(t("friendRequestFailed"));
    }
  };

  const handleDecline = async (fromId: string) => {
    if (!user) return;
    setError("");
    try {
      await declineFriendInvite(user.id, fromId);
      await loadAll();
    } catch {
      setError(t("friendRequestFailed"));
    }
  };

  const handleCancelOutgoing = async (toId: string) => {
    if (!user) return;
    setError("");
    try {
      await cancelFriendInvite(user.id, toId);
      await loadAll();
    } catch {
      setError(t("friendRequestFailed"));
    }
  };

  const openRemoveConfirm = (friendId: string) => {
    setRemoveTarget(friendId);
    setRemoveConfirmOpen(true);
    setMenuOpen(null);
  };

  const handleConfirmRemove = async () => {
    if (!user || !removeTarget) return;
    setError("");
    try {
      await removeFriendPair(user.id, removeTarget);
      await loadAll();
      setRemoveConfirmOpen(false);
      setRemoveTarget(null);
      setMessage(t("friendRemoved"));
    } catch {
      setError(t("friendRemoveFailed"));
    }
  };

  const handleAddToSpace = async () => {
    if (!spaceTarget || !selectedSpace || !user) return;
    setError("");
    try {
      await addFriendToSpace(user.id, spaceTarget, selectedSpace);
      setSpaceModalOpen(false);
      setSelectedSpace("");
      setSpaceTarget(null);
      setMessage(t("friendAddedToSpace"));
    } catch {
      setError(t("friendAddToSpaceFailed"));
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{t("friendsTitle")}</h1>
          <p className="muted">{t("friendsPageSubtitle")}</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          {t("addFriend")}
        </button>
      </div>

      {message && (
        <div className="success alert-dismissible">
          <span>{message}</span>
          <button className="alert-close" onClick={() => setMessage("")} aria-label={t("close")}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="error alert-dismissible">
          <span>{error}</span>
          <button className="alert-close" onClick={() => setError("")} aria-label={t("close")}>
            ×
          </button>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="card">
          <h3>{t("friendInvites")}</h3>
          <div className="invite-list">
            {incoming.map((relation) => (
              <div key={`in-${relation.other_user_id}`} className="invite-row">
                <span>{names[relation.other_user_id] || "User"}</span>
                <div className="inline-actions">
                  <button className="btn btn-ghost" onClick={() => handleDecline(relation.other_user_id)}>
                    {t("friendDecline")}
                  </button>
                  <button className="btn" onClick={() => handleAccept(relation.other_user_id)}>
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
            {outgoing.map((relation) => (
              <div key={`out-${relation.other_user_id}`} className="invite-row">
                <span>{names[relation.other_user_id] || "User"}</span>
                <div className="inline-actions">
                  <button className="btn btn-ghost" onClick={() => handleCancelOutgoing(relation.other_user_id)}>
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-invites">
        <h3>{t("friendsPageTitle")}</h3>
        {friends.length ? (
          <div className="invite-list">
            {friends.map((relation) => (
              <div key={`fr-${relation.other_user_id}`} className="invite-row">
                <span>{names[relation.other_user_id] || "User"}</span>
                <div className="user-menu">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setMenuOpen(menuOpen === relation.other_user_id ? null : relation.other_user_id)}
                  >
                    ...
                  </button>
                  {menuOpen === relation.other_user_id && (
                    <div className="menu">
                      <button className="menu-item" onClick={() => openRemoveConfirm(relation.other_user_id)}>
                        {t("friendRemove")}
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setMenuOpen(null);
                          setSpaceTarget(relation.other_user_id);
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
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchResults([]);
                setSelectedUser(null);
              }}
              required
            />
          </label>
          {searchResults.length > 1 && (
            <div className="friend-results">
              {searchResults.map((result) => (
                <label key={result.id} className="friend-result">
                  <input
                    type="radio"
                    name="friend"
                    value={result.id}
                    checked={selectedUser === result.id}
                    onChange={() => setSelectedUser(result.id)}
                  />
                  <span>
                    {result.display_name} ({result.email})
                  </span>
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

      <Modal title={t("friendRemoveConfirmTitle")} open={removeConfirmOpen} onClose={() => setRemoveConfirmOpen(false)}>
        <div className="modal-body compact">
          <p className="muted">{t("friendRemoveConfirmText")}</p>
          <div className="form-footer">
            <button className="btn btn-ghost" onClick={() => setRemoveConfirmOpen(false)}>
              {t("cancel")}
            </button>
            <button className="btn btn-danger" onClick={handleConfirmRemove}>
              {t("friendRemove")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
