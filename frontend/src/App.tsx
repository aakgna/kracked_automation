import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { auth } from "./firebase";
import OnboardingForm from "./components/OnboardingForm";
import Dashboard from "./components/Dashboard";
import Footer from "./components/Footer";
import PolicyPage from "./pages/PolicyPage";
import TikTokCallbackPage from "./pages/TikTokCallbackPage";
import LoginPage from "./pages/LoginPage";
import UserMenu from "./components/UserMenu";
import "./App.css";

const db = getFirestore();

type AppState = "loading" | "signed-out" | "onboarding" | "dashboard" | "error";

export default function App() {
  const path = window.location.pathname;
  if (path === "/privacy-policy") return <PolicyPage page="privacy" />;
  if (path === "/terms-of-service") return <PolicyPage page="terms" />;
  if (path === "/callback") return <TikTokCallbackPage />;
  if (path === "/login") return <LoginPage />;

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const path = window.location.pathname;
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [appState, setAppState] = useState<AppState>("loading");
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }

      if (!user) {
        setAppState("signed-out");
        setProfile(null);
        return;
      }

      unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setProfile({
          uid: user.uid,
          productDescription: data.productDescription ?? null,
          videoStyle: data.videoStyle ?? null,
          tiktokConnected: !!data.tiktokToken,
        });
        setAppState(data.productDescription ? "dashboard" : "onboarding");
      }, (e) => {
        setApiError(e.message ?? "Failed to load profile");
        setAppState("error");
      });
    });

    return () => { unsubAuth(); unsubProfile?.(); };
  }, []);

  function loadProfile() { /* profile is now live via onSnapshot */ }

  if (appState === "loading") {
    return <div className="center"><div className="spinner" /></div>;
  }

  if (appState === "error") {
    return (
      <div className="center" style={{ flexDirection: "column", gap: 12, padding: 32 }}>
        <p style={{ color: "#ff6b6b", fontWeight: 600 }}>Backend connection failed</p>
        <p style={{ color: "#888", fontSize: 13 }}>{apiError}</p>
        <button className="btn-ghost" onClick={() => fbSignOut(auth)}>Sign out</button>
      </div>
    );
  }

  if (appState === "signed-out") {
    if (path !== "/login") {
      window.location.replace("/login");
      return null;
    }
    return <LoginPage />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">VideoCreator</span>
        <div className="header-right">
          <UserMenu email={fbUser?.email ?? null} />
        </div>
      </header>

      <main className="app-main">
        {appState === "onboarding" && (
          <OnboardingForm onComplete={loadProfile} />
        )}
        {appState === "dashboard" && profile && (
          <Dashboard user={profile} onRefreshUser={loadProfile} />
        )}
      </main>

      <Footer />
    </div>
  );
}
