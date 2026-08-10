"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../payment.module.css";

type ApplePayConfig = {
  isEligible?: boolean;
  countryCode?: string;
  merchantCapabilities?: string[];
  supportedNetworks?: string[];
};

type ApplePayButtonProps = {
  token: string;
  clientId: string;
  currency: string;
  amount: number;
  functionUrl: string;
};

declare global {
  interface Window {
    paypal?: any;
    ApplePaySession?: any;
  }
}

function loadScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Payment script failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Payment script failed to load."));
    document.head.appendChild(script);
  });
}

export default function ApplePayButton({ token, clientId, currency, amount, functionUrl }: ApplePayButtonProps) {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<ApplePayConfig | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    if (!clientId || !currency || typeof window === "undefined") return;
    let cancelled = false;
    const setup = async () => {
      try {
        const paypalSrc = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons,funding-eligibility,applepay`;
        await Promise.all([
          loadScript("labnarrative-paypal-sdk", paypalSrc),
          loadScript("labnarrative-apple-pay-sdk", "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"),
        ]);
        const ApplePaySession = window.ApplePaySession;
        const applepayFactory = window.paypal?.Applepay;
        if (!ApplePaySession || !applepayFactory || !ApplePaySession.canMakePayments()) return;
        const nextConfig = await applepayFactory().config() as ApplePayConfig;
        if (!cancelled && nextConfig?.isEligible) {
          setConfig(nextConfig);
          setEligible(true);
        }
      } catch {
        if (!cancelled) setEligible(false);
      }
    };
    void setup();
    return () => { cancelled = true; };
  }, [clientId, currency]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !eligible) return;
    container.innerHTML = '<apple-pay-button buttonstyle="black" type="pay" locale="en-US"></apple-pay-button>';
    const button = container.querySelector("apple-pay-button");
    if (!button) return;
    const handler = () => void beginApplePay();
    button.addEventListener("click", handler);
    return () => button.removeEventListener("click", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, config, amount, currency]);

  async function beginApplePay() {
    if (busy || !eligible || !config) return;
    const ApplePaySession = window.ApplePaySession;
    const applepayFactory = window.paypal?.Applepay;
    if (!ApplePaySession || !applepayFactory) return;
    setError("");

    let session: any;
    try {
      session = new ApplePaySession(4, {
        countryCode: config.countryCode,
        merchantCapabilities: config.merchantCapabilities,
        supportedNetworks: config.supportedNetworks,
        currencyCode: currency,
        requiredBillingContactFields: ["postalAddress"],
        total: { label: "LabNarrative", type: "final", amount: amount.toFixed(2) },
      });
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Apple Pay could not start.");
      return;
    }

    const applepay = applepayFactory();
    session.onvalidatemerchant = async (event: any) => {
      try {
        const result = await applepay.validateMerchant({ validationUrl: event.validationURL, displayName: "LabNarrative" });
        session.completeMerchantValidation(result.merchantSession);
      } catch (validationError) {
        setError(validationError instanceof Error ? validationError.message : "Apple Pay merchant validation failed.");
        session.abort();
      }
    };

    session.onpaymentauthorized = async (event: any) => {
      setBusy(true);
      try {
        const created = await callProvider("create_apple_order");
        const orderId = String(created.orderId || "");
        if (!orderId) throw new Error("Apple Pay order could not be created.");
        await applepay.confirmOrder({
          orderId,
          token: event.payment.token,
          billingContact: event.payment.billingContact,
        });
        const captured = await callProvider("capture", { orderId });
        if (!captured.paid) throw new Error("Apple Pay payment was not completed.");
        session.completePayment(ApplePaySession.STATUS_SUCCESS);
        window.location.reload();
      } catch (paymentError) {
        setError(paymentError instanceof Error ? paymentError.message : "Apple Pay payment could not be completed.");
        session.completePayment(ApplePaySession.STATUS_FAILURE);
        setBusy(false);
      }
    };

    session.oncancel = () => setBusy(false);
    session.begin();
  }

  if (!eligible) return null;
  return <>
    <div ref={containerRef} className={`${styles.applePayWrap} ${busy ? styles.applePayBusy : ""}`} aria-label="Pay with Apple Pay" />
    {error ? <p className={styles.error}>{error}</p> : null}
  </>;
}
