import proj4 from "proj4";

const EPSG5174 =
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-147,506,687,0,0,0,0 +units=m +no_defs";

const SEOUL_BOUNDARY = {
  minLatitude: 37.413,
  maxLatitude: 37.716,
  minLongitude: 126.734,
  maxLongitude: 127.269
} as const;

const KNOWN_BAD_COORDINATES = [
  { latitude: 0, longitude: 0 },
  { latitude: 33.4777213, longitude: 124.8464315 }
] as const;

const EPSILON = 0.000001;

export const isFiniteCoordinate = (
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean => Number.isFinite(latitude) && Number.isFinite(longitude);

export const isKnownBadCoordinate = (
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean =>
  isFiniteCoordinate(latitude, longitude) &&
  KNOWN_BAD_COORDINATES.some(
    (coordinate) =>
      Math.abs((latitude as number) - coordinate.latitude) < EPSILON &&
      Math.abs((longitude as number) - coordinate.longitude) < EPSILON
  );

export const isWithinSeoulBoundary = (
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean =>
  isFiniteCoordinate(latitude, longitude) &&
  (latitude as number) >= SEOUL_BOUNDARY.minLatitude &&
  (latitude as number) <= SEOUL_BOUNDARY.maxLatitude &&
  (longitude as number) >= SEOUL_BOUNDARY.minLongitude &&
  (longitude as number) <= SEOUL_BOUNDARY.maxLongitude;

export const isValidSeoulCoordinate = (
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean =>
  isFiniteCoordinate(latitude, longitude) &&
  !isKnownBadCoordinate(latitude, longitude) &&
  isWithinSeoulBoundary(latitude, longitude);

export const epsg5174ToWgs84 = (x: number, y: number): { lat: number; lng: number } | null => {
  try {
    const [lng, lat] = proj4(EPSG5174, "WGS84", [x, y]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat, lng };
  } catch {
    return null;
  }
};
