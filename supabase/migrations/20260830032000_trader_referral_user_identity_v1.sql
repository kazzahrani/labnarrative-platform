alter table public.trader_referral_profiles
  add column if not exists owner_user_id uuid;

create unique index if not exists trader_referral_profiles_owner_user_idx
  on public.trader_referral_profiles (owner_user_id)
  where owner_user_id is not null;

alter table public.trader_referral_attributions
  add column if not exists referred_owner_user_id uuid,
  add column if not exists referrer_owner_user_id uuid;

create unique index if not exists trader_referral_attributions_referred_owner_idx
  on public.trader_referral_attributions (referred_owner_user_id)
  where referred_owner_user_id is not null;

create index if not exists trader_referral_attributions_referrer_owner_idx
  on public.trader_referral_attributions (referrer_owner_user_id, attributed_at desc)
  where referrer_owner_user_id is not null;

alter table public.trader_referral_commissions
  add column if not exists beneficiary_owner_user_id uuid,
  add column if not exists referred_owner_user_id uuid;

create index if not exists trader_referral_commissions_beneficiary_owner_idx
  on public.trader_referral_commissions (beneficiary_owner_user_id, status, hold_until)
  where beneficiary_owner_user_id is not null;

alter table public.trader_referral_payouts
  add column if not exists owner_user_id uuid;

create index if not exists trader_referral_payouts_owner_status_idx
  on public.trader_referral_payouts (owner_user_id, status, created_at desc)
  where owner_user_id is not null;
