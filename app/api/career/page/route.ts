import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "career-agent.html");
  let html = await readFile(filePath, "utf8");
  const liveScript = '<script src="/career-live.js"></script>';
  const workspaceScript = '<script src="/career-workspace.js"></script>';
  if (!html.includes(liveScript)) html = html.replace("</body>", `${liveScript}\n</body>`);
  if (!html.includes(workspaceScript)) html = html.replace("</body>", `${workspaceScript}\n</body>`);
  html = html.replace("Seeded for the first workspace", "Live official sources + strategic targets");
  html = html.replace("Current items are seed examples for the interface. Live scheduled discovery and verification will be connected as the next backend layer.", "Verified official vacancies and clearly labeled strategic institutional targets, ranked against your career profile.");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
