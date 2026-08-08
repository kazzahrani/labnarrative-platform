"use client";

/**
 * Retired with Engine v2.
 *
 * The old automation page used a document-level click interceptor and
 * MutationObserver to rewrite outreach-send buttons. Engine v2 has separate
 * review/publish controls and must not be touched by that legacy behavior.
 */
export default function OperatorSendSafetyEnhancer() {
  return null;
}
