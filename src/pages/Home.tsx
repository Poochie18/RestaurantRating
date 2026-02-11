import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { createSpace, listSpaces } from "../supabase/db";
import { supabase } from "../supabase/client";
import { Modal } from "../components/Modal";
import type { Space } from "../types";
import { useLanguage } from "../app/LanguageProvider";

const emptyForm = { name: "" };

export function HomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadSpaces = async () => {
    if (!user) return;
    try {
      const data = await listSpaces(user.id);
      setSpaces(data);
      const ownerIds = Array.from(new Set(data.map((space) => space.created_by).filter((id) => id !== user.id)));
      if (!ownerIds.length) {
        setOwners({});
      } else {
        const { data: users } = await supabase.from("users").select("id, display_name").in("id", ownerIds);
        const map: Record<string, string> = {};
        (users ?? []).forEach((row: { id: string; display_name: string }) => {
          map[row.id] = row.display_name;
        });
        setOwners(map);
      }
    } catch {
      setError("Failed to load spaces.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpaces();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () => {
      if (!active) return;
      loadSpaces();
    };

    const channel = supabase
      .channel(`home-spaces-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "space_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "spaces" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    const interval = window.setInterval(refresh, 8000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Space name is required.");
      return;
    }
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await createSpace({
        name: form.name.trim(),
        created_by: user.id
      });
      setModalOpen(false);
      setForm(emptyForm);
      await loadSpaces();
    } catch {
      setError("Failed to create space.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{t("spacesTitle")}</h1>
          <p className="muted">{t("spacesSubtitle")}</p>
        </div>
        <button className="btn" onClick={() => setModalOpen(true)}>
          {t("addSpace")}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="page-center">{t("loading")}</div>
      ) : (
        <div className="card-grid">
          {spaces.length ? (
            spaces.map((space) => (
              <button
                className="card space-tile"
                key={space.id}
                onClick={() => navigate(`/spaces/${space.id}`)}
              >
                <div className="card-body">
                  <div>
                    <h3 className="card-title">{space.name}</h3>
                    <p className="muted">
                      {space.created_by === user?.id
                        ? t("spaceOwnerYou")
                        : `${t("spaceOwnerPrefix")} ${owners[space.created_by] || "User"}`}
                    </p>
                  </div>
                  <span className="pill">{t("openSpace")}</span>
                </div>
              </button>
            ))
          ) : (
            <p className="muted">{t("noSpaces")}</p>
          )}
        </div>
      )}

      <Modal title={t("addSpace")} open={modalOpen} onClose={() => setModalOpen(false)}>
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>{t("spaceName")}</span>
            <input value={form.name} onChange={(event) => setForm({ name: event.target.value })} required />
          </label>
          <div className="form-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
