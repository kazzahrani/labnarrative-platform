const figures = [
  ["litovchick-1", "https://www.frontiersin.org/files/Articles/1363543/fonc-14-1363543-HTML/image_m/fonc-14-1363543-g001.jpg"],
  ["litovchick-2", "https://www.frontiersin.org/files/Articles/1277537/fcell-11-1277537-HTML/image_m/fcell-11-1277537-g001.jpg"],
  ["litovchick-3", "https://www.frontiersin.org/files/Articles/1277537/fcell-11-1277537-HTML/image_m/fcell-11-1277537-g003.jpg"],
  ["litovchick-4", "https://mdpi-res.com/d_attachment/cancers/cancers-13-00489/article_deploy/cancers-13-00489-g004.png"],
  ["bremner-1", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11384508/bin/crc-24-0101-f01.jpg"],
  ["bremner-2", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig3_HTML.png"],
  ["bremner-3", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig2_HTML.png"],
  ["bremner-4", "https://media.springernature.com/lw685/springer-static/image/art%3A10.1038%2Fs41388-020-1372-7/MediaObjects/41388_2020_1372_Fig4_HTML.png"],
];

let failed = false;
for (const [name, url] of figures) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LabNarrativeFigureCheck/1.0; +https://labnarrative.com)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: new URL(url).origin + "/",
      },
    });
    const type = response.headers.get("content-type") || "";
    const length = response.headers.get("content-length") || "unknown";
    const ok = response.ok && type.toLowerCase().startsWith("image/");
    console.log(`[figure-check] ${name}: status=${response.status} type=${type} bytes=${length} final=${response.url}`);
    if (!ok) failed = true;
    await response.body?.cancel();
  } catch (error) {
    failed = true;
    console.error(`[figure-check] ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error("[figure-check] One or more figure sources failed verification.");
  process.exit(1);
}

console.log("[figure-check] All figure sources passed verification.");
