import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "./init";
import type { Restaurant, Rating, UserProfile } from "../types";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export function subscribeRestaurants(callback: (restaurants: Restaurant[]) => void) {
  const q = query(collection(db, "restaurants"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Restaurant) }));
    callback(data);
  });
}

export async function createRestaurant(input: Pick<Restaurant, "name" | "location" | "createdBy">) {
  const now = serverTimestamp();
  await addDoc(collection(db, "restaurants"), {
    name: input.name,
    location: input.location,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateRestaurant(id: string, input: Pick<Restaurant, "name" | "location">) {
  await updateDoc(doc(db, "restaurants", id), {
    name: input.name,
    location: input.location,
    updatedAt: serverTimestamp()
  });
}

export async function deleteRestaurant(id: string) {
  await deleteDoc(doc(db, "restaurants", id));
}

export async function getRestaurant(id: string) {
  const snap = await getDoc(doc(db, "restaurants", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Restaurant) } as Restaurant;
}

export function subscribeRestaurantRatings(restaurantId: string, callback: (ratings: Rating[]) => void) {
  const q = query(collection(db, "restaurants", restaurantId, "ratings"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Rating) }));
    callback(data);
  });
}

export async function getUserRating(restaurantId: string, userId: string) {
  const snap = await getDoc(doc(db, "restaurants", restaurantId, "ratings", userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Rating) } as Rating;
}

export async function upsertRating(restaurantId: string, rating: Rating) {
  await setDoc(doc(db, "restaurants", restaurantId, "ratings", rating.userId), {
    ...rating,
    updatedAt: serverTimestamp(),
    createdAt: rating.createdAt ? rating.createdAt : serverTimestamp()
  }, { merge: true });
}

export async function searchRestaurantsByOwner(uid: string) {
  const q = query(collection(db, "restaurants"), where("createdBy", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Restaurant) }));
}
