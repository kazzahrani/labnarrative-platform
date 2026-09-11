import { fetchSharedBot, signedMoney, summarizeSharedBot } from "../../../bot/[slug]/shared-bot-data";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; snapshot: string }> },
) {
  const { slug, snapshot } = await params;

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(slug) || !/^[A-Za-z0-9_-]{1,120}$/.test(snapshot)) {
    return new Response("Not found", { status: 404 });
  }

  const payload = await fetchSharedBot(slug);
  if (!payload?.ok) return new Response("Public Paper bot not found", { status: 404 });

  const summary = summarizeSharedBot(payload);
  const title = `${summary.name} · Public Paper Bot | LabNarrative`;
  const metrics = summary.closedTrades
    ? `${summary.closedTrades} closed trades · ${summary.winners}W/${summary.losers}L · Realized P&L ${signedMoney(summary.realizedPnl)}.`
    : "A newly shared Paper bot with live forward analytics.";
  const description = `PAPER TRADING · ${metrics} Inspect the live analytics and exact configuration, then clone a fresh Paper copy.`;

  const publicBotUrl = `https://labnarrative.com/bot/${encodeURIComponent(slug)}`;
  const shareUrl = `https://labnarrative.com/bot-share/${encodeURIComponent(slug)}/${encodeURIComponent(snapshot)}`;
  const imageUrl = `${shareUrl}/image`;
  const destination = new URL(publicBotUrl);
  destination.searchParams.set("utm_source", "x");
  destination.searchParams.set("utm_medium", "organic");
  destination.searchParams.set("utm_campaign", "public_bot_update");
  destination.searchParams.set("utm_content", `${slug}_${snapshot}`);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="noindex,nofollow">
<link rel="canonical" href="${escapeHtml(publicBotUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LabNarrative Trading">
<meta property="og:url" content="${escapeHtml(shareUrl)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="LabNarrative public Paper bot live analytics">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<meta name="twitter:image:alt" content="LabNarrative public Paper bot live analytics">
</head>
<body style="margin:0;background:#0d0f12;color:#f5f5f5;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh">
<main style="max-width:680px;padding:40px;text-align:center">
<h1 style="font-size:24px">Opening live Paper bot…</h1>
<p><a style="color:#8ab4ff" href="${escapeHtml(destination.toString())}">Open live results</a></p>
</main>
<script>location.replace(${JSON.stringify(destination.toString())});</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
