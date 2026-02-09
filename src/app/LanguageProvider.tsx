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
  logoutConfirmTitle: { uk: "Підтвердіть вихід", en: "Confirm logout" },
  logoutConfirmText: {
    uk: "Ви впевнені, що хочете вийти з акаунту?",
    en: "Are you sure you want to log out?"
  },
  logoutConfirmYes: { uk: "Так, вийти", en: "Yes, log out" },
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
  noSpaces: { uk: "Поки що немає просторів.", en: "No spaces yet." },
  authTitleLogin: { uk: "Ласкаво просимо", en: "Welcome back" },
  authSubtitleLogin: { uk: "Увійдіть, щоб оцінювати ресторани.", en: "Sign in to rate restaurants." },
  authTitleRegister: { uk: "Створити акаунт", en: "Create account" },
  authSubtitleRegister: { uk: "Почніть оцінювати улюблені місця.", en: "Start rating your favorite places." },
  authName: { uk: "Ім'я", en: "Name" },
  authEmail: { uk: "Email", en: "Email" },
  authPassword: { uk: "Пароль", en: "Password" },
  authSignIn: { uk: "Увійти", en: "Sign in" },
  authRegister: { uk: "Зареєструватися", en: "Register" },
  authHaveAccount: { uk: "Вже маєте акаунт?", en: "Already have an account?" },
  authNoAccount: { uk: "Немає акаунту?", en: "No account?" },
  authGoLogin: { uk: "Увійти", en: "Login" },
  authGoRegister: { uk: "Зареєструватися", en: "Register" },
  profileTitle: { uk: "Профіль", en: "Profile" },
  profileSubtitle: { uk: "Керуйте публічною інформацією.", en: "Manage your public info." },
  profileUpload: { uk: "Завантажити аватар", en: "Upload avatar" },
  profileDisplayName: { uk: "Ім'я користувача", en: "Display name" },
  profileEmail: { uk: "Email", en: "Email" },
  profileSave: { uk: "Зберегти", en: "Save changes" }
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
