import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredDockerfile = [
  /COPY packages\/core\/src packages\/core\/src/,
  /COPY LICENSE LICENSE/,
  /COPY packages\/proxy\/src packages\/proxy\/src/,
  /COPY packages\/plugins packages\/plugins/,
  /COPY --from=dashboard-build .*packages\/dashboard\/dist packages\/dashboard\/dist/,
  /HEALTHCHECK .*__molenkopf\/health/,
  /CMD \["node".*"proxy".*"--host","0\.0\.0\.0".*"--allow-public-bind".*"--port","8787".*"--data-dir","\/data"\]/
];

const requiredRelease = [
  /npm run e2e/,
  /npm run prepack/,
  /scripts\/release-pack\.js/,
  /actions\/upload-artifact@v4/,
  /actions\/download-artifact@v4/,
  /sha256sum -c molenkopf\.tgz\.sha256/,
  /publish_npm/,
  /github\.event\.inputs\.publish_npm == 'true'/,
  /npm publish "\$tarball"/,
  /molenkopf" --help/,
  /molenkopf" self-test/,
  /npm run smoke:docker/,
  /MOLENKOPF_DOCKER_IMAGE:\s*molenkopf:ci/,
  /docker save molenkopf:ci \| gzip/,
  /molenkopf-docker-image/,
  /gunzip -c molenkopf-image\.tar\.gz \| docker load/,
  /type=ref,event=tag/,
  /type=semver,pattern=\{\{version\}\}/,
  /type=raw,value=latest,enable=\$\{\{ startsWith\(github\.ref, 'refs\/tags\/v'\) \}\}/,
  /docker push "\$tag"/,
  /startsWith\(github\.ref, 'refs\/tags\/'\)[\s\S]*github\.event_name == 'push'/,
  /github\.event_name == 'workflow_dispatch'[\s\S]*github\.event\.inputs\.dry_run == 'false'/,
  /actions\/checkout@v4[\s\S]*docker\/login-action@v3/,
  /GITHUB_REF_NAME.*expected/
];

const requiredPreview = [
  /name: preview/,
  /branches:\s*\[preview\]/,
  /packages: write/,
  /npm run smoke:docker/,
  /MOLENKOPF_DOCKER_IMAGE:\s*molenkopf:preview/,
  /docker\/login-action@v3/,
  /ghcr\.io\/\$\{\{ github\.repository \}\}/,
  /docker tag molenkopf:preview "\$image:preview"/,
  /docker tag molenkopf:preview "\$image:preview-\$short_sha"/,
  /docker push "\$image:preview"/,
  /docker push "\$image:preview-\$short_sha"/
];

const requiredTest = [
  /name: E2E[\s\S]*npm run e2e/,
  /name: Docker smoke[\s\S]*npm run smoke:docker/,
  /push:[\s\S]*branches:\s*\[main, preview\]/,
  /pull_request:[\s\S]*branches:\s*\[main, preview\]/
];

const requiredDockerSmoke = [
  /run\(\["build", "--pull"/,
  /--env-file/,
  /MOLENKOPF_SESSION_SECRET=test-8f6e1a9d0c2b4f739ab15c6d8e029471/,
  /assertFailsWithoutSecret/,
  /__molenkopf\/health/,
  /__molenkopf\/dashboard/,
  /__molenkopf\/setup-admin/,
  /__molenkopf\/plugins/,
  /volume/
];

export function containerContractFailures(rootDir = root) {
  const dockerfile = read(rootDir, "Dockerfile");
  const dockerignore = read(rootDir, ".dockerignore");
  const release = read(rootDir, ".github/workflows/release.yml");
  const preview = read(rootDir, ".github/workflows/preview.yml");
  const testWorkflow = read(rootDir, ".github/workflows/test.yml");
  const pkg = read(rootDir, "package.json");
  const dockerSmoke = read(rootDir, "scripts/smoke-docker.js");
  const failures = [
    ...missing("package.json", pkg, [/smoke:docker/, /check:source-completeness/, /release:verify[\s\S]*smoke:docker/]),
    ...missing("smoke-docker.js", dockerSmoke, requiredDockerSmoke),
    ...missing("Dockerfile", dockerfile, requiredDockerfile),
    ...missing(".dockerignore", dockerignore, [/!LICENSE/, /!packages\/dashboard\/public\//]),
    ...missing("release.yml", release, requiredRelease),
    ...missing("preview.yml", preview, requiredPreview),
    ...missing("test.yml", testWorkflow, requiredTest)
  ];
  if (testWorkflow && /name: E2E[\s\S]{0,300}CYPRESS_INSTALL_BINARY:\s*["']0["']/.test(testWorkflow)) {
    failures.push("test.yml: E2E job must install the Cypress binary");
  }
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = containerContractFailures();

  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log("container contract ok");
}

function read(rootDir, path) {
  try {
    return readFileSync(resolve(rootDir, path), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function missing(label, text, patterns) {
  if (text === undefined) return [`${label}: missing required file`];
  return patterns.flatMap((pattern, index) => pattern.test(text) ? [] : [`${label}: missing required pattern ${index + 1}`]);
}
