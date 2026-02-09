import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { logout } from "../supabase/auth";
import { useAuth } from "../app/AuthProvider";
import { useLanguage } from "../app/LanguageProvider";
import { Modal } from "./Modal";

export function Header() {
  const { user, profile } = useAuth();
  const { t, lang, toggle } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email || "User";
  const avatar = profile?.photo_url || null;
  const initials = (displayName.trim()[0] || "U").toUpperCase();

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
            {t("friends")}
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
