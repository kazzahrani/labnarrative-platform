create index if not exists performance_trade_marks_user_idx
  on private.performance_trade_marks(user_id);
create index if not exists performance_trade_marks_connection_idx
  on private.performance_trade_marks(connection_id);
