export const DATASET_CATEGORY = {
  TOURIST_FOOD: "서울 관광 음식",
  TOURIST_NATURE: "서울 관광 자연",
  TOURIST_ATTRACTION: "서울 관광명소",
  MAJOR_PARK: "서울 주요 공원",
  CULTURAL_SPACE: "서울 문화공간",
  CULTURAL_EVENT: "서울 문화행사",
  REST_AREA_PERMIT: "서울시 휴게음식점 인허가 정보",
  GENERAL_RESTAURANT_PERMIT: "서울시 일반음식점 인허가 정보",
  NIGHT_SPOT: "서울시 야경명소 정보",
  LIVING_POPULATION: "서울시 생활인구 통계",
  KARAOKE: "서울시 노래연습장",
  BATHHOUSE: "서울시 목욕장",
  BILLIARDS: "서울시 당구장",
  BOWLING: "서울시 볼링장",
  GAME_ARCADE: "서울시 오락실/게임장",
  PC_CAFE: "서울시 PC방",
  ESCAPE_ROOM: "서울시 방탈출/유원시설",
  CAMPING: "서울시 야영장",
  AMUSEMENT_PARK: "서울시 종합유원시설"
} as const;

export const INITIAL_PUBLIC_DATA_SYNC_SOURCE = "initial_public_data_sync";
export const DAILY_PUBLIC_DATA_SYNC_SOURCE = "daily_public_data_sync";
export const DAILY_PUBLIC_DATA_SYNC_HOUR_KST = 4;
export const DAILY_PUBLIC_DATA_SYNC_MINUTE_KST = 10;

export type DatasetCategory = (typeof DATASET_CATEGORY)[keyof typeof DATASET_CATEGORY];
