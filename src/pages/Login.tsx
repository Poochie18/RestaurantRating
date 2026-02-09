import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithEmail } from "../supabase/auth";
import { useAuth } from "../app/AuthProvider";
import { useLanguage } from "../app/LanguageProvider";

export function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, lang, toggle } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/app", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      navigate("/app");
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <button className="lang-toggle" onClick={toggle} aria-label="Toggle language">
          <span className={`flag flag-uk ${lang === "uk" ? "active" : ""}`} />
          <span className={`flag flag-en ${lang === "en" ? "active" : ""}`} />
        </button>
        <div className="auth-header">
          <h1>{t("authTitleLogin")}</h1>
          <p className="muted">{t("authSubtitleLogin")}</p>
        </div>
        <form className="form" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}
        <label className="field">
          <span>{t("authEmail")}</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>{t("authPassword")}</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? t("loading") : t("authSignIn")}
        </button>
        <div className="muted">
          {t("authNoAccount")} <Link to="/register">{t("authGoRegister")}</Link>
        </div>
        </form>
      </div>
    </div>
  );
}
