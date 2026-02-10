import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useLanguage } from "../app/LanguageProvider";
import {
  createRestaurant,
  createSpaceInvite,
  deleteRestaurant,
  deleteSpace,
  getSpace,
  listRatingsForRestaurants,
  listSpaceRestaurants,
  updateRestaurant,
  updateSpace,
  upsertRating
} from "../supabase/db";
import type { Rating, RatingCategory, Restaurant, Space } from "../types";
import { useAuth } from "../app/AuthProvider";
import { RatingForm } from "../components/RatingForm";

const categories: { key: RatingCategory; labelKey: string }[] = [
  { key: "location", labelKey: "categoryLocation" },
  { key: "service", labelKey: "categoryService" },
  { key: "interior", labelKey: "categoryInterior" },
  { key: "menu", labelKey: "categoryMenu" },
  { key: "food", labelKey: "categoryFood" },
  { key: "alcohol", labelKey: "categoryDrinks" },
  { key: "prices", labelKey: "categoryPrice" }
];

const emptyRestaurant = { name: "", location: "" };

type SortKey = "name" | "avg" | "newest";

export function SpaceDetailsPage() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [space, setSpace] = useState<Space | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [restaurantForm, setRestaurantForm] = useState(emptyRestaurant);
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [ratingRestaurant, setRatingRestaurant] = useState<Restaurant | null>(null);
  const [spaceName, setSpaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("avg");

  const loadSpace = async () => {
    if (!id) return;
    try {
      const data = await getSpace(id);
      setSpace(data);
      setSpaceName(data?.name ?? "");
    } catch {
      setError("Failed to load space.");
    }
  };

  const loadRestaurants = async () => {
    if (!id) return;
    try {
      const data = await listSpaceRestaurants(id);
      setRestaurants(data);
      const ratingData = await listRatingsForRestaurants(data.map((r) => r.id));
      setRatings(ratingData);
    } catch {
      setError("Failed to load restaurants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpace();
    loadRestaurants();
  }, [id]);

  const ratingsByRestaurant = useMemo(() => {
    const map = new Map<string, Rating[]>();
    ratings.forEach((rating) => {
      const list = map.get(rating.restaurant_id) ?? [];
      list.push(rating);
      map.set(rating.restaurant_id, list);
    });
    return map;
  }, [ratings]);

  const averagesByRestaurant = useMemo(() => {
    const map = new Map<string, number>();
    restaurants.forEach((restaurant) => {
      const list = ratingsByRestaurant.get(restaurant.id) ?? [];
      if (!list.length) {
        map.set(restaurant.id, 0);
        return;
      }
      const totals = categories.reduce((acc, c) => ({ ...acc, [c.key]: 0 }), {} as Record<RatingCategory, number>);
      list.forEach((rating) => {
        categories.forEach((c) => {
          totals[c.key] += Number(rating[c.key] ?? 0);
        });
      });
      const avg =
        categories.reduce((acc, c) => acc + totals[c.key] / list.length, 0) /
        categories.length;
      map.set(restaurant.id, avg);
    });
    return map;
  }, [restaurants, ratingsByRestaurant]);

  const filteredRestaurants = useMemo(() => {
    const query = filter.trim().toLowerCase();
    let list = restaurants.filter((r) =>
      query ? r.name.toLowerCase().includes(query) || r.location.toLowerCase().includes(query) : true
    );

    if (sort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "avg") {
      list = [...list].sort((a, b) => (averagesByRestaurant.get(b.id) ?? 0) - (averagesByRestaurant.get(a.id) ?? 0));
    } else if (sort === "newest") {
      list = [...list].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    }
    return list;
  }, [restaurants, filter, sort, averagesByRestaurant]);

  const handleSaveRestaurant = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !id) return;
    if (!restaurantForm.name.trim() || !restaurantForm.location.trim()) {
      setError("Name and location are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingRestaurant) {
        await updateRestaurant(editingRestaurant.id, {
          name: restaurantForm.name.trim(),
          location: restaurantForm.location.trim()
        });
      } else {
        await createRestaurant({
          name: restaurantForm.name.trim(),
          location: restaurantForm.location.trim(),
          created_by: user.id,
          space_id: id
        });
      }
      setAddOpen(false);
      setEditingRestaurant(null);
      setRestaurantForm(emptyRestaurant);
      await loadRestaurants();
    } catch {
      setError("Failed to save restaurant.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRestaurant = async (restaurant: Restaurant) => {
    if (!window.confirm("Delete this restaurant?")) return;
    try {
      await deleteRestaurant(restaurant.id);
      await loadRestaurants();
    } catch {
      setError("Failed to delete restaurant.");
    }
  };

  const handleSaveSpace = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await updateSpace(id, spaceName.trim());
      await loadSpace();
      setEditOpen(false);
    } catch {
      setError("Failed to update space.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpace = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await deleteSpace(id);
      navigate("/app");
    } catch {
      setError("Failed to delete space.");
    } finally {
      setSaving(false);
      setDeleteOpen(false);
    }
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !id) return;
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      await createSpaceInvite(id, inviteEmail.trim().toLowerCase(), user.id);
      setInviteEmail("");
      setInviteOpen(false);
      await loadInvites();
    } catch {
      setError("Failed to send invite.");
    } finally {
      setSaving(false);
    }
  };

  const handleRate = async (values: Record<RatingCategory, number> & { overallAvg: number }) => {
    if (!user || !ratingRestaurant) return;
    setSaving(true);
    try {
      await upsertRating({
        restaurant_id: ratingRestaurant.id,
        user_id: user.id,
        display_name_snapshot: profile?.display_name || user.user_metadata?.display_name || user.email || "Anonymous",
        photo_url_snapshot: profile?.photo_url || null,
        location: values.location,
        service: values.service,
        interior: values.interior,
        menu: values.menu,
        food: values.food,
        alcohol: values.alcohol,
        prices: values.prices,
        overall_avg: values.overallAvg
      });
      setRateOpen(false);
      await loadRestaurants();
    } catch {
      setError("Failed to save rating.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-center">{t("loading")}</div>;
  }

  return (
    <div className="container">
      <div className="space-toolbar">
        <Link to="/app" className="btn btn-ghost">
          ← {t("home")}
        </Link>
        <div className="space-actions">
          <button className="btn" onClick={() => setAddOpen(true)}>
            {t("addRestaurant")}
          </button>
          <button className="btn btn-ghost" onClick={() => setInviteOpen(true)}>
            {t("inviteFriends")}
          </button>
          <div className="user-menu">
            <button className="btn btn-ghost" onClick={() => setSettingsOpen((prev) => !prev)}>
              ⋯
            </button>
            {settingsOpen && (
              <div className="menu">
                <button className="menu-item" onClick={() => {
                  setSettingsOpen(false);
                  setEditOpen(true);
                }}>
                  {t("editSpace")}
                </button>
                <button className="menu-item" onClick={() => {
                  setSettingsOpen(false);
                  setDeleteOpen(true);
                }}>
                  {t("deleteSpace")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {space && (
        <div className="page-header">
          <div>
            <h1>{space.name}</h1>
            <p className="muted">{t("spaceDetailsSubtitle")}</p>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="space-controls">
        <input
          className="input"
          placeholder={t("filterPlaceholder")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <label className="field inline">
          <span>{t("sortLabel")}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="avg">{t("sortAvgDesc")}</option>
            <option value="name">{t("sortNameAsc")}</option>
            <option value="newest">{t("sortNewest")}</option>
          </select>
        </label>
      </div>

      <div className="space-grid">
        {filteredRestaurants.map((restaurant) => {
          const avg = averagesByRestaurant.get(restaurant.id) ?? 0;
          const isOpen = expandedId === restaurant.id;
          const list = ratingsByRestaurant.get(restaurant.id) ?? [];
          return (
            <div key={restaurant.id} className={`card space-card ${isOpen ? "open" : ""}`}>
              <div className="space-card-header" onClick={() => setExpandedId(isOpen ? null : restaurant.id)}>
                <div>
                  <h3 className="card-title">{restaurant.name}</h3>
                  <p className="muted">{restaurant.location}</p>
                </div>
                <div className="space-card-meta">
                  <span className="pill">Avg {avg ? avg.toFixed(1) : "-"}</span>
                  <button
                    className="btn btn-ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRatingRestaurant(restaurant);
                      setRateOpen(true);
                    }}
                  >
                    {t("rateRestaurant")}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingRestaurant(restaurant);
                      setRestaurantForm({ name: restaurant.name, location: restaurant.location });
                      setAddOpen(true);
                    }}
                    aria-label={t("edit")}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteRestaurant(restaurant);
                    }}
                    aria-label={t("delete")}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="space-card-body">
                  {list.length ? (
                    <div className="space-rating-table">
                      <div className="space-rating-row header">
                        <span>{t("categoryUser")}</span>
                        {categories.map((c) => (
                          <span key={c.key}>{t(c.labelKey as never)}</span>
                        ))}
                      </div>
                      {list.map((rating) => (
                        <div key={rating.id} className="space-rating-row">
                          <span className="rating-user">{rating.display_name_snapshot}</span>
                          {categories.map((c) => (
                            <span key={c.key} className="rating-cell">
                              <span className="rating-label">{t(c.labelKey as never)}</span>
                              <span className="rating-score">{rating[c.key] ?? "-"}</span>
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">{t("ratingsEmpty")}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal title={editingRestaurant ? t("editRestaurant") : t("addRestaurant")} open={addOpen} onClose={() => {
        setAddOpen(false);
        setEditingRestaurant(null);
      }}>
        <form className="form" onSubmit={handleSaveRestaurant}>
          <label className="field">
            <span>{t("restaurantName")}</span>
            <input value={restaurantForm.name} onChange={(event) => setRestaurantForm({ ...restaurantForm, name: event.target.value })} />
          </label>
          <label className="field">
            <span>{t("restaurantLocation")}</span>
            <input value={restaurantForm.location} onChange={(event) => setRestaurantForm({ ...restaurantForm, location: event.target.value })} />
          </label>
          <div className="form-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={t("editSpace")} open={editOpen} onClose={() => setEditOpen(false)}>
        <form className="form" onSubmit={handleSaveSpace}>
          <label className="field">
            <span>{t("spaceName")}</span>
            <input value={spaceName} onChange={(event) => setSpaceName(event.target.value)} />
          </label>
          <div className="form-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t("loading") : t("save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={t("deleteSpaceTitle")} open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <div className="modal-body compact">
          <p className="muted">{t("deleteSpaceConfirm")}</p>
          <div className="form-footer">
            <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>
              {t("cancel")}
            </button>
            <button className="btn btn-danger" onClick={handleDeleteSpace} disabled={saving}>
              {saving ? t("loading") : t("delete")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal title={t("inviteFriends")} open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <form className="form" onSubmit={handleInvite}>
          <label className="field">
            <span>{t("inviteEmail")}</span>
            <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          </label>
          <div className="form-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setInviteOpen(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? t("loading") : t("inviteSend")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal title={t("ratingTitle")} open={rateOpen} onClose={() => setRateOpen(false)}>
        <RatingForm
          initial={
            ratingRestaurant
              ? (() => {
                  const list = ratingsByRestaurant.get(ratingRestaurant.id) ?? [];
                  const mine = list.find((rating) => rating.user_id === user?.id);
                  if (!mine) return null;
                  return {
                    location: mine.location,
                    service: mine.service,
                    interior: mine.interior,
                    menu: mine.menu,
                    food: mine.food,
                    alcohol: mine.alcohol,
                    prices: mine.prices
                  };
                })()
              : null
          }
          onSubmit={handleRate}
          onCancel={() => setRateOpen(false)}
          submitting={saving}
        />
      </Modal>

      {/* Invites list intentionally hidden for now */}
    </div>
  );
}
