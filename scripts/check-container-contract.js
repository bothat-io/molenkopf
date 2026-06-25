import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const release = read(".github/workflows/release.yml");
const testWorkflow = read(".github/workflows/test.yml");

const requiredDockerfile = [
  /COPY packages\/core\/src packages\/core\/src/,
  /COPY LICENSE LICENSE/,
  /COPY packages\/proxy\/src packages\/proxy\/src/,
  /COPY packages\/plugins packages\/plugins/,
  /COPY --from=dashboard-build .*packages\/dashboard\/dist packages\/dashboard\/dist/,
  /HEALTHCHECK .*__molenkopf\/health/,
  /CMD \["node".*"proxy".*"--host","127\.0\.0\.1".*"--port","8787".*"--data-dir","\/data"\]/
];

const requiredRelease = [
  /npm run e2e/,
  /npm run prepack/,
  /scripts\/release-pack\.js/,
  /actions\/upload-artifact@v4/,
  /actions\/download-artifact@v4/,
  /sha256sum -c molenkopf\.tgz\.sha256/,
  /npm publish "\$tarball"/,
  /molenkopf" --help/,
  /molenkopf" self-test/,
  /docker build --pull -t molenkopf:ci \./,
  /docker run -d --name molenkopf-ci molenkopf:ci/,
  /__molenkopf\/health/,
  /__molenkopf\/setup-admin/,
  /github\.event\.inputs\.dry_run != 'true'/,
  /GITHUB_REF_NAME.*expected/
];

const requiredTest = [
  /name: E2E[\s\S]*npm run e2e/
];

const failures = [
  ...missing("Dockerfile", dockerfile, requiredDockerfile),
  ...missing(".dockerignore", dockerignore, [/!LICENSE/, /!packages\/dashboard\/public\//]),
  ...missing("release.yml", release, requiredRelease),
  ...missing("test.yml", testWorkflow, requiredTest)
];

if (/name: E2E[\s\S]{0,300}CYPRESS_INSTALL_BINARY:\s*["']0["']/.test(testWorkflow)) {
  failures.push("test.yml: E2E job must install the Cypress binary");
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("container contract ok");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function missing(label, text, patterns) {
  return patterns.flatMap((pattern, index) => pattern.test(text) ? [] : [`${label}: missing required pattern ${index + 1}`]);
}
