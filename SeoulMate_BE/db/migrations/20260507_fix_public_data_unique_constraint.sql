-- POST_SN은 각 Visit Seoul 데이터셋별로 독립 시퀀스이므로
-- source 기준 unique key는 TbVwRestaurants/TbVwNature/TbVwAttractions 간 충돌 발생.
-- source_dataset 기준으로 변경하면 데이터셋별로 독립 관리 가능.

alter table public_data
  drop constraint uq_public_data_source_record;

alter table public_data
  add constraint uq_public_data_source_record unique (source_dataset, source_record_id);
