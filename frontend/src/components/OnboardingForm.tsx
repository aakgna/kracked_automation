import { useState } from "react";
import { onboard } from "../api";

interface Props {
  onComplete: () => void;
}

export default function OnboardingForm({ onComplete }: Props) {
  const [productDescription, setProductDescription] = useState("");
  const [videoStyle, setVideoStyle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onboard(productDescription, videoStyle);
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Set up your profile</h2>
      <p className="subtitle">
        Tell us about your product and the videos you want to create. We'll remember this.
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Describe your product
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="e.g. Kracked is a social logic puzzle app — a TikTok-style feed of brain games like Sudoku, Wordle challenges, and user-created puzzles..."
            rows={5}
            required
          />
        </label>
        <label>
          What style of TikTok videos do you want?
          <textarea
            value={videoStyle}
            onChange={(e) => setVideoStyle(e.target.value)}
            placeholder="e.g. Energetic and punchy, targeted at young adults who want to feel smarter. Fast hooks, surprising stats, strong call to action."
            rows={4}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Saving…" : "Save & continue"}
        </button>
      </form>
    </div>
  );
}
