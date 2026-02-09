import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { getRestaurant, getUserRating, listRatings, upsertRating } from "../supabase/db";
import { Modal } from "../components/Modal";
import { RatingForm } from "../components/RatingForm";
import type { Rating, RatingCategory, Restaurant } from "../types";

const categories: { key: RatingCategory; label: string }[] = [
  { key: "location", label: "Location" },
  { key: "service", label: "Service" },
  { key: "interior", label: "Interior" },
  { key: "menu", label: "Menu" },
  { key: "food", label: "Food" },
  { key: "alcohol", label: "Drinks" },
  { key: "prices", label: "Price" }
];

export function RestaurantDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userRating, setUserRating] = useState<Rating | null>(null);

  const loadRatings = async (restaurantId: string) => {
    const data = await listRatings(restaurantId);
    setRatings(data);
    if (user) {
      const mine = data.find((item) => item.user_id === user.id) ?? null;
      setUserRating(mine);
    }
  };

  useEffect(() => {
    if (!id) return;
    let active = true;
    getRestaurant(id).then((data) => {
      if (active) {
        setRestaurant(data);
        setLoading(false);
      }
    }).catch(() => setLoading(false));

    loadRatings(id).catch(() => setError("Failed to load ratings."));
    return () => {
      active = false;
    };
  }, [id, user]);

  useEffect(() => {
    if (!id || !user) return;
    getUserRating(id, user.id).then((data) => setUserRating(data));
  }, [id, user]);

  const averages = useMemo(() => {
    if (!ratings.length) return null;
    const sums = categories.reduce((acc, c) => ({ ...acc, [c.key]: 0 }), {} as Record<RatingCategory, number>);
    ratings.forEach((rating) => {
      categories.forEach((c) => {
        const value = Number(rating[c.key] ?? 0);
        sums[c.key] += value;
      });
    });
    const avg = categories.reduce(
      (acc, c) => ({ ...acc, [c.key]: sums[c.key] / ratings.length }),
      {} as Record<RatingCategory, number>
    );
    const overall = categories.reduce((acc, c) => acc + avg[c.key], 0) / categories.length;
    return { avg, overall };
  }, [ratings]);

  const handleSubmitRating = async (values: Record<RatingCategory, number> & { overallAvg: number }) => {
    if (!user || !id) return;
    setSaving(true);
    setError("");
    try {
      await upsertRating({
        restaurant_id: id,
        user_id: user.id,
        display_name_snapshot: profile?.display_name || user.user_metadata?.display_name || user.email || "Anonymous",
        photo_url_snapshot: profile?.photo_url || null,
        location: values.location,
        menu: values.menu,
        food: values.food,
        alcohol: values.alcohol,
        prices: values.prices,
        service: values.service,
        interior: values.interior,
        overall_avg: values.overallAvg
      });
      setModalOpen(false);
      await loadRatings(id);
    } catch (err) {
      setError("Failed to save rating.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-center">Loading...</div>;
  }

  if (!restaurant) {
    return (
      <div className="container">
        <p>Restaurant not found.</p>
        <button className="btn" onClick={() => navigate("/app")}>
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{restaurant.name}</h1>
          <p className="muted">{restaurant.location}</p>
        </div>
        <button className="btn" onClick={() => setModalOpen(true)}>
          {userRating ? "Edit your rating" : "Rate this restaurant"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="card rating-summary">
        <h3>Average ratings</h3>
        {averages ? (
          <div className="rating-grid">
            {categories.map((c) => (
              <div key={c.key} className="rating-item">
                <span className="muted">{c.label}</span>
                <strong>{averages.avg[c.key].toFixed(1)}</strong>
              </div>
            ))}
            <div className="rating-item overall">
              <span className="muted">Overall</span>
              <strong>{averages.overall.toFixed(1)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">No ratings yet. Be the first!</p>
        )}
      </section>

      <section className="card">
        <h3>All ratings</h3>
        {ratings.length ? (
          <div className="rating-list">
            {ratings.map((rating) => {
              const name = rating.display_name_snapshot || "User";
              const initial = (name.trim()[0] || "U").toUpperCase();
              return (
                <div key={rating.id} className="rating-row">
                  <div className="avatar small">
                    {rating.photo_url_snapshot ? (
                      <img src={rating.photo_url_snapshot} alt={name} />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <div className="rating-meta">
                    <strong>{name}</strong>
                    <div className="muted">Overall {rating.overall_avg.toFixed(1)}</div>
                  </div>
                  <div className="rating-values">
                    {categories.map((c) => (
                      <span key={c.key}>
                        {c.label}: {rating[c.key]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No ratings yet.</p>
        )}
      </section>

      <Modal title="Your rating" open={modalOpen} onClose={() => setModalOpen(false)}>
        <RatingForm
          initial={
            userRating
              ? {
                  location: userRating.location,
                  menu: userRating.menu,
                  food: userRating.food,
            alcohol: userRating.alcohol,
            prices: userRating.prices,
            service: userRating.service,
            interior: userRating.interior
          }
              : null
          }
          onSubmit={handleSubmitRating}
          onCancel={() => setModalOpen(false)}
          submitting={saving}
        />
      </Modal>
    </div>
  );
}
