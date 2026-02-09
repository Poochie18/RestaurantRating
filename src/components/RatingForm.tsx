import { useMemo, useState, type FormEvent } from "react";
import type { RatingCategory } from "../types";

const categories: { key: RatingCategory; label: string }[] = [
  { key: "location", label: "Location" },
  { key: "menu", label: "Menu" },
  { key: "food", label: "Food" },
  { key: "alcohol", label: "Alcohol" },
  { key: "prices", label: "Prices" },
  { key: "service", label: "Service" }
];

type RatingValues = Record<RatingCategory, number>;

type Props = {
  initial?: RatingValues | null;
  onSubmit: (rating: RatingValues & { overallAvg: number }) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
};

export function RatingForm({ initial, onSubmit, onCancel, submitting }: Props) {
  const [values, setValues] = useState<RatingValues>(() => {
    const base: RatingValues = {
      location: 3,
      menu: 3,
      food: 3,
      alcohol: 3,
      prices: 3,
      service: 3
    };
    return initial ? { ...base, ...initial } : base;
  });

  const overall = useMemo(() => {
    const sum = categories.reduce((acc, c) => acc + values[c.key], 0);
    return sum / categories.length;
  }, [values]);

  const handleChange = (key: RatingCategory, value: number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, overallAvg: overall });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {categories.map((category) => (
        <label key={category.key} className="field">
          <span>{category.label}</span>
          <select
            value={values[category.key]}
            onChange={(event) => handleChange(category.key, Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className="form-footer">
        <div className="muted">Overall: {overall.toFixed(1)}</div>
        <div className="inline-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? "Saving..." : "Save rating"}
          </button>
        </div>
      </div>
    </form>
  );
}
