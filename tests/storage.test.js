// Storage backends: S3/R2 blobs against s3rver (an S3 API emulator; it
// doesn't verify SigV4, so signatures are checked against the AWS SDK's
// signer separately) and PostgreSQL state against a real server. The PostgreSQL
// tests run when LIBRARY_TEST_DATABASE_URL points at an empty database
// they may write to; CI provides one as a service container.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createServer, parseTokens } from "../apps/api/src/server.js";
import { createFileBlobs, createPostgresState, createS3Blobs } from "../apps/api/src/storage.js";
import { startPhp, target } from "./harness.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fflib-store-"));
const PG = process.env.LIBRARY_TEST_DATABASE_URL;

async function startS3() {
	const { default: S3rver } = await import("s3rver");
	const s3 = new S3rver({ port: 0, address: "127.0.0.1", silent: true, directory: tmp(), configureBuckets: [{ name: "library" }] });
	const { port } = await s3.run();
	const creds = { endpoint: `http://127.0.0.1:${port}`, bucket: "library", accessKeyId: "S3RVER", secretAccessKey: "S3RVER", region: "us-east-1" };
	return { s3, creds };
}

async function readAll(stream) {
	const chunks = [];
	for await (const c of stream) chunks.push(c);
	return Buffer.concat(chunks);
}

test("S3/R2 blobs: put, head, get, ranged stream, missing keys", async (t) => {
	const { s3, creds } = await startS3();
	t.after(() => s3.close());
	const blobs = createS3Blobs({ ...creds, prefix: "test" });
	const data = Buffer.from("0123456789".repeat(100));
	assert.equal(await blobs.has("packages/a b+c.zip"), false);
	await blobs.put("packages/a b+c.zip", data, "application/zip");
	assert.equal(await blobs.has("packages/a b+c.zip"), true);
	assert.equal((await blobs.head("packages/a b+c.zip")).size, 1000);
	assert.deepEqual(await blobs.get("packages/a b+c.zip"), data);
	assert.equal((await readAll(await blobs.stream("packages/a b+c.zip", { start: 10, end: 19 }))).toString(), "0123456789");
	assert.equal(await blobs.get("nope"), null);
	assert.equal(await blobs.head("nope"), null);
});

test("file blobs refuse keys outside their folder", async () => {
	const blobs = createFileBlobs(tmp());
	await assert.rejects(blobs.put("../escape", Buffer.from("x")), /Bad blob key/);
});

/** Publishes one LUT through the API and returns what FrameFlow would see. */
async function publishLut({ blobs, state, dataDir = tmp() }) {
	const { server, lib } = await createServer({ dataDir, blobs, state, tokens: parseTokens("su:super_admin:u1") });
	await new Promise((r) => server.listen(0, r));
	const base = `http://127.0.0.1:${server.address().port}`;
	const as = (p, init = {}) => fetch(base + p, { ...init, headers: { Authorization: "Bearer su", ...(init.headers ?? {}) } });
	const rows = [];
	for (let b = 0; b < 17; b++) for (let g = 0; g < 17; g++) for (let r = 0; r < 17; r++) rows.push(`${r / 16} ${g / 16} ${b / 16}`);
	const up = await (await as("/api/v1/admin/uploads", { method: "POST", body: `LUT_3D_SIZE 17\n${rows.join("\n")}\n`, headers: { "X-Filename": "warm.cube" } })).json();
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
	const thumb = await (await as("/api/v1/admin/uploads", { method: "POST", body: png, headers: { "X-Filename": "t.png" } })).json();
	const a = await (await as("/api/v1/admin/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: up.id, thumbnail_upload_id: thumb.id, title: "Warm Film" }) })).json();
	assert.equal((await as(`/api/v1/admin/assets/${a.id}/publish`, { method: "POST" })).status, 200);
	const catalog = await (await fetch(`${base}/feed/stable/catalog.json`)).json();
	const zip = await fetch(`${base}/feed/stable/${catalog.packs[0].files}`, { headers: { Range: "bytes=0-3" } });
	const key = await (await fetch(`${base}/feed/public-key.pem`)).text();
	server.close();
	await lib.close();
	return { catalog, zipStatus: zip.status, zipHead: Buffer.from(await zip.arrayBuffer()), key, assetId: a.id };
}

test("the API runs on S3/R2 blobs: packages are stored in the bucket and served with ranges", async (t) => {
	const { s3, creds } = await startS3();
	t.after(() => s3.close());
	const blobs = createS3Blobs(creds);
	const dataDir = tmp();
	const out = await publishLut({ blobs, dataDir });
	assert.equal(out.zipStatus, 206);
	assert.equal(out.zipHead.readUInt32LE(0), 0x04034b50);
	assert.equal((await blobs.head(`packages/${out.catalog.packs[0].files.split("/").pop()}`)).size, out.catalog.packs[0].sizeBytes);
	// Nothing but the state file is written locally.
	assert.deepEqual(fs.readdirSync(dataDir), ["library.json"]);
});

test("PostgreSQL state: records survive a restart, only changes are written, one writer at a time", { skip: !PG && "set LIBRARY_TEST_DATABASE_URL" }, async () => {
	const pg = (await import("pg")).default;
	const admin = new pg.Client({ connectionString: PG });
	await admin.connect();
	await admin.query("drop table if exists library_records, library_meta");
	await admin.end();

	const blobs = createFileBlobs(tmp());
	const first = await publishLut({ blobs, state: await createPostgresState(PG) });

	// Rows, not one blob: one per asset, category, upload, sync event, audit entry.
	const check = new pg.Client({ connectionString: PG });
	await check.connect();
	const counts = Object.fromEntries((await check.query("select collection, count(*)::int as n from library_records group by collection")).rows.map((r) => [r.collection, r.n]));
	assert.equal(counts.assets, 1);
	assert.equal(counts.uploads, 2);
	assert.equal(counts.sync_events, 1);
	assert.ok(counts.categories > 10);
	assert.ok(counts.audit_log >= 2);
	const stamp = (await check.query("select updated_at from library_records where collection = 'categories' limit 1")).rows[0].updated_at;

	// A second instance can't take the writer lock while the first holds it.
	const holder = await createPostgresState(PG);
	await assert.rejects(createPostgresState(PG), /writer lock/);
	await holder.close();

	// Restart: the same asset, catalog and signing key come back.
	const state = await createPostgresState(PG);
	const { server, lib } = await createServer({ dataDir: tmp(), blobs, state, tokens: parseTokens("su:super_admin:u1") });
	await new Promise((r) => server.listen(0, r));
	const base = `http://127.0.0.1:${server.address().port}`;
	assert.deepEqual((await (await fetch(`${base}/feed/stable/catalog.json`)).json()).packs, first.catalog.packs);
	assert.equal(await (await fetch(`${base}/feed/public-key.pem`)).text(), first.key);
	const asset = await (await fetch(`${base}/api/v1/admin/assets/${first.assetId}`, { headers: { Authorization: "Bearer su" } })).json();
	assert.equal(asset.status, "published");
	// An edit rewrites that asset's row, not the untouched categories.
	await fetch(`${base}/api/v1/admin/assets/${first.assetId}`, { method: "PATCH", headers: { Authorization: "Bearer su", "Content-Type": "application/json" }, body: JSON.stringify({ description: "Edited" }) });
	assert.equal((await check.query("select doc->>'description' as d from library_records where collection = 'assets'")).rows[0].d, "Edited");
	assert.deepEqual((await check.query("select updated_at from library_records where collection = 'categories' limit 1")).rows[0].updated_at, stamp);
	server.close();
	await lib.close();
	await check.end();
});

test("SigV4 signatures match the AWS SDK signer (what R2 and S3 verify)", async () => {
	const { SignatureV4 } = await import("@smithy/signature-v4");
	const { Sha256 } = await import("@aws-crypto/sha256-js");
	const at = new Date("2026-10-24T09:30:00Z");
	const creds = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
	const blobs = createS3Blobs({ endpoint: "https://acct.r2.cloudflarestorage.com", bucket: "library", region: "auto", prefix: "prod", ...creds, now: () => at });
	const sdk = new SignatureV4({ credentials: creds, region: "auto", service: "s3", sha256: Sha256, uriEscapePath: false, applyChecksum: false });
	const cases = [
		["PUT", "packages/warm-film-1.0.0.zip", { body: Buffer.from("zip bytes"), headers: { "content-type": "application/zip" } }],
		["GET", "originals/ab cd+ef(1)!.png", { headers: { range: "bytes=0-99" } }],
		["HEAD", "packages/x.zip", {}],
	];
	for (const [method, key, opts] of cases) {
		const ours = blobs.signRequest(method, key, opts);
		const signed = await sdk.sign(
			{
				method,
				protocol: "https:",
				hostname: ours.url.host,
				path: ours.url.pathname,
				headers: { host: ours.url.host, ...Object.fromEntries(Object.entries(ours.headers).filter(([k]) => k !== "authorization" && k !== "x-amz-date")) },
				body: opts.body,
			},
			{ signingDate: at },
		);
		const sig = (h) => /Signature=([0-9a-f]+)/.exec(h)[1];
		assert.equal(sig(ours.headers.authorization), sig(signed.headers.authorization), `${method} ${key}`);
	}
});

// ---------- the PHP backend (LIBRARY_API_URL=php) on S3/R2 ----------

test("PHP backend: packages go to the S3/R2 bucket and are served with ranges", { skip: target !== "php" && "set LIBRARY_API_URL=php" }, async (t) => {
	const { s3, creds } = await startS3();
	t.after(() => s3.close());
	const s = await startPhp({ tokens: "su:super_admin:u1", env: { LIBRARY_S3_ENDPOINT: creds.endpoint, LIBRARY_S3_BUCKET: creds.bucket, LIBRARY_S3_ACCESS_KEY_ID: creds.accessKeyId, LIBRARY_S3_SECRET_ACCESS_KEY: creds.secretAccessKey, LIBRARY_S3_REGION: creds.region } });
	t.after(() => s.server.close());
	const as = (p, init = {}) => fetch(s.base + p, { ...init, headers: { Authorization: "Bearer su", ...(init.headers ?? {}) } });
	const rows = [];
	for (let b = 0; b < 17; b++) for (let g = 0; g < 17; g++) for (let r = 0; r < 17; r++) rows.push(`${r / 16} ${g / 16} ${b / 16}`);
	const up = await (await as("/api/v1/admin/uploads", { method: "POST", body: `LUT_3D_SIZE 17\n${rows.join("\n")}\n`, headers: { "X-Filename": "warm.cube" } })).json();
	const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
	const thumb = await (await as("/api/v1/admin/uploads", { method: "POST", body: png, headers: { "X-Filename": "t.png" } })).json();
	const a = await (await as("/api/v1/admin/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_id: up.id, thumbnail_upload_id: thumb.id, title: "Warm Film" }) })).json();
	assert.equal((await as(`/api/v1/admin/assets/${a.id}/publish`, { method: "POST" })).status, 200);
	const catalog = await (await fetch(`${s.base}/feed/stable/catalog.json`)).json();
	const zip = await fetch(`${s.base}/feed/stable/${catalog.packs[0].files}`, { headers: { Range: "bytes=0-3" } });
	assert.equal(zip.status, 206);
	assert.equal(Buffer.from(await zip.arrayBuffer()).readUInt32LE(0), 0x04034b50);
	const blobs = createS3Blobs(creds);
	assert.equal((await blobs.head(`packages/${catalog.packs[0].files.split("/").pop()}`)).size, catalog.packs[0].sizeBytes);
	assert.ok(await blobs.has(`originals/${up.sha256}`));
	// Nothing is written to the local blob folder.
	assert.equal(fs.existsSync(path.join(s.dataDir, "blobs", "packages")), false);
});
