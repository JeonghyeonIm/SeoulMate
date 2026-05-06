insert into public.public_data (
  source_dataset,
  source_record_id,
  title,
  category,
  region,
  address,
  latitude,
  longitude,
  source,
  source_url,
  metadata
)
values
  (
    'seoul_open_data',
    'SEOUL-PLACE-001',
    '북서울꿈의숲',
    '공원',
    '강북구',
    '서울특별시 강북구 월계로 173',
    37.6224570,
    127.0419940,
    '서울열린데이터광장',
    'https://data.seoul.go.kr/',
    '{"tags":["산책","야경","가족"]}'::jsonb
  ),
  (
    'seoul_open_data',
    'SEOUL-PLACE-002',
    '서울시립미술관',
    '문화',
    '중구',
    '서울특별시 중구 덕수궁길 61',
    37.5641250,
    126.9737640,
    '서울열린데이터광장',
    'https://data.seoul.go.kr/',
    '{"tags":["전시","실내","데이트"]}'::jsonb
  ),
  (
    'seoul_open_data',
    'SEOUL-PLACE-003',
    '경의선숲길',
    '산책',
    '마포구',
    '서울특별시 마포구 연남동 일대',
    37.5599480,
    126.9215160,
    '서울열린데이터광장',
    'https://data.seoul.go.kr/',
    '{"tags":["산책","연남","야외"]}'::jsonb
  ),
  (
    'seoul_open_data',
    'SEOUL-PLACE-004',
    '익선동 한옥거리',
    '관광',
    '종로구',
    '서울특별시 종로구 익선동 일대',
    37.5742610,
    126.9895430,
    '서울열린데이터광장',
    'https://data.seoul.go.kr/',
    '{"tags":["한옥","카페","도보"]}'::jsonb
  )
on conflict (source, source_record_id)
do update set
  title = excluded.title,
  category = excluded.category,
  region = excluded.region,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  source_url = excluded.source_url,
  metadata = excluded.metadata,
  updated_at = timezone('utc', now());
