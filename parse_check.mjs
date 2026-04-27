import { parse } from "@babel/parser";
import { readFileSync } from "fs";

const code = readFileSync("client/src/pages/QcScanner.tsx", "utf8");
try {
  parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  console.log("No parse errors");
} catch (e) {
  console.log("Error at line", e.loc?.line, "col", e.loc?.column, ":", e.message);
}
