"use client";

/**
 * Retired legacy Website Monitor enhancer.
 *
 * Website Monitor v4 renders outreach sequence state directly from the compact
 * website_monitor_snapshot RPC. Keeping the old enhancer mounted caused four
 * redundant Supabase queries every 15 seconds plus a realtime subscription,
 * even though its legacy table selectors no longer matched the v4 monitor.
 */
export default function WebsiteOutreachSequenceEnhancer() {
  return null;
}
