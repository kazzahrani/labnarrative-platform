create or replace function public.trader_gateway_store_signing_private_key(p_private_key text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  select signing_private_key_secret_id into v_existing
  from public.trader_gateway_config
  where name='binance'
  for update;

  if v_existing is not null then
    raise exception 'gateway_signing_key_already_configured';
  end if;

  v_id := vault.create_secret(
    p_private_key,
    'trader_binance_gateway_signing_key',
    'ECDSA P-256 private signing key for LabNarrative Binance relay authentication',
    null
  );

  update public.trader_gateway_config
  set signing_private_key_secret_id=v_id,
      status='pending',
      updated_at=now()
  where name='binance';

  return v_id;
end;
$$;

revoke all on function public.trader_gateway_store_signing_private_key(text) from public, anon, authenticated;
grant execute on function public.trader_gateway_store_signing_private_key(text) to service_role;
