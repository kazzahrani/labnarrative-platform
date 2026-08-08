"use client";

/**
 * Retired with Engine v2.
 *
 * The legacy production queue used MutationObservers, timers and realtime
 * subscriptions to rewrite /admin/automation. Engine v2 owns that page now,
 * so this component intentionally renders nothing.
 */
export default function LiveProductionQueue() {
  return null;
}
