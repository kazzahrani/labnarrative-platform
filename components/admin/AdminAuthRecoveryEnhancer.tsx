"use client";

// Retained as a mounted compatibility component. Administrator session recovery
// now lives in AdminControlCenterGate + AdminSessionContinuity, so this legacy
// DOM injector intentionally performs no work.
export default function AdminAuthRecoveryEnhancer() {
  return null;
}
