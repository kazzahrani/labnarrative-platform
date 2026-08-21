import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "career-agent.html");
  const baseHtml = await readFile(filePath, "utf8");
  const html = baseHtml.replace(
    "</body>",
    '<script src="/career-microsoft-ui.js"></script>\n<script src="/career-requirements-ui.js"></script>\n</body>',
  );

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
