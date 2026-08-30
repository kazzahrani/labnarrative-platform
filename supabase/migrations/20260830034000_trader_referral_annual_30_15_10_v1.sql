update public.trader_referral_program_config
set annual_l1_bps = 3000,
    annual_l2_bps = 1500,
    annual_l3_bps = 1000,
    updated_at = now()
where id = 1;
