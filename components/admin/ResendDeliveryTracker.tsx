"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ResendIntegrationState = {
  id: string;
  webhook_id: string;
  endpoint: string;
  status: string;
  configured_at: string | null;
  last_sync_at: string | null;
  last_event_at: string | null;
  last_error: string;
};

type DeliveryMessage = {
  id: string;
  prospect_id: string;
  recipient_email: string;
  provider: string;
  provider_message_id: string;
  delivery_status: string;
  sent_at: string | null;
  delivered_at: string | null;
  delivery_delayed_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  error_message: string;
  delivery_details: Record<string, unknown> | null;
};

type ProspectName = {
  id: string;
  pi_name: string;
};

type ConnectResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: string;
  backfilled?: number;
  backfillErrors?: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function normalizedLastEvent(message: DeliveryMessage): string {
  const raw = message.delivery_details?.last_event;
  return typeof raw === "string" ? raw.replace(/^email\./, "") : "";
}

function deliveryKey(message: DeliveryMessage): string {
  const status = message.delivery_status || "pending";
  if (status !== "pending") return status;

  const lastEvent = normalizedLastEvent(message);
  return ["sent", "delivered", "delivery_delayed", "bounced", "complained", "failed", "suppressed"]
    .includes(lastEvent)
    ? lastEvent
    : status;
}

function deliveryLabel(value: string): string {
  const labels: Record<string, string> = {
    pending: "Awaiting event",
    sent: "Sent",
    delivered: "Delivered",
    delivery_delayed: "Delayed",
    bounced: "Bounced",
    complained: "Complained",
    failed: "Failed",
    suppressed: "Suppressed",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function engagementKey(message: DeliveryMessage): "clicked" | "opened" | "none" {
  const lastEvent = normalizedLastEvent(message);
  if (message.clicked_at || lastEvent === "clicked") return "clicked";
  if (message.opened_at || lastEvent === "opened") return "opened";
  return "none";
}

function integrationLabel(status: string): string {
  if (status === "connected") return "Connected";
  if (status === "configuring") return "Connecting";
  if (status === "error") return "Connection error";
  return "Needs connection";
}

export default function ResendDeliveryTracker() {
  const [session, setSession] = useState<Session | null>(null);
  const [integration, setIntegration] = useState<ResendIntegrationState | null>(null);
  const [messages, setMessages] = useState<DeliveryMessage[]>([]);
  const [prospectNames, setProspectNames] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  const loadTracking = useCallback(async (activeSession?: Session | null) => {
    const currentSession = activeSession ?? session;
    if (!currentSession) return;

    setLoading(true);
    try {
      const [integrationResult, messageResult, prospectResult] = await Promise.all([
        supabase
          .from("resend_integration_state")
          .select("*")
          .eq("id", "primary")
          .maybeSingle(),
        supabase
          .from("outreach_messages")
          .select(
            "id,prospect_id,recipient_email,provider,provider_message_id,delivery_status,sent_at,delivered_at,delivery_delayed_at,bounced_at,complained_at,opened_at,clicked_at,error_message,delivery_details",
          )
          .eq("provider", "resend")
          .neq("provider_message_id", "")
          .order("sent_at", { ascending: false })
          .limit(100),
        supabase.from("prospects").select("id,pi_name"),
      ]);

      if (integrationResult.error) throw integrationResult.error;
      if (messageResult.error) throw messageResult.error;
      if (prospectResult.error) throw prospectResult.error;

      setIntegration((integrationResult.data ?? null) as ResendIntegrationState | null);
      setMessages((messageResult.data ?? []) as DeliveryMessage[]);
      setProspectNames(
        Object.fromEntries(
          ((prospectResult.data ?? []) as ProspectName[]).map((prospect) => [prospect.id, prospect.pi_name]),
        ),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delivery tracking could not be loaded.");
      setNoticeError(true);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) void loadTracking(data.session);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      if (nextSession) void loadTracking(nextSession);
      else {
        setIntegration(null);
        setMessages([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadTracking]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void loadTracking(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadTracking, session]);

  const deliveryCounts = useMemo(() => {
    const counts = {
      total: messages.length,
      delivered: 0,
      delayed: 0,
      bounced: 0,
      opened: 0,
      clicked: 0,
    };

    for (const message of messages) {
      const delivery = deliveryKey(message);
      const engagement = engagementKey(message);
      if (delivery === "delivered") counts.delivered += 1;
      if (delivery === "delivery_delayed") counts.delayed += 1;
      if (["bounced", "complained", "failed", "suppressed"].includes(delivery)) counts.bounced += 1;
      if (engagement === "opened" || engagement === "clicked") counts.opened += 1;
      if (engagement === "clicked") counts.clicked += 1;
    }

    return counts;
  }, [messages]);

  async function connectResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = apiKey.trim();
    if (!key) return;

    setConnecting(true);
    setNotice("");
    setNoticeError(false);

    try {
      const { data, error } = await supabase.functions.invoke("resend-connect", {
        body: { apiKey: key },
      });

      if (error) {
        let detail = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          const parsed = await context.clone().json().catch(() => ({})) as ConnectResponse;
          detail = parsed.error || parsed.message || detail;
        }
        throw new Error(detail);
      }

      const result = (data ?? {}) as ConnectResponse;
      if (result.error) throw new Error(result.error);

      setApiKey("");
      setNotice(result.message || "Resend delivery tracking is connected.");
      await loadTracking();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Resend could not be connected.");
      setNoticeError(true);
      await loadTracking();
    } finally {
      setConnecting(false);
    }
  }

  if (!session) return null;

  const connected = integration?.status === "connected";
  const recentMessages = messages.slice(0, 10);

  return (
    <section className="resendDeliveryCard" aria-label="Resend email delivery tracking">
      <div className="resendDeliveryHeader">
        <div>
          <p className="resendDeliveryKicker">Email delivery</p>
          <h2>Resend tracking</h2>
        </div>
        <span
          className="resendIntegrationBadge"
          data-integration={integration?.status || "not_configured"}
        >
          {integrationLabel(integration?.status || "not_configured")}
        </span>
      </div>

      {!connected ? (
        <div className="resendConnectPanel">
          <p>
            Connect a Resend <strong>Full access</strong> API key once to register the webhook and
            synchronize existing delivery results. The key is used for this connection only and is not stored.
          </p>
          <form className="resendConnectRow" onSubmit={connectResend}>
            <input
              aria-label="Resend Full access API key"
              autoComplete="off"
              disabled={connecting}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="re_…"
              type="password"
              value={apiKey}
            />
            <button disabled={connecting || !apiKey.trim()} type="submit">
              {connecting ? "Connecting…" : "Connect Resend"}
            </button>
          </form>
          {integration?.last_error ? (
            <p className="resendIntegrationError">{integration.last_error}</p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="resendDeliveryStats" aria-label="Email delivery totals">
            <div><span>Tracked</span><strong>{deliveryCounts.total}</strong></div>
            <div><span>Delivered</span><strong>{deliveryCounts.delivered}</strong></div>
            <div><span>Delayed</span><strong>{deliveryCounts.delayed}</strong></div>
            <div><span>Bounced / failed</span><strong>{deliveryCounts.bounced}</strong></div>
            <div><span>Opened</span><strong>{deliveryCounts.opened}</strong></div>
            <div><span>Clicked</span><strong>{deliveryCounts.clicked}</strong></div>
          </div>

          <div className="resendDeliveryMeta">
            <span>
              {integration?.last_event_at
                ? `Last event ${formatDate(integration.last_event_at)}`
                : "Connected and waiting for the next Resend event."}
            </span>
            <button disabled={loading} onClick={() => void loadTracking()} type="button">
              Refresh
            </button>
          </div>

          <div className="resendDeliveryTableWrap">
            <table className="resendDeliveryTable">
              <thead>
                <tr>
                  <th>PI</th>
                  <th>Recipient</th>
                  <th>Delivery</th>
                  <th>Engagement</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {recentMessages.length === 0 ? (
                  <tr><td colSpan={5}>No Resend messages have been recorded yet.</td></tr>
                ) : recentMessages.map((message) => {
                  const delivery = deliveryKey(message);
                  const engagement = engagementKey(message);
                  return (
                    <tr key={message.id}>
                      <td><strong>{prospectNames[message.prospect_id] || "Unknown PI"}</strong></td>
                      <td>{message.recipient_email || "—"}</td>
                      <td>
                        <span className="resendDeliveryBadge" data-delivery={delivery}>
                          {deliveryLabel(delivery)}
                        </span>
                      </td>
                      <td>
                        <span className="resendEngagement" data-engagement={engagement}>
                          {engagement === "clicked" ? "Clicked" : engagement === "opened" ? "Opened" : "—"}
                        </span>
                      </td>
                      <td>{formatDate(message.sent_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {notice ? (
        <p className={noticeError ? "resendIntegrationError" : "resendIntegrationNotice"} role={noticeError ? "alert" : "status"}>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
