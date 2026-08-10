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

async function fetchCardFieldsClientToken(functionUrl: string, paymentToken: string) {
  const clientTokenUrl = functionUrl.replace(/\/paypal-checkout$/, "/paypal-client-token");
  if (clientTokenUrl === functionUrl) return "";
  const response = await fetch(clientTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: paymentToken }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) return "";
  return String(payload.clientToken || "");
}

function loadPayPalSdk(clientId: string, currency: string, clientToken: string) {
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
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons,funding-eligibility,card-fields,applepay`;
    if (clientToken) script.setAttribute("data-client-token", clientToken);
    script.async = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Secure checkout could not load."));
    document.head.appendChild(script);
  });
}

export default function PayPalStandardButtons({ token, clientId, currency, functionUrl }: Props) {
  const paypalRef = useRef<HTMLDivElement | null>(null);
  const cardFieldsRef = useRef<any>(null);
  const [error, setError] = useState("");
  const [advancedCardEligible, setAdvancedCardEligible] = useState(false);
  const [eligibilityChecked, setEligibilityChecked] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);

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
        const clientToken = await fetchCardFieldsClientToken(functionUrl, token);
        await loadPayPalSdk(clientId, currency, clientToken);
        if (cancelled || !window.paypal) return;

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
          setSubmittingCard(false);
          setError(checkoutError instanceof Error ? checkoutError.message : "Payment could not be completed.");
        };

        if (window.paypal.CardFields && clientToken) {
          try {
            const cardFields = window.paypal.CardFields({
              createOrder,
              onApprove,
              onError,
              style: {
                input: {
                  "font-size": "16px",
                  "font-family": "Arial, Helvetica, sans-serif",
                  color: "#16231f",
                },
                ".invalid": { color: "#842b22" },
              },
            });
            if (cardFields?.isEligible?.()) {
              cardFieldsRef.current = cardFields;
              setAdvancedCardEligible(true);
              await Promise.all([
                cardFields.NumberField({ placeholder: "Card number" }).render("#labnarrative-card-number"),
                cardFields.ExpiryField({ placeholder: "MM/YY" }).render("#labnarrative-card-expiry"),
                cardFields.CVVField({ placeholder: "CVV" }).render("#labnarrative-card-cvv"),
              ]);
            }
          } catch {
            cardFieldsRef.current = null;
            setAdvancedCardEligible(false);
          }
        }

        setEligibilityChecked(true);

        if (paypalRef.current && window.paypal.Buttons) {
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
        if (!cancelled) {
          setEligibilityChecked(true);
          setError(setupError instanceof Error ? setupError.message : "Secure checkout could not load.");
        }
      }
    };

    void setup();
    return () => {
      cancelled = true;
      cardFieldsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currency, token, functionUrl]);

  async function submitAdvancedCard() {
    if (!cardFieldsRef.current || submittingCard) return;
    setSubmittingCard(true);
    setError("");
    try {
      await cardFieldsRef.current.submit();
    } catch (submitError) {
      setSubmittingCard(false);
      setError(submitError instanceof Error ? submitError.message : "Please check your card details and try again.");
    }
  }

  return <>
    {advancedCardEligible ? <div className={styles.directPayBlock}>
      <p className={styles.directPayLabel}>Pay directly by card</p>
      <div className={`${styles.advancedCardForm} ${styles.advancedCardFormVisible}`}>
        <div id="labnarrative-card-number" className={styles.cardField} />
        <div className={styles.cardFieldRow}>
          <div id="labnarrative-card-expiry" className={styles.cardField} />
          <div id="labnarrative-card-cvv" className={styles.cardField} />
        </div>
        <button type="button" className={styles.advancedCardSubmit} disabled={submittingCard} onClick={() => void submitAdvancedCard()}>{submittingCard ? "Processing…" : "Pay by card"}</button>
      </div>
      <p className={styles.directPayHint}>Card number, expiry and security code only. No PayPal account required.</p>
    </div> : eligibilityChecked ? <p className={styles.directCardUnavailable}>Direct card checkout is not enabled for this PayPal merchant account. Pay securely with PayPal below.</p> : null}
    {advancedCardEligible ? <div className={styles.paymentDivider}><span>or</span></div> : null}
    <div ref={paypalRef} className={styles.smartButtonSlot} />
    {error ? <p className={styles.error}>{error}</p> : null}
  </>;
}
