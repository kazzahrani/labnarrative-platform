"use client";

import { useEffect } from "react";

const legacyTransferUrl = "https://labnarrative-platform-lab-narrative.vercel.app/admin/session-transfer";

export default function AdminAuthRecoveryEnhancer() {
  useEffect(() => {
    if (window.location.pathname !== "/admin") return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const enhance = () => {
      if (cancelled) return;

      document.querySelectorAll<HTMLElement>("main *").forEach((element) => {
        if (element.children.length === 0 && element.textContent?.trim() === "{}") {
          element.textContent = "The verification email could not be sent because the configured SMTP mailbox rejected authentication.";
        }
      });

      const submit = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === "Send verification code",
      );
      if (!submit || document.querySelector("[data-admin-session-recovery='true']")) return;

      const recovery = document.createElement("div");
      recovery.dataset.adminSessionRecovery = "true";
      Object.assign(recovery.style, {
        marginTop: "14px",
        padding: "14px 16px",
        border: "1px solid rgba(178, 195, 187, 0.35)",
        background: "rgba(255, 255, 255, 0.035)",
        fontSize: "0.88rem",
        lineHeight: "1.5",
      });

      const text = document.createElement("p");
      text.textContent = "Email-code delivery is temporarily unavailable. You can securely transfer your active administrator session from the existing platform address.";
      text.style.margin = "0 0 10px";

      const link = document.createElement("a");
      link.href = legacyTransferUrl;
      link.textContent = "Continue with existing administrator session →";
      link.style.color = "inherit";
      link.style.fontWeight = "700";
      link.style.textDecoration = "underline";
      link.style.textUnderlineOffset = "3px";

      recovery.append(text, link);
      submit.insertAdjacentElement("afterend", recovery);
    };

    enhance();
    observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
