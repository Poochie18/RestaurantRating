import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./init";

export async function uploadAvatar(uid: string, file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `avatars/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}
