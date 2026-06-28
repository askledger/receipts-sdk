// Bootstrap: compile and run the TS verifier without needing ts-node installed.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TS = path.join(__dirname, "verify-hardening.ts");
const OUT = path.join(__dirname, ".verify-hardening.cjs");

// Strip TS-only syntax (just enough — this file is intentionally
// JS-compatible in its imports and uses minimal types). For a real
// production verifier we'd run tsc + node, but this gets the job done.
execSync(`npx tsc --target es2022 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --outFile ${OUT} ${TS}`, { stdio: "inherit" });
require(OUT);
