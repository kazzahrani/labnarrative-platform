"use client";

import { useEffect } from "react";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicNumerals(value: string) {
  return value
    .replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)])
    .replace(/%/g, "٪");
}

function toWesternNumerals(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/٪/g, "%");
}

function localizeVisibleText(root: HTMLElement) {
  const useArabicNumerals = root.dir === "rtl" || root.lang === "ar";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (
      parent &&
      !parent.closest("script, style, textarea, [data-number-localization='off']")
    ) {
      const current = node.nodeValue ?? "";
      const next = useArabicNumerals
        ? toArabicNumerals(current)
        : toWesternNumerals(current);

      if (next !== current) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

export default function ArabicDigitLocalizer() {
  useEffect(() => {
    const systemsRoot = document.querySelector<HTMLElement>(".lnSystemsTypography");
    if (!systemsRoot) return;

    const run = () => {
      systemsRoot
        .querySelectorAll<HTMLElement>("main[dir]")
        .forEach(localizeVisibleText);
    };

    run();

    const observer = new MutationObserver(run);
    observer.observe(systemsRoot, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["dir", "lang"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
