import assert from "node:assert/strict";
import test from "node:test";
import { isThemePreference, resolveTheme } from "./theme.mjs";

test("accepts every supported theme preference", () => {
  assert.equal(isThemePreference("system"), true);
  assert.equal(isThemePreference("light"), true);
  assert.equal(isThemePreference("dark"), true);
});

test("rejects missing and legacy-invalid preferences", () => {
  assert.equal(isThemePreference(null), false);
  assert.equal(isThemePreference(""), false);
  assert.equal(isThemePreference("dim"), false);
});

test("resolves explicit themes independently of the system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("resolves system preference in both directions", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});
