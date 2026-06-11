export default function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      padding: "16px 28px",
      display: "flex",
      justifyContent: "center",
      gap: 24,
      background: "var(--surface)",
    }}>
      <a href="/privacy-policy" style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
        onMouseOver={e => (e.currentTarget.style.color = "var(--text)")}
        onMouseOut={e => (e.currentTarget.style.color = "var(--text-muted)")}>
        Privacy Policy
      </a>
      <a href="/terms-of-service" style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
        onMouseOver={e => (e.currentTarget.style.color = "var(--text)")}
        onMouseOut={e => (e.currentTarget.style.color = "var(--text-muted)")}>
        Terms of Service
      </a>
    </footer>
  );
}
