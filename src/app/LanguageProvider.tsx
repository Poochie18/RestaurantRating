import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Language = "uk" | "en";

type LanguageContextValue = {
  lang: Language;
  toggle: () => void;
  t: (key: keyof typeof dictionary) => string;
};

const dictionary = {
  appName: { uk: "Restaurant Rater", en: "Restaurant Rater" },
  home: { uk: "Головна", en: "Home" },
  friends: { uk: "Друзі", en: "Friends" },
  profile: { uk: "Профіль", en: "Profile" },
  logout: { uk: "Вийти", en: "Logout" },
  spacesTitle: { uk: "Ваші простори", en: "Your spaces" },
  spacesSubtitle: {
    uk: "Створюйте простори та запрошуйте друзів для спільних рейтингів.",
    en: "Create spaces and invite friends to rate together."
  },
  addSpace: { uk: "Створити простір", en: "Create space" },
  spaceName: { uk: "Назва простору", en: "Space name" },
  cancel: { uk: "Скасувати", en: "Cancel" },
  save: { uk: "Зберегти", en: "Save" },
  loading: { uk: "Завантаження...", en: "Loading..." },
  noSpaces: { uk: "Поки що немає просторів.", en: "No spaces yet." }
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>("uk");

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      toggle: () => setLang((prev) => (prev === "uk" ? "en" : "uk")),
      t: (key) => dictionary[key][lang]
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
