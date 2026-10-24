// Runs the HTTP test suites against either Library API:
//   (default)                 the Node server in apps/api, in-process
//   LIBRARY_API_URL=php       a fresh CodeIgniter backend (backend/) per start():
//                             `php spark serve` on a free port, a new SQLite
//                             database (or LIBRARY_PHP_DATABASE_URL, reset with
//                             `php spark library:reset --force`) and blob folder
//   LIBRARY_API_URL=http://…  an already running server (state is NOT reset)
// Tests that need Node internals (lib, injected fetch) check `target`.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const API_URL = process.env.LIBRARY_API_URL || "";
export const target = !API_URL ? "node" : API_URL === "php" ? "php" : "external";
const BACKEND = process.env.LIBRARY_PHP_DIR || path.resolve(import.meta.dirname, "..", "backend");
const PHP = process.env.PHP_BINARY || "php";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fflib-php-"));

function freePort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer();
		s.once("error", reject);
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

/**
 * Starts the PHP backend with `tokens` ("token:role:id,…") and extra env
 * (e.g. LIBRARY_OIDC_ISSUER). Returns { base, server: { close() } }.
 */
export async function startPhp({ tokens = "", env = {} } = {}) {
	const dir = tmp();
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
	for (const k of ["LIBRARY_S3_BUCKET", "LIBRARY_API_URL"]) if (!(k in env)) delete childEnv[k];
	execFileSync(PHP, ["spark", "library:reset", "--force"], { cwd: BACKEND, env: childEnv, stdio: "pipe" });
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
			try { process.kill(-child.pid, "SIGKILL"); } catch {}
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
	return { base, dataDir: dir, server: { close }, log: () => log };
}

/**
 * The server for a test: Node in-process unless LIBRARY_API_URL says otherwise.
 * `node()` builds the in-process server (so callers keep their createServer options).
 */
export async function startTarget({ tokens, env, node }) {
	if (target === "php") return startPhp({ tokens, env });
	if (target === "external") return { base: API_URL.replace(/\/$/, ""), server: { close() {} }, dataDir: null };
	const { server, lib, dataDir } = await node();
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	return { base: `http://127.0.0.1:${server.address().port}`, server, lib, dataDir };
}
