import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

function initFirebase() {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) {
    throw new Error(
      "VITE_FIREBASE_CONFIG is not set in Vercel environment variables."
    );
  }
  let config: object;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error(
      "VITE_FIREBASE_CONFIG is not valid JSON. Value starts with: " + raw.slice(0, 60)
    );
  }
  return initializeApp(config);
}

export const firebaseApp = initFirebase();
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
export const firestore = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
