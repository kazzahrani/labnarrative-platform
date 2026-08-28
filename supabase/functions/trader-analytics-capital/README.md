# Trader Analytics Max Capital

Read-only authenticated helper used by Trader Analytics.

- DCA: full configured capital ladder for one trade multiplied by maximum active trades.
- Strategy Execution: reported as dynamic because TradingView can add to an existing position, so the strategy itself has no truthful fixed capital ceiling.

This function does not place, modify, or cancel orders or trades.
