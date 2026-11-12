#!/usr/bin/env node
/* tools/make-themes.mjs — writes the twelve themes of server/themes.mjs into public/css/lm.css, between "themes: begin" and
   "themes: end". The policy allows no style attribute, so a theme is a class the stylesheet already knows. tests/unit-test.mjs fails
   when the stylesheet and the module disagree.     node tools/make-themes.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { themeCss } from "../server/themes.mjs";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "css", "lm.css");
const css = fs.readFileSync(file, "utf8");
const re = /(\/\* themes: begin \*\/\n)[\s\S]*?(\/\* themes: end \*\/)/;
if (!re.test(css)) { console.error("lm.css has no themes: begin / themes: end markers"); process.exit(1); }
fs.writeFileSync(file, css.replace(re, `$1${themeCss()}\n$2`));
console.log("wrote 12 themes into public/css/lm.css");
