import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);

export const firebaseApp = initializeApp(config);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
