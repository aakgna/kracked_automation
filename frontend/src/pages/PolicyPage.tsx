type PolicyPageProps = { page: "privacy" | "terms" };

export default function PolicyPage({ page }: PolicyPageProps) {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "48px 24px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <a
          href="/"
          style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 32 }}
        >
          ← Back to app
        </a>
        {page === "privacy" ? <PrivacyPolicy /> : <TermsOfService />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: "1.1rem", color: "#fff", marginBottom: 10 }}>{title}</h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#ccc", marginBottom: 12, lineHeight: 1.7 }}>{children}</p>;
}

function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ color: "#ccc", paddingLeft: 20, marginBottom: 12, lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i} style={{ marginBottom: 6 }}>{item}</li>)}
    </ul>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1 style={{ fontSize: "2rem", color: "#fff", marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: 40 }}>Last updated: June 11, 2026</p>
      <P>This Privacy Policy describes how Kracked VideoCreator ("we", "us", or "our") collects, uses, and protects information when you use our AI-powered TikTok video generation platform.</P>

      <Section title="1. Information We Collect">
        <P>We collect the following information when you use our service:</P>
        <UL items={[
          <><strong>Account information:</strong> Your name and email address via Google Sign-In (Firebase Authentication).</>,
          <><strong>Product profile:</strong> The product description and video style preferences you provide during onboarding.</>,
          <><strong>TikTok tokens:</strong> OAuth access and refresh tokens for your TikTok account, stored securely in Firebase Firestore, used solely to post videos on your behalf.</>,
          <><strong>Generated content:</strong> Scripts, captions, and video metadata created during the video generation pipeline.</>,
          <><strong>Usage data:</strong> Standard server logs including IP addresses and request timestamps for security and debugging.</>,
        ]} />
      </Section>

      <Section title="2. How We Use Your Information">
        <UL items={[
          "To generate AI-powered TikTok videos based on your product description.",
          "To post videos to your TikTok account when you explicitly request it.",
          "To display your video history and account status within the app.",
          "To maintain and improve the service.",
        ]} />
        <P>We do not sell, rent, or share your personal information with third parties for marketing purposes.</P>
      </Section>

      <Section title="3. Third-Party Services">
        <P>Our service integrates with the following third-party platforms, each governed by their own privacy policies:</P>
        <UL items={[
          <><strong>Google / Firebase</strong> — authentication and database storage.</>,
          <><strong>Anthropic (Claude)</strong> — AI-generated scripts, captions, and prompts.</>,
          <><strong>ElevenLabs</strong> — AI voice synthesis for video audio.</>,
          <><strong>Fal.ai / Pika Art</strong> — AI text-to-video generation.</>,
          <><strong>TikTok Open API</strong> — posting content to your TikTok account.</>,
        ]} />
      </Section>

      <Section title="4. Data Retention">
        <P>Generated video files are stored temporarily on our servers and may be deleted after 30 days. Your profile data and TikTok tokens remain in Firestore until you disconnect your TikTok account or delete your account. You may request deletion of all your data at any time by contacting us.</P>
      </Section>

      <Section title="5. Security">
        <P>All data is transmitted over HTTPS. TikTok tokens are stored in Firebase Firestore with restricted access rules. We do not store your Google password — authentication is handled entirely by Google.</P>
      </Section>

      <Section title="6. Your Rights">
        <UL items={[
          "You may disconnect your TikTok account at any time from the dashboard.",
          "You may request deletion of your account and all associated data by emailing us.",
          "You may review what data we hold about you by contacting us directly.",
        ]} />
      </Section>

      <Section title="7. Children's Privacy">
        <P>This service is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13.</P>
      </Section>

      <Section title="8. Changes to This Policy">
        <P>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the service after changes constitutes acceptance of the updated policy.</P>
      </Section>

      <Section title="9. Contact">
        <P>For privacy-related questions or data deletion requests, contact us at <a href="mailto:agnan001@ucr.edu" style={{ color: "var(--accent)" }}>agnan001@ucr.edu</a>.</P>
      </Section>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <h1 style={{ fontSize: "2rem", color: "#fff", marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: 40 }}>Last updated: June 11, 2026</p>
      <P>By accessing or using Kracked VideoCreator ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</P>

      <Section title="1. Description of Service">
        <P>Kracked VideoCreator is an AI-powered platform that generates TikTok videos for your product or brand using AI-generated scripts, voiceovers, and visuals, and posts them directly to your connected TikTok account.</P>
      </Section>

      <Section title="2. Eligibility">
        <P>You must be at least 13 years old to use this Service. By using the Service, you represent that you meet this requirement and that all information you provide is accurate.</P>
      </Section>

      <Section title="3. Acceptable Use">
        <P>You agree <strong>not</strong> to use the Service to generate or post content that:</P>
        <UL items={[
          "Is sexually explicit, obscene, or pornographic.",
          "Is hateful, discriminatory, or harassing based on race, religion, gender, sexual orientation, disability, or nationality.",
          "Promotes or glorifies violence, self-harm, eating disorders, or illegal drug use.",
          "Targets, exploits, or endangers minors in any way.",
          "Constitutes misinformation, fake news, or deliberately misleading health or safety claims.",
          "Infringes on the intellectual property rights of any third party.",
          "Violates TikTok's Community Guidelines or Terms of Service.",
          "Is spam, repetitive low-quality content, or artificially inflates engagement metrics.",
          "Promotes illegal products, services, or activities.",
          "Impersonates any person, brand, or organization.",
        ]} />
        <P>We reserve the right to suspend or terminate accounts that violate these rules without notice.</P>
      </Section>

      <Section title="4. Your TikTok Account">
        <P>By connecting your TikTok account, you authorize us to post videos to your account on your behalf when you explicitly trigger the "Post to TikTok" action. You remain solely responsible for all content posted to your TikTok account via this Service.</P>
      </Section>

      <Section title="5. AI-Generated Content">
        <P>Videos generated by this Service use AI tools (Claude, ElevenLabs, Pika Art). AI-generated content may occasionally be inaccurate or not perfectly aligned with your intentions. You are responsible for reviewing generated content before posting.</P>
      </Section>

      <Section title="6. Intellectual Property">
        <P>You retain ownership of your product description and brand information you provide. You are responsible for ensuring your use of generated content complies with Anthropic, ElevenLabs, and Fal.ai usage policies.</P>
      </Section>

      <Section title="7. Service Availability">
        <P>We do not guarantee that the Service will be available at all times. Video generation depends on third-party APIs which may have their own outages or rate limits. We are not liable for delays or failures caused by third-party services.</P>
      </Section>

      <Section title="8. Limitation of Liability">
        <P>To the maximum extent permitted by law, Kracked VideoCreator shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</P>
      </Section>

      <Section title="9. Indemnification">
        <P>You agree to indemnify and hold harmless Kracked VideoCreator and its operators from any claims, damages, or expenses arising from your use of the Service or violation of these Terms.</P>
      </Section>

      <Section title="10. Termination">
        <P>We may suspend or terminate your access to the Service at any time for violation of these Terms. You may stop using the Service at any time.</P>
      </Section>

      <Section title="11. Changes to Terms">
        <P>We may update these Terms at any time. Changes will be posted on this page with an updated date. Continued use of the Service after changes constitutes your acceptance.</P>
      </Section>

      <Section title="12. Governing Law">
        <P>These Terms are governed by the laws of the State of California, United States.</P>
      </Section>

      <Section title="13. Contact">
        <P>For questions about these Terms, contact us at <a href="mailto:agnan001@ucr.edu" style={{ color: "var(--accent)" }}>agnan001@ucr.edu</a>.</P>
      </Section>
    </>
  );
}
