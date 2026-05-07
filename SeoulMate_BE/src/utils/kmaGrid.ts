const PI = Math.PI;
const DEGRAD = PI / 180.0;

const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;

const re = RE / GRID;
const slat1 = SLAT1 * DEGRAD;
const slat2 = SLAT2 * DEGRAD;
const olon = OLON * DEGRAD;
const olat = OLAT * DEGRAD;

const sn =
  Math.log(Math.cos(slat1) / Math.cos(slat2)) /
  Math.log(Math.tan(PI * 0.25 + slat2 * 0.5) / Math.tan(PI * 0.25 + slat1 * 0.5));

const sf = (Math.pow(Math.tan(PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1)) / sn;

const ro = (re * sf) / Math.pow(Math.tan(PI * 0.25 + olat * 0.5), sn);

export const latLngToGrid = (lat: number, lng: number): { nx: number; ny: number } => {
  const ra = (re * sf) / Math.pow(Math.tan(PI * 0.25 + lat * DEGRAD * 0.5), sn);

  let theta = lng * DEGRAD - olon;
  if (theta > PI) theta -= 2.0 * PI;
  if (theta < -PI) theta += 2.0 * PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
};
