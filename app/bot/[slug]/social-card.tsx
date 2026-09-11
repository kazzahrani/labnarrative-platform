import { ImageResponse } from "next/og";
import { fetchSharedBot, shortDate, signedMoney, summarizeSharedBot } from "./shared-bot-data";

const SIZE = { width: 1200, height: 630 } as const;

function metric(label: string, value: string, sub?: string, accent?: string) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 246, minHeight: 118, padding: "20px 22px", border: "1px solid #2d3238", borderRadius: 18, background: "#171a1f" }}>
      <div style={{ display: "flex", color: "#7d858f", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
        <div style={{ display: "flex", color: accent || "#f3f4f6", fontSize: 38, fontWeight: 800, letterSpacing: "-0.04em" }}>{value}</div>
        {sub ? <div style={{ display: "flex", marginTop: 5, color: "#747c86", fontSize: 15 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

export async function createPublicBotSocialImage(slug: string) {
  const payload = await fetchSharedBot(slug);
  const summary = summarizeSharedBot(payload);
  const pnlAccent = summary.realizedPnl > 0 ? "#55d99a" : summary.realizedPnl < 0 ? "#df7b84" : "#f3f4f6";
  const name = summary.name.length > 72 ? `${summary.name.slice(0, 69)}…` : summary.name;
  const sampleNote = summary.closedTrades < 30
    ? "Early Paper sample — not enough data to judge the strategy."
    : "Forward Paper results — wins, losses and drawdowns included.";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 58px", background: "#0d0f12", color: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "#f4f4f2", color: "#0b0d10", fontSize: 28, fontWeight: 900 }}>L!</div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 14 }}>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 800 }}>LabNarrative Trading</div>
              <div style={{ display: "flex", marginTop: 3, color: "#747c86", fontSize: 15 }}>Public automated-trading lab</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderRadius: 999, border: "1px solid #3b424a", background: "#171a1f", color: "#d9dde2", fontSize: 16, fontWeight: 800, letterSpacing: "0.08em" }}>PAPER TRADING</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          <div style={{ display: "flex", color: "#79818a", fontSize: 17, fontWeight: 700, letterSpacing: "0.08em" }}>LIVE PUBLIC BOT</div>
          <div style={{ display: "flex", marginTop: 10, maxWidth: 1050, fontSize: 38, lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.035em" }}>{name}</div>
          <div style={{ display: "flex", marginTop: 12, color: "#8e969f", fontSize: 18 }}>{summary.marketLabel} · DCA · Running since {shortDate(summary.startedAt)}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}>
          {metric("Realized P&L", signedMoney(summary.realizedPnl), `${summary.closedTrades} closed trades`, pnlAccent)}
          {metric("Outcomes", `${summary.winners}W · ${summary.losers}L`, summary.breakeven ? `${summary.breakeven} breakeven` : "closed trades only")}
          {metric("Max drawdown", signedMoney(-summary.maxRealizedDrawdown), "realized P&L curve", summary.maxRealizedDrawdown > 0 ? "#df7b84" : "#f3f4f6")}
          {metric("Market", summary.pairCount ? `${summary.pairCount} pairs` : "USDT Spot", "spot only")}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 24, borderTop: "1px solid #272c32" }}>
          <div style={{ display: "flex", color: "#808892", fontSize: 16 }}>{sampleNote}</div>
          <div style={{ display: "flex", color: "#c9cdd2", fontSize: 17, fontWeight: 700 }}>Inspect settings · Clone into Paper →</div>
        </div>
      </div>
    ),
    SIZE,
  );
}

export const socialImageSize = SIZE;
