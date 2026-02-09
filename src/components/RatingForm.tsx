import { useMemo, useState, type FormEvent } from "react";
import type { RatingCategory } from "../types";
import { useLanguage } from "../app/LanguageProvider";

const categories: { key: RatingCategory; labelKey: string }[] = [
  { key: "location", labelKey: "categoryLocation" },
  { key: "service", labelKey: "categoryService" },
  { key: "interior", labelKey: "categoryInterior" },
  { key: "menu", labelKey: "categoryMenu" },
  { key: "food", labelKey: "categoryFood" },
  { key: "alcohol", labelKey: "categoryDrinks" },
  { key: "prices", labelKey: "categoryPrice" }
];

type RatingValues = Record<RatingCategory, number>;

type Props = {
  initial?: RatingValues | null;
  onSubmit: (rating: RatingValues & { overallAvg: number }) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
};

export function RatingForm({ initial, onSubmit, onCancel, submitting }: Props) {
  const { t } = useLanguage();
  const [values, setValues] = useState<RatingValues>(() => {
    const base: RatingValues = {
      location: 5,
      service: 5,
      interior: 5,
      menu: 5,
      food: 5,
      alcohol: 5,
      prices: 5
    };
    return initial ? { ...base, ...initial } : base;
  });

  const overall = useMemo(() => {
    const sum = categories.reduce((acc, c) => acc + values[c.key], 0);
    return sum / categories.length;
  }, [values]);

  const handleChange = (key: RatingCategory, value: number) => {
    const clamped = Math.min(10, Math.max(1, value));
    setValues((prev) => ({ ...prev, [key]: clamped }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, overallAvg: overall });
  };

  return (
    <form className="form rating-form" onSubmit={handleSubmit}>
      {categories.map((category) => (
        <div key={category.key} className="rating-row">
          <span>{t(category.labelKey as never)}</span>
          <div className="rating-control">
            <button
              type="button"
              className="icon-btn"
              onClick={() => handleChange(category.key, values[category.key] - 1)}
            >
              ←
            </button>
            <span className="rating-value">{values[category.key]}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => handleChange(category.key, values[category.key] + 1)}
            >
              →
            </button>
          </div>
        </div>
      ))}
      <div className="form-footer">
        <div className="muted">
          {t("overallLabel")}: {overall.toFixed(1)}
        </div>
        <div className="inline-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? t("loading") : t("save")}
          </button>
        </div>
      </div>
    </form>
  );
}
