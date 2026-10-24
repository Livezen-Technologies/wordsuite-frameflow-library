// Library API (blueprint §7) over node:http, plus:
//   /feed/<channel>/catalog.json(.sig)  the signed catalog FrameFlow reads
//   /feed/<channel>/packs/<file>        pack zips and thumbnails (HTTP Range)
//   /feed/public-key.pem                the catalog signing key's public half
//   /admin/                             the Download Center admin web
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ValidationError } from "../../../packages/asset-schema/index.js";
import { createOidcVerifier, planRank } from "./auth.js";
import { HttpError, createLibrary } from "./service.js";
import { storageFromEnv } from "./storage.js";

const ADMIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "admin-web");
const SCHEMA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "asset-schema", "index.js");
const MAX_BODY = 2 * 1024 ** 3;

/**
 * Admin tokens: "token:role:userId,…" (LIBRARY_ADMIN_TOKENS). In production
 * these come from OneAuth (§7.1); the token map is the dev/server-to-server path.
 */
export function parseTokens(spec = "") {
	const map = new Map();
	for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
		const [token, role, id] = part.split(":");
		if (token && role) map.set(token, { id: id || `${role}-${crypto.createHash("sha256").update(token).digest("hex").slice(0, 8)}`, role });
	}
	return map;
}

function send(res, status, body, headers = {}) {
	const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
	res.writeHead(status, { "Content-Type": typeof body === "string" || Buffer.isBuffer(body) ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", ...headers });
	res.end(data);
}

function readBody(req, limit = MAX_BODY) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let n = 0;
		req.on("data", (c) => {
			n += c.length;
			if (n > limit) {
				reject(new HttpError(413, "TOO_LARGE", "Upload is too large."));
				req.destroy();
			} else chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

async function json(req) {
	const buf = await readBody(req, 5 * 1024 ** 2);
	if (!buf.length) return {};
	try {
		return JSON.parse(buf.toString("utf8"));
	} catch {
		throw new HttpError(400, "BAD_JSON", "Body isn't valid JSON.");
	}
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".jpg": "image/jpeg", ".zip": "application/zip", ".svg": "image/svg+xml" };

/** Serves a file with ETag and single-range support (§9 step 4 resume). */
function serveFile(req, res, file, extra = {}) {
	const stat = fs.statSync(file);
	const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
	const headers = { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes", ETag: etag, ...extra };
	if (req.headers["if-none-match"] === etag) return send(res, 304, "", headers);
	const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
	if (range && (range[1] || range[2])) {
		let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
		let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
		start = Math.max(0, start);
		end = Math.min(end, stat.size - 1);
		if (start > end) return send(res, 416, "", { ...headers, "Content-Range": `bytes */${stat.size}` });
		res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
		return fs.createReadStream(file, { start, end }).pipe(res);
	}
	res.writeHead(200, { ...headers, "Content-Length": stat.size });
	if (req.method === "HEAD") return res.end();
	fs.createReadStream(file).pipe(res);
}

/** Serves a stored blob ({ key, size, etag }) with ETag and single-range support. */
async function serveBlob(req, res, lib, blob, extra = {}) {
	const headers = { "Content-Type": MIME[path.extname(blob.key)] ?? "application/octet-stream", "Accept-Ranges": "bytes", ...(blob.etag ? { ETag: blob.etag } : {}), ...extra };
	if (blob.etag && req.headers["if-none-match"] === blob.etag) return send(res, 304, "", headers);
	let start = 0;
	let end = blob.size - 1;
	const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
	let status = 200;
	if (range && (range[1] || range[2])) {
		start = range[1] ? Number(range[1]) : blob.size - Number(range[2]);
		end = range[1] && range[2] ? Number(range[2]) : blob.size - 1;
		start = Math.max(0, start);
		end = Math.min(end, blob.size - 1);
		if (start > end) return send(res, 416, "", { ...headers, "Content-Range": `bytes */${blob.size}` });
		status = 206;
		headers["Content-Range"] = `bytes ${start}-${end}/${blob.size}`;
	}
	res.writeHead(status, { ...headers, "Content-Length": end - start + 1 });
	if (req.method === "HEAD" || blob.size === 0) return res.end();
	const stream = await lib.streamBlob(blob.key, { start, end });
	stream.on("error", () => res.destroy());
	stream.pipe(res);
}

/** Tiny router: [method, /path/:param, handler]. */
function route(routes, method, pathname) {
	for (const [m, pattern, handler] of routes) {
		if (m !== method) continue;
		const keys = [];
		const re = new RegExp(`^${pattern.replace(/:[a-z_]+/g, (k) => (keys.push(k.slice(1)), "([^/]+)"))}$`);
		const hit = re.exec(pathname);
		if (hit) return { handler, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(hit[i + 1])])) };
	}
	return null;
}

/**
 * `oidc`: { issuer, audience?, roleClaim? } (LIBRARY_OIDC_ISSUER, …_AUDIENCE,
 * …_ROLE_CLAIM). Without it, dev mode: clients may claim a plan with X-Plan.
 */
export async function createServer({
	dataDir,
	blobs,
	state,
	signingKey = process.env.LIBRARY_SIGNING_KEY || null,
	tokens = parseTokens(process.env.LIBRARY_ADMIN_TOKENS),
	requireProcessing = process.env.LIBRARY_REQUIRE_PROCESSING === "1",
	oidc = process.env.LIBRARY_OIDC_ISSUER ? { issuer: process.env.LIBRARY_OIDC_ISSUER, audience: process.env.LIBRARY_OIDC_AUDIENCE || undefined, roleClaim: process.env.LIBRARY_OIDC_ROLE_CLAIM || undefined } : null,
	fetch: fetchImpl,
	now,
} = {}) {
	const lib = await createLibrary({ dataDir, signingKey, now, requireProcessing, ...(blobs ? { blobs } : {}), ...(state ? { state } : {}) });
	const verifier = oidc ? createOidcVerifier({ ...oidc, fetch: fetchImpl, now: now ? () => now().getTime() : undefined }) : null;
	/** Who is calling: a static token's admin, a verified OIDC user, or null. */
	async function principalOf(req) {
		const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
		if (!token) return null;
		const staticActor = tokens.get(token);
		if (staticActor) return { ...staticActor, plan: "enterprise" };
		return verifier ? verifier.principal(token).catch(() => null) : null;
	}
	const clientOf = (req, who) => ({
		// Production: the plan comes from the verified token. Dev (no OIDC): X-Plan.
		plan: who?.plan ?? (verifier ? "free" : String(req.headers["x-plan"] ?? "free")),
		device_id: who?.device_id ?? req.headers["x-device-id"] ?? null,
		user_id: who?.id ?? null,
		appVersion: req.headers["x-app-version"] ?? null,
	});

	const A = "/api/v1";
	const routes = [
		// ---- client (§7.2)
		["GET", `${A}/catalog/types`, () => ({ data: lib.catalogTypes() })],
		["GET", `${A}/catalog/categories`, ({ query }) => ({ data: lib.categories(query.get("type")) })],
		["GET", `${A}/assets`, ({ query, req }) => lib.searchAssets({ ...Object.fromEntries(query), appVersion: clientOf(req).appVersion })],
		["GET", `${A}/assets/:id`, ({ params, req, who }) => lib.assetDetail(params.id, clientOf(req, who))],
		["GET", `${A}/assets/:id/preview`, ({ params }) => ({ thumbnail_url: lib.assetDetail(params.id).thumbnail_url })],
		["GET", `${A}/search/suggest`, ({ query }) => ({ data: lib.searchAssets({ q: query.get("q") ?? "", limit: 8 }).data.map((a) => ({ id: a.id, title: a.title, type: a.type })) })],
		["GET", `${A}/collections`, () => ({ data: lib.collections() })],
		["GET", `${A}/collections/:slug`, ({ params }) => lib.collections().find((c) => c.slug === params.slug) ?? (() => { throw new HttpError(404, "NOT_FOUND", "Collection not found."); })()],
		["POST", `${A}/assets/:id/download`, async ({ params, req, who }) => {
			const body = await json(req);
			const c = clientOf(req, who);
			return lib.downloadGrant(params.id, { ...body, ...c, device_id: c.device_id ?? body.device_id ?? null });
		}],
		["POST", `${A}/downloads/:id/complete`, async ({ params, req }) => lib.completeDownload(params.id, await json(req))],
		["POST", `${A}/me/usage`, async ({ req }) => lib.recordUsage((await json(req)).events)],
		["GET", `${A}/sync`, ({ query }) => lib.sync(query.get("since"), Number(query.get("limit")) || 500)],
		["GET", `${A}/entitlements`, ({ req, who }) => ({ plan: clientOf(req, who).plan, signed_in: !!who })],
		// ---- admin (§7.3)
		["GET", `${A}/admin/me`, ({ actor }) => (actor ? actor : (() => { throw new HttpError(401, "UNAUTHENTICATED", "Sign in first."); })())],
		["POST", `${A}/admin/uploads`, async ({ req, actor, query }) => {
			const filename = decodeURIComponent(String(req.headers["x-filename"] ?? query.get("filename") ?? ""));
			return lib.upload(actor, { filename, buf: await readBody(req), type: query.get("type") || null });
		}],
		["GET", `${A}/admin/uploads/:id`, ({ params }) => lib.getUpload(params.id)],
		["GET", `${A}/admin/assets`, ({ query }) => lib.adminList(Object.fromEntries(query))],
		["POST", `${A}/admin/assets`, async ({ req, actor }) => {
			const body = await json(req);
			if (Array.isArray(body.items)) {
				// One at a time, so slug uniqueness holds within a batch.
				const data = [];
				for (const item of body.items.slice(0, 200)) {
					try {
						data.push({ ok: true, asset: await lib.createAsset(actor, { ...body.defaults, ...item }) });
					} catch (e) {
						data.push({ ok: false, upload_id: item.upload_id, error: { code: e.code, message: e.message, details: e.details } });
					}
				}
				return { data };
			}
			return lib.createAsset(actor, body);
		}],
		["GET", `${A}/admin/assets/:id`, ({ params }) => lib.getAsset(params.id)],
		["PATCH", `${A}/admin/assets/:id`, async ({ params, req, actor }) => lib.updateAsset(actor, params.id, await json(req))],
		["POST", `${A}/admin/assets/bulk`, async ({ req, actor }) => lib.bulk(actor, await json(req))],
		["POST", `${A}/admin/assets/:id/versions`, async ({ params, req, actor }) => lib.addVersion(actor, params.id, await json(req))],
		["POST", `${A}/admin/assets/:id/versions/:v/publish`, ({ params, actor }) => lib.publish(actor, params.id, { version: params.v })],
		["POST", `${A}/admin/assets/:id/versions/:v/rollback`, ({ params, actor }) => lib.rollback(actor, params.id, params.v)],
		["POST", `${A}/admin/assets/:id/submit-review`, ({ params, actor }) => lib.submitReview(actor, params.id)],
		["POST", `${A}/admin/assets/:id/approve`, ({ params, actor }) => lib.review(actor, params.id, { approve: true })],
		["POST", `${A}/admin/assets/:id/reject`, async ({ params, req, actor }) => lib.review(actor, params.id, { approve: false, reason: (await json(req)).reason })],
		["POST", `${A}/admin/assets/:id/publish`, async ({ params, req, actor }) => lib.publish(actor, params.id, await json(req))],
		["POST", `${A}/admin/assets/:id/unpublish`, async ({ params, req, actor }) => lib.unpublish(actor, params.id, await json(req))],
		["POST", `${A}/admin/assets/:id/deprecate`, async ({ params, req, actor }) => lib.unpublish(actor, params.id, { ...(await json(req)), op: "deprecate" })],
		["POST", `${A}/admin/assets/:id/archive`, ({ params, actor }) => lib.unpublish(actor, params.id, { op: "archive" })],
		["GET", `${A}/admin/categories`, ({ query }) => ({ data: lib.categories(query.get("type")) })],
		["POST", `${A}/admin/categories`, async ({ req, actor }) => lib.createCategory(actor, await json(req))],
		["GET", `${A}/admin/analytics/overview`, () => lib.overview()],
		["GET", `${A}/admin/jobs`, ({ query }) => ({ data: lib.jobs({ status: query.get("status") }) })],
		["POST", `${A}/admin/assets/:id/reprocess`, async ({ params, req, actor }) => lib.reprocess(actor, params.id, (await json(req)).version ?? null)],
		// ---- processing workers (apps/workers); token role "worker"
		["POST", `${A}/worker/jobs/claim`, ({ who }) => lib.claimJob(who)],
		["GET", `${A}/worker/jobs/:id/files/:sha`, ({ params, who }) => lib.jobFile(who, params.id, params.sha)],
		["PUT", `${A}/worker/jobs/:id/previews/:kind`, async ({ params, req, who, query }) => lib.putPreview(who, params.id, { kind: params.kind, ext: query.get("ext"), buf: await readBody(req, 50 * 1024 ** 2) })],
		["POST", `${A}/worker/jobs/:id/complete`, async ({ params, req, who }) => lib.completeJob(who, params.id, await json(req))],
		["GET", `${A}/admin/audit-log`, ({ query }) => ({ data: lib.auditLog({ entity_id: query.get("entity_id") }) })],
	];
	const ADMIN_READ = /^\/api\/v1\/admin\//;

	const server = http.createServer(async (req, res) => {
		const requestId = req.headers["x-request-id"] ?? `req_${crypto.randomBytes(8).toString("hex")}`;
		res.setHeader("X-Request-Id", requestId);
		res.setHeader("X-Content-Type-Options", "nosniff");
		const url = new URL(req.url, "http://localhost");
		const { pathname } = url;
		try {
			// ---- FrameFlow feed
			const feed = /^\/feed\/(stable|beta)\/(catalog\.json(?:\.sig)?|packs\/([^/]+))$/.exec(pathname);
			if (feed && (req.method === "GET" || req.method === "HEAD")) {
				if (feed[3]) {
					const file = await lib.packageFile(feed[3]);
					if (!file) return send(res, 404, "Not found");
					// Pro and above: a signed-in plan that covers the tier, or a download grant's signed URL.
					const tier = lib.packageTier(feed[3]);
					if (tier !== "free") {
						const granted = lib.verifyDownloadToken(feed[3], url.searchParams.get("expires"), url.searchParams.get("sig"));
						const who = granted ? null : await principalOf(req);
						if (!granted && planRank(clientOf(req, who).plan) < planRank(tier))
							return send(res, who ? 403 : 401, { error: { code: who ? "NOT_ENTITLED" : "UNAUTHENTICATED", message: `This pack needs a ${tier} plan.`, details: [], request_id: requestId } });
						return serveBlob(req, res, lib, file, { "Cache-Control": "private, no-store" });
					}
					return serveBlob(req, res, lib, file, { "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" });
				}
				const f = lib.feed(feed[1]);
				const headers = { ETag: f.etag, "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" };
				if (pathname.endsWith(".sig")) return send(res, 200, f.sig, headers);
				if (req.headers["if-none-match"] === f.etag) return send(res, 304, "", headers);
				return send(res, 200, f.text, { ...headers, "Content-Type": "application/json; charset=utf-8" });
			}
			if (pathname === "/feed/public-key.pem") return send(res, 200, lib.publicKey);
			const preview = /^\/previews\/([0-9a-f-]{36})\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/([a-z0-9_-]{1,32}\.[a-z0-9]{2,5})$/.exec(pathname);
			if (preview && (req.method === "GET" || req.method === "HEAD")) {
				const file = await lib.previewFile(preview[1], preview[2], preview[3]);
				if (!file) return send(res, 404, "Not found");
				return serveBlob(req, res, lib, file, { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" });
			}
			if (pathname === "/healthz") return send(res, 200, { ok: true });
			// ---- admin web
			if (pathname === "/" || pathname === "/admin") return send(res, 302, "", { Location: "/admin/" });
			if (pathname === "/admin/schema.js") return serveFile(req, res, SCHEMA_FILE, { "Cache-Control": "no-cache" });
			if (pathname.startsWith("/admin/")) {
				const rel = pathname.slice("/admin/".length) || "index.html";
				const file = path.join(ADMIN_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
				if (!file.startsWith(ADMIN_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return serveFile(req, res, path.join(ADMIN_DIR, "index.html"));
				return serveFile(req, res, file, { "Cache-Control": "no-cache" });
			}
			// ---- API
			const hit = route(routes, req.method, pathname);
			if (!hit) throw new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${pathname}.`);
			const who = await principalOf(req);
			// Admin endpoints need a library role (static token or the OIDC role claim).
			const actor = who?.role ? who : null;
			if (ADMIN_READ.test(pathname) && !actor) throw new HttpError(who ? 403 : 401, who ? "FORBIDDEN" : "UNAUTHENTICATED", who ? "Your account has no Download Center role." : "Sign in first.");
			await lib.runSchedule();
			const out = await hit.handler({ req, params: hit.params, query: url.searchParams, actor, who });
			// Changes are stored before the response says they happened.
			if (req.method !== "GET") await lib.flush();
			if (out === null && req.method === "POST") return send(res, 204, "");
			if (Buffer.isBuffer(out)) return send(res, 200, out, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
			const body = JSON.stringify(out);
			if (req.method === "GET") {
				const etag = `"${crypto.createHash("sha256").update(body).digest("hex").slice(0, 27)}"`;
				res.setHeader("ETag", etag);
				if (req.headers["if-none-match"] === etag) return send(res, 304, "");
			}
			res.writeHead(req.method === "POST" && /\/admin\/(assets|uploads|categories)$/.test(pathname) ? 201 : 200, { "Content-Type": "application/json; charset=utf-8" });
			res.end(body);
		} catch (e) {
			const status = e instanceof HttpError || e instanceof ValidationError ? e.status : 500;
			if (status === 500) console.error(e);
			send(res, status, { error: { code: e.code ?? "INTERNAL", message: status === 500 ? "Something went wrong." : e.message, details: e.details ?? [], request_id: requestId } });
		}
	});
	return { server, lib };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const port = Number(process.env.PORT) || 8787;
	const dataDir = process.env.LIBRARY_DATA_DIR || path.join(process.cwd(), "data");
	const tokens = parseTokens(process.env.LIBRARY_ADMIN_TOKENS || "dev-admin:super_admin:admin");
	const { server, lib } = await createServer({ dataDir, tokens, ...(await storageFromEnv({ dataDir })) });
	server.listen(port, () => {
		console.log(`FrameFlow Library on http://localhost:${port}  (admin: /admin/, feed: /feed/stable/catalog.json)`);
		if (!process.env.LIBRARY_ADMIN_TOKENS) console.log("Dev admin token: dev-admin");
		if (!process.env.LIBRARY_SIGNING_KEY) console.log(`No LIBRARY_SIGNING_KEY: using a development key kept with the library state. Point FrameFlow at it with:\n  WSC_ASSET_URL=http://localhost:${port}/feed WSC_ASSET_PUBLIC_KEY="$(curl -s http://localhost:${port}/feed/public-key.pem)"`);
	});
	setInterval(() => lib.runSchedule().catch((e) => console.error("Schedule run failed:", e.message)), 60_000).unref();
	for (const signal of ["SIGTERM", "SIGINT"])
		process.once(signal, () => {
			server.close();
			lib.close().finally(() => process.exit(0));
		});
}
