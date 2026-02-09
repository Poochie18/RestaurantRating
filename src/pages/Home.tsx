import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../app/AuthProvider";
import { createSpace, listSpaces } from "../supabase/db";
import { Modal } from "../components/Modal";
import type { Space } from "../types";
import { useLanguage } from "../app/LanguageProvider";

const emptyForm = { name: "" };

export function HomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [spaces, setSpaces] = useState<Space[]>([]);
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
    } catch {
      setError("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpaces();
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
              <div className="card" key={space.id}>
                <div className="card-body">
                  <div>
                    <h3 className="card-title">{space.name}</h3>
                    <p className="muted">Private space</p>
                  </div>
                </div>
              </div>
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
