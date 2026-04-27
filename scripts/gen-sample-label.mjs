/**
 * Generates a sample GD pallet label PDF for preview.
 * Run: node scripts/gen-sample-label.mjs
 */
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { register } from "tsx/esm";

// Use tsx to handle TypeScript imports
const __dirname = dirname(fileURLToPath(import.meta.url));
