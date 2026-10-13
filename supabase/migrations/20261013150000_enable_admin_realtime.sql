DO $$
DECLARE
  table_name text;
  admin_tables text[] := ARRAY[
    'businesses',
    'business_info',
    'subscriptions',
    'payment_records',
    'promotions',
    'business_plan_change_requests',
    'business_notifications',
    'billing_plan_periods',
    'billing_plan_features',
    'public_courier_applications',
    'public_courier_topups',
    'public_courier_settings',
    'categories',
    'categories_shop',
    'inventory_categories',
    'products',
    'inventory_items',
    'business_hours',
    'frases',
    'system',
    'support_settings',
    'promotion_pricing_settings',
    'promotion_discount_tiers',
    'payment_qr_codes',
    'profiles'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'La publicación supabase_realtime no existe.';
  END IF;

  FOREACH table_name IN ARRAY admin_tables
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables AS publication_table
        WHERE publication_table.pubname = 'supabase_realtime'
          AND publication_table.schemaname = 'public'
          AND publication_table.tablename = table_name
      )
    THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
