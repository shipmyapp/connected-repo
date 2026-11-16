// What the backend sends to Sentry, checked against the built server.
//
// A local HTTP server stands in for Sentry: the DSN http://public@127.0.0.1:<port>/1
// makes the SDK post its envelopes there. The built backend (apps/backend/dist)
// starts against the test database and Redis with that DSN, real requests are
// made, and every envelope it sent is checked:
//
//   - a team-scoped procedure that reads and writes the database gives one trace:
//     the HTTP server span, the oRPC procedure span under it, Postgres spans under that;
//   - no cookie, Authorization, x-api-key, x-tbus-*, device header, body, query
//     string or bound SQL value sent with the requests appears in any envelope,
//     and no client IP;
//   - ULID path segments arrive as `:id`;
//   - `/health` and `/` are never traced; an idle server sends no span;
//   - a request carrying `sentry-trace` and `baggage` continues that trace;
//   - an outbound request carries W3C `traceparent` as well as `sentry-trace`;
//   - an error thrown in a procedure arrives as an error event of the request's trace;
//   - profiling starts without a warning when SENTRY_PROFILES_SAMPLE_RATE is set,
//     and stays off when it is not;
//   - without a DSN the server says `Sentry: off` and posts nothing.
//
// It fails when the server sends nothing at all. Needs `yarn build` (or the
// backend's build) and `yarn test:db:setup` first: yarn check:sentry
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "backend");
const APP_ORIGIN = "http://localhost:5174";

const failures = [];
const check = (ok, message) => {
	if (ok) console.log(`  ok   ${message}`);
	else {
		console.log(`  FAIL ${message}`);
		failures.push(message);
	}
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Markers: recognisable values that must never reach Sentry ─────────────
const tag = randomBytes(4).toString("hex");
const MARKERS = {
	cookie: `cookiemarker${tag}`,
	authorization: `authmarker${tag}`,
	apiKey: `apikeymarker${tag}`,
	tbus: `tbusmarker${tag}`,
	device: `devicemarker${tag}`,
	body: `bodymarker${tag}`,
	query: `querymarker${tag}`,
};

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ulid = () => {
	let time = Date.now();
	let out = "";
	for (let i = 0; i < 10; i++) {
		out = CROCKFORD[time % 32] + out;
		time = Math.floor(time / 32);
	}
	for (const byte of randomBytes(16)) out += CROCKFORD[byte % 32];
	return out;
};

// ── The stand-in for Sentry ──────────────────────────────────────────────
/** Parses one envelope: a header line, then item header + payload pairs. */
const parseEnvelope = (buffer) => {
	const items = [];
	let offset = buffer.indexOf(10);
	const header = JSON.parse(buffer.subarray(0, offset < 0 ? buffer.length : offset).toString());
	offset = offset < 0 ? buffer.length : offset + 1;
	while (offset < buffer.length) {
		let end = buffer.indexOf(10, offset);
		if (end < 0) end = buffer.length;
		const line = buffer.subarray(offset, end).toString().trim();
		offset = end + 1;
		if (!line) continue;
		const itemHeader = JSON.parse(line);
		let payload;
		if (typeof itemHeader.length === "number") {
			payload = buffer.subarray(offset, offset + itemHeader.length);
			offset += itemHeader.length + 1;
		} else {
			let payloadEnd = buffer.indexOf(10, offset);
			if (payloadEnd < 0) payloadEnd = buffer.length;
			payload = buffer.subarray(offset, payloadEnd);
			offset = payloadEnd + 1;
		}
		const text = payload.toString();
		let json;
		try {
			json = JSON.parse(text);
		} catch {
			json = undefined;
		}
		items.push({ type: itemHeader.type, header: itemHeader, text, json });
	}
	return { header, items };
};

const startCaptureServer = async () => {
	const envelopes = [];
	const outbound = [];
	const server = createServer((req, res) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			let body = Buffer.concat(chunks);
			if (req.headers["content-encoding"] === "gzip") body = gunzipSync(body);
			if (req.url?.includes("/envelope")) {
				const raw = body.toString();
				try {
					envelopes.push({ raw, ...parseEnvelope(body) });
				} catch (error) {
					envelopes.push({ raw, header: {}, items: [], error: String(error) });
				}
			} else {
				outbound.push({ url: req.url, headers: req.headers });
			}
			res.writeHead(200, { "content-type": "application/json" });
			res.end("{}");
		});
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	return { server, port, envelopes, outbound };
};

const freePort = async () => {
	const probe = createServer();
	await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
	const { port } = probe.address();
	await new Promise((resolve) => probe.close(resolve));
	return port;
};

// ── The built backend ────────────────────────────────────────────────────
const startBackend = async (extraEnv) => {
	const port = await freePort();
	const child = spawn(process.execPath, ["dist/server.js"], {
		cwd: backendDir,
		env: {
			...process.env,
			NODE_ENV: "test",
			IS_E2E_TEST: "true",
			PORT: String(port),
			HOST: "127.0.0.1",
			LOG_LEVEL: "warn",
			// The proxy's x-forwarded-for is trusted, so 203.0.113.77 is the client IP.
			TRUSTED_PROXY_COUNT: "1",
			SENTRY_DSN: "",
			SENTRY_TRACES_SAMPLE_RATE: "1",
			SENTRY_PROFILES_SAMPLE_RATE: "",
			...extraEnv,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk;
	});
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});
	const exited = new Promise((resolve) => child.on("exit", resolve));
	const deadline = Date.now() + 60_000;
	const base = `http://127.0.0.1:${port}`;
	// Ready when /health answers (never traced, so it adds nothing to check).
	for (;;) {
		if (child.exitCode !== null) throw new Error(`backend exited during boot:\n${output}`);
		if (Date.now() > deadline) throw new Error(`backend did not start in 60 s:\n${output}`);
		const up = await fetch(`${base}/health`).then(
			(response) => response.ok,
			() => false,
		);
		if (up) break;
		await sleep(200);
	}
	return {
		base,
		output: () => output,
		stop: async () => {
			child.kill("SIGTERM");
			await Promise.race([exited, sleep(20_000)]);
			if (child.exitCode === null) child.kill("SIGKILL");
		},
	};
};

// ── Helpers over what arrived ────────────────────────────────────────────
const allItems = (envelopes) => envelopes.flatMap((envelope) => envelope.items);
/** Every streamed span (span items carry `{ items: [span, ...] }`). */
const allSpans = (envelopes) =>
	allItems(envelopes)
		.filter((item) => item.type === "span")
		.flatMap((item) => item.json?.items ?? []);
const events = (envelopes) =>
	allItems(envelopes).filter((item) => item.type === "event" && item.json);
const attr = (span, key) => {
	const value = span.attributes?.[key];
	return value && typeof value === "object" && "value" in value ? value.value : value;
};
const op = (span) => attr(span, "sentry.op");

const waitFor = async (predicate, ms) => {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (predicate()) return true;
		await sleep(200);
	}
	return predicate();
};

// ── The requests ─────────────────────────────────────────────────────────
const json = (body) => JSON.stringify({ json: body });

const signUp = async (base) => {
	const email = `sentry-check-${tag}@example.com`;
	const password = `pw-${tag}-pw-${tag}`;
	const response = await fetch(`${base}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: APP_ORIGIN },
		body: JSON.stringify({ email, password, name: "Sentry Check" }),
	});
	if (!response.ok) throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
	const cookie = response.headers
		.getSetCookie()
		.map((line) => line.split(";")[0])
		.join("; ");
	const session = await fetch(`${base}/api/auth/get-session`, {
		headers: { cookie, origin: APP_ORIGIN },
	}).then((r) => r.json());
	// The personal team made at sign-up.
	const teams = await fetch(`${base}/api/user-app/teams/getMyTeams`, {
		headers: { cookie, origin: APP_ORIGIN },
	}).then((r) => r.json());
	const teamId = session?.user?.activeTeamAppId ?? teams?.json?.[0]?.id;
	if (!teamId) throw new Error(`no team after sign-up: ${JSON.stringify(teams)}`);
	return { cookie, teamId, email, password, userId: session.user.id };
};

const main = async () => {
	const capture = await startCaptureServer();
	const dsn = `http://public@127.0.0.1:${capture.port}/1`;

	// 1. With a DSN and profiling on.
	console.log("Backend with a DSN:");
	const backend = await startBackend({ SENTRY_DSN: dsn, SENTRY_PROFILES_SAMPLE_RATE: "1" });
	const bootOutput = backend.output();
	check(/Sentry: on \(environment test, release /.test(bootOutput), "boot line says Sentry: on");

	// Idle: the pg-tbus poller and the crons run, nothing is traced.
	await sleep(4000);
	await fetch(`${backend.base}/health`);
	await fetch(`${backend.base}/`);
	await sleep(1500);
	const idleSpans = allSpans(capture.envelopes);
	check(
		idleSpans.length === 0,
		`idle server, /health and / send no span (got ${idleSpans.map((s) => `${s.name} [${op(s)}${s.parent_span_id ? "" : ", root"}]`).join(", ") || "none"})`,
	);

	const user = await signUp(backend.base);
	const entryId = ulid();
	const markerHeaders = {
		"content-type": "application/json",
		origin: APP_ORIGIN,
		cookie: `${user.cookie}; probe=${MARKERS.cookie}`,
		"x-team-id": user.teamId,
		"x-api-key": MARKERS.apiKey,
		"x-tbus-event": MARKERS.tbus,
		"x-device-id": `native-${MARKERS.device}`,
		"x-forwarded-for": "203.0.113.77",
	};

	// The main request: a team-scoped write and read, with every marker.
	const created = await fetch(
		`${backend.base}/api/user-app/journalEntries/create?probe=${MARKERS.query}`,
		{
			method: "POST",
			headers: markerHeaders,
			body: json({ id: entryId, content: `${MARKERS.body} entry`, prompt: null, promptId: null }),
		},
	);
	check(created.ok, `journalEntries.create answered ${created.status}`);

	// A path holding a ULID and an Authorization bearer.
	const ulidPathId = ulid();
	await fetch(`${backend.base}/api/user-app/journalEntries/${ulidPathId}?probe=${MARKERS.query}`, {
		headers: { ...markerHeaders, authorization: `Bearer ${MARKERS.authorization}` },
	});

	// A request continuing a browser trace.
	const parentTraceId = randomBytes(16).toString("hex");
	const parentSpanId = randomBytes(8).toString("hex");
	await fetch(`${backend.base}/api/user-app/journalEntries/getAll`, {
		method: "POST",
		headers: {
			...markerHeaders,
			"sentry-trace": `${parentTraceId}-${parentSpanId}-1`,
			baggage: `sentry-trace_id=${parentTraceId},sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public`,
		},
		body: json(null),
	});

	// An error thrown in a procedure: Postgres refuses a NUL byte in text.
	const failed = await fetch(
		`${backend.base}/api/user-app/journalEntries/create?probe=${MARKERS.query}`,
		{
			method: "POST",
			headers: markerHeaders,
			body: json({ id: ulid(), content: `${MARKERS.body}\u0000`, prompt: null, promptId: null }),
		},
	);
	check(failed.status >= 500, `the failing create answered ${failed.status}`);

	await waitFor(() => events(capture.envelopes).length > 0, 10_000);
	await backend.stop();
	const shutdownOutput = backend.output();

	const spans = allSpans(capture.envelopes);
	check(capture.envelopes.length > 0, `the server sent envelopes (${capture.envelopes.length})`);
	check(spans.length > 0, `the server sent spans (${spans.length})`);

	// Rows: one trace, nested HTTP → oRPC → Postgres.
	const createServerSpan = spans.find(
		(s) =>
			op(s) === "http.server" &&
			String(attr(s, "url.path") ?? s.name).includes("journalEntries/create") &&
			s.status !== "error",
	);
	check(Boolean(createServerSpan), "the create request has an http.server span");
	if (createServerSpan) {
		const inTrace = spans.filter((s) => s.trace_id === createServerSpan.trace_id);
		const byId = new Map(inTrace.map((s) => [s.span_id, s]));
		const descendsFrom = (span, ancestor) => {
			let current = span;
			for (let depth = 0; current && depth < 50; depth++) {
				if (current.parent_span_id === ancestor.span_id) return true;
				current = byId.get(current.parent_span_id);
			}
			return false;
		};
		const orpcSpan = inTrace.find(
			(s) => /journalEntries/.test(s.name) && attr(s, "sentry.origin") !== "auto.http.server" && s !== createServerSpan && !/^pg|^db|SELECT|INSERT/.test(s.name),
		);
		check(Boolean(orpcSpan), `an oRPC procedure span is in the trace (${orpcSpan?.name ?? "none"})`);
		check(
			Boolean(orpcSpan) && descendsFrom(orpcSpan, createServerSpan),
			"the oRPC span sits under the http.server span",
		);
		const dbSpans = inTrace.filter((s) => op(s) === "db" || /^db/.test(String(op(s))));
		check(dbSpans.length > 0, `Postgres spans are in the trace (${dbSpans.length})`);
		check(
			dbSpans.length > 0 && Boolean(orpcSpan) && dbSpans.some((s) => descendsFrom(s, orpcSpan)),
			"Postgres spans sit under the oRPC span",
		);
	}

	// Trace continuation.
	check(
		spans.some((s) => s.trace_id === parentTraceId && op(s) === "http.server"),
		"a request with sentry-trace and baggage continues that trace",
	);

	// URL shapes.
	const everything = capture.envelopes.map((envelope) => envelope.raw).join("\n");
	check(!everything.includes(ulidPathId), "the ULID path segment never appears");
	check(
		spans.some((s) => String(attr(s, "url.path") ?? "").includes("/journalEntries/:id")),
		"the ULID path segment arrives as :id",
	);

	// Nothing sent with the requests leaves the process.
	for (const [name, marker] of Object.entries(MARKERS)) {
		check(!everything.includes(marker), `the ${name} marker appears in no envelope`);
	}
	check(!everything.includes("203.0.113.77"), "the forwarded client IP appears in no envelope");
	check(!/"ip_address"/.test(everything), "no ip_address field in any envelope");
	check(
		!spans.some((s) => attr(s, "client.address") !== undefined || attr(s, "network.peer.address") !== undefined),
		"no span names the client address",
	);
	const redisArgs = spans.filter(
		(s) => attr(s, "db.system.name") === "redis" && /\s/.test(String(attr(s, "db.query.text") ?? "")),
	);
	check(redisArgs.length === 0, "Redis spans carry the command only, never its arguments");
	check(!everything.includes(entryId), "no bound SQL value (the new entry's id) appears");
	check(!everything.includes(user.cookie.split("=")[1] ?? "-"), "the session cookie value appears in no envelope");
	check(!everything.includes(user.email), "the sign-up email address appears in no envelope");
	check(!everything.includes(user.password), "the sign-up password appears in no envelope");

	// The error event.
	const errorEvents = events(capture.envelopes).filter((item) => item.json.exception);
	check(errorEvents.length > 0, `an error event arrived (${errorEvents.length})`);
	const failedServerSpan = spans.find(
		(s) => op(s) === "http.server" && String(attr(s, "url.path") ?? "").includes("journalEntries/create") && s !== createServerSpan,
	);
	const errorEvent = errorEvents[0]?.json;
	check(
		Boolean(errorEvent) &&
			Boolean(failedServerSpan) &&
			errorEvent.contexts?.trace?.trace_id === failedServerSpan.trace_id,
		"the error event belongs to the failing request's trace",
	);
	check(
		/\/api\/user-app\/journalEntries\/create$/.test(String(errorEvent?.request?.url)),
		`the error event carries the URL without its query string (${errorEvent?.request?.url ?? "no url"})`,
	);
	check(!errorEvent?.user?.ip_address, "the error event names no IP address");

	// Profiling.
	check(!/profil/i.test(shutdownOutput.replace(/SENTRY_PROFILES/g, "")), "no profiler warning in the output");
	check(
		allItems(capture.envelopes).some((item) => item.type === "profile_chunk"),
		"a profile chunk arrived with SENTRY_PROFILES_SAMPLE_RATE=1",
	);

	// Outbound requests: traceparent next to sentry-trace.
	const outboundEnvelopeCount = capture.envelopes.length;
	console.log("Outbound request from the built Sentry setup:");
	await checkOutboundPropagation(dsn, capture);
	capture.envelopes.splice(outboundEnvelopeCount);

	// 2. With a DSN, profiling unset: no profile.
	console.log("Backend with a DSN, profiling unset:");
	const before = capture.envelopes.length;
	const plain = await startBackend({ SENTRY_DSN: dsn });
	await fetch(`${plain.base}/api/user-app/journalEntries/getAll`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: APP_ORIGIN, cookie: user.cookie, "x-team-id": user.teamId },
		body: json(null),
	});
	await plain.stop();
	const plainItems = allItems(capture.envelopes.slice(before));
	check(plainItems.some((item) => item.type === "span"), "spans still arrive");
	check(!plainItems.some((item) => item.type === "profile_chunk"), "no profile chunk without SENTRY_PROFILES_SAMPLE_RATE");

	// 3. Without a DSN.
	console.log("Backend without a DSN:");
	const quietBefore = capture.envelopes.length;
	const quiet = await startBackend({ SENTRY_DSN: "" });
	check(quiet.output().includes("Sentry: off (SENTRY_DSN is empty)"), "boot line says Sentry: off");
	await fetch(`${quiet.base}/api/user-app/journalEntries/getAll`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: APP_ORIGIN, cookie: user.cookie, "x-team-id": user.teamId },
		body: json(null),
	});
	await quiet.stop();
	check(capture.envelopes.length === quietBefore, "nothing is posted without a DSN");

	capture.server.close();
	if (failures.length > 0) {
		console.error(`\n${failures.length} check(s) failed.`);
		process.exit(1);
	}
	console.log("\nSentry capture check passed.");
};

/**
 * Loads the built Sentry setup in a child process and makes one outbound
 * request inside a span to the stand-in server, which records the headers.
 */
const checkOutboundPropagation = async (dsn, capture) => {
	const script = `
		require("./dist/otel.sdk");
		const Sentry = require("@sentry/node");
		const http = require("node:http");
		Sentry.startSpan({ name: "outbound check", op: "function" }, () => new Promise((resolve) => {
			http.get(process.env.OUTBOUND_URL, (res) => { res.resume(); res.on("end", resolve); });
		})).then(() => Sentry.close(2000)).then(() => process.exit(0));
	`;
	const child = spawn(process.execPath, ["-e", script], {
		cwd: backendDir,
		env: {
			...process.env,
			NODE_ENV: "test",
			SENTRY_DSN: dsn,
			SENTRY_TRACES_SAMPLE_RATE: "1",
			OUTBOUND_URL: `http://127.0.0.1:${capture.port}/outbound`,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk;
	});
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});
	const code = await new Promise((resolve) => child.on("exit", resolve));
	check(code === 0, `the outbound check ran (exit ${code})${code === 0 ? "" : `\n${output}`}`);
	const request = capture.outbound.find((entry) => entry.url === "/outbound");
	check(Boolean(request?.headers["sentry-trace"]), "the outbound request carries sentry-trace");
	check(
		/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(String(request?.headers.traceparent ?? "")),
		`the outbound request carries W3C traceparent (${request?.headers.traceparent ?? "none"})`,
	);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
