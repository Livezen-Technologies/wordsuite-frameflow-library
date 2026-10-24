import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import crypto from "node:crypto";
import { parseCube, svgProblems, lottieInfo, detectType, uploadChecks, publishProblems, tagsByScript } from "../packages/asset-schema/index.js";
import { caller, startTarget, target, tmp } from "./harness.js";
import { cube, lottie, png } from "./fixtures.js";
import { startIssuer } from "./oidc.js";

/** Ed25519 detached signature (base64) of `text` under a PEM public key. */
const verify = (text, sigB64, publicPem) => crypto.verify(null, Buffer.from(text), crypto.createPublicKey(publicPem), Buffer.from(String(sigB64).trim(), "base64"));

// ---------- schema ----------

test("LUT validation: size, rows and range", () => {
	assert.equal(parseCube(cube(17)).lut_size, 17);
	assert.throws(() => parseCube("LUT_3D_SIZE 32\n"), (e) => e.details[0].rule === "lut.size" && e.details[0].value === 32 && e.message === "LUT size must be 17, 33 or 65.");
	assert.throws(() => parseCube(cube(17).replace("1.0000 1.0000 1.0000", "1.5 1 1")), (e) => e.details[0].rule === "lut.range");
});

test("preset types must match what FrameFlow can apply", async () => {
	const { validateFile } = await import("../packages/asset-schema/index.js");
	const j = (o) => Buffer.from(JSON.stringify(o));
	assert.equal(validateFile({ type: "transition", filename: "a.ffx", buf: j({ value: { type: "wipe" } }) }).meta.render_engine, "wipe");
	assert.throws(() => validateFile({ type: "transition", filename: "a.ffx", buf: j({ value: { type: "melt" } }) }), (e) => e.details[0].rule === "transition.type");
	assert.throws(() => validateFile({ type: "filter", filename: "a.ffx", buf: j({ name: "x" }) }), (e) => e.details[0].rule === "filter.grade");
	assert.throws(() => validateFile({ type: "text_template", filename: "a.json", buf: j({ placeholders: [] }) }), (e) => e.details[0].rule === "text.params");
	assert.equal(validateFile({ type: "video_template", filename: "a.fftemplate", buf: j({ aspect: { width: 1920, height: 1080 }, layers: [{ kind: "media", slot: 0, start: 0, duration: 4 }] }) }).meta.total_duration_ms, 4000);
});

test("SVG and Lottie safety", () => {
	assert.deepEqual(svgProblems('<svg><rect fill="#fff"/></svg>'), []);
	const rules = svgProblems('<svg onload="x()"><script>1</script><image href="https://x/y.png"/><foreignObject/></svg>').map((p) => p.rule);
	assert.deepEqual(rules.sort(), ["svg.event_handler", "svg.external_ref", "svg.foreignObject", "svg.script"]);
	assert.equal(lottieInfo(lottie).duration_ms, 2000);
	assert.throws(() => lottieInfo({ ...lottie, layers: [{ ks: { p: { x: "time*2" } } }] }), (e) => e.details[0].rule === "lottie.expressions");
	assert.throws(() => lottieInfo({ ...lottie, assets: [{ id: "i", p: "img.png", u: "images/" }] }), (e) => e.details[0].rule === "lottie.external_image");
	assert.throws(() => lottieInfo({ ...lottie, op: 900 }), (e) => e.details[0].rule === "lottie.frames");
});

test("upload gate: extension, magic bytes, type detection", () => {
	assert.equal(detectType("a.cube", Buffer.from(cube())), "lut");
	assert.equal(detectType("a.json", Buffer.from(JSON.stringify(lottie))), "lottie");
	const bad = uploadChecks({ filename: "fake.png", type: "graphic", buf: Buffer.from("not a png") });
	assert.equal(bad.find((c) => c.check === "magic_bytes").passed, false);
	assert.ok(uploadChecks({ filename: "a.png", type: "graphic", buf: png(600, 600) }).every((c) => c.passed));
});

test("tags split by script for FrameFlow search", () => {
	assert.deepEqual(tagsByScript(["warm", "උණුසුම්", "சூடான"]), { en: ["warm"], si: ["උණුසුම්"], ta: ["சூடான"] });
});

test("publish gate lists every blocker", () => {
	const rules = publishProblems({ status: "draft", visibility: "internal", versions: [{ version: "1.0.0", checks: [{ passed: false }] }], current_version: "1.0.0" }).map((p) => p.rule);
	for (const r of ["status.approved", "thumbnail.required", "category.required", "min_app_version.required", "licence.complete", "checks.passed", "audience.rule"]) assert.ok(rules.includes(r), r);
});

// ---------- API ----------

// A fresh CodeIgniter backend per test (tests/harness.js).
async function start() {
	const tokens = "su:super_admin:u1,ed:content_editor:u2,rv:reviewer:u3,mg:library_manager:u4";
	const { server, base, dataDir } = await startTarget({ tokens });
	const call = caller(base);
	const upload = (token, filename, buf) => call("POST", "/api/v1/admin/uploads", { token, raw: buf, headers: { "X-Filename": encodeURIComponent(filename) } });
	return { server, base, call, upload, dataDir };
}

test("workflow: upload → draft → review → approve → publish → feed → sync, with RBAC and audit", async (t) => {
	const s = await start();
	t.after(() => s.server.close());
	const { call, upload } = s;

	assert.equal((await call("GET", "/api/v1/admin/assets")).status, 401);
	const up = await upload("ed", "kandy_golden_hour.cube", Buffer.from(cube(17)));
	assert.equal(up.status, 201);
	assert.equal(up.data.type, "lut");
	assert.ok(up.data.checks.every((c) => c.passed), JSON.stringify(up.data.checks));
	const thumb = await upload("ed", "thumb.png", png(640, 360));
	const created = await call("POST", "/api/v1/admin/assets", { token: "ed", body: { upload_id: up.data.id, thumbnail_upload_id: thumb.data.id, title: "Kandy Golden Hour", tags: ["Warm", "sunset", "warm"], keywords: ["උණුසුම්"], licence_tier: "pro" } });
	assert.equal(created.status, 201, JSON.stringify(created.data));
	const id = created.data.id;
	assert.equal(created.data.slug, "kandy-golden-hour");
	assert.deepEqual(created.data.tags, ["warm", "sunset"]);
	assert.equal(created.data.meta.lut_size, 17);

	// The editor can't publish; publishing before approval is blocked with the exact rule.
	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/publish`, { token: "ed" })).status, 403);
	const blocked = await call("POST", `/api/v1/admin/assets/${id}/publish`, { token: "mg" });
	assert.equal(blocked.status, 422);
	assert.equal(blocked.data.error.code, "PUBLISH_BLOCKED");
	assert.equal(blocked.data.error.details[0].rule, "status.approved");

	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/submit-review`, { token: "ed" })).data.status, "ready_for_review");
	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/reject`, { token: "rv", body: {} })).status, 422);
	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/approve`, { token: "rv" })).data.status, "approved");
	const pub = await call("POST", `/api/v1/admin/assets/${id}/publish`, { token: "mg" });
	assert.equal(pub.status, 200, JSON.stringify(pub.data));
	assert.equal(pub.data.status, "published");

	// Feed: signed, FrameFlow schema.
	const cat = await call("GET", "/feed/stable/catalog.json");
	const sig = await call("GET", "/feed/stable/catalog.json.sig");
	const key = await call("GET", "/feed/public-key.pem");
	const text = await (await fetch(`${s.base}/feed/stable/catalog.json`)).text();
	assert.ok(verify(text, sig.data, key.data));
	assert.equal(cat.data.schema, 1);
	assert.equal(cat.data.packs[0].id, "kandy-golden-hour");
	assert.equal(cat.data.packs[0].type, "luts");
	assert.equal(cat.data.packs[0].plan, "pro");
	assert.deepEqual(cat.data.packs[0].tags.si, ["උණුසුම්"]);
	assert.equal((await call("GET", "/feed/stable/catalog.json", { headers: { "If-None-Match": cat.headers.get("etag") } })).status, 304);

	// Range download of the pack.
	// Pro pack: signed out is refused; a Pro plan (X-Plan in dev mode) gets it.
	assert.equal((await fetch(`${s.base}/feed/stable/${cat.data.packs[0].files}`)).status, 401);
	const ranged = await fetch(`${s.base}/feed/stable/${cat.data.packs[0].files}`, { headers: { Range: "bytes=10-", "X-Plan": "pro" } });
	assert.equal(ranged.status, 206);
	assert.equal((await ranged.arrayBuffer()).byteLength, cat.data.packs[0].sizeBytes - 10);

	// Client API: search, entitlement, download grant.
	const found = await call("GET", "/api/v1/assets?q=kandy");
	assert.equal(found.data.total, 1);
	assert.equal((await call("GET", "/api/v1/assets?q=glitch")).data.total, 0);
	assert.equal((await call("POST", `/api/v1/assets/${id}/download`, { body: {} })).status, 403);
	const grant = await call("POST", `/api/v1/assets/${id}/download`, { body: { device_id: "dev1" }, headers: { "X-Plan": "pro" } });
	assert.equal(grant.data.sha256, cat.data.packs[0].sha256);
	assert.equal((await call("POST", `/api/v1/downloads/${grant.data.download_id}/complete`, { body: { status: "installed" } })).data.status, "installed");

	// New version, sync delta, unpublish.
	const up2 = await upload("ed", "kandy_v2.cube", Buffer.from(cube(33)));
	const v2 = await call("POST", `/api/v1/admin/assets/${id}/versions`, { token: "ed", body: { upload_id: up2.data.id, changelog: "33³" } });
	assert.equal(v2.data.current_version, "1.1.0");
	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/publish`, { token: "mg" })).data.published_version, "1.1.0");
	const sync = await call("GET", "/api/v1/sync?since=0");
	assert.deepEqual(sync.data.events.map((e) => [e.op, e.version, e.update_available]), [["upsert", "1.0.0", false], ["upsert", "1.1.0", true]]);
	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/versions/1.0.0/rollback`, { token: "mg" })).data.published_version, "1.0.0");
	assert.equal((await call("POST", `/api/v1/admin/assets/${id}/unpublish`, { token: "mg", body: { reason: "licence_expired" } })).data.status, "draft");
	assert.equal((await call("GET", "/feed/stable/catalog.json")).data.packs.length, 0);
	assert.equal((await call("GET", `/api/v1/sync?since=${sync.data.next_cursor}`)).data.events.at(-1).op, "unpublish");

	// Every mutation is in the audit log with before/after.
	const log = (await call("GET", `/api/v1/admin/audit-log?entity_id=${id}`, { token: "su" })).data.data;
	assert.deepEqual(new Set(log.map((e) => e.action)), new Set(["asset.create", "asset.submit_review", "asset.approve", "asset.publish", "version.create", "version.rollback", "asset.unpublish"]));
	assert.deepEqual(log.find((e) => e.action === "asset.approve").diff, { before: { status: "ready_for_review" }, after: { status: "approved", review: log.find((e) => e.action === "asset.approve").diff.after.review } });
});

test("validation failures are blocking and explain the rule", async (t) => {
	const s = await start();
	t.after(() => s.server.close());
	const up = await s.upload("su", "bad.cube", Buffer.from("LUT_3D_SIZE 32\n"));
	const failed = up.data.checks.find((c) => !c.passed);
	assert.equal(failed.detail.rule, "lut.size");
	assert.equal(failed.detail.value, 32);
	const created = await s.call("POST", "/api/v1/admin/assets", { token: "su", body: { upload_id: up.data.id, title: "Bad LUT" } });
	assert.equal(created.data.status, "failed");
	const res = await s.call("POST", `/api/v1/admin/assets/${created.data.id}/publish`, { token: "su" });
	assert.ok(res.data.error.details.some((d) => d.rule === "checks.passed"));
});

// ---------- end to end with the FrameFlow desktop asset store ----------

const FRAMEFLOW = process.env.FRAMEFLOW_DIR || path.resolve(import.meta.dirname, "..", "..", "worksuite-frameflow");
const storeFile = path.join(FRAMEFLOW, "electron", "asset-store.js");

test("FrameFlow installs a published Lottie and LUT from this server", { skip: !fs.existsSync(storeFile) && "worksuite-frameflow checkout not found (set FRAMEFLOW_DIR)" }, async (t) => {
	const s = await start();
	t.after(() => s.server.close());
	const publishOne = async (filename, buf, body) => {
		const up = await s.upload("su", filename, buf);
		const thumb = await s.upload("su", `${filename}.png`, png(640, 360));
		const a = await s.call("POST", "/api/v1/admin/assets", { token: "su", body: { upload_id: up.data.id, thumbnail_upload_id: thumb.data.id, ...body } });
		const p = await s.call("POST", `/api/v1/admin/assets/${a.data.id}/publish`, { token: "su" });
		assert.equal(p.data.status, "published", JSON.stringify(p.data));
		return a.data;
	};
	await publishOne("like_burst.json", Buffer.from(JSON.stringify(lottie)), { title: "Like Burst", tags: ["like"] });
	await publishOne("warm.cube", Buffer.from(cube(17)), { title: "Warm Film" });
	await publishOne("leak.png", png(1024, 576), { title: "Light Leak Overlay" });
	await publishOne("glitch.ffx", Buffer.from(JSON.stringify({ name: "Glitch Push", value: { type: "push", duration: 0.4 } })), { type: "transition", title: "Glitch Push" });

	const require = createRequire(import.meta.url);
	const { createAssetStore } = require(storeFile);
	const publicKey = (await s.call("GET", "/feed/public-key.pem")).data;
	const root = tmp();
	const store = createAssetStore({ root, assetBase: `${s.base}/feed`, publicKey, appVersion: "9.9.9" });
	const state = await store.refreshCatalog();
	assert.equal(state.catalogStatus.state, "ready", state.catalogStatus.error);
	assert.deepEqual(state.catalog.packs.map((p) => [p.id, p.type]), [["glitch-push", "transitions"], ["light-leak-overlay", "graphics"], ["like-burst", "motion"], ["warm-film", "luts"]]);
	await store.install("like-burst");
	await store.install("warm-film");
	await store.install("light-leak-overlay");
	assert.equal(store.getState().installed["light-leak-overlay"].type, "graphics");
	await store.install("glitch-push");
	// The transitions panel reads the item's file as { name, value: ClipTransition }.
	const fxIndex = JSON.parse(fs.readFileSync(path.join(root, "glitch-push", "1.0.0", "index.json"), "utf8"));
	const preset = JSON.parse(fs.readFileSync(path.join(root, "glitch-push", "1.0.0", fxIndex.items[0].file), "utf8"));
	assert.equal(preset.value.type, "push");
	const installed = store.getState().installed;
	assert.equal(installed["like-burst"].version, "1.0.0");
	// The Lottie lands where FrameFlow's Animations library looks: <path>/<id>.json + thumbnail.png.
	const motionIndex = JSON.parse(fs.readFileSync(path.join(root, "like-burst", "1.0.0", "index.json"), "utf8"));
	assert.equal(motionIndex.assets[0].path, "like-burst");
	assert.ok(fs.existsSync(path.join(root, "like-burst", "1.0.0", "like-burst", "like-burst.json")));
	assert.ok(fs.existsSync(path.join(root, "like-burst", "1.0.0", "like-burst", "thumbnail.png")));
	const lutIndex = JSON.parse(fs.readFileSync(path.join(root, "warm-film", "1.0.0", "index.json"), "utf8"));
	assert.equal(lutIndex.items[0].lut_size, 17);
	assert.ok(fs.existsSync(path.join(root, "warm-film", "1.0.0", lutIndex.items[0].file)));
});

test("JS SDK talks to the API", async (t) => {
	const { createLibraryClient } = await import("../packages/sdk-js/index.js");
	const s = await start();
	t.after(() => s.server.close());
	const up = await s.upload("su", "warm.cube", Buffer.from(cube(17)));
	const thumb = await s.upload("su", "t.png", png(640, 360));
	const a = (await s.call("POST", "/api/v1/admin/assets", { token: "su", body: { upload_id: up.data.id, thumbnail_upload_id: thumb.data.id, title: "Warm Film" } })).data;
	await s.call("POST", `/api/v1/admin/assets/${a.id}/publish`, { token: "su" });
	const client = createLibraryClient({ baseUrl: s.base, appVersion: "2.0.0", deviceId: "d1" });
	assert.equal((await client.types()).find((x) => x.key === "lut").count, 1);
	assert.equal((await client.search({ q: "warm" })).data[0].pack_id, "warm-film");
	const grant = await client.requestDownload(a.id);
	assert.ok(grant.url.startsWith(s.base));
	assert.equal((await fetch(grant.url)).status, 200);
	assert.equal((await client.sync()).events.length, 1);
	await assert.rejects(client.asset("nope"), (e) => e.status === 404 && e.code === "NOT_FOUND");
});

test("OIDC: verified tokens carry plan and admin role; Pro packs need the plan", { skip: target === "external" && "starts its own backend" }, async (t) => {
	const { issuer, jwt } = await startIssuer(t);
	const { server, base } = await startTarget({ tokens: "", env: { LIBRARY_OIDC_ISSUER: issuer } });
	t.after(() => server.close());
	const as = (token, p, init = {}) => fetch(base + p, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

	const admin = jwt({ sub: "u-admin", library_roles: ["super_admin"], plan: "enterprise" });
	const user = jwt({ sub: "u-free", plan: "free" });
	const pro = jwt({ sub: "u-pro", plan: "pro" });
	const forged = jwt({ sub: "u-x", library_roles: ["super_admin"] }, crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);
	const expired = jwt({ sub: "u-admin", library_roles: ["super_admin"], exp: 1 });

	assert.equal((await as(user, "/api/v1/admin/assets")).status, 403);
	assert.equal((await as(forged, "/api/v1/admin/assets")).status, 401);
	assert.equal((await as(expired, "/api/v1/admin/assets")).status, 401);
	assert.equal((await as(admin, "/api/v1/admin/me")).status, 200);

	const up = await (await as(admin, "/api/v1/admin/uploads", { method: "POST", body: cube(17), headers: { "X-Filename": "w.cube" } })).json();
	const thumb = await (await as(admin, "/api/v1/admin/uploads", { method: "POST", body: png(640, 360), headers: { "X-Filename": "t.png" } })).json();
	const a = await (await as(admin, "/api/v1/admin/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: up.id, thumbnail_upload_id: thumb.id, title: "Pro Warm", licence_tier: "pro" }) })).json();
	assert.equal((await as(admin, `/api/v1/admin/assets/${a.id}/publish`, { method: "POST" })).status, 200);

	const zip = (await (await fetch(`${base}/feed/stable/catalog.json`)).json()).packs[0].files;
	// X-Plan is ignored once OIDC is configured.
	assert.equal((await fetch(`${base}/feed/stable/${zip}`, { headers: { "X-Plan": "pro" } })).status, 401);
	assert.equal((await as(user, `/feed/stable/${zip}`)).status, 403);
	assert.equal((await as(pro, `/feed/stable/${zip}`)).status, 200);
	// Download grants need a registered device of the caller.
	const noDevice = await as(pro, `/api/v1/assets/${a.id}/download`, { method: "POST" });
	assert.equal(noDevice.status, 403);
	assert.equal((await noDevice.json()).error.code, "DEVICE_REQUIRED");
	const device = await (await as(pro, "/api/v1/devices/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint_hash: "sha256-pro-laptop", os: "macos", app_version: "2.1.0" }) })).json();
	// A grant's signed URL works without the token (e.g. handed to a download manager).
	const grant = await (await as(pro, `/api/v1/assets/${a.id}/download`, { method: "POST", headers: { "X-Device-Id": device.id } })).json();
	assert.equal((await fetch(base + grant.url)).status, 200);
	assert.equal((await as(user, `/api/v1/assets/${a.id}/download`, { method: "POST", headers: { "X-Device-Id": device.id } })).status, 403);
});
