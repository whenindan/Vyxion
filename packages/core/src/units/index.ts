// Pure unit conversions used across the app. All functions are one-directional
// and named `xToY`; there is no implicit unit type — callers track units by convention
// (see AircraftProfile / CruiseTable etc. in later phases for typed wrappers).

const NM_PER_SM = 0.868976;
const FT_PER_M = 3.280839895;
const KG_PER_LB = 0.45359237;

// Distance
export const nmToM = (nm: number): number => nm * 1852;
export const mToNm = (m: number): number => m / 1852;
export const nmToFt = (nm: number): number => nm * 6076.11549;
export const ftToNm = (ft: number): number => ft / 6076.11549;
export const nmToSm = (nm: number): number => nm / NM_PER_SM;
export const smToNm = (sm: number): number => sm * NM_PER_SM;
export const ftToM = (ft: number): number => ft / FT_PER_M;
export const mToFt = (m: number): number => m * FT_PER_M;

// Speed
export const ktToMps = (kt: number): number => nmToM(kt) / 3600;
export const mpsToKt = (mps: number): number => mToNm(mps * 3600);
export const ktToFpm = (kt: number): number => kt * 101.269; // knots -> feet/min (for glide-ratio style math)

// Temperature
export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;
export const cToK = (c: number): number => c + 273.15;
export const kToC = (k: number): number => k - 273.15;

// Pressure
export const inHgToHpa = (inHg: number): number => inHg * 33.8639;
export const hpaToInHg = (hpa: number): number => hpa / 33.8639;
export const mbToInHg = hpaToInHg; // mb === hPa
export const inHgToMb = inHgToHpa;

// Mass / volume
export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const literToGal = (l: number): number => l / 3.785411784;
export const galToLiter = (gal: number): number => gal * 3.785411784;

/** Avgas (100LL) weight in lb for a given volume in US gallons, at the standard 6.0 lb/gal. */
export const avgasGalToLb = (gal: number, lbPerGal = 6.0): number => gal * lbPerGal;
export const avgasLbToGal = (lb: number, lbPerGal = 6.0): number => lb / lbPerGal;

/** Angle helpers used throughout geo/nav math. */
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Normalize a bearing/heading into [0, 360). */
export const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360;
