#!/usr/bin/env node
/**
 * Convert site/og-image.svg → site/og-image.png at 1200×630.
 *
 * Usage:
 *   npm install --no-save sharp
 *   node scripts/build-og-image.mjs
 *
 * Why a separate script? Sharp is a 30 MB native dependency that we don't
 * want in the SDK's runtime deps. We only need it once to regenerate the
 * social card after a design change.
 */

import { readFileSync, writeFileSync } from "node:fs";

const SRC = "site/og-image.svg";
const DST = "site/og-image.png";

try {
  const sharp = (await import("sharp")).default;
  const svg = readFileSync(SRC);
  await sharp(svg)
    .resize(1200, 630, { fit: "contain", background: "#060d22" })
    .png({ compressionLevel: 9 })
    .toFile(DST);
  console.log(`✓ ${DST} generated (1200×630)`);
} catch (err) {
  if (err.code === "ERR_MODULE_NOT_FOUND") {
    console.error("sharp not installed. Run: npm install --no-save sharp");
    process.exit(1);
  }
  throw err;
}
