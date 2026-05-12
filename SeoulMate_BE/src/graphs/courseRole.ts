export type CourseRole =
  | "cafe"
  | "culture"
  | "walk"
  | "food"
  | "nightlife"
  | "karaoke"
  | "activity"
  | "camping"
  | "amusement"
  | "attraction";

export const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

export const NIGHTLIFE_KEYWORDS = [
  "술집",
  "2차",
  "호프집",
  "주점",
  "호프",
  "포차",
  "맥주",
  "와인",
  "칵테일",
  "이자카야",
  "펍",
  "하이볼",
  "막걸리",
  "막걸리집",
  "전통주점",
  "루프탑바",
  "혼술",
  "감성주점",
  "클럽",
  "나이트",
  "정종/대포집/소주방",
  "호프/통닭",
  "lp바",
  "엘피바",
  "lp bar",
  "재즈바",
  "jazz bar",
  "와인바",
  "wine bar",
  "칵테일바",
  "cocktail bar",
  "club",
  "bar",
  "pub"
];

export const CHICKEN_PIZZA_KEYWORDS = ["치킨", "통닭", "피자", "피자집", "chicken", "pizza"];

export const KARAOKE_KEYWORDS = ["노래방", "노래연습장", "코인노래방", "동전노래연습장", "karaoke"];

export const ACTIVITY_KEYWORDS = [
  "방탈출",
  "보드게임",
  "보드게임카페",
  "찜질방",
  "볼링",
  "당구",
  "당구장",
  "만화카페",
  "공방",
  "원데이클래스",
  "향수",
  "도자기",
  "클라이밍",
  "vr",
  "아케이드",
  "실내놀거리",
  "액티비티",
  "체험",
  "복합유통게임제공업",
  "체력단련장업"
];

export const CAMPING_KEYWORDS = [
  "캠핑",
  "캠핑장",
  "야영",
  "글램핑",
  "바베큐",
  "피크닉장",
  "피크닉"
];

export const AMUSEMENT_KEYWORDS = [
  "놀이시설",
  "놀이공원",
  "테마파크",
  "어트랙션",
  "워터파크",
  "어드벤처",
  "롯데월드",
  "어린이대공원",
  "허가테마파크업"
];

export const AMUSEMENT_REGION_HINTS = [
  "잠실",
  "송파",
  "롯데월드",
  "어린이대공원",
  "능동",
  "광진",
  "문정",
  "파크하비오",
  "워터킹덤"
];

export const CAFE_KEYWORDS = ["카페", "커피", "디저트", "베이커리", "휴게", "cafe"];
export const CULTURE_KEYWORDS = ["문화", "전시", "공연", "박물관", "미술관", "공간"];
export const WALK_KEYWORDS = ["공원", "산책", "자연", "숲", "한강", "야외", "하천", "둘레길"];
export const FOOD_KEYWORDS = [
  "음식",
  "식사",
  "맛집",
  "식당",
  "레스토랑",
  "restaurant",
  "한식",
  "양식",
  "일식",
  "중식"
];
export const ATTRACTION_KEYWORDS = ["관광", "명소", "야경", "attraction"];

export const DEFAULT_ROLE_ORDER: CourseRole[] = ["cafe", "food", "walk", "culture", "attraction"];
export const EVENING_ROLE_ORDER: CourseRole[] = ["food", "cafe", "walk", "culture", "attraction"];

export const resolvePlaceCountRange = (durationHours: number): { min: number; max: number } => {
  if (durationHours <= 2) return { min: 1, max: 2 };
  if (durationHours <= 4) return { min: 2, max: 3 };
  if (durationHours <= 6) return { min: 3, max: 4 };
  if (durationHours <= 8) return { min: 4, max: 5 };
  if (durationHours <= 10) return { min: 5, max: 6 };
  if (durationHours <= 12) return { min: 6, max: 7 };
  return { min: 7, max: 8 };
};

export const resolveRequestHourKst = (dateTime?: string): number | undefined => {
  if (!dateTime) return undefined;
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return undefined;
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hourCycle: "h23",
      hour12: false
    }).format(date)
  );
};

export const defaultRoleOrder = (dateTime?: string): CourseRole[] =>
  (resolveRequestHourKst(dateTime) ?? 12) >= 18 ? EVENING_ROLE_ORDER : DEFAULT_ROLE_ORDER;

export const PLACE_FAMILY_TO_ROLE: Record<string, CourseRole> = {
  food: "food",
  cafe: "cafe",
  culture: "culture",
  walk: "walk",
  park: "walk",
  nightlife: "nightlife",
  bar: "nightlife",
  karaoke: "karaoke",
  activity: "activity",
  camping: "camping",
  amusement: "amusement",
  attraction: "attraction"
};

export const requestedRolesFromCategories = (categories: string[] = []): CourseRole[] => {
  const roles: CourseRole[] = [];
  const pushRole = (role: CourseRole): void => {
    if (!roles.includes(role)) roles.push(role);
  };

  for (const category of categories) {
    const text = category.toLowerCase();
    if (includesAny(text, NIGHTLIFE_KEYWORDS)) pushRole("nightlife");
    if (includesAny(text, KARAOKE_KEYWORDS)) pushRole("karaoke");
    if (includesAny(text, ACTIVITY_KEYWORDS)) pushRole("activity");
    if (includesAny(text, CAMPING_KEYWORDS)) pushRole("camping");
    if (includesAny(text, AMUSEMENT_KEYWORDS)) pushRole("amusement");
    if (includesAny(text, CAFE_KEYWORDS)) pushRole("cafe");
    if (includesAny(text, CULTURE_KEYWORDS)) pushRole("culture");
    if (includesAny(text, ["실내"])) {
      pushRole("cafe");
      pushRole("culture");
    }
    if (includesAny(text, WALK_KEYWORDS)) pushRole("walk");
    if (includesAny(text, FOOD_KEYWORDS)) pushRole("food");
    if (includesAny(text, ATTRACTION_KEYWORDS)) pushRole("attraction");
  }

  return roles;
};
