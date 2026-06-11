import { useEffect, useState } from "react";
import { signInWithPopup, onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { getMe } from "./api";
import OnboardingForm from "./components/OnboardingForm";
import Dashboard from "./components/Dashboard";
import "./App.css";

type AppState = "loading" | "signed-out" | "onboarding" | "dashboard";

export default function App() {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [appState, setAppState] = useState<AppState>("loading");

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (!user) {
        setAppState("signed-out");
        setProfile(null);
        return;
      }
      await loadProfile();
    });
  }, []);

  async function loadProfile() {
    try {
      const data = await getMe();
      setProfile(data);
      setAppState(data.productDescription ? "dashboard" : "onboarding");
    } catch {
      setAppState("signed-out");
    }
  }

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  if (appState === "loading") {
    return <div className="center"><div className="spinner" /></div>;
  }

  if (appState === "signed-out") {
    return (
      <div className="landing">
        <div className="landing-card">
          <h1>TikTok Video Creator</h1>
          <p>Generate AI-powered TikTok videos for your product and post them directly.</p>
          <button className="btn-primary btn-large" onClick={handleSignIn}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">VideoCreator</span>
        <div className="header-right">
          <span className="user-email">{fbUser?.email}</span>
          <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
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
    </div>
  );
}
