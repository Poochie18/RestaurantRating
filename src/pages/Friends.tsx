import { useLanguage } from "../app/LanguageProvider";

export function FriendsPage() {
  const { t } = useLanguage();
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{t("friends")}</h1>
          <p className="muted">Coming soon. We'll add invitations and friend management next.</p>
        </div>
      </div>
      <div className="card">
        <p className="muted">Friends list will live here.</p>
      </div>
    </div>
  );
}
