alter table public.trader_gateway_config add column if not exists signing_private_key_secret_id uuid;

create or replace function public.trader_gateway_read_signing_private_key()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select signing_private_key_secret_id into v_secret_id from public.trader_gateway_config where name='binance';
  if v_secret_id is null then raise exception 'gateway_signing_key_not_configured'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_secret_id;
  if v_secret is null then raise exception 'gateway_signing_key_not_configured'; end if;
  return v_secret;
end;
$$;

revoke all on function public.trader_gateway_read_signing_private_key() from public, anon, authenticated;
grant execute on function public.trader_gateway_read_signing_private_key() to service_role;
