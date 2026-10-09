CREATE TABLE IF NOT EXISTS public.support_settings (
  setting_key text PRIMARY KEY DEFAULT 'global'
    CHECK (setting_key = 'global'),
  whatsapp_phone text NOT NULL DEFAULT ''
    CHECK (whatsapp_phone = '' OR whatsapp_phone ~ '^[0-9]{8,15}$')
);

INSERT INTO public.support_settings (setting_key, whatsapp_phone)
VALUES ('global', '')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read support contact"
  ON public.support_settings;
CREATE POLICY "Authenticated users can read support contact"
  ON public.support_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Superadmins can update support contact"
  ON public.support_settings;
CREATE POLICY "Superadmins can update support contact"
  ON public.support_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );

REVOKE ALL ON public.support_settings FROM anon, authenticated;

GRANT SELECT ON public.support_settings TO authenticated;
GRANT UPDATE (whatsapp_phone) ON public.support_settings TO authenticated;
