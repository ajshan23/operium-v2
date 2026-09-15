export const THEME_STORAGE_KEY = "operium-theme";

export function isThemePreference(value) {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference, systemPrefersDark) {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}
