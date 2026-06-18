import { useEffect, useRef, useState } from "react";
import { signOut, deleteUser } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { getStorage, ref, listAll, deleteObject } from "firebase/storage";
import { auth } from "../firebase";

interface Props {
  email: string | null;
}

export default function UserMenu({ email }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
        setError("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleDeleteAccount() {
    const user = auth.currentUser;
    if (!user) return;
    setDeleting(true);
    setError("");

    const db = getFirestore();
    const storage = getStorage();

    try {
      // 1. Delete all videos documents for this user
      const videosQuery = query(
        collection(db, "videos"),
        where("userId", "==", user.uid)
      );
      const videoSnap = await getDocs(videosQuery);
      await Promise.all(videoSnap.docs.map((d) => deleteDoc(d.ref)));

      // 2. Delete all files in Storage under videos/{uid}/
      const userStorageRef = ref(storage, `videos/${user.uid}`);
      const listed = await listAll(userStorageRef).catch(() => ({ items: [] }));
      await Promise.all(listed.items.map((item) => deleteObject(item).catch(() => {})));

      // 3. Delete the user Firestore profile document
      await deleteDoc(doc(db, "users", user.uid)).catch(() => {});

      // 4. Delete Firebase Auth account last
      await deleteUser(user);
    } catch (e: any) {
      setDeleting(false);
      if (e.code === "auth/requires-recent-login") {
        setError("Please sign out and sign back in, then try again.");
      } else {
        setError("Failed to delete account. Please try again.");
      }
    }
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="btn-ghost user-menu-trigger"
        onClick={() => { setOpen((o) => !o); setConfirming(false); setError(""); }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="user-email-truncate">{email}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          style={{ marginLeft: 6, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="user-menu-dropdown">
          {!confirming ? (
            <>
              <button
                className="user-menu-item"
                onClick={() => signOut(auth)}
              >
                Sign out
              </button>
              <div className="user-menu-divider" />
              <button
                className="user-menu-item user-menu-item-danger"
                onClick={() => setConfirming(true)}
              >
                Delete account
              </button>
            </>
          ) : (
            <div className="user-menu-confirm">
              <p>Delete your account and all data permanently?</p>
              {error && <p className="user-menu-error">{error}</p>}
              <div className="user-menu-confirm-actions">
                <button
                  className="btn-ghost"
                  style={{ fontSize: 13 }}
                  onClick={() => { setConfirming(false); setError(""); }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="user-menu-item-danger-btn"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
