// Storage for the Library service (blueprint §15–16):
//   blobs  originals/<sha256> and packages/<file>: local folder or an
//          S3-compatible bucket (Cloudflare R2, AWS S3, MinIO) with SigV4
//   state  the library document: a JSON file, or PostgreSQL with one row per
//          record (assets, categories, uploads, sync events, audit log, …)
// No dependencies besides `pg`, which is loaded only for PostgreSQL.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

// ---------- blobs: local folder ----------

export function createFileBlobs(root) {
	const p = (key) => {
		const full = path.resolve(root, key);
		if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`Bad blob key ${key}`);
		return full;
	};
	return {
		kind: "file",
		async has(key) {
			return fs.existsSync(p(key));
		},
		async put(key, buf) {
			fs.mkdirSync(path.dirname(p(key)), { recursive: true });
			const tmp = `${p(key)}.${process.pid}.tmp`;
			fs.writeFileSync(tmp, buf);
			fs.renameSync(tmp, p(key));
		},
		async get(key) {
			try {
				return fs.readFileSync(p(key));
			} catch {
				return null;
			}
		},
		async head(key) {
			try {
				const s = fs.statSync(p(key));
				return { size: s.size, etag: `"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"` };
			} catch {
				return null;
			}
		},
		/** A Node stream of bytes [start, end] (inclusive). */
		async stream(key, { start, end }) {
			return fs.createReadStream(p(key), { start, end });
		},
	};
}

// ---------- blobs: S3 / R2 (SigV4) ----------

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
const sha256hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const encodeKey = (key) => key.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

/**
 * @param {object} o
 * @param {string} o.endpoint   e.g. https://<account>.r2.cloudflarestorage.com
 * @param {string} o.bucket
 * @param {string} o.accessKeyId
 * @param {string} o.secretAccessKey
 * @param {string} [o.region]   "auto" for R2
 * @param {string} [o.prefix]   key prefix inside the bucket
 */
export function createS3Blobs({ endpoint, bucket, accessKeyId, secretAccessKey, region = "auto", prefix = "", fetch: fetchImpl = globalThis.fetch, now = () => new Date() }) {
	const base = new URL(endpoint);
	const fullKey = (key) => `${prefix ? `${prefix.replace(/\/$/, "")}/` : ""}${key}`;

	function sign(method, key, { headers = {}, body = null } = {}) {
		const url = new URL(`${base.origin}${base.pathname.replace(/\/$/, "")}/${bucket}/${encodeKey(fullKey(key))}`);
		const amzDate = now().toISOString().replace(/[:-]|\.\d{3}/g, "");
		const day = amzDate.slice(0, 8);
		const payloadHash = body ? sha256hex(body) : "UNSIGNED-PAYLOAD";
		const all = { ...headers, host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
		const names = Object.keys(all).map((h) => h.toLowerCase()).sort();
		const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
		const canonical = [method, url.pathname, "", names.map((n) => `${n}:${lower[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
		const scope = `${day}/${region}/s3/aws4_request`;
		const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
		const kSign = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"), "aws4_request");
		const signature = crypto.createHmac("sha256", kSign).update(toSign).digest("hex");
		const { host: _host, ...sent } = lower;
		return { url, headers: { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` } };
	}

	async function call(method, key, opts = {}) {
		const { url, headers } = sign(method, key, opts);
		const res = await fetchImpl(url, { method, headers, body: opts.body ?? undefined });
		if (res.status === 404) return null;
		if (!res.ok && res.status !== 206) throw new Error(`Object store ${method} ${key} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
		return res;
	}

	return {
		kind: "s3",
		/** For tests: the URL and headers a request would be sent with. */
		signRequest: sign,
		async has(key) {
			return (await call("HEAD", key)) !== null;
		},
		async put(key, buf, contentType = "application/octet-stream") {
			await call("PUT", key, { body: buf, headers: { "content-type": contentType } });
		},
		async get(key) {
			const res = await call("GET", key);
			return res ? Buffer.from(await res.arrayBuffer()) : null;
		},
		async head(key) {
			const res = await call("HEAD", key);
			return res ? { size: Number(res.headers.get("content-length")), etag: res.headers.get("etag") } : null;
		},
		async stream(key, { start, end }) {
			const res = await call("GET", key, { headers: { range: `bytes=${start}-${end}` } });
			if (!res) throw new Error(`Missing object ${key}`);
			return Readable.fromWeb(res.body);
		},
	};
}

// ---------- state: JSON file ----------

export function createFileState(file) {
	return {
		kind: "file",
		async load() {
			return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
		},
		async write(db) {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			const tmp = `${file}.tmp`;
			fs.writeFileSync(tmp, JSON.stringify(db));
			fs.renameSync(tmp, file);
		},
		async close() {},
	};
}

// ---------- state: PostgreSQL ----------

/** Record collections and the field that keys each row. `uploads` is an id → record map. */
const COLLECTIONS = { assets: "id", categories: "id", uploads: "id", sync_events: "seq", audit_log: "id", downloads: "id", usage: "id", collections: "slug" };

const SCHEMA = `
create table if not exists library_records (
	collection text not null,
	id text not null,
	doc jsonb not null,
	updated_at timestamptz not null default now(),
	primary key (collection, id)
);
create index if not exists library_records_assets_status on library_records ((doc->>'status')) where collection = 'assets';
create table if not exists library_meta (key text primary key, value jsonb not null);
`;

/** One advisory lock id for "this database's library writer". */
const LOCK_ID = 7_310_417_221;

/**
 * PostgreSQL state. Holds a session advisory lock so only one API instance
 * writes; a second one fails at start instead of overwriting the first.
 */
export async function createPostgresState(connectionString, { pg: pgModule } = {}) {
	const pg = pgModule ?? (await import("pg")).default;
	const client = new pg.Client({ connectionString });
	await client.connect();
	await client.query(SCHEMA);
	const { rows } = await client.query("select pg_try_advisory_lock($1) as ok", [LOCK_ID]);
	if (!rows[0].ok) {
		await client.end();
		throw new Error("Another Library API instance holds this database's writer lock");
	}
	/** collection → id → JSON text last written, to write only what changed. */
	const written = new Map();
	const writtenMeta = new Map();

	const rowsOf = (db, collection) => {
		const value = db[collection];
		if (!value) return [];
		const list = Array.isArray(value) ? value : Object.values(value);
		return list.map((doc) => [String(doc[COLLECTIONS[collection]]), doc]);
	};

	return {
		kind: "postgres",
		async load() {
			const recs = await client.query("select collection, id, doc from library_records");
			const meta = await client.query("select key, value from library_meta");
			if (recs.rowCount === 0 && meta.rowCount === 0) return null;
			const db = Object.fromEntries(meta.rows.map((r) => [r.key, r.value]));
			for (const c of Object.keys(COLLECTIONS)) db[c] = c === "uploads" ? {} : [];
			for (const r of recs.rows) {
				if (!(r.collection in COLLECTIONS)) continue;
				if (r.collection === "uploads") db.uploads[r.id] = r.doc;
				else db[r.collection].push(r.doc);
				written.set(`${r.collection}\u0000${r.id}`, JSON.stringify(r.doc));
			}
			db.sync_events.sort((a, b) => a.seq - b.seq);
			db.audit_log.sort((a, b) => a.at.localeCompare(b.at));
			for (const r of meta.rows) writtenMeta.set(r.key, JSON.stringify(r.value));
			return db;
		},
		/** Upserts changed records, deletes removed ones, in one transaction. */
		async write(db) {
			const upserts = [];
			const seen = new Set();
			for (const c of Object.keys(COLLECTIONS)) {
				for (const [id, doc] of rowsOf(db, c)) {
					const key = `${c}\u0000${id}`;
					seen.add(key);
					const text = JSON.stringify(doc);
					if (written.get(key) !== text) upserts.push([c, id, text, key]);
				}
			}
			const deletes = [...written.keys()].filter((k) => !seen.has(k));
			const metaChanges = Object.entries(db)
				.filter(([k]) => !(k in COLLECTIONS))
				.map(([k, v]) => [k, JSON.stringify(v)])
				.filter(([k, text]) => writtenMeta.get(k) !== text);
			if (!upserts.length && !deletes.length && !metaChanges.length) return;
			await client.query("begin");
			try {
				// Batches keep statements under PostgreSQL's parameter limit.
				for (let i = 0; i < upserts.length; i += 500) {
					const batch = upserts.slice(i, i + 500);
					const values = batch.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3}::jsonb, now())`).join(", ");
					await client.query(`insert into library_records (collection, id, doc, updated_at) values ${values} on conflict (collection, id) do update set doc = excluded.doc, updated_at = now()`, batch.flatMap(([c, id, text]) => [c, id, text]));
				}
				for (const key of deletes) {
					const [c, id] = key.split("\u0000");
					await client.query("delete from library_records where collection = $1 and id = $2", [c, id]);
				}
				for (const [k, text] of metaChanges) await client.query("insert into library_meta (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [k, text]);
				await client.query("commit");
			} catch (e) {
				await client.query("rollback");
				throw e;
			}
			for (const [, , text, key] of upserts) written.set(key, text);
			for (const key of deletes) written.delete(key);
			for (const [k, text] of metaChanges) writtenMeta.set(k, text);
		},
		async close() {
			await client.end();
		},
	};
}

/** Storage from the environment (see README): Postgres + R2 in production, a folder in development. */
export async function storageFromEnv({ dataDir, env = process.env }) {
	const blobs = env.LIBRARY_S3_BUCKET
		? createS3Blobs({ endpoint: env.LIBRARY_S3_ENDPOINT, bucket: env.LIBRARY_S3_BUCKET, accessKeyId: env.LIBRARY_S3_ACCESS_KEY_ID, secretAccessKey: env.LIBRARY_S3_SECRET_ACCESS_KEY, region: env.LIBRARY_S3_REGION || "auto", prefix: env.LIBRARY_S3_PREFIX || "" })
		: createFileBlobs(dataDir);
	const state = env.DATABASE_URL ? await createPostgresState(env.DATABASE_URL) : createFileState(path.join(dataDir, "library.json"));
	return { blobs, state };
}
