# LabNarrative Trading v0.1 retirement

Trading v0.1 was retired from the live `/trader` route when Trading Automations v1 was introduced.

- The final v0.1 source baseline is preserved in `app/trader/TradingAgent.tsx`, its chart components, and the `scripts/prepare-trader-*` build transforms.
- Git commit `f2ad04d` is the last v0.1 production baseline before the v1 route switch.
- Historical browser data is intentionally untouched. v1 reads `labnarrative-dca-bots-v1` and `labnarrative-dca-trades-v1` without rewriting them.
- New v1 configuration drafts use the separate `labnarrative-trading-automations-v1-bots` key.
- SmartTrade remains archived in the v0.1 source and storage history but is not rendered or included in v1 accounting.
- v1 exposes no API-key, exchange-connect, or live-order controls. Those require a durable server-side engine, persistent database state, auditable execution, and server-only credentials.

To recover v0.1 for audit, inspect commit `f2ad04d` and run its existing build pipeline. Do not point the live `/trader` route back to v0.1 without an explicit rollback decision.
