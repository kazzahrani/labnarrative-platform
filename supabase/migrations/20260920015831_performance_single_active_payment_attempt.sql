create unique index if not exists performance_payment_attempts_one_active_per_settlement_uidx
  on private.performance_payment_attempts(settlement_id)
  where status in ('created','pending');
