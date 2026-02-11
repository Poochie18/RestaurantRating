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
  editSpace: { uk: "Редагувати простір", en: "Edit space" },
  deleteSpace: { uk: "Видалити простір", en: "Delete space" },
  leaveSpace: { uk: "Вийти з простору", en: "Leave space" },
  leaveSpaceConfirm: { uk: "Вийти з цього простору?", en: "Leave this space?" },
  leaveSpaceFailed: { uk: "Не вдалося вийти з простору.", en: "Failed to leave the space." },
  deleteSpaceTitle: { uk: "Видалити простір", en: "Delete space" },
  deleteSpaceConfirm: {
    uk: "Це видалить простір і всі дані всередині. Продовжити?",
    en: "This will remove the space and all data inside it. Continue?"
  },
  addRestaurant: { uk: "Додати ресторан", en: "Add restaurant" },
  rateRestaurant: { uk: "Оцінити", en: "Rate" },
  inviteFriends: { uk: "Запросити друзів", en: "Invite friends" },
  inviteEmail: { uk: "Email друга", en: "Friend email" },
  inviteSend: { uk: "Надіслати інвайт", en: "Send invite" },
  invitesTitle: { uk: "Запрошення", en: "Invites" },
  invitesEmpty: { uk: "Запрошень поки немає.", en: "No invites yet." },
  sortLabel: { uk: "Сортування", en: "Sort" },
  sortNameAsc: { uk: "Назва (A-Z)", en: "Name (A-Z)" },
  sortAvgDesc: { uk: "Середній бал (спадання)", en: "Average (desc)" },
  sortNewest: { uk: "Найновіші", en: "Newest" },
  filterPlaceholder: { uk: "Пошук ресторанів...", en: "Search restaurants..." },
  ratingTitle: { uk: "Оцінка ресторану", en: "Rate restaurant" },
  categoryUser: { uk: "Користувач", en: "User" },
  categoryLocation: { uk: "Локація", en: "Location" },
  categoryService: { uk: "Обслуговування", en: "Service" },
  categoryInterior: { uk: "Інтерʼєр", en: "Interior" },
  categoryMenu: { uk: "Меню", en: "Menu" },
  categoryFood: { uk: "Їжа", en: "Food" },
  categoryDrinks: { uk: "Напої", en: "Drinks" },
  categoryPrice: { uk: "Ціна", en: "Price" },
  overallLabel: { uk: "Загальна оцінка", en: "Overall" },
  friendsTitle: { uk: "Друзі", en: "Friends" },
  friendsPageTitle: { uk: "Додані друзі", en: "Added friends" },
  friendsPageSubtitle: { uk: "Управління списком друзів", en: "Manage your friends list" },
  addFriend: { uk: "Додати друга", en: "Add friend" },
  friendSearchLabel: { uk: "Ім'я користувача", en: "User name" },
  friendSend: { uk: "Відправити", en: "Send" },
  friendInvites: { uk: "Запити в друзі", en: "Friend requests" },
  friendInvitesEmpty: { uk: "Запитів поки немає.", en: "No requests yet." },
  friendsEmpty: { uk: "Друзів поки немає.", en: "No friends yet." },
  friendAccept: { uk: "Прийняти", en: "Accept" },
  friendDecline: { uk: "Відхилити", en: "Decline" },
  friendRemove: { uk: "Видалити з друзів", en: "Remove friend" },
  friendAddToSpace: { uk: "Додати в спейс", en: "Add to space" },
  friendRequestSent: { uk: "Запит відправлено.", en: "Request sent." },
  friendNotFound: { uk: "Користувача не знайдено.", en: "User not found." },
  friendSelfError: { uk: "Не можна додати себе.", en: "You cannot add yourself." },
  friendSelectUser: { uk: "Оберіть користувача зі списку.", en: "Select a user from the list." },
  friendRequestFailed: { uk: "Не вдалося надіслати запит.", en: "Failed to send request." },
  friendAlreadyFriends: { uk: "Ви вже друзі.", en: "You are already friends." },
  friendAlreadyPendingOutgoing: { uk: "Запит уже відправлено.", en: "Invite already sent." },
  friendIncomingExists: { uk: "У вас вже є вхідний запит від цього користувача.", en: "You already have an incoming invite from this user." },
  friendRemoveConfirmTitle: { uk: "Видалити друга", en: "Remove friend" },
  friendRemoveConfirmText: {
    uk: "Ви впевнені? Дружба буде видалена для обох сторін.",
    en: "Are you sure? Friendship will be removed for both users."
  },
  friendRemoved: { uk: "Друга видалено.", en: "Friend removed." },
  friendRemoveFailed: { uk: "Не вдалося видалити друга.", en: "Failed to remove friend." },
  friendAddedToSpace: { uk: "Користувача додано до простору.", en: "User added to space." },
  friendAddToSpaceFailed: { uk: "Не вдалося додати в простір.", en: "Failed to add user to space." },
  outgoingTitle: { uk: "Відправлені запити", en: "Outgoing requests" },
  outgoingEmpty: { uk: "Немає відправлених запитів.", en: "No outgoing requests." },
  addToSpaceTitle: { uk: "Додати в простір", en: "Add to space" },
  addToSpaceSelect: { uk: "Оберіть простір", en: "Select space" },
  editRestaurant: { uk: "Редагувати ресторан", en: "Edit restaurant" },
  deleteRestaurant: { uk: "Видалити ресторан", en: "Delete restaurant" },
  restaurantName: { uk: "Назва ресторану", en: "Restaurant name" },
  restaurantLocation: { uk: "Локація", en: "Location" },
  privateSpace: { uk: "Приватний простір", en: "Private space" },
  spaceOwnerYou: { uk: "Ваш простір", en: "Your space" },
  spaceOwnerPrefix: { uk: "Простір:", en: "Space of" },
  spaceMembersTitle: { uk: "Учасники простору", en: "Space members" },
  spaceMembersEmpty: { uk: "Учасників поки немає.", en: "No members yet." },
  spaceMembersButton: { uk: "Учасники", en: "Members" },
  spaceMembersCurrent: { uk: "Поточні учасники", en: "Current members" },
  spaceMembersAddFriends: { uk: "Додати друзів у простір", en: "Add friends to space" },
  spaceMemberRemoved: { uk: "Учасника видалено зі простору.", en: "Member removed from space." },
  spaceMemberRemoveFailed: { uk: "Не вдалося видалити учасника.", en: "Failed to remove member." },
  openSpace: { uk: "Відкрити", en: "Open" },
  spaceDetailsSubtitle: {
    uk: "Простір для друзів та спільних оцінок.",
    en: "A space for friends and shared ratings."
  },
  ratingsEmpty: { uk: "Поки що немає оцінок.", en: "No ratings yet." },
  edit: { uk: "Редагувати", en: "Edit" },
  delete: { uk: "Видалити", en: "Delete" },
  spaceName: { uk: "Назва простору", en: "Space name" },
  cancel: { uk: "Скасувати", en: "Cancel" },
  close: { uk: "Закрити", en: "Close" },
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
