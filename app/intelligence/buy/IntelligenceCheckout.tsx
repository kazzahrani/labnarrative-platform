"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./buy.module.css";

type PackageKey = "starter" | "portfolio" | "portfolio_plus";
type PackageOption = {
  key: PackageKey;
  name: string;
  products: number;
  price: string;
  amount: number;
  note: string;
};

type ProviderStatus = {
  configured?: boolean;
  verified?: boolean;
  clientId?: string;
  currency?: string;
  authError?: string;
};

declare global {
  interface Window {
    paypal?: any;
  }
}

const packages: PackageOption[] = [
  { key: "starter", name: "Starter", products: 5, price: "$399", amount: 399, note: "A focused first expansion across five products." },
  { key: "portfolio", name: "Portfolio", products: 10, price: "$699", amount: 699, note: "Broader coverage for an active scientific portfolio." },
  { key: "portfolio_plus", name: "Portfolio Plus", products: 20, price: "$1,190", amount: 1190, note: "The strongest launch value for a larger portfolio." },
];

function loadPayPalSdk(clientId: string, currency: string) {
  return new Promise<void>((resolve, reject) => {
    const id = "labnarrative-intelligence-paypal-sdk";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Secure PayPal checkout could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Secure PayPal checkout could not load."));
    document.head.appendChild(script);
  });
}

function validPackage(value: string | null): value is PackageKey {
  return value === "starter" || value === "portfolio" || value === "portfolio_plus";
}

export default function IntelligenceCheckout() {
  const [selectedKey, setSelectedKey] = useState<PackageKey>("portfolio");
  const [sourceReportId, setSourceReportId] = useState("");
  const [provider, setProvider] = useState<ProviderStatus>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ captureId: string; purchaseId: string; packageName: string; payerEmail: string; workspaceUrl: string } | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const functionUrl = `${String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1/intelligence-checkout`;
  const selected = useMemo(() => packages.find((item) => item.key === selectedKey) || packages[1], [selectedKey]);

  async function callProvider(action: string, extra: Record<string, unknown> = {}) {
    if (!functionUrl.startsWith("https://")) throw new Error("Secure payment service is unavailable.");
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error || "Payment provider request failed."));
    return payload;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("package");
    if (validPackage(query)) setSelectedKey(query);
    const report = String(params.get("report") || "").trim();
    if (/^[0-9a-f-]{36}$/i.test(report)) setSourceReportId(report);
    void callProvider("status")
      .then((result) => {
        setProvider({
          configured: Boolean(result.configured),
          verified: Boolean(result.verified),
          clientId: String(result.clientId || ""),
          currency: String(result.currency || "USD"),
          authError: String(result.authError || ""),
        });
      })
      .catch((statusError: unknown) => setError(statusError instanceof Error ? statusError.message : "Secure checkout could not be opened."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionUrl]);

  useEffect(() => {
    if (!provider.clientId || !provider.verified || success) return;
    let cancelled = false;
    let buttons: any = null;
    setError("");

    const setup = async () => {
      try {
        await loadPayPalSdk(provider.clientId || "", provider.currency || "USD");
        if (cancelled || !window.paypal?.Buttons || !buttonRef.current) return;
        buttonRef.current.innerHTML = "";
        buttons = window.paypal.Buttons({
          createOrder: async () => {
            const result = await callProvider("create_order", { packageKey: selected.key, sourceReportId: sourceReportId || undefined });
            const orderId = String(result.orderId || "");
            if (!orderId) throw new Error("Secure payment order could not be created.");
            return orderId;
          },
          onApprove: async (data: { orderID?: string }) => {
            const orderId = String(data.orderID || "");
            if (!orderId) throw new Error("Payment order is missing.");
            const result = await callProvider("capture", { orderId });
            if (!result.paid) throw new Error("The payment was not completed.");
            const workspaceUrl = String(result.workspaceUrl || "");
            if (!workspaceUrl.startsWith("https://labnarrative.com/intelligence/workspace")) throw new Error("Payment succeeded, but the client workspace could not be opened.");
            setSuccess({
              captureId: String(result.captureId || ""),
              purchaseId: String(result.purchaseId || ""),
              packageName: String(result.packageName || selected.name),
              payerEmail: String(result.payerEmail || ""),
              workspaceUrl,
            });
          },
          onCancel: () => setError("PayPal checkout was cancelled. No payment was recorded."),
          onError: (checkoutError: unknown) => setError(checkoutError instanceof Error ? checkoutError.message : "Payment could not be completed."),
          style: { layout: "vertical", shape: "pill", height: 50, label: "pay" },
        });
        if (buttons.isEligible()) await buttons.render(buttonRef.current);
      } catch (setupError) {
        if (!cancelled) setError(setupError instanceof Error ? setupError.message : "Secure PayPal checkout could not load.");
      }
    };

    void setup();
    return () => {
      cancelled = true;
      try { buttons?.close?.(); } catch {}
      if (buttonRef.current) buttonRef.current.innerHTML = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.clientId, provider.currency, provider.verified, selected.key, sourceReportId, success]);

  if (success) {
    return (
      <section className={styles.success} aria-live="polite">
        <p className={styles.kicker}>Payment confirmed</p>
        <h2>Your Intelligence workspace is ready.</h2>
        <p>
          PayPal confirmed the <strong>{success.packageName}</strong> purchase. Continue to your private workspace to add company details, submit your products and follow every analysis through research, scientific review and delivery.
        </p>
        <div className={styles.receipt}>
          <span>Payment reference</span>
          <strong>{success.captureId || success.purchaseId}</strong>
          {success.payerEmail ? <small>Receipt identity: {success.payerEmail}</small> : null}
        </div>
        <a className={styles.primaryButton} href={success.workspaceUrl}>OPEN YOUR CLIENT WORKSPACE →</a>
      </section>
    );
  }

  return (
    <section className={styles.checkoutSection}>
      <div className={styles.packageGrid}>
        {packages.map((item) => {
          const active = item.key === selected.key;
          return (
            <button
              type="button"
              key={item.key}
              className={`${styles.packageCard} ${active ? styles.packageCardActive : ""}`}
              onClick={() => setSelectedKey(item.key)}
              aria-pressed={active}
            >
              <div>
                <span className={styles.packageName}>{item.name}</span>
                {item.key === "portfolio" ? <span className={styles.recommended}>Recommended</span> : null}
              </div>
              <strong>{item.products} products</strong>
              <p>{item.note}</p>
              <footer><b>{item.price}</b><span>{active ? "Selected" : "Choose"}</span></footer>
            </button>
          );
        })}
      </div>

      <aside className={styles.checkoutCard}>
        <p className={styles.kicker}>Secure checkout</p>
        <div className={styles.orderSummary}>
          <div><span>Package</span><strong>{selected.name}</strong></div>
          <div><span>Complete analyses</span><strong>{selected.products} products</strong></div>
          <div className={styles.total}><span>Total</span><strong>{selected.price} USD</strong></div>
        </div>
        <p className={styles.checkoutCopy}>One-time introductory launch price. No subscription. After payment, your private client workspace opens immediately.</p>
        {sourceReportId ? <p className={styles.checkoutCopy}>Your complimentary report will also be carried into the workspace as your first Intelligence reference.</p> : null}
        {loading ? <div className={styles.loading}>Connecting secure checkout…</div> : null}
        {!loading && provider.verified && provider.clientId ? <div ref={buttonRef} className={styles.paypalSlot} /> : null}
        {!loading && !provider.verified ? <div className={styles.error}>{provider.authError || "PayPal checkout is temporarily unavailable."}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        <div className={styles.securityLine}><span />Pay securely with PayPal or an eligible card.</div>
      </aside>
    </section>
  );
}
