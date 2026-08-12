"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SalesActionCenter from "./SalesActionCenter";
import SalesConversionInbox from "./SalesConversionInbox";

export default function SalesHomeComposition() {
  const [conversionMount, setConversionMount] = useState<HTMLDivElement | null>(null);
  const [actionMount, setActionMount] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main");
    const shell = main?.firstElementChild instanceof HTMLElement ? main.firstElementChild : null;
    const topbar = shell?.querySelector<HTMLElement>(":scope > header");
    const conceptHeading = Array.from(shell?.querySelectorAll<HTMLHeadingElement>("h2") ?? [])
      .find((heading) => heading.textContent?.trim() === "Concept activity");
    const conceptSection = conceptHeading?.closest("section");

    if (!shell || !topbar || !conceptSection) return;

    const conversion = document.createElement("div");
    conversion.dataset.salesHomeSlot = "conversion";
    topbar.insertAdjacentElement("afterend", conversion);

    const action = document.createElement("div");
    action.dataset.salesHomeSlot = "action-center";
    conceptSection.insertAdjacentElement("beforebegin", action);

    setConversionMount(conversion);
    setActionMount(action);

    return () => {
      setConversionMount(null);
      setActionMount(null);
      conversion.remove();
      action.remove();
    };
  }, []);

  return (
    <>
      {conversionMount ? createPortal(<SalesConversionInbox />, conversionMount) : null}
      {actionMount ? createPortal(<SalesActionCenter />, actionMount) : null}
    </>
  );
}
