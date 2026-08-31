-- Core V2 exit-plan live-control rollout is operationally enabled per account in
-- public.trader_v2_command_gates after the production UI deployment is verified.
--
-- This migration intentionally performs no gate insert/update because account IDs
-- are deployment-specific and absence of a row must remain fail-closed by default.
-- The production rollout operation is limited to command_type =
-- 'position.update_exit_plan' for the explicitly selected Real Account.
select 1;
