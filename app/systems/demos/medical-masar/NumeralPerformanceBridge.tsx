"use client";

import { useLayoutEffect } from "react";

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const LATIN_DIGITS = "0123456789";

function latinize(value: unknown) {
  if (typeof value !== "string") return value;
  return value.replace(ARABIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return LATIN_DIGITS[code - 0x0660];
    if (code >= 0x06f0 && code <= 0x06f9) return LATIN_DIGITS[code - 0x06f0];
    return digit;
  });
}

export default function NumeralPerformanceBridge() {
  useLayoutEffect(() => {
    const OriginalNumberFormat = Intl.NumberFormat;
    const formatterCache = new Map<string, Intl.NumberFormat>();

    function LatinNumberFormat(
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

    Object.setPrototypeOf(LatinNumberFormat, OriginalNumberFormat);
    LatinNumberFormat.prototype = OriginalNumberFormat.prototype;
    (LatinNumberFormat as typeof Intl.NumberFormat).supportedLocalesOf = OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
    (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = LatinNumberFormat as typeof Intl.NumberFormat;

    const nodeValue = Object.getOwnPropertyDescriptor(Node.prototype, "nodeValue");
    const textContent = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    const data = Object.getOwnPropertyDescriptor(CharacterData.prototype, "data");

    if (nodeValue?.set) {
      Object.defineProperty(Node.prototype, "nodeValue", {
        ...nodeValue,
        set(this: Node, value: string | null) {
          nodeValue.set!.call(this, latinize(value));
        },
      });
    }

    if (textContent?.set) {
      Object.defineProperty(Node.prototype, "textContent", {
        ...textContent,
        set(this: Node, value: string | null) {
          textContent.set!.call(this, latinize(value));
        },
      });
    }

    if (data?.set) {
      Object.defineProperty(CharacterData.prototype, "data", {
        ...data,
        set(this: CharacterData, value: string) {
          data.set!.call(this, latinize(value));
        },
      });
    }

    return () => {
      (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
      if (nodeValue) Object.defineProperty(Node.prototype, "nodeValue", nodeValue);
      if (textContent) Object.defineProperty(Node.prototype, "textContent", textContent);
      if (data) Object.defineProperty(CharacterData.prototype, "data", data);
    };
  }, []);

  return null;
}
