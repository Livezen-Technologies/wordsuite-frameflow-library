// Admin additions (docs/api-v1-additions.md): collections, category edits,
// tag merge, settings, analytics, search misses with optional Meilisearch,
// webhooks (signed, queued, SSRF-guarded) and the admin preview route.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { test } from "node:test";
import { cube, png, publishAsset } from "./fixtures.js";
import { caller, startTarget, target } from "./harness.js";

const own = { skip: target === "external" && "starts its own backend" };
const TOKENS = "su:super_admin:u1,mg:library_manager:u4,ed:content_editor:u2,an:analyst:u5,wk:worker:w1";

async function start(t, env = {}) {
	const s = await startTarget({ tokens: TOKENS, env });
	t.after(() => s.server.close());
	return { ...s, call: caller(s.base) };
}

/** A local HTTP server recording requests; `respond(req, n)` → status. */
async function listen(t, respond = () => 200) {
	const got = [];
	const server = http.createServer((req, res) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			const raw = Buffer.concat(chunks).toString();
			got.push({ method: req.method, url: req.url, headers: req.headers, raw });
			res.statusCode = respond(req, got.length, raw);
			res.setHeader("Content-Type", "application/json");
			res.end(res.statusCode < 300 ? "{}" : '{"error":"nope"}');
		});
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	t.after(() => server.close());
	return { url: `http://127.0.0.1:${server.address().port}`, got };
}

test("collections, category edits and tag merge", own, async (t) => {
	const { call } = await start(t);
	const warm = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Warm Film", tags: ["sunset", "warm"] });
	const cool = await publishAsset(call, "su", "cool.cube", cube(17), { title: "Cool Film", tags: ["Sun Set", "cool"] });

	assert.equal((await call("POST", "/api/v1/admin/collections", { token: "ed", body: { title: "Vesak" } })).status, 403);
	const made = await call("POST", "/api/v1/admin/collections", { token: "mg", body: { title: "Vesak picks", description: "Lanterns and light", asset_ids: [cool.id, warm.slug] } });
	assert.equal(made.status, 201, JSON.stringify(made.data));
	assert.deepEqual(made.data.asset_ids, [cool.id, warm.id]);
	assert.equal(made.data.slug, "vesak-picks");
	assert.equal((await call("POST", "/api/v1/admin/collections", { token: "mg", body: { title: "Vesak picks" } })).data.error.details[0].rule, "slug.unique");
	assert.equal((await call("POST", "/api/v1/admin/collections", { token: "mg", body: { title: "Soon", publish_at: new Date(Date.now() + 3_600_000).toISOString() } })).status, 201);
	const rails = (await call("GET", "/api/v1/collections")).data.data;
	assert.deepEqual(rails.map((c) => c.slug), ["vesak-picks", "featured", "new", "trending"]);
	assert.deepEqual(rails[0].assets.map((a) => a.slug), ["cool-film", "warm-film"]);
	assert.equal((await call("GET", "/api/v1/collections/vesak-picks")).data.title, "Vesak picks");
	const patched = await call("PATCH", "/api/v1/admin/collections/vesak-picks", { token: "mg", body: { asset_ids: [warm.id], visible: false } });
	assert.deepEqual(patched.data.asset_ids, [warm.id]);
	assert.equal((await call("GET", "/api/v1/collections/vesak-picks")).status, 404);
	assert.equal((await call("GET", "/api/v1/admin/collections", { token: "mg" })).data.data.length, 2);
	assert.equal((await call("DELETE", "/api/v1/admin/collections/soon", { token: "mg" })).status, 204);
	assert.equal((await call("GET", "/api/v1/admin/collections/soon", { token: "mg" })).status, 404);

	// Categories: rename, hide, reorder; delete only when empty.
	const cats = (await call("GET", "/api/v1/admin/categories?type=lut", { token: "su" })).data.data;
	const used = cats.find((c) => c.id === warm.category_id);
	const empty = cats.find((c) => c.id !== warm.category_id);
	assert.equal((await call("PATCH", `/api/v1/admin/categories/${empty.id}`, { token: "ed", body: { name: "X" } })).status, 403);
	const renamed = await call("PATCH", `/api/v1/admin/categories/${empty.id}`, { token: "mg", body: { name: "Film stocks", icon: "film", visible: false, parent_id: used.id } });
	assert.deepEqual([renamed.data.name, renamed.data.slug, renamed.data.icon, renamed.data.visible, renamed.data.parent_id], ["Film stocks", "film-stocks", "film", false, used.id]);
	const inUse = await call("DELETE", `/api/v1/admin/categories/${used.id}`, { token: "mg" });
	assert.equal(inUse.status, 409);
	assert.equal(inUse.data.error.code, "CATEGORY_IN_USE");
	const order = cats.map((c) => c.id).reverse();
	assert.deepEqual((await call("POST", "/api/v1/admin/categories/reorder", { token: "mg", body: { ids: order } })).data.data.filter((c) => c.type === "lut").map((c) => c.id), order);
	assert.deepEqual((await call("GET", "/api/v1/catalog/categories?type=lut")).data.data.map((c) => c.id), order);
	assert.equal((await call("POST", "/api/v1/admin/categories/reorder", { token: "mg", body: { ids: ["nope"] } })).status, 422);
	await call("PATCH", `/api/v1/admin/categories/${empty.id}`, { token: "mg", body: { parent_id: null } });
	assert.equal((await call("DELETE", `/api/v1/admin/categories/${empty.id}`, { token: "mg" })).status, 204);

	// Tag merge rewrites every asset and reaches clients as sync upserts.
	const merged = await call("POST", "/api/v1/admin/tags/merge", { token: "mg", body: { from: ["sunset", "sun set"], into: "Golden hour" } });
	assert.equal(merged.data.updated, 2);
	assert.deepEqual((await call("GET", `/api/v1/assets/${warm.id}`)).data.tags, ["golden hour", "warm"]);
	assert.deepEqual((await call("GET", `/api/v1/assets/${cool.id}`)).data.tags, ["golden hour", "cool"]);
	assert.equal((await call("GET", "/api/v1/assets?tags=golden%20hour")).data.total, 2);
	const actions = (await call("GET", "/api/v1/admin/audit-log", { token: "su" })).data.data.map((e) => e.action);
	for (const a of ["collection.create", "collection.update", "collection.delete", "category.update", "category.reorder", "category.delete", "tag.merge"]) assert.ok(actions.includes(a), a);
	const ops = (await call("GET", "/api/v1/sync?since=0")).data.events.map((e) => e.op);
	assert.ok(ops.includes("category_change"));
});

test("settings: device limits, processing and feed channels", own, async (t) => {
	const { call } = await start(t);
	assert.equal((await call("GET", "/api/v1/admin/settings", { token: "mg" })).status, 403);
	const defaults = await call("GET", "/api/v1/admin/settings", { token: "su" });
	assert.deepEqual(defaults.data, { device_limits: { free: 2, pro: 3, business: 10, enterprise: 50 }, require_processing: false, cors_origins: [], feed: { stable: ["public"], beta: ["public", "internal"] } });
	const bad = await call("PUT", "/api/v1/admin/settings", { token: "su", body: { device_limits: { free: -1 }, colour: "red" } });
	assert.equal(bad.status, 422);
	assert.deepEqual(bad.data.error.details.map((d) => d.rule), ["settings.device_limits", "settings.unknown"]);
	const saved = await call("PUT", "/api/v1/admin/settings", { token: "su", body: { device_limits: { pro: 5 }, require_processing: true, cors_origins: ["https://admin.example.com"], feed: { stable: ["public", "unlisted"] } } });
	assert.equal(saved.status, 200, JSON.stringify(saved.data));
	assert.deepEqual(saved.data.device_limits, { free: 2, pro: 5, business: 10, enterprise: 50 });
	assert.deepEqual(saved.data.feed, { stable: ["public", "unlisted"], beta: ["public", "internal"] });
	assert.equal((await call("GET", "/api/v1/me/devices", { token: "su", headers: {} })).data.limit, 50);

	// require_processing now blocks publishing until the worker is done.
	const draft = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Hidden Gem", visibility: "unlisted" }, { publish: false });
	const blocked = await call("POST", `/api/v1/admin/assets/${draft.id}/publish`, { token: "su" });
	assert.equal(blocked.data.error.details[0].rule, "processing.done");
	await call("PUT", "/api/v1/admin/settings", { token: "su", body: { require_processing: false } });
	assert.equal((await call("POST", `/api/v1/admin/assets/${draft.id}/publish`, { token: "su" })).status, 200);
	// The stable feed now lists unlisted assets too.
	assert.deepEqual((await call("GET", "/feed/stable/catalog.json")).data.packs.map((p) => p.id), ["hidden-gem"]);
	const audit = (await call("GET", "/api/v1/admin/audit-log?entity_id=library", { token: "su" })).data.data;
	assert.equal(audit.length, 2);
	assert.equal(audit[1].diff.after.device_limits.pro, 5);
});

test("settings: CORS origins apply to the API", own, async (t) => {
	const s = await start(t);
	const preflight = (origin) => fetch(`${s.base}/api/v1/assets`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } });
	assert.equal((await preflight("https://admin.example.com")).headers.get("access-control-allow-origin"), null);
	await s.call("PUT", "/api/v1/admin/settings", { token: "su", body: { cors_origins: ["https://admin.example.com"] } });
	assert.equal((await preflight("https://admin.example.com")).headers.get("access-control-allow-origin"), "https://admin.example.com");
	// CodeIgniter answers a single allowed origin as-is; the browser refuses it for any other origin.
	assert.notEqual((await preflight("https://evil.example.com")).headers.get("access-control-allow-origin"), "https://evil.example.com");
});

test("analytics: overview additions, per-asset stats and search misses", own, async (t) => {
	const { call } = await start(t);
	const warm = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Warm Film" });
	await publishAsset(call, "su", "leak.png", png(1024, 576), { title: "Light Leak" });
	for (let i = 0; i < 2; i++) {
		const g = await call("POST", `/api/v1/assets/${warm.id}/download`, { body: {}, headers: { "X-Device-Id": `dev${i}` } });
		await call("POST", `/api/v1/downloads/${g.data.download_id}/complete`, { body: { status: "installed" } });
	}
	await call("POST", "/api/v1/me/usage", { body: { events: [{ asset_id: warm.id, event: "apply" }, { asset_id: warm.id, event: "preview" }] } });
	const o = (await call("GET", "/api/v1/admin/analytics/overview", { token: "an" })).data;
	assert.deepEqual([o.downloads_30d, o.installs_30d, o.applies_30d, o.active_devices_30d], [2, 2, 1, 2]);
	assert.deepEqual(o.downloads_by_type, { lut: 2 });
	const past = (await call("GET", "/api/v1/admin/analytics/overview?from=2020-01-01&to=2020-01-31", { token: "an" })).data;
	assert.deepEqual([past.downloads_30d, past.downloads_by_type], [0, {}]);
	assert.equal((await call("GET", "/api/v1/admin/analytics/overview?from=soon", { token: "an" })).status, 422);

	const a = (await call("GET", `/api/v1/admin/analytics/assets/${warm.id}`, { token: "an" })).data;
	assert.deepEqual(Object.values(a.downloads_by_day), [2]);
	assert.deepEqual([a.installs, a.applies, a.favorites, a.versions], [2, 1, 0, [{ version: "1.0.0", downloads: 2 }]]);
	assert.equal((await call("GET", `/api/v1/admin/analytics/assets/${warm.id}`, { token: "ed" })).status, 403);
	assert.equal((await call("GET", `/api/v1/admin/analytics/assets/${warm.id}`, { token: "wk" })).status, 403);

	for (const q of ["warm", "Glitch", "glitch ", "warm", "zzz"]) await call("GET", `/api/v1/assets?q=${encodeURIComponent(q)}`);
	await call("GET", "/api/v1/assets?q=glitch&cursor=50");
	const sa = (await call("GET", "/api/v1/admin/analytics/search", { token: "an" })).data;
	// Ties: most recent first ("warm" was searched last).
	assert.deepEqual(sa.top, [{ term: "warm", count: 2 }, { term: "glitch", count: 2 }, { term: "zzz", count: 1 }]);
	assert.deepEqual(sa.misses.map((m) => [m.term, m.count]), [["glitch", 2], ["zzz", 1]]);
	assert.ok(sa.misses[0].last_at);
	assert.equal((await call("GET", "/api/v1/admin/analytics/search", { token: "ed" })).status, 403);
});

test("webhooks: signed deliveries from the queue, retries, ping and admin CRUD", own, async (t) => {
	const receiver = await listen(t, (req, n) => (n === 2 ? 500 : 200));
	const s = await start(t, { LIBRARY_WEBHOOKS_ALLOW_PRIVATE: "1", LIBRARY_WEBHOOKS_BACKOFF: "0,0" });
	const { call } = s;
	assert.equal((await call("GET", "/api/v1/admin/webhooks", { token: "mg" })).status, 403);
	assert.equal((await call("POST", "/api/v1/admin/webhooks", { token: "su", body: { url: "gopher://x", events: ["asset.published"] } })).data.error.details[0].rule, "webhook.url");
	assert.equal((await call("POST", "/api/v1/admin/webhooks", { token: "su", body: { url: receiver.url, events: ["asset.exploded"] } })).data.error.details[0].rule, "webhook.events");
	const hook = await call("POST", "/api/v1/admin/webhooks", { token: "su", body: { url: `${receiver.url}/hook`, events: ["asset.published", "version.published", "asset.unpublished"] } });
	assert.equal(hook.status, 201);
	const secret = hook.data.secret;
	assert.match(secret, /^whsec_[0-9a-f]{48}$/);
	const listed = (await call("GET", "/api/v1/admin/webhooks", { token: "su" })).data.data;
	assert.equal(listed.length, 1);
	assert.equal(listed[0].secret, undefined);

	const verifyReq = (r) => {
		assert.equal(r.method, "POST");
		assert.equal(r.headers["content-type"], "application/json");
		assert.equal(r.headers["x-library-signature"], `sha256=${crypto.createHmac("sha256", secret).update(r.raw).digest("hex")}`);
		const body = JSON.parse(r.raw);
		assert.equal(body.id, r.headers["x-library-delivery"]);
		assert.equal(body.event, r.headers["x-library-event"]);
		return body;
	};

	const ping = await call("POST", `/api/v1/admin/webhooks/${hook.data.id}/test`, { token: "su" });
	assert.equal(ping.data.ok, true, JSON.stringify(ping.data));
	assert.equal(verifyReq(receiver.got[0]).event, "ping");

	// Publishing queues; nothing is sent until the queue runs.
	const a = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Warm Film" });
	assert.equal(receiver.got.length, 1);
	const out1 = await s.spark("library:webhooks");
	assert.match(out1, /2 delivery attempt/);
	// The receiver failed the first of them (HTTP 500): it's retried on the next run.
	assert.equal(receiver.got.length, 3);
	await s.spark("library:webhooks");
	assert.equal(receiver.got.length, 4);
	assert.match(await s.spark("library:webhooks"), /0 delivery attempt/);
	const bodies = receiver.got.slice(1).map(verifyReq);
	assert.deepEqual(bodies.map((b) => b.event).sort(), ["asset.published", "asset.published", "version.published"]);
	const pub = bodies.find((b) => b.event === "asset.published");
	assert.equal(pub.data.asset.slug, "warm-film");
	assert.equal(pub.data.version, "1.0.0");
	assert.equal(pub.data.asset.checksum_sha256.length, 64);
	assert.ok(pub.created_at);
	// The retry resends the same delivery: same id, body and signature.
	assert.equal(receiver.got[1].raw, receiver.got[3].raw);

	const deliveries = (await call("GET", `/api/v1/admin/webhooks/${hook.data.id}/deliveries`, { token: "su" })).data.data;
	assert.deepEqual(deliveries.map((d) => [d.event, d.ok]).sort(), [["asset.published", true], ["ping", true], ["version.published", true]]);
	assert.equal(deliveries.find((d) => d.event === "asset.published").attempt, 2);
	for (const k of ["id", "event", "status_code", "ok", "attempt", "error", "created_at"]) assert.ok(k in deliveries[0], k);

	// Inactive hooks get nothing; events they don't subscribe to aren't queued.
	await call("POST", `/api/v1/admin/assets/${a.id}/deprecate`, { token: "su", body: {} });
	assert.equal((await call("PATCH", `/api/v1/admin/webhooks/${hook.data.id}`, { token: "su", body: { active: false, events: ["asset.deprecated"] } })).data.active, false);
	await call("PATCH", `/api/v1/admin/assets/${a.id}`, { token: "su", body: { description: "x" } });
	await s.spark("library:webhooks");
	assert.equal(receiver.got.length, 4);
	const actions = (await call("GET", `/api/v1/admin/audit-log?entity_id=${hook.data.id}`, { token: "su" })).data.data.map((e) => e.action);
	assert.deepEqual(actions, ["webhook.update", "webhook.test", "webhook.create"]);
	assert.equal((await call("DELETE", `/api/v1/admin/webhooks/${hook.data.id}`, { token: "su" })).status, 204);
	assert.equal((await call("GET", `/api/v1/admin/webhooks/${hook.data.id}/deliveries`, { token: "su" })).status, 404);
});

test("webhooks refuse private and loopback targets by default", own, async (t) => {
	const receiver = await listen(t);
	const s = await start(t);
	const hook = await s.call("POST", "/api/v1/admin/webhooks", { token: "su", body: { url: `${receiver.url}/hook`, events: ["asset.published"] } });
	const ping = await s.call("POST", `/api/v1/admin/webhooks/${hook.data.id}/test`, { token: "su" });
	assert.equal(ping.data.ok, false);
	assert.equal(ping.data.status_code, null);
	assert.match(ping.data.error, /private or reserved address/);
	await publishAsset(s.call, "su", "warm.cube", cube(17), { title: "Warm Film" });
	await s.spark("library:webhooks");
	assert.equal(receiver.got.length, 0);
	const d = (await s.call("GET", `/api/v1/admin/webhooks/${hook.data.id}/deliveries`, { token: "su" })).data.data;
	assert.deepEqual(d.map((x) => [x.event, x.ok, x.attempt]), [["asset.published", false, 1], ["ping", false, 1]]);
});

test("admin preview route serves draft previews with Range and ETag", own, async (t) => {
	const { call, base } = await start(t);
	const a = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Warm Film" }, { publish: false });
	const claim = await call("POST", "/api/v1/worker/jobs/claim", { token: "wk" });
	const bytes = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8 "), crypto.randomBytes(200)]);
	assert.equal((await call("PUT", `/api/v1/worker/jobs/${claim.data.job.id}/previews/thumbnail?ext=webp`, { token: "wk", raw: bytes })).status, 200);
	await call("POST", `/api/v1/worker/jobs/${claim.data.job.id}/complete`, { token: "wk", body: { ok: true, checks: [] } });
	const p = `/api/v1/admin/assets/${a.id}/versions/1.0.0/previews/thumbnail.webp`;
	assert.equal((await fetch(base + p)).status, 401);
	const full = await fetch(base + p, { headers: { Authorization: "Bearer ed" } });
	assert.equal(full.status, 200);
	assert.equal(full.headers.get("content-type"), "image/webp");
	assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
	const etag = full.headers.get("etag");
	assert.ok(etag);
	assert.equal((await fetch(base + p, { headers: { Authorization: "Bearer ed", "If-None-Match": etag } })).status, 304);
	const part = await fetch(base + p, { headers: { Authorization: "Bearer ed", Range: "bytes=0-3" } });
	assert.equal(part.status, 206);
	assert.equal(Buffer.from(await part.arrayBuffer()).toString(), "RIFF");
	assert.equal((await fetch(`${base}/api/v1/admin/assets/${a.id}/versions/1.0.0/previews/hover.mp4`, { headers: { Authorization: "Bearer ed" } })).status, 404);
	// Not public while it's a draft.
	assert.equal((await fetch(`${base}/previews/${a.id}/1.0.0/thumbnail.webp`)).status, 404);
});

/** A small stand-in for Meilisearch: documents, synonyms and a typo-tolerant-ish prefix search. */
async function fakeMeili(t) {
	const docs = new Map();
	let synonyms = {};
	const log = [];
	const server = http.createServer((req, res) => {
		let raw = "";
		req.on("data", (c) => (raw += c));
		req.on("end", () => {
			const body = raw ? JSON.parse(raw) : null;
			log.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
			const u = new URL(req.url, "http://x");
			let out = { taskUid: log.length };
			if (u.pathname.endsWith("/documents") && req.method === "POST") for (const d of body) docs.set(d.id, d);
			else if (/\/documents\/[^/]+$/.test(u.pathname) && req.method === "DELETE") docs.delete(decodeURIComponent(u.pathname.split("/").pop()));
			else if (u.pathname.endsWith("/settings/synonyms") && req.method === "GET") out = synonyms;
			else if (u.pathname.endsWith("/settings/synonyms") && req.method === "PUT") synonyms = body;
			else if (u.pathname.endsWith("/search")) {
				const words = [body.q.toLowerCase(), ...(synonyms[body.q.toLowerCase()] ?? [])];
				const hit = (d) => words.some((w) => JSON.stringify(d).toLowerCase().includes(w.slice(0, 4)));
				out = { hits: [...docs.values()].filter(hit).map((d) => ({ id: d.id })) };
			}
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify(out));
		});
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	t.after(() => server.close());
	return { url: `http://127.0.0.1:${server.address().port}`, docs, log, synonyms: () => synonyms };
}

test("search: Meilisearch when MEILI_URL is set (indexing on publish/update/unpublish), SQL otherwise", own, async (t) => {
	const meili = await fakeMeili(t);
	const s = await start(t, { MEILI_URL: meili.url, MEILI_KEY: "master-key" });
	const { call } = s;
	const a = await publishAsset(call, "su", "kandy.cube", cube(17), { title: "Kandy Golden Hour", tags: ["warm"], keywords: ["උණුසුම්"] });
	assert.deepEqual([...meili.docs.keys()], [a.id]);
	assert.deepEqual(meili.docs.get(a.id), { id: a.id, title: "Kandy Golden Hour", slug: "kandy-golden-hour", tags: ["warm"], keywords: ["උණුසුම්"], category: "Cinematic", category_id: a.category_id, author: "", type: "lut", tier: "free" });
	assert.ok(meili.log.every((r) => r.auth === "Bearer master-key"));
	assert.deepEqual(meili.synonyms()["උණුසුම්"], ["warm"]);
	// "kandi" only matches through the index (typo tolerance), and the Sinhala keyword through synonyms.
	assert.equal((await call("GET", "/api/v1/assets?q=kandi")).data.total, 1);
	await call("PATCH", `/api/v1/admin/assets/${a.id}`, { token: "su", body: { title: "Kandy Sunset" } });
	assert.equal(meili.docs.get(a.id).title, "Kandy Sunset");
	await call("POST", `/api/v1/admin/assets/${a.id}/unpublish`, { token: "su", body: {} });
	assert.equal(meili.docs.size, 0);
	assert.equal((await call("GET", "/api/v1/assets?q=kandi")).data.total, 0);
	assert.equal((await call("GET", "/api/v1/admin/analytics/search", { token: "su" })).data.misses[0].term, "kandi");
	await call("POST", `/api/v1/admin/assets/${a.id}/publish`, { token: "su" });
	assert.equal(meili.docs.size, 1);
	assert.match(await s.spark("library:reindex"), /1 live asset/);

	// Index down: SQL search answers.
	const sql = await start(t, { MEILI_URL: "http://127.0.0.1:9" });
	await publishAsset(sql.call, "su", "kandy.cube", cube(17), { title: "Kandy Golden Hour" });
	assert.equal((await sql.call("GET", "/api/v1/assets?q=kandy")).data.total, 1);
	assert.equal((await sql.call("GET", "/api/v1/assets?q=kandi")).data.total, 0);
});
