#!/usr/bin/env node
// `yarn check:deploy`: the env schemas, the example and test env files, the
// Dockerfiles' build args, the compose files and the deploy env files agree.
// Every variable the code reads is declared once per file it belongs in, and
// nothing is declared that nothing reads. Also: the three Dockerfiles' shared
// install stages are identical (one dependency install for every image). Run
// in CI; prints each mismatch and exits 1 when there is one.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const problems = [];

/** Keys of the `<opener> … \n});` object literal in a zod schema file. */
const schemaKeys = (file, opener) => {
	const text = read(file);
	const start = text.indexOf(opener);
	if (start === -1) throw new Error(`${file}: "${opener}" not found`);
	const body = text.slice(start, text.indexOf("\n});", start));
	return new Set([...body.matchAll(/^\t([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
};
/** Keys assigned in a dotenv-style file (comments skipped). */
const envFileKeys = (file) =>
	new Set([...read(file).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
/** Non-test .ts/.tsx files under a directory. */
const sourceFiles = (dir) =>
	readdirSync(join(root, dir), { recursive: true })
		.filter((f) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f))
		.map((f) => join(dir, f));
const minus = (a, b) => [...a].filter((k) => !b.has(k));

/** Both directions, with the keys allowed on one side only and why. */
const sameKeys = (label, left, leftKeys, right, rightKeys, onlyLeft = {}, onlyRight = {}) => {
	for (const k of minus(leftKeys, rightKeys))
		if (!(k in onlyLeft)) problems.push(`${label}: ${k} is in ${left} but not in ${right}`);
	for (const k of minus(rightKeys, leftKeys))
		if (!(k in onlyRight)) problems.push(`${label}: ${k} is in ${right} but not in ${left}`);
};
const subset = (label, keys, file, fileKeys, except = {}) => {
	for (const k of keys)
		if (!fileKeys.has(k) && !(k in except)) problems.push(`${label}: ${k} is missing from ${file}`);
};

// ── Backend ──────────────────────────────────────────────────────────────
const BACKEND_SCHEMA = "apps/backend/src/configs/env.config.ts";
const backend = schemaKeys(BACKEND_SCHEMA, "const envSchema = z.object({");
sameKeys(
	"backend",
	"the schema",
	backend,
	"apps/backend/.env.example",
	envFileKeys("apps/backend/.env.example"),
	{ IS_E2E_TEST: "set by the package scripts" },
);
for (const k of minus(envFileKeys("apps/backend/.env.test"), backend))
	problems.push(`backend: ${k} is in apps/backend/.env.test but the schema has no such key`);

// A variable read straight from process.env (test files aside) is still a
// schema key, so it is documented with the rest.
for (const file of sourceFiles("apps/backend/src"))
	for (const m of read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g))
		if (!backend.has(m[1])) problems.push(`backend: ${file} reads ${m[1]}, which the schema lacks`);

function superadminKeys() {
	return schemaKeys("apps/superadmin/src/configs/env.config.ts", "z.object({");
}

// ── Frontend ─────────────────────────────────────────────────────────────
const frontend = schemaKeys("apps/frontend/src/utils/env_validator.zod.utils.ts", "object({");
const frontendExample = envFileKeys("apps/frontend/.env.example");
sameKeys("frontend", "the schema", frontend, "apps/frontend/.env.example", frontendExample, {
	VITE_USER_NODE_ENV: "Vite derives it from NODE_ENV",
}, {
	NODE_ENV: "becomes VITE_USER_NODE_ENV",
	VITE_DEV_BACKEND_PROXY_TARGET: "read by vite.config.ts (dev proxy)",
	VITE_SENTRY_AUTH_TOKEN: "read by vite.config.ts (source-map upload)",
});
const VITE_BUILT_INS = new Set(["DEV", "PROD", "MODE", "BASE_URL", "SSR"]);
for (const [dir, keys] of [
	["apps/frontend/src", frontend],
	["apps/superadmin/src", superadminKeys()],
])
	for (const file of sourceFiles(dir))
		for (const m of read(file).matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g))
			if (!VITE_BUILT_INS.has(m[1]) && !keys.has(m[1]))
				problems.push(`${dir}: ${file} reads ${m[1]}, which the schema lacks`);
for (const k of minus(envFileKeys("apps/frontend/.env.test"), frontend))
	problems.push(`frontend: ${k} is in apps/frontend/.env.test but the schema has no such key`);

// ── Superadmin ───────────────────────────────────────────────────────────
const superadmin = superadminKeys();
sameKeys(
	"superadmin",
	"the schema",
	superadmin,
	"apps/superadmin/.env.example",
	envFileKeys("apps/superadmin/.env.example"),
	{},
	{ VITE_DEV_BACKEND_PROXY_TARGET: "read by vite.config.ts (dev proxy)" },
);

// ── Images: every build-time key is a build arg, and every build arg a key ─
const dockerArgs = (file) =>
	new Set([...read(file).matchAll(/^ARG (VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]));
const NOT_BUILD_ARGS = {
	VITE_TEST_PASSWORD: "tests only",
	VITE_SENTRY_RELEASE: "set inside the build from .build-sha",
};
sameKeys(
	"frontend image",
	"the schema",
	frontend,
	"apps/frontend/Dockerfile",
	dockerArgs("apps/frontend/Dockerfile"),
	NOT_BUILD_ARGS,
);
sameKeys(
	"superadmin image",
	"the schema",
	superadmin,
	"apps/superadmin/Dockerfile",
	dockerArgs("apps/superadmin/Dockerfile"),
	{},
	{ VITE_USER_NODE_ENV: "read by Vite itself (the build's NODE_ENV)" },
);

const compose = read("docker-compose.prod.yml");
const composeArgs = (service) => {
	const block = compose.slice(compose.indexOf(`\n  ${service}:\n`));
	const args = block.slice(block.indexOf("      args:\n"), block.indexOf("\n    restart:"));
	return new Set([...args.matchAll(/^ {8}(VITE_[A-Z0-9_]+):/gm)].map((m) => m[1]));
};
sameKeys(
	"frontend compose",
	"apps/frontend/Dockerfile",
	dockerArgs("apps/frontend/Dockerfile"),
	"docker-compose.prod.yml build args",
	composeArgs("frontend"),
);
sameKeys(
	"superadmin compose",
	"apps/superadmin/Dockerfile",
	dockerArgs("apps/superadmin/Dockerfile"),
	"docker-compose.prod.yml build args",
	composeArgs("superadmin"),
);
const APP_OWN_ORIGIN = { VITE_API_URL: "unset: the app calls its own origin" };
sameKeys(
	"frontend Application",
	"apps/frontend/Dockerfile",
	dockerArgs("apps/frontend/Dockerfile"),
	"deploy/dokploy/frontend.build-args",
	envFileKeys("deploy/dokploy/frontend.build-args"),
	APP_OWN_ORIGIN,
);
sameKeys(
	"superadmin Application",
	"apps/superadmin/Dockerfile",
	dockerArgs("apps/superadmin/Dockerfile"),
	"deploy/dokploy/superadmin.build-args",
	envFileKeys("deploy/dokploy/superadmin.build-args"),
	APP_OWN_ORIGIN,
);

// ── Deploy env files ─────────────────────────────────────────────────────
const prod = envFileKeys("deploy/prod.env.example");
sameKeys(
	"deploy",
	"deploy/prod.env.example",
	prod,
	"deploy/staging.env.example",
	envFileKeys("deploy/staging.env.example"),
);
const IMAGE_OR_DEV_ONLY = {
	IS_E2E_TEST: "tests only",
	LOG_PRETTY: "development only",
	PORT: "the image (3000)",
	HOST: "the image (0.0.0.0)",
	GRACEFUL_SHUTDOWN_TIMEOUT: "the image",
	AGENT_TASK_TIMEOUT: "the image",
	GOOGLE_APPLICATION_CREDENTIALS: "a file path; containers use FIREBASE_SERVICE_ACCOUNT_JSON",
};
subset("deploy", backend, "deploy/prod.env.example", prod, IMAGE_OR_DEV_ONLY);
subset(
	"deploy",
	backend,
	"deploy/dokploy/backend.env",
	envFileKeys("deploy/dokploy/backend.env"),
	IMAGE_OR_DEV_ONLY,
);
const DERIVED = {
	VITE_USER_NODE_ENV: "from NODE_ENV",
	VITE_USER_APP_URL: "from APP_HOST / WEBAPP_URL",
	VITE_TENANT_ROOT_DOMAIN: "from TENANT_ROOT_DOMAIN",
	...APP_OWN_ORIGIN,
};
subset("deploy", dockerArgs("apps/frontend/Dockerfile"), "deploy/prod.env.example", prod, DERIVED);
// Every deploy key has a reader: the backend, the compose file, or nginx.
const nginxRuntime = read("apps/frontend/docker-entrypoint.envsh");
for (const k of prod) {
	const word = new RegExp(`\\b${k}\\b`);
	if (backend.has(k) || word.test(compose) || word.test(nginxRuntime)) continue;
	if (k === "COMPOSE_PROFILES") continue; // read by Docker Compose itself
	problems.push(`deploy: ${k} in deploy/prod.env.example is read by nothing`);
}
// Application mode references only shared variables that exist.
for (const file of ["backend.env", "frontend.env", "frontend.build-args", "superadmin.build-args"]) {
	for (const m of read(`deploy/dokploy/${file}`).matchAll(/\$\{\{environment\.([A-Z0-9_]+)\}\}/g))
		if (!prod.has(m[1]))
			problems.push(`deploy/dokploy/${file}: ${m[1]} is not in deploy/prod.env.example`);
}

// ── The shared install stages ────────────────────────────────────────────
const sharedStages = (file) => {
	const text = read(file);
	const start = text.search(/^ARG NODE_VERSION/m);
	const endMark = "# ── End of the shared install.";
	const end = text.indexOf(endMark);
	return start === -1 || end === -1 ? null : text.slice(start, end + endMark.length);
};
const [firstImage, ...otherImages] = ["backend", "frontend", "superadmin"].map(
	(app) => `apps/${app}/Dockerfile`,
);
const shared = sharedStages(firstImage);
if (shared === null) problems.push(`${firstImage}: the shared install stages are not marked`);
for (const file of otherImages)
	if (sharedStages(file) !== shared)
		problems.push(`${file}: its shared install stages differ from ${firstImage}'s`);

if (problems.length > 0) {
	console.error(`check:deploy: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}`);
	process.exit(1);
}
console.log(
	"check:deploy: the env schemas, examples, images, compose and deploy files agree; the shared install stages match.",
);
