import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { useLanguage } from "../app/LanguageProvider";
import { listSpaces } from "../supabase/db";
import { supabase } from "../supabase/client";
import type { Space } from "../types";

type SpaceOwnerMap = Record<string, string>;

export function StatisticsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [owners, setOwners] = useState<SpaceOwnerMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSpaces = async () => {
    if (!user) return;
    setError("");
    try {
      const data = await listSpaces(user.id);
      setSpaces(data);
      const ownerIds = Array.from(new Set(data.map((space) => space.created_by).filter((id) => id !== user.id)));
      if (!ownerIds.length) {
        setOwners({});
        return;
      }
      const { data: users } = await supabase.from("users").select("id, display_name").in("id", ownerIds);
      const map: SpaceOwnerMap = {};
      (users ?? []).forEach((row: { id: string; display_name: string }) => {
        map[row.id] = row.display_name;
      });
      setOwners(map);
    } catch {
      setError(t("statisticsLoadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpaces();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () => {
      if (!active) return;
      void loadSpaces();
    };

    const channel = supabase
      .channel(`statistics-spaces-${user.id}`)
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

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{t("statisticsTitle")}</h1>
          <p className="muted">{t("statisticsSubtitle")}</p>
        </div>
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
                onClick={() => navigate(`/statistics/${space.id}`)}
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
                  <span className="pill">{t("statisticsOpenSpace")}</span>
                </div>
              </button>
            ))
          ) : (
            <p className="muted">{t("statisticsEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
