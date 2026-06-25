import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("dashboard is a Vite React app with no external page resources", () => {
  const html = readFileSync("packages/dashboard/index.html", "utf8");
  const css = readFileSync("packages/dashboard/src/app/styles.css", "utf8");
  const pkg = JSON.parse(readFileSync("packages/dashboard/package.json", "utf8"));

  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /type="module" src="\/src\/main\.tsx"/);
  assert.doesNotMatch(html + css, /fonts\.googleapis|fonts\.gstatic|@import\s+url\(["']?https?:/);
  assert.equal(pkg.scripts.build, "vite build");
  assert.equal(pkg.scripts.test, "vitest run");
  assert.ok(pkg.dependencies.react);
  assert.ok(pkg.dependencies["react-dom"]);
});

test("dashboard styling keeps compact chrome and responsive provider rows", () => {
  const css = readFileSync("packages/dashboard/src/app/styles.css", "utf8");
  const tableCss = readFileSync("packages/dashboard/src/components/data/DataTable.css", "utf8");
  const formCss = readFileSync("packages/dashboard/src/components/forms/FormControls.css", "utf8");
  assert.match(css, /\.topbar/);
  assert.match(css, /\.brand-title/);
  assert.match(tableCss, /\.provider-table/);
  assert.match(formCss, /\.radio-choice/);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(tableCss, /overflow-x:auto/);
});
