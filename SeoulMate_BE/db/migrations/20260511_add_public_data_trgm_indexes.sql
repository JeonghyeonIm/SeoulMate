create extension if not exists pg_trgm;

create index if not exists idx_public_data_source_dataset
  on public_data(source_dataset);

create index if not exists idx_public_data_title_trgm
  on public_data using gin (title gin_trgm_ops);

create index if not exists idx_public_data_category_trgm
  on public_data using gin (category gin_trgm_ops);

create index if not exists idx_public_data_region_trgm
  on public_data using gin (region gin_trgm_ops);

create index if not exists idx_public_data_address_trgm
  on public_data using gin (address gin_trgm_ops);

create index if not exists idx_public_data_metadata_text_trgm
  on public_data using gin ((metadata::text) gin_trgm_ops);
