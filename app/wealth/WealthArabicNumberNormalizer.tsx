"use client";

import type { FormEvent, ReactNode } from "react";

function normalizeArabicNumerals(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

export default function WealthArabicNumberNormalizer({ children }: { children: ReactNode }) {
  function normalizeInput(event: FormEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    if (target.type === "password" || target.type === "email") return;

    const normalized = normalizeArabicNumerals(target.value);
    if (normalized === target.value) return;

    const prototype = target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(target, normalized);
  }

  return <div onInputCapture={normalizeInput}>{children}</div>;
}
