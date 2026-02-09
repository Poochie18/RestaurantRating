import { Link } from "react-router-dom";
import type { Restaurant } from "../types";

type Props = {
  restaurant: Restaurant;
  onEdit: (restaurant: Restaurant) => void;
  onDelete?: (restaurant: Restaurant) => void;
  canEdit: boolean;
  overallAvg?: number | null;
};

export function RestaurantCard({ restaurant, onEdit, onDelete, canEdit, overallAvg }: Props) {
  return (
    <div className="card">
      <div className="card-body">
        <div>
          <h3 className="card-title">
            <Link to={`/restaurants/${restaurant.id}`}>{restaurant.name}</Link>
          </h3>
          <p className="muted">{restaurant.location}</p>
        </div>
        {overallAvg != null && (
          <div className="pill">Avg {overallAvg.toFixed(1)}</div>
        )}
      </div>
      {canEdit && (
        <div className="card-actions">
          <button className="btn btn-ghost" onClick={() => onEdit(restaurant)}>
            Edit
          </button>
          {onDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(restaurant)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
