import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const raw = import.meta.env.VITE_FIREBASE_CONFIG;
if (!raw) throw new Error("VITE_FIREBASE_CONFIG is not set. Add it to Vercel environment variables.");
const config = JSON.parse(raw);

export const firebaseApp = initializeApp(config);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
