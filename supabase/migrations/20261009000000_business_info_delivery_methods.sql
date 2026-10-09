ALTER TABLE public.business_info
ADD COLUMN IF NOT EXISTS delivery_methods text[] NOT NULL
DEFAULT ARRAY['pickup', 'table', 'point', 'delivery']::text[];
