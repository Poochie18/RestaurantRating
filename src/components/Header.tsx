import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { logout } from "../supabase/auth";
import { useAuth } from "../app/AuthProvider";
import { useLanguage } from "../app/LanguageProvider";
import { Modal } from "./Modal";
import { supabase } from "../supabase/client";
import { countIncomingFriendInvites } from "../supabase/db";

export function Header() {
  const { user, profile } = useAuth();
  const { t, lang, toggle } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [incomingCount, setIncomingCount] = useState(0);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email || "User";
  const avatar = profile?.photo_url || null;
  const avatarUrl = avatar && /^https?:\/\//i.test(avatar) ? avatar : null;
  const initials = (displayName.trim()[0] || "U").toUpperCase();

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (userMenuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!user) {
      setIncomingCount(0);
      return;
    }

    let isActive = true;
    let isRefreshing = false;
    const refreshIncoming = async () => {
      if (!isActive) return;
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        const next = await countIncomingFriendInvites(user.id);
        if (isActive) setIncomingCount(next);
      } catch {
        if (isActive) setIncomingCount(0);
      } finally {
        isRefreshing = false;
      }
    };

    refreshIncoming();
    const channel = supabase
      .channel(`friendships-badge-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refreshIncoming)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, refreshIncoming)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          refreshIncoming();
        }
      });

    const visibleInterval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshIncoming();
    }, 12000);
    const onFriendshipsChanged = (event: Event) => {
      const payload = event as CustomEvent<{ incomingCount?: number }>;
      if (typeof payload.detail?.incomingCount === "number") {
        setIncomingCount(payload.detail.incomingCount);
        return;
      }
      refreshIncoming();
    };
    window.addEventListener("friendships-changed", onFriendshipsChanged);

    return () => {
      isActive = false;
      window.clearInterval(visibleInterval);
      window.removeEventListener("friendships-changed", onFriendshipsChanged);
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/app" className="brand">
          {t("appName")}
        </Link>
        <nav className="nav">
          <NavLink to="/app" end className={({ isActive }) => (isActive ? "active" : "")}>
            {t("home")}
          </NavLink>
          <NavLink to="/friends" className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="nav-link-with-badge">
              {t("friends")}
              {incomingCount > 0 && (
                <span className="friends-badge" aria-label={`${incomingCount} pending friend requests`}>
                  {incomingCount > 9 ? "9+" : incomingCount}
                </span>
              )}
            </span>
          </NavLink>
          <NavLink to="/statistics" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("statistics")}
          </NavLink>
        </nav>
        <div className="header-actions">
          <button className="lang-toggle" onClick={toggle} aria-label="Toggle language">
            <span className={`flag flag-uk ${lang === "uk" ? "active" : ""}`} />
            <span className={`flag flag-en ${lang === "en" ? "active" : ""}`} />
          </button>
          <div className="user-menu" ref={userMenuRef}>
            <button className="avatar" onClick={() => setOpen((prev) => !prev)}>
              {avatarUrl && !avatarBroken ? (
                <img src={avatarUrl} alt={displayName} onError={() => setAvatarBroken(true)} />
              ) : (
                <span>{initials}</span>
              )}
            </button>
            {open && (
              <div className="menu">
                <Link to="/profile" className="menu-item" onClick={() => setOpen(false)}>
                  {t("profile")}
                </Link>
                <button
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    setConfirmOpen(true);
                  }}
                >
                  {t("logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <Modal title={t("logoutConfirmTitle")} open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="modal-body compact">
          <p className="muted">{t("logoutConfirmText")}</p>
          <div className="form-footer">
            <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>
              {t("cancel")}
            </button>
            <button className="btn btn-danger" onClick={handleLogout}>
              {t("logoutConfirmYes")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
