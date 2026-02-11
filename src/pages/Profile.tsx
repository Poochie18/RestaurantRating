import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../app/AuthProvider";
import { useLanguage } from "../app/LanguageProvider";
import { updateDisplayName } from "../supabase/auth";
import { uploadAvatar } from "../supabase/storage";
import { supabase } from "../supabase/client";

export function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [name, setName] = useState(profile?.display_name || user?.user_metadata?.display_name || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);

  if (!user) return null;

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await updateDisplayName(user.id, name.trim() || "Anonymous");
      await refreshProfile();
      setSuccess("Profile updated.");
    } catch (err) {
      setError("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const url = await uploadAvatar(user.id, file);
      const { error: updateError } = await supabase
        .from("users")
        .update({ photo_url: url })
        .eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      setSuccess("Avatar updated.");
    } catch (err) {
      setError("Failed to upload avatar.");
    } finally {
      setLoading(false);
    }
  };

  const displayInitial = (profile?.display_name || user.user_metadata?.display_name || "U").trim()[0] || "U";
  const avatar = profile?.photo_url || null;
  const avatarUrl = avatar && /^https?:\/\//i.test(avatar) ? avatar : null;

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl]);

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{t("profileTitle")}</h1>
          <p className="muted">{t("profileSubtitle")}</p>
        </div>
      </div>
      <div className="card profile-card">
        <div className="profile-avatar">
          {avatarUrl && !avatarBroken ? (
            <img src={avatarUrl} alt="Avatar" onError={() => setAvatarBroken(true)} />
          ) : (
            <span>{displayInitial}</span>
          )}
          <label className="btn btn-ghost">
            {t("profileUpload")}
            <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
          </label>
        </div>
        <form className="form" onSubmit={handleSave}>
          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}
          <label className="field">
            <span>{t("profileDisplayName")}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>{t("profileEmail")}</span>
            <input value={profile?.email || user.email || ""} disabled />
          </label>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? t("loading") : t("profileSave")}
          </button>
        </form>
      </div>
    </div>
  );
}

