// Embedded geography: simplified outlines and capital coordinates (lon, lat).
// Everything is hand-simplified and meant for a stylised map, not for navigation.

export interface City {
  name: string;
  lon: number;
  lat: number;
  major?: boolean;
}

type Ring = [number, number][];

/** Peninsula, clockwise from Galicia's north tip. */
const PENINSULA: Ring = [
  [-7.87, 43.77], [-7.04, 43.55], [-6.54, 43.55], [-5.85, 43.66], [-5.06, 43.46],
  [-4.75, 43.42], [-3.8, 43.48], [-3.45, 43.45], [-2.93, 43.4], [-2.4, 43.38],
  [-1.98, 43.34], [-1.78, 43.37], [-1.45, 43.05], [-1.0, 42.97], [-0.3, 42.85],
  [0.35, 42.72], [0.7, 42.85], [1.0, 42.8], [1.44, 42.6], [1.73, 42.5],
  [2.0, 42.35], [2.5, 42.33], [3.17, 42.43], [3.32, 42.32], [3.18, 42.12],
  [3.2, 41.9], [3.0, 41.72], [2.8, 41.62], [2.45, 41.5], [2.18, 41.32],
  [1.9, 41.2], [1.25, 41.07], [0.87, 40.72], [0.55, 40.5], [0.4, 40.33],
  [0.05, 39.95], [-0.2, 39.62], [-0.3, 39.4], [-0.25, 39.15], [0.12, 38.84],
  [0.23, 38.73], [0.05, 38.62], [-0.2, 38.5], [-0.48, 38.3], [-0.55, 38.15],
  [-0.68, 37.95], [-0.72, 37.62], [-1.0, 37.57], [-1.58, 37.38], [-2.1, 36.9],
  [-2.2, 36.7], [-2.46, 36.78], [-3.02, 36.72], [-3.52, 36.7], [-3.87, 36.73],
  [-4.42, 36.66], [-4.88, 36.47], [-5.15, 36.4], [-5.35, 36.12], [-5.6, 36.0],
  [-5.92, 36.15], [-6.25, 36.47], [-6.35, 36.78], [-6.9, 37.15], [-7.4, 37.17],
  [-7.43, 37.7], [-7.25, 38.15], [-7.1, 38.55], [-7.0, 38.9], [-7.25, 39.4],
  [-7.5, 39.65], [-7.1, 39.85], [-6.85, 40.3], [-6.9, 40.6], [-6.95, 41.0],
  [-6.45, 41.35], [-6.2, 41.6], [-6.55, 41.95], [-7.2, 41.88], [-8.0, 41.85],
  [-8.2, 42.0], [-8.87, 41.87], [-8.85, 42.3], [-8.95, 42.6], [-9.27, 42.9],
  [-9.1, 43.2], [-8.6, 43.35], [-8.3, 43.55],
];

const MALLORCA: Ring = [
  [2.35, 39.57], [2.5, 39.72], [2.78, 39.85], [3.05, 39.93], [3.21, 39.96],
  [3.25, 39.82], [3.45, 39.72], [3.35, 39.55], [3.2, 39.35], [3.05, 39.27],
  [2.78, 39.37], [2.62, 39.47], [2.45, 39.5],
];
const MENORCA: Ring = [
  [3.82, 39.93], [4.0, 40.05], [4.3, 40.0], [4.32, 39.93], [4.1, 39.85], [3.9, 39.83],
];
const IBIZA: Ring = [
  [1.2, 38.9], [1.4, 39.08], [1.6, 39.1], [1.58, 38.95], [1.4, 38.85],
];

export const SPAIN_OUTLINE: Ring[] = [PENINSULA, MALLORCA, MENORCA, IBIZA];

export const SPAIN_CITIES: City[] = [
  { name: 'A Coruña', lon: -8.41, lat: 43.37 },
  { name: 'Lugo', lon: -7.56, lat: 43.01 },
  { name: 'Ourense', lon: -7.86, lat: 42.34 },
  { name: 'Pontevedra', lon: -8.64, lat: 42.43 },
  { name: 'Oviedo', lon: -5.85, lat: 43.36 },
  { name: 'Santander', lon: -3.8, lat: 43.46 },
  { name: 'Bilbao', lon: -2.93, lat: 43.26, major: true },
  { name: 'Vitoria-Gasteiz', lon: -2.67, lat: 42.85 },
  { name: 'San Sebastián', lon: -1.98, lat: 43.32 },
  { name: 'Pamplona', lon: -1.64, lat: 42.82 },
  { name: 'Logroño', lon: -2.45, lat: 42.47 },
  { name: 'Burgos', lon: -3.7, lat: 42.34 },
  { name: 'León', lon: -5.57, lat: 42.6 },
  { name: 'Palencia', lon: -4.53, lat: 42.01 },
  { name: 'Valladolid', lon: -4.72, lat: 41.65, major: true },
  { name: 'Zamora', lon: -5.75, lat: 41.5 },
  { name: 'Salamanca', lon: -5.66, lat: 40.97 },
  { name: 'Ávila', lon: -4.7, lat: 40.66 },
  { name: 'Segovia', lon: -4.12, lat: 40.95 },
  { name: 'Soria', lon: -2.47, lat: 41.76 },
  { name: 'Madrid', lon: -3.7, lat: 40.42, major: true },
  { name: 'Guadalajara', lon: -3.17, lat: 40.63 },
  { name: 'Toledo', lon: -4.02, lat: 39.86 },
  { name: 'Cuenca', lon: -2.13, lat: 40.07 },
  { name: 'Ciudad Real', lon: -3.93, lat: 38.99 },
  { name: 'Albacete', lon: -1.86, lat: 38.99 },
  { name: 'Cáceres', lon: -6.37, lat: 39.47 },
  { name: 'Badajoz', lon: -6.97, lat: 38.88 },
  { name: 'Huesca', lon: -0.41, lat: 42.14 },
  { name: 'Zaragoza', lon: -0.88, lat: 41.65, major: true },
  { name: 'Teruel', lon: -1.11, lat: 40.34 },
  { name: 'Lleida', lon: 0.62, lat: 41.62 },
  { name: 'Girona', lon: 2.82, lat: 41.98 },
  { name: 'Barcelona', lon: 2.17, lat: 41.39, major: true },
  { name: 'Tarragona', lon: 1.25, lat: 41.12 },
  { name: 'Castellón', lon: -0.04, lat: 39.99 },
  { name: 'Valencia', lon: -0.38, lat: 39.47, major: true },
  { name: 'Alicante', lon: -0.48, lat: 38.35 },
  { name: 'Murcia', lon: -1.13, lat: 37.98 },
  { name: 'Almería', lon: -2.46, lat: 36.84 },
  { name: 'Granada', lon: -3.6, lat: 37.18 },
  { name: 'Jaén', lon: -3.79, lat: 37.77 },
  { name: 'Córdoba', lon: -4.78, lat: 37.89 },
  { name: 'Sevilla', lon: -5.98, lat: 37.39, major: true },
  { name: 'Huelva', lon: -6.95, lat: 37.26 },
  { name: 'Cádiz', lon: -6.3, lat: 36.55 },
  { name: 'Málaga', lon: -4.42, lat: 36.75, major: true },
  { name: 'Palma', lon: 2.65, lat: 39.57, major: true },
];

export const EUROPE_CITIES: City[] = [
  { name: 'Lisboa', lon: -9.14, lat: 38.72 },
  { name: 'Madrid', lon: -3.7, lat: 40.42, major: true },
  { name: 'París', lon: 2.35, lat: 48.86, major: true },
  { name: 'Londres', lon: -0.13, lat: 51.51, major: true },
  { name: 'Dublín', lon: -6.26, lat: 53.35 },
  { name: 'Bruselas', lon: 4.35, lat: 50.85 },
  { name: 'Ámsterdam', lon: 4.9, lat: 52.37 },
  { name: 'Berlín', lon: 13.4, lat: 52.52, major: true },
  { name: 'Berna', lon: 7.45, lat: 46.95 },
  { name: 'Roma', lon: 12.5, lat: 41.9, major: true },
  { name: 'Viena', lon: 16.37, lat: 48.21 },
  { name: 'Praga', lon: 14.42, lat: 50.08 },
  { name: 'Varsovia', lon: 21.01, lat: 52.23 },
  { name: 'Copenhague', lon: 12.57, lat: 55.68 },
  { name: 'Estocolmo', lon: 18.07, lat: 59.33 },
  { name: 'Oslo', lon: 10.75, lat: 59.91 },
  { name: 'Helsinki', lon: 24.94, lat: 60.17 },
  { name: 'Atenas', lon: 23.73, lat: 37.98, major: true },
  { name: 'Budapest', lon: 19.04, lat: 47.5 },
  { name: 'Bucarest', lon: 26.1, lat: 44.43 },
  { name: 'Sofía', lon: 23.32, lat: 42.7 },
  { name: 'Belgrado', lon: 20.46, lat: 44.8 },
  { name: 'Zagreb', lon: 15.98, lat: 45.81 },
  { name: 'Sarajevo', lon: 18.41, lat: 43.86 },
  { name: 'Bratislava', lon: 17.11, lat: 48.15 },
  { name: 'Liubliana', lon: 14.51, lat: 46.06 },
  { name: 'Tallin', lon: 24.75, lat: 59.44 },
  { name: 'Riga', lon: 24.1, lat: 56.95 },
  { name: 'Vilna', lon: 25.28, lat: 54.69 },
  { name: 'Minsk', lon: 27.57, lat: 53.9 },
  { name: 'Kiev', lon: 30.52, lat: 50.45, major: true },
  { name: 'Chisináu', lon: 28.86, lat: 47.01 },
  { name: 'Tirana', lon: 19.82, lat: 41.33 },
  { name: 'Skopie', lon: 21.43, lat: 42.0 },
  { name: 'Luxemburgo', lon: 6.13, lat: 49.61 },
  { name: 'Podgorica', lon: 19.26, lat: 42.44 },
];

export interface Vec2 {
  x: number;
  y: number;
}

export interface SceneNode extends Vec2 {
  name?: string;
  major?: boolean;
}

export interface Scene {
  id: string;
  /** World size (width, height). World origin is bottom-left, y up. */
  w: number;
  h: number;
  nodes: SceneNode[];
  /** Land polygons in world coordinates; null means open space. */
  land: Vec2[][] | null;
}

function project(c: { lon: number; lat: number }, lat0: number): Vec2 {
  return { x: c.lon * Math.cos((lat0 * Math.PI) / 180), y: c.lat };
}

function build(
  id: string,
  cities: City[],
  outline: Ring[] | null,
  lat0: number,
  pad: number,
): Scene {
  const pts: Vec2[] = cities.map((c) => project(c, lat0));
  const rings = outline ? outline.map((r) => r.map(([lon, lat]) => project({ lon, lat }, lat0))) : null;
  const all = rings ? pts.concat(...rings) : pts;
  const minX = Math.min(...all.map((p) => p.x)) - pad;
  const maxX = Math.max(...all.map((p) => p.x)) + pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad;
  const maxY = Math.max(...all.map((p) => p.y)) + pad;
  const tr = (p: Vec2): Vec2 => ({ x: p.x - minX, y: p.y - minY });
  return {
    id,
    w: maxX - minX,
    h: maxY - minY,
    nodes: cities.map((c, i) => ({ ...tr(pts[i]), name: c.name, major: c.major })),
    land: rings ? rings.map((r) => r.map(tr)) : null,
  };
}

export function spainScene(): Scene {
  return build('spain', SPAIN_CITIES, SPAIN_OUTLINE, 40, 0.25);
}

export function europeScene(): Scene {
  return build('europe', EUROPE_CITIES, null, 52, 1.2);
}

export function randomScene(aspect: number): Scene {
  const h = 10;
  const w = h * Math.max(0.6, Math.min(2.2, aspect));
  const count = 14 + Math.floor(Math.random() * 14);
  const nodes: SceneNode[] = [];
  const minDist = Math.sqrt((w * h) / count) * 0.62;
  let guard = 0;
  while (nodes.length < count && guard++ < 4000) {
    const x = 0.5 + Math.random() * (w - 1);
    const y = 0.5 + Math.random() * (h - 1);
    if (nodes.every((n) => Math.hypot(n.x - x, n.y - y) > minDist)) nodes.push({ x, y });
  }
  return { id: 'random', w, h, nodes, land: null };
}
