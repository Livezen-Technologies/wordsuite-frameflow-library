// Cloudflare front for frameflow.worksuitecloud.com/library (the web editor
// serves the rest of the host). The /library prefix comes off first, then:
//   /api/*, /feed/*, /previews/*, /healthz → the Library API container (backend/Dockerfile)
//   everything else                        → the built frontend (Workers static assets, SPA fallback)
// A cron trigger keeps one processing-worker container (apps/workers) running.
import { Container, getContainer } from "@cloudflare/containers";

// Runtime secrets/vars handed to the API container. Database: CodeIgniter's own names.
const API_ENV = [
	"database.default.DBDriver",
	"database.default.hostname",
	"database.default.port",
	"database.default.database",
	"database.default.username",
	"database.default.password",
	"database.default.DSN",
	"DATABASE_URL",
	"LIBRARY_SIGNING_KEY",
	"LIBRARY_ADMIN_TOKENS",
	"LIBRARY_OIDC_ISSUER",
	"LIBRARY_OIDC_AUDIENCE",
	"LIBRARY_OIDC_ROLE_CLAIM",
	"LIBRARY_S3_ENDPOINT",
	"LIBRARY_S3_BUCKET",
	"LIBRARY_S3_ACCESS_KEY_ID",
	"LIBRARY_S3_SECRET_ACCESS_KEY",
	"LIBRARY_S3_REGION",
	"LIBRARY_S3_PREFIX",
	"LIBRARY_CORS_ORIGINS",
	"LIBRARY_REQUIRE_PROCESSING",
	"MEILI_URL",
	"MEILI_KEY",
	"MEILI_INDEX",
	"CLAMAV_HOST",
];
const WORKER_ENV = ["LIBRARY_WORKER_TOKEN", "WORKER_CONCURRENCY", "WORKER_POLL_MS", "CLAMAV_HOST", "CLAMAV_PORT"];
const API_PATH = /^\/(api|feed|previews)(\/|$)|^\/healthz$/;

const PREFIX = "/library";

/** The request with /library taken off its path; null when it isn't under /library. */
function unprefixed(request) {
	const url = new URL(request.url);
	if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return null;
	url.pathname = url.pathname.slice(PREFIX.length) || "/";
	return new Request(url, request);
}

/** Puts /library back on a same-origin redirect from the API. */
function withPrefix(response) {
	const location = response.headers.get("Location");
	if (!location?.startsWith("/") || location.startsWith("//")) return response;
	const headers = new Headers(response.headers);
	headers.set("Location", PREFIX + location);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const pick = (env, keys) => Object.fromEntries(keys.filter((k) => env[k] !== undefined && env[k] !== "").map((k) => [k, String(env[k])]));

export class LibraryContainer extends Container {
	defaultPort = 8080;
	// The cron below wakes it every 5 minutes, so scheduled publishes and webhooks keep running.
	sleepAfter = "15m";
	enableInternet = true;

	constructor(ctx, env) {
		super(ctx, env);
		this.envVars = pick(env, API_ENV);
	}
}

export class ProcessorContainer extends Container {
	// No HTTP port: the worker only makes outbound calls to the API.
	sleepAfter = "15m";
	enableInternet = true;

	constructor(ctx, env) {
		super(ctx, env);
		this.envVars = { LIBRARY_API_URL: env.LIBRARY_PUBLIC_URL, ...pick(env, WORKER_ENV) };
	}

	/** Starts the worker if it isn't running and pushes its sleep timer out. */
	async keepAlive() {
		await this.start();
		this.renewActivityTimeout();
		return { running: true };
	}
}

export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === PREFIX) return Response.redirect(`${new URL(request.url).origin}${PREFIX}/`, 301);
		const inner = unprefixed(request);
		if (!inner) return new Response("Not found", { status: 404 });
		if (API_PATH.test(new URL(inner.url).pathname)) return withPrefix(await getContainer(env.LIBRARY).fetch(inner));
		return env.ASSETS.fetch(inner);
	},

	async scheduled(controller, env, ctx) {
		ctx.waitUntil(
			Promise.allSettled([
				env.LIBRARY_WORKER_TOKEN ? getContainer(env.PROCESSOR, "processor").keepAlive() : Promise.resolve(),
				getContainer(env.LIBRARY).fetch(unprefixed(new Request(`${env.LIBRARY_PUBLIC_URL}/healthz`))),
			]).then((results) => {
				for (const r of results) if (r.status === "rejected") console.error("cron:", r.reason);
			}),
		);
	},
};
