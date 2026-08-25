"use client";

export default function BinanceLauncher() {
  return (
    <button
      type="button"
      aria-label="Connect Binance"
      style={{
        position: "fixed",
        top: 16,
        right: 76,
        zIndex: 9990,
        height: 34,
        padding: "0 14px",
        border: "1px solid rgba(255,255,255,.14)",
        borderRadius: 10,
        background: "#f3f5f6",
        color: "#111518",
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "-.01em",
        cursor: "pointer",
        boxShadow: "0 8px 24px rgba(0,0,0,.22)",
      }}
    >
      Connect Binance
    </button>
  );
}
