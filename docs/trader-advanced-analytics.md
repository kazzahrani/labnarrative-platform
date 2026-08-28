# Trader advanced analytics

The bot performance workspace includes eight compact range-aware visual diagnostics:

1. Capital utilization timeline — reconstructed from actual closed-trade open/close timestamps and recorded capital.
2. Risk/return bubble map — Max DD % vs realized ROI; bubble size represents capital.
3. Day × hour performance heatmap — realized close-time ROI in the browser's local time.
4. Rolling strategy health — rolling 20-trade ROI, win rate, and profit factor.
5. Trade return distribution — histogram of realized trade ROI.
6. Holding time × ROI — duration/return scatter with dot size proportional to trade capital.
7. Underwater drawdown — realized peak-to-trough drawdown normalized by capital used.
8. MFE/MAE trade map — rendered only when observed intratrade excursion values exist.

MFE/MAE is intentionally not estimated from entry and exit prices. Historical trades currently do not contain observed intratrade high/low excursion fields, so the chart shows a data-availability state until those values are genuinely recorded.

All analytics are read-only and do not change bot configuration, execution, positions, orders, or exchange connectivity.
