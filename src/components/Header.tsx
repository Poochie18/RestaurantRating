import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email || "User";
  const avatar = profile?.photo_url || null;
  const initials = (displayName.trim()[0] || "U").toUpperCase();

  useEffect(() => {
    if (!user) {
      setIncomingCount(0);
      return;
    }

    let isActive = true;
    const refreshIncoming = async () => {
      if (!isActive) return;
      try {
        const next = await countIncomingFriendInvites(user.id);
        if (isActive) setIncomingCount(next);
      } catch {
        if (isActive) setIncomingCount(0);
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

    const interval = window.setInterval(refreshIncoming, 8000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIncoming();
    };
    window.addEventListener("focus", refreshIncoming);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isActive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIncoming);
      document.removeEventListener("visibilitychange", onVisibility);
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
        </nav>
        <div className="header-actions">
          <button className="lang-toggle" onClick={toggle} aria-label="Toggle language">
            <span className={`flag flag-uk ${lang === "uk" ? "active" : ""}`} />
            <span className={`flag flag-en ${lang === "en" ? "active" : ""}`} />
          </button>
          <div className="user-menu">
            <button className="avatar" onClick={() => setOpen((prev) => !prev)}>
              {avatar ? <img src={avatar} alt={displayName} /> : <span>{initials}</span>}
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
