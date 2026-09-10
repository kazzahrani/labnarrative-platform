# LabNarrative Bot Arena

Bot Arena is the public forward-testing product served at `https://labnarrative.com/arena`.

## Isolation boundary

Arena intentionally does **not** use the customer Paper/Real trading data model. Its state is confined to tables prefixed with `arena_`:

- `arena_guests`
- `arena_bots`
- `arena_trades`
- `arena_fills`
- `arena_equity_snapshots`
- `arena_runtime_settings`

There are no Arena foreign keys to `trading_*` tables and the public website does not use Supabase Anonymous Auth. A browser generates a random Arena guest key; PostgreSQL stores only its SHA-256 hash. The guest identity exists only for Arena ownership/actions.

## Current beta execution model

- Spot Long DCA only.
- One USDT pair per bot.
- Fixed $10,000 virtual starting capital per bot.
- Public Binance market prices are sampled by the Arena worker once per minute.
- Base entry, safety/DCA orders, volume scale, step scale, take profit, optional trailing take profit, stop loss, optional trailing stop, and deal cooldown are simulated with virtual funds.
- Equity history is sampled every five minutes.
- Results begin at bot launch; no historical results are backfilled.
- LN Score is withheld until at least five closed trades.

The Arena worker is deployed as the Supabase Edge Function `arena-worker` and is invoked by the `arena-worker-minute` pg_cron job. Its authentication token is generated and stored only in `arena_runtime_settings`; never commit it to source control.

## Public actions

The public page can create a bot, clone/fork a bot, pause/resume/close a bot owned by the current Arena guest, increment public views, and read public bot/trade/equity records. Mutations go through constrained Arena RPCs. Direct table writes are not granted to browser roles.

## Beta capacity controls

- Maximum 3 active/paused non-official bots per Arena guest.
- Maximum 200 active/paused public beta bots globally.
- Maximum 60 new public bots per hour globally.
- Guest identities that own no bots and have been inactive for seven days are cleaned automatically.

## Planned parity work

The production trading app currently supports additional DCA controls such as base-order type, multiple take-profit levels, active-order limits, multi-position limits, stop-loss timeout, and indicator conditions. These should be ported deliberately into the Arena engine rather than coupling Arena to the trading application's tables or workers.
