import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./init";
import type { UserProfile } from "../types";

export async function registerWithEmail(email: string, password: string, displayName: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (!cred.user) throw new Error("No user returned");

  await updateProfile(cred.user, { displayName });

  const profile: UserProfile = {
    uid: cred.user.uid,
    displayName,
    email: cred.user.email ?? email,
    photoURL: cred.user.photoURL ?? "",
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, "users", cred.user.uid), {
    ...profile,
    createdAt: serverTimestamp()
  });

  return cred.user;
}

export async function loginWithEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export async function updateDisplayName(user: User, displayName: string) {
  await updateProfile(user, { displayName });
  await updateDoc(doc(db, "users", user.uid), {
    displayName,
    updatedAt: serverTimestamp()
  });
}
