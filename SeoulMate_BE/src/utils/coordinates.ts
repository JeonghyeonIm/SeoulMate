import proj4 from "proj4";

const EPSG5174 =
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-147,506,687,0,0,0,0 +units=m +no_defs";

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
