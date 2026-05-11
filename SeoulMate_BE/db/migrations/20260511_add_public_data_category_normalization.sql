ALTER TABLE public_data
  ADD COLUMN IF NOT EXISTS place_family varchar(50),
  ADD COLUMN IF NOT EXISTS place_type varchar(100),
  ADD COLUMN IF NOT EXISTS place_subtype varchar(100),
  ADD COLUMN IF NOT EXISTS category_confidence numeric(4,2);

CREATE INDEX IF NOT EXISTS idx_public_data_place_family
  ON public_data(place_family);

CREATE INDEX IF NOT EXISTS idx_public_data_place_type
  ON public_data(place_type);

CREATE INDEX IF NOT EXISTS idx_public_data_place_subtype
  ON public_data(place_subtype);
