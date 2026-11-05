// Model trzyma wymiary w mm, scena Three.js pracuje w metrach.
export const MM = 0.001;

// Konwersja współrzędnych przestrzeni (mm, z od tylnej ściany) na scenę (m).
// W scenie: tylna ściana leży na z = -depth, front przestrzeni na z = 0.
export function toScene(x, y, z, space) {
  return [x * MM, y * MM, (z - space.depth) * MM];
}
