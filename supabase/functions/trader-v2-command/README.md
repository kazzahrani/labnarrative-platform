# Trader Core V2 command bus

This function is intentionally shadow-only in this phase.

- The signed-in user's active Real Account is resolved server-side.
- `mode=execute` is rejected.
- Supported command envelopes are validated but never forwarded to live controls.
- Idempotency keys are unique per user and request fingerprints prevent key reuse with different payloads.
- Sensitive-looking payload keys are rejected so credentials cannot enter the command audit tables.
- Direct browser access to the command/audit tables is blocked with RLS and revoked grants; the Edge Function uses service-role access after user authentication.

Live execution must only be enabled in a later, separately validated command worker.
