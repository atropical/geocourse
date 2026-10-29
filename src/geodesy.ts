// SPDX-License-Identifier: Apache-2.0

/** WGS 84 ellipsoid. */
export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
const B = WGS84_A * (1 - WGS84_F);
const E2 = WGS84_F * (2 - WGS84_F);

const RAD = Math.PI / 180;

/**
 * Geodesic distance in metres between two lon/lat points on the WGS 84
 * ellipsoid (Vincenty's inverse formula). Vincenty can fail to converge for
 * nearly antipodal points; it then falls back to a spherical great-circle
 * distance on a sphere of the ellipsoid's mean radius, which is within 0.5 %
 * of the true value there.
 */
export function geodesicDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  if (lon1 === lon2 && lat1 === lat2) return 0;
  const L = (lon2 - lon1) * RAD;
  const U1 = Math.atan((1 - WGS84_F) * Math.tan(lat1 * RAD));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(lat2 * RAD));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L;
  for (let iter = 0; iter < 200; iter++) {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    const sinSigma = Math.hypot(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL);
    if (sinSigma === 0) return 0;
    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    const cos2Alpha = 1 - sinAlpha * sinAlpha;
    const cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha;
    const C = (WGS84_F / 16) * cos2Alpha * (4 + WGS84_F * (4 - 3 * cos2Alpha));
    const prev = lambda;
    lambda = L + (1 - C) * WGS84_F * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - prev) < 1e-12) {
      const u2 = (cos2Alpha * (WGS84_A * WGS84_A - B * B)) / (B * B);
      const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const Bc = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const dSigma = Bc * sinSigma * (cos2SigmaM + (Bc / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (Bc / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
      return B * A * (sigma - dSigma);
    }
  }
  return greatCircle(lon1, lat1, lon2, lat2);
}

function greatCircle(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = (2 * WGS84_A + B) / 3;
  const p1 = lat1 * RAD, p2 = lat2 * RAD;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * East and north offset in metres from point 1 to point 2, using the
 * ellipsoid's radii of curvature at the mean latitude. Accurate for the short
 * (about 1 m) steps used to measure headings.
 */
export function localOffset(lon1: number, lat1: number, lon2: number, lat2: number): [number, number] {
  const phi = ((lat1 + lat2) / 2) * RAD;
  const s = Math.sin(phi);
  const w = Math.sqrt(1 - E2 * s * s);
  const N = WGS84_A / w;
  const M = (WGS84_A * (1 - E2)) / (w * w * w);
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  return [dLon * RAD * N * Math.cos(phi), (lat2 - lat1) * RAD * M];
}
