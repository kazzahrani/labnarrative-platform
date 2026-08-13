"use client";

/**
 * Retired legacy Website Monitor LinkedIn enhancer.
 *
 * Website Monitor v4 already receives LinkedIn status in the compact
 * website_monitor_snapshot RPC and renders the native LinkedIn action itself.
 * The legacy MutationObserver re-fetched prospects, LinkedIn state and initial
 * outreach messages whenever the monitor DOM changed, creating unnecessary
 * Supabase egress.
 */
export default function WebsiteLinkedInCueEnhancer() {
  return null;
}
