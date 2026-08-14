"use client";

import { useLayoutEffect } from "react";

export default function NumeralPerformanceBridge() {
  useLayoutEffect(() => {
    const OriginalNumberFormat = Intl.NumberFormat;
    const originalReplace = String.prototype.replace;
    const formatterCache = new Map<string, Intl.NumberFormat>();

    function CachedLatinNumberFormat(
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ): Intl.NumberFormat {
      const normalizedOptions: Intl.NumberFormatOptions = {
        ...options,
        numberingSystem: "latn",
      };
      const localeList = Array.isArray(locales) ? locales : locales ? [locales] : [];
      const key = JSON.stringify([localeList.map(String), normalizedOptions]);

      let formatter = formatterCache.get(key);
      if (!formatter) {
        formatter = new OriginalNumberFormat(locales, normalizedOptions);
        formatterCache.set(key, formatter);
      }
      return formatter;
    }

    Object.setPrototypeOf(CachedLatinNumberFormat, OriginalNumberFormat);
    CachedLatinNumberFormat.prototype = OriginalNumberFormat.prototype;
    (CachedLatinNumberFormat as typeof Intl.NumberFormat).supportedLocalesOf = OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
    (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = CachedLatinNumberFormat as typeof Intl.NumberFormat;

    // Keep technical references such as SO-2026-041 unchanged in Arabic.
    // No DOM observer, walker, mutation scan, timeout, or animation-frame work.
    const latinIdReplace = function (
      this: string,
      searchValue: string | RegExp,
      replaceValue: string | ((substring: string, ...args: unknown[]) => string),
    ): string {
      const value = String(this);
      if (
        searchValue instanceof RegExp &&
        searchValue.source === "\\d" &&
        searchValue.global &&
        typeof replaceValue === "function" &&
        /[A-Za-z]/.test(value) &&
        /\d/.test(value) &&
        value.includes("-")
      ) {
        return value;
      }
      return originalReplace.call(value, searchValue as never, replaceValue as never);
    };

    String.prototype.replace = latinIdReplace as typeof String.prototype.replace;

    return () => {
      (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
      String.prototype.replace = originalReplace;
    };
  }, []);

  return null;
}
