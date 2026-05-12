ALTER TABLE public_data
  ADD COLUMN IF NOT EXISTS menu_price_first   integer,
  ADD COLUMN IF NOT EXISTS menu_name_first    varchar(200),
  ADD COLUMN IF NOT EXISTS menu_price_fetched_at timestamptz;
