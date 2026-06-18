import { useState } from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import Footer from "../components/Footer";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(friendlyError(err.code));
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div className="landing" style={{ flex: 1 }}>
        <div className="landing-card" style={{ width: "100%", maxWidth: 420 }}>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>TikTok Video Creator</h1>
          <p style={{ marginBottom: 28 }}>
            Generate AI-powered TikTok videos and post them automatically.
          </p>

          {/* Mode toggle */}
          <div className="mode-toggle" style={{ width: "100%", marginBottom: 24 }}>
            <button
              className={`mode-btn${mode === "signin" ? " mode-btn-active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => { setMode("signin"); setError(""); }}
            >
              Sign In
            </button>
            <button
              className={`mode-btn${mode === "signup" ? " mode-btn-active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => { setMode("signup"); setError(""); }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleEmailAuth} style={{ textAlign: "left" }}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button
              type="submit"
              className="btn-primary btn-large"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            className="btn-google btn-large"
            onClick={handleGoogle}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ verticalAlign: "middle", marginRight: 8 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Continue with Google
          </button>

          <p style={{ marginTop: 24, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            By continuing you agree to our{" "}
            <a href="/terms-of-service" style={{ color: "var(--accent2)" }}>Terms</a>
            {" "}and{" "}
            <a href="/privacy-policy" style={{ color: "var(--accent2)" }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Something went wrong. Please try again.";
  }
}
