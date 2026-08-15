export const metadata = {
  title: "LabIntelligence | LabNarrative",
  robots: { index: false, follow: false },
};

const LABINTELLIGENCE_URL =
  "https://labintelligence-production-v2-lab-narrative.vercel.app/";

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
        background: "#101a22",
      }}
    >
      <iframe
        src={LABINTELLIGENCE_URL}
        title="LabIntelligence"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="clipboard-read; clipboard-write"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          background: "#101a22",
        }}
      />
    </main>
  );
}
