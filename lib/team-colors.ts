const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

/** Normalize user-entered team colors to a value safe to persist and render. */
export function normalizeTeamColor(input: unknown): string | null {
  const value = String(input ?? "").trim();
  if (HEX_COLOR.test(value)) {
    const hex = value.toLowerCase();
    return hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  }
  const match = RGB_COLOR.exec(value);
  if (!match) return null;
  const channels = match.slice(1).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `rgb(${channels.join(", ")})`;
}

/** Convert a valid color to the value accepted by the native color picker. */
export function teamColorPickerValue(input: unknown): string {
  const normalized = normalizeTeamColor(input) || "#7c6ce7";
  if (normalized.startsWith("#")) return normalized;
  const match = RGB_COLOR.exec(normalized);
  if (!match) return "#7c6ce7";
  return `#${match
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}
