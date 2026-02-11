import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { useLanguage } from "../app/LanguageProvider";
import { listSpaces } from "../supabase/db";
import { supabase } from "../supabase/client";
import type { Space } from "../types";

type SpaceOwnerMap = Record<string, string>;
const STATISTICS_CACHE_PREFIX = "statistics-cache-v1:";

type StatisticsCache = {
  spaces: Space[];
  owners: SpaceOwnerMap;
  spacesSig: string;
  ownersSig: string;
};

function readStatisticsCache(userId: string): StatisticsCache | null {
  try {
    const raw = window.localStorage.getItem(`${STATISTICS_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatisticsCache;
    if (!parsed || !Array.isArray(parsed.spaces) || typeof parsed.owners !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStatisticsCache(userId: string, payload: StatisticsCache) {
  try {
    window.localStorage.setItem(`${STATISTICS_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch {
    // Best-effort cache.
  }
}

export function StatisticsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [owners, setOwners] = useState<SpaceOwnerMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const spacesSigRef = useRef("");
  const ownersSigRef = useRef("");
  const ownersRef = useRef<SpaceOwnerMap>({});
  const inFlightRef = useRef(false);

  const loadSpaces = async (options?: { silent?: boolean }) => {
    if (!user) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!options?.silent) setError("");
    try {
      const data = await listSpaces(user.id);
      const nextSpacesSig = data
        .map((space) => `${space.id}|${space.name}|${space.created_by}|${space.updated_at ?? ""}|${space.created_at ?? ""}`)
        .join("||");
      if (nextSpacesSig !== spacesSigRef.current) {
        spacesSigRef.current = nextSpacesSig;
        setSpaces(data);
      }

      const ownerIds = Array.from(new Set(data.map((space) => space.created_by).filter((id) => id !== user.id)));
      if (!ownerIds.length) {
        if (ownersSigRef.current !== "") {
          ownersSigRef.current = "";
          ownersRef.current = {};
          setOwners({});
        }
        writeStatisticsCache(user.id, {
          spaces: data,
          owners: ownersRef.current,
          spacesSig: spacesSigRef.current,
          ownersSig: ownersSigRef.current
        });
        return;
      }
      const { data: users } = await supabase.from("users").select("id, display_name").in("id", ownerIds);
      const map: SpaceOwnerMap = {};
      (users ?? []).forEach((row: { id: string; display_name: string }) => {
        map[row.id] = row.display_name;
      });
      const nextOwnersSig = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, name]) => `${id}|${name}`)
        .join("||");
      if (nextOwnersSig !== ownersSigRef.current) {
        ownersSigRef.current = nextOwnersSig;
        ownersRef.current = map;
        setOwners(map);
      }

      writeStatisticsCache(user.id, {
        spaces: data,
        owners: ownersRef.current,
        spacesSig: spacesSigRef.current,
        ownersSig: ownersSigRef.current
      });
    } catch {
      if (!options?.silent) setError(t("statisticsLoadError"));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const cached = readStatisticsCache(user.id);
    if (cached) {
      spacesSigRef.current = cached.spacesSig ?? "";
      ownersSigRef.current = cached.ownersSig ?? "";
      ownersRef.current = cached.owners ?? {};
      setSpaces(cached.spaces ?? []);
      setOwners(cached.owners ?? {});
      setLoading(false);
      void loadSpaces({ silent: true });
      return;
    }
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
        if (status === "SUBSCRIBED") void loadSpaces({ silent: true });
      });

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh();
    }, 12000);

    return () => {
      active = false;
      window.clearInterval(interval);
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
