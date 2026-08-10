"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../payment.module.css";

type Props = {
  token: string;
  clientId: string;
  currency: string;
  functionUrl: string;
};

declare global {
  interface Window {
    paypal?: any;
  }
}

function loadPayPalSdk(clientId: string, currency: string) {
  return new Promise<void>((resolve, reject) => {
    const id = "labnarrative-paypal-sdk";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Secure checkout could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons,funding-eligibility,applepay`;
    script.async = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Secure checkout could not load."));
    document.head.appendChild(script);
  });
}

export default function PayPalStandardButtons({ token, clientId, currency, functionUrl }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const paypalRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [cardEligible, setCardEligible] = useState(false);

  async function callProvider(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...extra }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error || "Payment provider request failed."));
    return payload;
  }

  useEffect(() => {
    if (!clientId || !currency) return;
    let cancelled = false;

    const setup = async () => {
      try {
        await loadPayPalSdk(clientId, currency);
        if (cancelled || !window.paypal?.Buttons) return;

        const createOrder = async () => {
          const result = await callProvider("create_standard_order");
          const orderId = String(result.orderId || "");
          if (!orderId) throw new Error("Secure payment order could not be created.");
          return orderId;
        };
        const onApprove = async (data: { orderID?: string }) => {
          const orderId = String(data.orderID || "");
          if (!orderId) throw new Error("Payment order is missing.");
          const result = await callProvider("capture", { orderId });
          if (!result.paid) throw new Error("The payment was not completed.");
          window.location.reload();
        };
        const onError = (checkoutError: unknown) => {
          setError(checkoutError instanceof Error ? checkoutError.message : "Payment could not be completed.");
        };

        if (cardRef.current) {
          cardRef.current.innerHTML = "";
          const cardButton = window.paypal.Buttons({
            fundingSource: window.paypal.FUNDING.CARD,
            createOrder,
            onApprove,
            onCancel: () => undefined,
            onError,
            style: { layout: "vertical", shape: "pill", height: 50, label: "pay" },
          });
          if (cardButton.isEligible()) {
            setCardEligible(true);
            await cardButton.render(cardRef.current);
          }
        }

        if (paypalRef.current) {
          paypalRef.current.innerHTML = "";
          const paypalButton = window.paypal.Buttons({
            fundingSource: window.paypal.FUNDING.PAYPAL,
            createOrder,
            onApprove,
            onCancel: () => undefined,
            onError,
            style: { layout: "vertical", shape: "pill", height: 50, label: "paypal" },
          });
          if (paypalButton.isEligible()) await paypalButton.render(paypalRef.current);
        }
      } catch (setupError) {
        if (!cancelled) setError(setupError instanceof Error ? setupError.message : "Secure checkout could not load.");
      }
    };

    void setup();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currency, token, functionUrl]);

  return <>
    <div className={styles.directPayBlock}>
      <p className={styles.directPayLabel}>{cardEligible ? "Pay directly by card" : "Payment options"}</p>
      <div ref={cardRef} className={styles.smartButtonSlot} />
      {cardEligible ? <p className={styles.directPayHint}>No PayPal account required. Use an eligible debit or credit card.</p> : null}
    </div>
    <div className={styles.paymentDivider}><span>or</span></div>
    <div ref={paypalRef} className={styles.smartButtonSlot} />
    {error ? <p className={styles.error}>{error}</p> : null}
  </>;
}
