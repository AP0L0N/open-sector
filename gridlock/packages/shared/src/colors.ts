/** Original 8-color commander palette. Not taken from any commercial RTS. */
export const COLORS: readonly { id: number; name: string; hex: string }[] = [
  { id: 0, name: "Crimson", hex: "#c0392b" },
  { id: 1, name: "Amber", hex: "#e8b84a" },
  { id: 2, name: "Cobalt", hex: "#2e86de" },
  { id: 3, name: "Viridian", hex: "#27ae60" },
  { id: 4, name: "Ember", hex: "#e67e22" },
  { id: 5, name: "Iris", hex: "#8e44ad" },
  { id: 6, name: "Teal", hex: "#1abc9c" },
  { id: 7, name: "Bone", hex: "#ecf0f1" },
] as const;

export function colorHex(colorId: number): string {
  return COLORS[colorId]?.hex ?? "#888888";
}

export function colorName(colorId: number): string {
  return COLORS[colorId]?.name ?? "Unknown";
}
