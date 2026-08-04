const imageHeaders = {
  "User-Agent": "Mozilla/5.0 (compatible; LabNarrativeFigureCheck/1.0; +https://labnarrative.com)",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
};

const figures = [
  ["litovchick-4-current", "https://mdpi-res.com/d_attachment/cancers/cancers-13-00489/article_deploy/cancers-13-00489-g004.png"],
  ["litovchick-4-candidate", "https://mdpi-res.com/cancers/cancers-13-00489/article_deploy/html/images/cancers-13-00489-g004-550.jpg"],
  ["bremner-1-current", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11384508/bin/crc-24-0101-f01.jpg"],
  ["bremner-1-fallback", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig1_HTML.png"],
  ["bremner-2", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig3_HTML.png"],
  ["bremner-3", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig2_HTML.png"],
  ["bremner-4", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig4_HTML.png"],
];

for (const [name, url] of figures) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { ...imageHeaders, Referer: new URL(url).origin + "/" },
    });
    const type = response.headers.get("content-type") || "";
    const length = response.headers.get("content-length") || "unknown";
    console.log(`[figure-check] ${name}: status=${response.status} type=${type} bytes=${length} final=${response.url}`);
    await response.body?.cancel();
  } catch (error) {
    console.error(`[figure-check] ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const articleUrl = "https://aacrjournals.org/cancerrescommun/article/4/9/2374/748388/Netrin-1-and-UNC5B-Cooperate-with-Integrins-to";
try {
  const response = await fetch(articleUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  const html = await response.text();
  const matches = [...html.matchAll(/https?:[^\"'<>\s]+(?:crc-24-0101-f0?1|CRC-24-0101)[^\"'<>\s]*/gi)].map((match) => match[0].replaceAll("&amp;", "&"));
  console.log(`[figure-check] aacr article status=${response.status} type=${response.headers.get("content-type") || ""}`);
  console.log(`[figure-check] aacr candidate urls=${JSON.stringify([...new Set(matches)].slice(0, 30))}`);
} catch (error) {
  console.error(`[figure-check] aacr article: ${error instanceof Error ? error.message : String(error)}`);
}

console.log("[figure-check] Inspection complete.");
