// Shared by manual screening and the scheduled Edge Function.
export function crossrefIssns(metadata: Record<string, any> = {}) {
  const configured = Array.isArray(metadata.crossref_issns) ? metadata.crossref_issns : null;
  return [...new Set((configured ?? [metadata.online_issn, metadata.print_issn])
    .map((value: any) => String(value ?? "").trim().toUpperCase())
    .filter((value: string) => /^\d{4}-[\dX]{4}$/.test(value)))];
}

export function unusableJournalPage(html: string) {
  return /test page for (?:the )?nginx|welcome to.*nginx|checking your browser|just a moment|access denied|verify you are human/i.test(html);
}

export async function fetchCrossrefWorks(issn: string, start: string, end: string,
  mode: "publication" | "update" = "update", request: typeof fetch = fetch) {
  const rows = 500, items: any[] = [];
  let cursor = "*", total = 0;
  for (let page = 0; page < 8; page++) {
    const url = new URL("https://api.crossref.org/v1/journals/" + encodeURIComponent(issn) + "/works");
    url.searchParams.set("filter", (mode === "update" ? "from-update-date:" : "from-pub-date:") + start +
      (mode === "update" ? ",until-update-date:" : ",until-pub-date:") + end + ",type:journal-article");
    url.searchParams.set("rows", String(rows));
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("mailto", "support@pvos.site");
    let message: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(url.toString(), {cache: "no-store", signal: AbortSignal.timeout(15000),
          headers: {Accept: "application/json", "User-Agent": "PVOS literature monitoring/1.0 (https://pvos.site)"}});
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); continue; }
          throw new Error("Crossref request failed (" + response.status + ").");
        }
        message = (await response.json())?.message;
        if (!message || !Array.isArray(message.items)) throw new Error("Invalid Crossref works response.");
        break;
      } catch (error) {
        if (attempt === 2 || /Crossref request failed|Invalid Crossref/.test(String(error))) throw error;
      }
    }
    const batch = message.items;
    total = Number(message["total-results"] ?? batch.length);
    items.push(...batch);
    const next = String(message["next-cursor"] ?? "");
    if (items.length >= total || !next || !batch.length || next === cursor) break;
    cursor = next;
  }
  return {items, total, truncated: items.length < total, mode};
}

// PostgREST caps individual responses: paginate before deduplicating against history.
export async function readAllRows(query: (from: number, to: number) => PromiseLike<{data: any[] | null; error: any}>) {
  const rows: any[] = [];
  for(let from = 0; ; from += 1000) {
    const {data, error} = await query(from, from + 999);
    if(error) throw error;
    rows.push(...(data || []));
    if(!data || data.length < 1000) return rows;
  }
}
