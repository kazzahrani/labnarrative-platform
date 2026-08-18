export const metadata = {
  title: "LabNarrative Revenue Intelligence",
  robots: { index: false, follow: false },
};

const INTELLIGENCE_V2_URL =
  "https://labintelligence-production-v2-lab-narrative.vercel.app/v2";

export default function IntelligenceAdminPage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: "#f4f6f4",
      }}
    >
      <iframe
        src={INTELLIGENCE_V2_URL}
        title="LabNarrative Revenue Intelligence V2"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="clipboard-read; clipboard-write"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          background: "#f4f6f4",
        }}
      />
    </main>
  );
}
