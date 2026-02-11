import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../app/LanguageProvider";
import { supabase } from "../supabase/client";
import { getSpace, listRatingsForRestaurants, listSpaceMembersWithUsers, listSpaceRestaurants } from "../supabase/db";
import type { Rating, RatingCategory, Restaurant, Space } from "../types";

const categories: { key: RatingCategory; labelKey: "categoryLocation" | "categoryService" | "categoryInterior" | "categoryMenu" | "categoryFood" | "categoryDrinks" | "categoryPrice" }[] = [
  { key: "location", labelKey: "categoryLocation" },
  { key: "service", labelKey: "categoryService" },
  { key: "interior", labelKey: "categoryInterior" },
  { key: "menu", labelKey: "categoryMenu" },
  { key: "food", labelKey: "categoryFood" },
  { key: "alcohol", labelKey: "categoryDrinks" },
  { key: "prices", labelKey: "categoryPrice" }
];

type MemberRow = {
  user_id: string;
  role: "owner" | "member";
  user: { id: string; display_name: string; email: string } | null;
};

export function SpaceStatisticsPage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [space, setSpace] = useState<Space | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSpaceStatistics = async () => {
    if (!id) return;
    setError("");
    try {
      const [spaceData, restaurantData, memberData] = await Promise.all([
        getSpace(id),
        listSpaceRestaurants(id),
        listSpaceMembersWithUsers(id)
      ]);

      setSpace(spaceData);
      setRestaurants(restaurantData);
      setMembers(memberData);

      const ratingData = await listRatingsForRestaurants(restaurantData.map((restaurant) => restaurant.id));
      setRatings(ratingData);
    } catch {
      setError(t("statisticsLoadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpaceStatistics();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const refresh = () => {
      if (!active) return;
      void loadSpaceStatistics();
    };

    const channel = supabase
      .channel(`space-statistics-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "spaces", filter: `id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "space_members", filter: `space_id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants", filter: `space_id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, refresh)
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
  }, [id]);

  const restaurantAverages = useMemo(() => {
    const byRestaurant = new Map<string, Rating[]>();
    ratings.forEach((rating) => {
      const current = byRestaurant.get(rating.restaurant_id) ?? [];
      current.push(rating);
      byRestaurant.set(rating.restaurant_id, current);
    });

    return restaurants.map((restaurant) => {
      const list = byRestaurant.get(restaurant.id) ?? [];
      if (!list.length) {
        return { restaurant, avg: 0, count: 0 };
      }
      const avg = list.reduce((acc, rating) => acc + Number(rating.overall_avg ?? 0), 0) / list.length;
      return { restaurant, avg, count: list.length };
    });
  }, [restaurants, ratings]);

  const categoryAverages = useMemo(() => {
    if (!ratings.length) {
      return categories.map((category) => ({ key: category.key, labelKey: category.labelKey, avg: 0 }));
    }
    return categories.map((category) => {
      const total = ratings.reduce((acc, rating) => acc + Number(rating[category.key] ?? 0), 0);
      return {
        key: category.key,
        labelKey: category.labelKey,
        avg: total / ratings.length
      };
    });
  }, [ratings]);

  const overallAverage = useMemo(() => {
    if (!ratings.length) return 0;
    return ratings.reduce((acc, rating) => acc + Number(rating.overall_avg ?? 0), 0) / ratings.length;
  }, [ratings]);

  const activeRaters = useMemo(() => new Set(ratings.map((rating) => rating.user_id)).size, [ratings]);

  const leaderboard = useMemo(
    () => [...restaurantAverages].filter((item) => item.count > 0).sort((a, b) => b.avg - a.avg),
    [restaurantAverages]
  );

  const topBestRestaurants = useMemo(() => leaderboard.slice(0, 5), [leaderboard]);
  const topWorstRestaurants = useMemo(() => [...leaderboard].reverse().slice(0, 5), [leaderboard]);

  const contributorStats = useMemo(() => {
    const memberNames = new Map<string, string>();
    members.forEach((member) => {
      memberNames.set(member.user_id, member.user?.display_name || member.user?.email || "User");
    });

    const byUser = new Map<string, { userId: string; name: string; count: number; avg: number }>();
    ratings.forEach((rating) => {
      const current = byUser.get(rating.user_id) ?? {
        userId: rating.user_id,
        name: memberNames.get(rating.user_id) || rating.display_name_snapshot || "User",
        count: 0,
        avg: 0
      };
      current.count += 1;
      current.avg += Number(rating.overall_avg ?? 0);
      byUser.set(rating.user_id, current);
    });

    return Array.from(byUser.values())
      .map((item) => ({ ...item, avg: item.count ? item.avg / item.count : 0 }))
      .sort((a, b) => b.count - a.count || b.avg - a.avg);
  }, [ratings, members]);

  if (loading) {
    return <div className="page-center">{t("loading")}</div>;
  }

  return (
    <div className="container">
      <div className="space-toolbar stats-toolbar">
        <Link to="/statistics" className="btn btn-ghost">
          {"<"} {t("statisticsBackToList")}
        </Link>
        {id && (
          <button className="btn btn-ghost" onClick={() => navigate(`/spaces/${id}`)}>
            {t("openSpace")}
          </button>
        )}
      </div>

      <div className="page-header">
        <div>
          <h1>{space?.name || ""}</h1>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="stats-kpi-grid">
        <div className="card stats-kpi">
          <span className="stats-kpi-label">{t("statisticsTotalRestaurants")}</span>
          <strong>{restaurants.length}</strong>
        </div>
        <div className="card stats-kpi">
          <span className="stats-kpi-label">{t("statisticsTotalRatings")}</span>
          <strong>{ratings.length}</strong>
        </div>
        <div className="card stats-kpi">
          <span className="stats-kpi-label">{t("statisticsActiveRaters")}</span>
          <strong>{activeRaters}</strong>
        </div>
        <div className="card stats-kpi">
          <span className="stats-kpi-label">{t("statisticsAverageScore")}</span>
          <strong>{overallAverage ? overallAverage.toFixed(1) : "-"}</strong>
        </div>
      </div>

      <div className="stats-grid single">
        <section className="card">
          <div className="stats-section-head">
            <h3>{t("statisticsCategoryAverages")}</h3>
            <span className="muted">{t("statisticsChartScaleHint")}</span>
          </div>
          {ratings.length ? (
            <div className="stats-bars">
              {categoryAverages.map((item) => (
                <div key={item.key} className="stats-bar-row">
                  <span className="stats-bar-label">{t(item.labelKey)}</span>
                  <div className="stats-bar-track">
                    <span className="stats-bar-fill" style={{ width: `${Math.max(4, (item.avg / 10) * 100)}%` }} />
                  </div>
                  <strong className="stats-bar-value">{item.avg.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("statisticsNoRatings")}</p>
          )}
        </section>
      </div>

      <div className="stats-grid stats-grid-top">
        <section className="card">
          <h3>{t("statisticsTopBestRestaurants")}</h3>
          {topBestRestaurants.length ? (
            <div className="stats-bars leaderboard">
              {topBestRestaurants.map((item) => (
                <div key={item.restaurant.id} className="stats-bar-row">
                  <span className="stats-bar-label">{item.restaurant.name}</span>
                  <div className="stats-bar-track">
                    <span className="stats-bar-fill" style={{ width: `${Math.max(4, (item.avg / 10) * 100)}%` }} />
                  </div>
                  <strong className="stats-bar-value">{item.avg.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("statisticsNoRestaurants")}</p>
          )}
        </section>

        <section className="card">
          <h3>{t("statisticsTopWorstRestaurants")}</h3>
          {topWorstRestaurants.length ? (
            <div className="stats-bars leaderboard">
              {topWorstRestaurants.map((item) => (
                <div key={item.restaurant.id} className="stats-bar-row">
                  <span className="stats-bar-label">{item.restaurant.name}</span>
                  <div className="stats-bar-track">
                    <span className="stats-bar-fill" style={{ width: `${Math.max(4, (item.avg / 10) * 100)}%` }} />
                  </div>
                  <strong className="stats-bar-value">{item.avg.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("statisticsNoRestaurants")}</p>
          )}
        </section>
      </div>

      <div className="stats-grid single">
        <section className="card">
          <h3>{t("statisticsContributors")}</h3>
          {contributorStats.length ? (
            <div className="stats-table">
              <div className="stats-table-row stats-table-head">
                <span>{t("statisticsContributorUser")}</span>
                <span>{t("statisticsContributorCount")}</span>
                <span>{t("statisticsContributorAvg")}</span>
              </div>
              {contributorStats.map((item) => (
                <div key={item.userId} className="stats-table-row">
                  <span className="stats-table-cell">
                    <span className="stats-table-label">{t("statisticsContributorUser")}</span>
                    <span>{item.name}</span>
                  </span>
                  <span className="stats-table-cell">
                    <span className="stats-table-label">{t("statisticsContributorCount")}</span>
                    <span>{item.count}</span>
                  </span>
                  <span className="stats-table-cell">
                    <span className="stats-table-label">{t("statisticsContributorAvg")}</span>
                    <span>{item.avg.toFixed(1)}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("statisticsNoRatings")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
