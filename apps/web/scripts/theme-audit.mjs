import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const themePath = path.join(srcRoot, "app", "theme.css");
const globalsPath = path.join(srcRoot, "app", "globals.css");
const failures = [];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

function allowsArtworkOrDataColor(relativePath, line) {
  if ([
    "components/Logo.tsx",
    "components/V2ShaderBackground.tsx",
    "components/CanvasEditor.tsx",
  ].includes(relativePath)) return true;
  if (/app\/\(auth\)\/(?:login|signup)\/page\.tsx$/.test(relativePath)) {
    return line.includes("<path fill=");
  }
  if (relativePath.endsWith("tasks/AzureBoardsTab.tsx")) {
    return /TYPE_FALLBACK_COLORS|CATEGORY_COLORS|STATE_COLORS|^\s*"?[\w ]+"?:\s*"#|return CATEGORY_COLORS/.test(line);
  }
  if (relativePath.endsWith("settings/page.tsx")) {
    return line.includes("defaultStroke") || line.includes('["#');
  }
  return false;
}

for (const file of sourceFiles(srcRoot)) {
  const relativePath = path.relative(srcRoot, file).split(path.sep).join("/");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/text-\[(?:9|10|11)px\]/.test(line)) {
      failures.push(`${relativePath}:${index + 1} uses text smaller than 12px`);
    }
    if (/#[\da-fA-F]{3,8}\b/.test(line) && !allowsArtworkOrDataColor(relativePath, line)) {
      failures.push(`${relativePath}:${index + 1} contains a non-semantic color`);
    }
  });
}

const globals = fs.readFileSync(globalsPath, "utf8");
for (const legacy of ["--s0", "--s1", "--s2", "--s3", "TAILWIND ARBITRARY VALUE OVERRIDES"]) {
  if (globals.includes(legacy)) failures.push(`globals.css still contains legacy theme marker ${legacy}`);
}

const themeCss = fs.readFileSync(themePath, "utf8");
const darkBlock = themeCss.match(/:root,[\s\S]*?html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const lightBlock = themeCss.match(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

function rgbTokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+-rgb):\s*(\d+)\s+(\d+)\s+(\d+);/g)]
    .map((match) => [match[1], match.slice(2).map(Number)]));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const darkTokens = rgbTokens(darkBlock);
const themes = {
  dark: darkTokens,
  light: { ...darkTokens, ...rgbTokens(lightBlock) },
};

const textTokens = [
  "text-primary-rgb",
  "text-secondary-rgb",
  "text-muted-rgb",
  "accent-text-rgb",
  "success-rgb",
  "error-rgb",
  "warning-rgb",
  "info-rgb",
];

for (const [theme, tokens] of Object.entries(themes)) {
  for (const text of textTokens) {
    for (const surface of ["surface-page-rgb", "surface-panel-rgb"]) {
      const ratio = contrast(tokens[text], tokens[surface]);
      if (ratio < 4.5) failures.push(`${theme} ${text} on ${surface} is ${ratio.toFixed(2)}:1; expected 4.5:1`);
    }
  }
  const buttonRatio = contrast(tokens["text-inverse-rgb"], tokens["accent-solid-rgb"]);
  if (buttonRatio < 4.5) failures.push(`${theme} accent button is ${buttonRatio.toFixed(2)}:1; expected 4.5:1`);
  const controlRatio = contrast(tokens["border-control-rgb"], tokens["surface-panel-rgb"]);
  if (controlRatio < 3) failures.push(`${theme} control boundary is ${controlRatio.toFixed(2)}:1; expected 3:1`);
}

if (failures.length) {
  console.error(`Theme audit failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Theme audit passed: semantic colors, readable text sizes, and contrast targets are satisfied.");
}
