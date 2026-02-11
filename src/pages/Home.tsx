import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { createSpace, listSpaces } from "../supabase/db";
import { supabase } from "../supabase/client";
import { Modal } from "../components/Modal";
import type { Space } from "../types";
import { useLanguage } from "../app/LanguageProvider";

const emptyForm = { name: "" };
const HOME_CACHE_PREFIX = "home-cache-v1:";

type HomeCache = {
  spaces: Space[];
  owners: Record<string, string>;
  spacesSig: string;
  ownersSig: string;
};

function readHomeCache(userId: string): HomeCache | null {
  try {
    const raw = window.localStorage.getItem(`${HOME_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeCache;
    if (!parsed || !Array.isArray(parsed.spaces) || typeof parsed.owners !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeHomeCache(userId: string, payload: HomeCache) {
  try {
    window.localStorage.setItem(`${HOME_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch {
    // Best-effort cache.
  }
}

function mergeSpaces(prev: Space[], next: Space[]): Space[] {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  let changed = prev.length !== next.length;
  const merged = next.map((item) => {
    const existing = prevById.get(item.id);
    if (
      existing &&
      existing.name === item.name &&
      existing.created_by === item.created_by &&
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
  const spacesSigRef = useRef("");
  const ownersSigRef = useRef("");

  const loadSpaces = async () => {
    if (!user) return;
    try {
      const data = await listSpaces(user.id);
      const nextSpacesSig = data
        .map((space) => `${space.id}|${space.name}|${space.created_by}|${space.updated_at ?? ""}|${space.created_at ?? ""}`)
        .join("||");
      let ownersMap: Record<string, string> = owners;
      if (nextSpacesSig !== spacesSigRef.current) {
        spacesSigRef.current = nextSpacesSig;
        setSpaces((prev) => mergeSpaces(prev, data));
      }
      const ownerIds = Array.from(new Set(data.map((space) => space.created_by).filter((id) => id !== user.id)));
      if (!ownerIds.length) {
        if (ownersSigRef.current !== "") {
          ownersSigRef.current = "";
          ownersMap = {};
          setOwners(ownersMap);
        }
      } else {
        const { data: users } = await supabase.from("users").select("id, display_name").in("id", ownerIds);
        const map: Record<string, string> = {};
        (users ?? []).forEach((row: { id: string; display_name: string }) => {
          map[row.id] = row.display_name;
        });
        const nextOwnersSig = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, name]) => `${id}|${name}`)
          .join("||");
        if (nextOwnersSig !== ownersSigRef.current) {
          ownersSigRef.current = nextOwnersSig;
          ownersMap = map;
          setOwners((prev) => {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(map);
            if (
              prevKeys.length === nextKeys.length &&
              nextKeys.every((key) => prev[key] === map[key])
            ) {
              return prev;
            }
            return map;
          });
        } else {
          ownersMap = owners;
        }
      }
      writeHomeCache(user.id, {
        spaces: data,
        owners: ownersMap,
        spacesSig: spacesSigRef.current,
        ownersSig: ownersSigRef.current
      });
    } catch {
      setError("Failed to load spaces.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const cached = readHomeCache(user.id);
    if (cached) {
      spacesSigRef.current = cached.spacesSig ?? "";
      ownersSigRef.current = cached.ownersSig ?? "";
      setSpaces(cached.spaces ?? []);
      setOwners(cached.owners ?? {});
      setLoading(false);
    }
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
