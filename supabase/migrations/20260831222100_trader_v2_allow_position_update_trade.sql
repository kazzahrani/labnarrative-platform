alter table public.trader_v2_commands
  drop constraint if exists trader_v2_commands_type_check;

alter table public.trader_v2_commands
  add constraint trader_v2_commands_type_check
  check (command_type in (
    'automation.create',
    'automation.update',
    'automation.set_status',
    'automation.archive',
    'position.add_funds',
    'position.update_exit_plan',
    'position.update_trade'
  ));
