// Runs the HTTP test suites against the Library API (the CodeIgniter backend in backend/):
//   (default)                 a fresh backend per start(): `php spark serve` on a free
//                             port, a new SQLite database (or LIBRARY_PHP_DATABASE_URL,
//                             reset with `php spark library:reset --force`) and blob folder
//   LIBRARY_API_URL=http://…  an already running server (state is NOT reset; tests that
//                             need their own server settings check `target` and skip)
import { execFile, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const API_URL = /^https?:\/\//.test(process.env.LIBRARY_API_URL ?? "") ? process.env.LIBRARY_API_URL : "";
export const target = API_URL ? "external" : "php";
export const BACKEND = process.env.LIBRARY_PHP_DIR || path.resolve(import.meta.dirname, "..", "backend");
const PHP = process.env.PHP_BINARY || "php";

export const tmp = (prefix = "fflib-") => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

export function freePort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer();
		s.once("error", reject);
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

/** The environment a started backend runs with (also used for `php spark` commands in tests). */
function backendEnv(dir, tokens, env) {
	const pg = process.env.LIBRARY_PHP_DATABASE_URL;
	const childEnv = {
		...process.env,
		CI_ENVIRONMENT: "production",
		DATABASE_URL: pg || `sqlite:${path.join(dir, "library.sqlite")}`,
		LIBRARY_DATA_DIR: path.join(dir, "blobs"),
		LIBRARY_ADMIN_TOKENS: tokens,
		LIBRARY_SIGNING_KEY: "",
		LIBRARY_OIDC_ISSUER: "",
		LIBRARY_REQUIRE_PROCESSING: "",
		...env,
	};
	for (const k of ["LIBRARY_S3_BUCKET", "LIBRARY_API_URL", "MEILI_URL", "MEILI_KEY"]) if (!(k in env)) delete childEnv[k];
	return childEnv;
}

/**
 * Starts the PHP backend with `tokens` ("token:role:id,…") and extra env
 * (e.g. LIBRARY_OIDC_ISSUER). Returns { base, server: { close() }, spark(...args) → Promise<stdout> }.
 */
export async function startPhp({ tokens = "", env = {} } = {}) {
	const dir = tmp("fflib-php-");
	const childEnv = backendEnv(dir, tokens, env);
	execFileSync(PHP, ["spark", "library:reset", "--force"], { cwd: BACKEND, env: childEnv, stdio: "pipe" });
	// Async, so servers in this process (webhook receivers, fakes) can answer the command.
	const spark = (...args) =>
		new Promise((resolve, reject) =>
			execFile(PHP, ["spark", ...args], { cwd: BACKEND, env: childEnv }, (err, stdout, stderr) => (err ? reject(new Error(`spark ${args.join(" ")}: ${err.message}\n${stdout}${stderr}`)) : resolve(stdout))),
		);
	const port = await freePort();
	const child = spawn(PHP, ["spark", "serve", "--host", "127.0.0.1", "--port", String(port)], { cwd: BACKEND, env: { ...childEnv, PHP_CLI_SERVER_WORKERS: "4" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
	let log = "";
	child.stdout.on("data", (d) => (log += d));
	child.stderr.on("data", (d) => (log += d));
	const base = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 20_000;
	for (;;) {
		try {
			if ((await fetch(`${base}/healthz`)).ok) break;
		} catch {}
		if (child.exitCode !== null || Date.now() > deadline) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {}
			throw new Error(`php spark serve didn't start:\n${log}`);
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	const close = () => {
		try {
			process.kill(-child.pid, "SIGTERM");
		} catch {}
		return new Promise((r) => (child.exitCode !== null ? r() : child.once("exit", r)));
	};
	return { base, dataDir: dir, server: { close }, spark, log: () => log };
}

/** The server for a test: a fresh PHP backend, or LIBRARY_API_URL when it is an http(s) URL. */
export async function startTarget({ tokens, env } = {}) {
	if (target === "external") return { base: API_URL.replace(/\/$/, ""), server: { close() {} }, dataDir: null, spark: null };
	return startPhp({ tokens, env });
}

/** fetch + JSON for tests: `call(method, path, { token, body, raw, headers })` → { status, data, headers }. */
export function caller(base) {
	return async (method, p, { token, body, raw, headers = {} } = {}) => {
		const res = await fetch(base + p, {
			method,
			headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
			body: raw ?? (body ? JSON.stringify(body) : undefined),
		});
		const text = await res.text();
		let data = text;
		try {
			data = JSON.parse(text);
		} catch {}
		return { status: res.status, data, headers: res.headers };
	};
}
