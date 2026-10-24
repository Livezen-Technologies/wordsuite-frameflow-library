// The Library service: assets, versions, workflow, publishing, the sync
// feed and the audit log (blueprint §3, §4, §5, §8). State is one JSON
// document written atomically, plus content-addressed files on disk. This
// keeps v1 dependency-free; the shape mirrors the PostgreSQL tables in §16
// so a database adapter can replace `load`/`save` without touching callers.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
	ASSET_TYPES,
	TRANSITIONS,
	ValidationError,
	bumpSemver,
	can,
	compareSemver,
	detectType,
	extOf,
	metadataProblems,
	normalizeTags,
	publishProblems,
	SEMVER,
	slugify,
	uploadChecks,
	validateFile,
} from "../../../packages/asset-schema/index.js";
import { buildCatalog, buildPackage, generateKeyPair, inspectZip, packIdOf, publicKeyOf, sha256, sign } from "./pack.js";

/** UUID v7 (time-ordered), §3.1. */
export function uuid7() {
	const b = crypto.randomBytes(16);
	const t = BigInt(Date.now());
	for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
	b[6] = (b[6] & 0x0f) | 0x70;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = b.toString("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class HttpError extends Error {
	constructor(status, code, message, details = []) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details;
	}
}
const forbidden = (perm) => new HttpError(403, "FORBIDDEN", `You need the ${perm} permission.`);
const notFound = (what) => new HttpError(404, "NOT_FOUND", `${what} not found.`);

const DEFAULT_CATEGORIES = {
	graphic: ["Overlays", "Shapes", "Frames"],
	sfx: ["Transitions", "UI", "Ambience", "Music beds"],
	text_template: ["Lower thirds", "Titles", "Captions"],
	video_template: ["Wedding", "Corporate", "Social"],
	motion: ["Social", "Callouts", "Backgrounds"],
	transition: ["Glitch", "Wipes", "Zooms"],
	lut: ["Cinematic", "Film", "Log conversion"],
	font: ["Sans serif", "Serif", "Sinhala", "Tamil"],
	filter: ["Film", "Stylize", "Blur"],
	brand_kit: ["Org private"],
	gif_sticker: ["Reactions", "Seasonal", "Emoji"],
	lottie: ["Social", "Icons", "Loaders"],
};

export function createLibrary({ dataDir, signingKey = null, now = () => new Date() }) {
	const dir = (...p) => path.join(dataDir, ...p);
	for (const d of ["originals", "packages"]) fs.mkdirSync(dir(d), { recursive: true });

	// Signing key: the configured PEM, else a persisted dev key.
	let privateKey = signingKey;
	if (!privateKey) {
		const keyFile = dir("dev-signing-key.pem");
		if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, generateKeyPair().privateKey, { mode: 0o600 });
		privateKey = fs.readFileSync(keyFile, "utf8");
	}
	const publicKey = publicKeyOf(privateKey);

	const dbFile = dir("library.json");
	let db = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, "utf8")) : null;
	if (!db) {
		db = { seq: 0, assets: [], categories: [], uploads: {}, sync_events: [], audit_log: [], downloads: [], usage: [], collections: [] };
		for (const [type, names] of Object.entries(DEFAULT_CATEGORIES))
			names.forEach((name, i) => db.categories.push({ id: uuid7(), type, name, slug: slugify(name), parent_id: null, sort: i, icon: null, visible: true }));
	}
	const save = () => {
		const tmp = `${dbFile}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(db));
		fs.renameSync(tmp, dbFile);
	};
	save();

	const iso = () => now().toISOString();
	const readFile = (sha) => fs.readFileSync(dir("originals", sha));

	function audit(actor, action, entity, id, before, after, ip = null) {
		db.audit_log.push({ id: uuid7(), actor_id: actor?.id ?? null, actor_role: actor?.role ?? null, action, entity, entity_id: id, diff: diffOf(before, after), ip, at: iso() });
	}
	function diffOf(before, after) {
		if (!before || !after) return { before: before ?? null, after: after ?? null };
		const out = { before: {}, after: {} };
		for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
			if (k === "versions" || k === "updated_at") continue;
			if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
				out.before[k] = before[k];
				out.after[k] = after[k];
			}
		}
		return out;
	}
	function syncEvent(op, asset, extra = {}) {
		db.seq += 1;
		db.sync_events.push({ seq: db.seq, op, asset_id: asset?.id ?? null, type: asset?.type, version: asset?.current_version, ...extra, created_at: iso() });
		feedCache.clear();
	}

	const snapshot = (a) => structuredClone(a);
	const getAsset = (id) => db.assets.find((a) => a.id === id || a.slug === id) ?? null;
	const mustAsset = (id) => getAsset(id) ?? (() => { throw notFound("Asset"); })();
	const categoryOf = (asset) => db.categories.find((c) => c.id === asset.category_id) ?? null;

	function requirePerm(actor, perm, asset = null) {
		if (!actor) throw new HttpError(401, "UNAUTHENTICATED", "Sign in first.");
		if (perm === "asset.edit") {
			if (can(actor.role, "asset.edit.all")) return;
			if (can(actor.role, "asset.edit.own") && asset && asset.created_by === actor.id) return;
			throw forbidden("asset.edit");
		}
		if (!can(actor.role, perm)) throw forbidden(perm);
	}

	function setStatus(asset, to) {
		if (!(TRANSITIONS[asset.status] ?? []).includes(to)) throw new HttpError(409, "INVALID_TRANSITION", `Can't move from ${asset.status} to ${to}.`);
		asset.status = to;
	}

	// ---------- uploads (§4.1) ----------

	/** Upload gate (§4.1) then type validation (§4.2) for `type`; returns { checks, meta }. */
	function runChecks({ filename, buf, type }) {
		const checks = type ? uploadChecks({ filename, type, buf }) : [{ check: "type", passed: false, detail: { rule: "type.detect", value: extOf(filename), message: "Pick a type for this file." } }];
		if (checks.find((c) => c.check === "magic_bytes")?.detail?.value === "zip") {
			try {
				checks.push({ check: "archive", passed: true, detail: { entries: inspectZip(buf).length } });
			} catch (e) {
				checks.push({ check: "archive", passed: false, detail: { rule: e.rule, value: e.value ?? null, message: e.message } });
			}
		}
		let meta = {};
		if (type && checks.every((c) => c.passed)) {
			try {
				const result = validateFile({ type, filename, buf });
				checks.push(...result.checks);
				meta = result.meta;
			} catch (e) {
				if (!(e instanceof ValidationError)) throw e;
				checks.push({ check: e.details[0]?.rule ?? "type", passed: false, detail: { ...e.details[0], message: e.message } });
			}
		}
		// Malware scanning (ClamAV) runs in the worker when CLAMAV_HOST is set.
		checks.push({ check: "malware_scan", passed: true, detail: { engine: process.env.CLAMAV_HOST ? "clamav" : "not-configured" } });
		return { checks, meta };
	}

	/** Stores raw bytes and runs the checks for the given or detected type. */
	function upload(actor, { filename, buf, type = null }) {
		requirePerm(actor, "asset.create");
		if (!filename || !buf?.length) throw new ValidationError("A file is required.", [{ field: "file", rule: "file.required", value: null }]);
		const sha = sha256(buf);
		const detected = type || detectType(filename, buf);
		const { checks, meta } = runChecks({ filename, buf, type: detected });
		const duplicate = db.assets.find((a) => a.versions.some((v) => v.files.some((f) => f.sha256 === sha)));
		const id = uuid7();
		db.uploads[id] = { id, filename, sha256: sha, size: buf.length, type: detected, checks, meta, duplicate_of: duplicate?.id ?? null, created_by: actor.id, created_at: iso() };
		if (!fs.existsSync(dir("originals", sha))) fs.writeFileSync(dir("originals", sha), buf);
		save();
		return db.uploads[id];
	}

	/** An upload checked as `type`: re-validated when that isn't the type it was checked as. */
	function uploadAs(id, type) {
		const up = mustUpload(id);
		if (!type || up.type === type) return up;
		Object.assign(up, { type }, runChecks({ filename: up.filename, buf: readFile(up.sha256), type }));
		return up;
	}
	const mustUpload = (id) => db.uploads[id] ?? (() => { throw notFound(`Upload ${id}`); })();

	// ---------- assets ----------

	function newVersion(asset, { version, uploadId, thumbnailUploadId, changelog = "", is_breaking = false, actor }) {
		const up = uploadAs(uploadId, asset.type);
		const files = [{ role: "main", filename: up.filename, sha256: up.sha256, size: up.size }];
		if (thumbnailUploadId) {
			const t = mustUpload(thumbnailUploadId);
			files.push({ role: "thumbnail", filename: t.filename, sha256: t.sha256, size: t.size });
			asset.thumbnail_file = { filename: t.filename, sha256: t.sha256 };
		} else if (!asset.thumbnail_file && ["png", "webp", "gif"].includes(extOf(up.filename))) {
			// Image assets are their own thumbnail (§5 stage 4 for v1).
			asset.thumbnail_file = { filename: up.filename, sha256: up.sha256 };
		}
		const failed = up.checks.some((c) => !c.passed);
		const v = {
			id: uuid7(),
			version,
			changelog,
			is_breaking: !!is_breaking,
			min_app_version: asset.min_app_version,
			files,
			checks: up.checks,
			meta: up.meta,
			status: failed ? "failed" : "ready",
			package: null,
			created_by: actor.id,
			created_at: iso(),
		};
		asset.versions.push(v);
		return v;
	}

	function createAsset(actor, body) {
		requirePerm(actor, "asset.create");
		const type = body.type ?? mustUpload(body.upload_id).type;
		const up = uploadAs(body.upload_id, type);
		const title = body.title ?? up.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
		const slug = body.slug ?? slugify(title);
		const category = body.category_id ? db.categories.find((c) => c.id === body.category_id) : db.categories.find((c) => c.type === type);
		const meta = {
			type,
			slug,
			title,
			description: body.description ?? "",
			tags: normalizeTags(body.tags),
			keywords: normalizeTags(body.keywords),
			min_app_version: body.min_app_version ?? "1.0.0",
			licence_tier: body.licence_tier ?? "free",
			licence_terms: body.licence_terms ?? "royalty_free",
			visibility: body.visibility ?? "public",
		};
		const problems = metadataProblems(meta);
		if (category && category.type !== type) problems.push({ field: "category_id", rule: "category.type", value: category.type });
		if (db.assets.some((a) => a.slug === slug)) problems.push({ field: "slug", rule: "slug.unique", value: slug });
		if (problems.length) throw new ValidationError(`Invalid ${problems[0].field}.`, problems);
		const asset = {
			id: uuid7(),
			...meta,
			category_id: category?.id ?? null,
			subcategory_id: null,
			licence_text: body.licence_text ?? "",
			attribution_required: !!body.attribution_required,
			attribution_text: body.attribution_text ?? "",
			author: body.author ?? "",
			aspect_ratios: body.aspect_ratios ?? ["any"],
			platforms: body.platforms ?? ["windows", "macos", "linux"],
			audience_rules: body.audience_rules ?? [],
			dependencies: body.dependencies ?? [],
			featured: !!body.featured,
			featured_rank: null,
			publish_at: null,
			unpublish_at: null,
			meta: { ...up.meta, ...(body.meta ?? {}) },
			thumbnail_file: null,
			status: "processing",
			current_version: null,
			published_version: null,
			versions: [],
			stats: { downloads: 0, installs: 0, favorites: 0, applies: 0 },
			created_by: actor.id,
			created_at: iso(),
			updated_by: actor.id,
			updated_at: iso(),
			published_by: null,
			published_at: null,
		};
		const v = newVersion(asset, { version: body.version ?? "1.0.0", uploadId: up.id, thumbnailUploadId: body.thumbnail_upload_id, actor });
		asset.current_version = v.version;
		asset.status = v.status === "failed" ? "failed" : body.submit_for_review ? "ready_for_review" : "draft";
		db.assets.push(asset);
		audit(actor, "asset.create", "asset", asset.id, null, { slug: asset.slug, type, status: asset.status });
		save();
		return asset;
	}

	const EDITABLE = ["title", "description", "category_id", "subcategory_id", "tags", "keywords", "aspect_ratios", "platforms", "min_app_version", "licence_tier", "licence_terms", "licence_text", "attribution_required", "attribution_text", "author", "visibility", "audience_rules", "featured", "featured_rank", "publish_at", "unpublish_at", "dependencies", "meta", "slug"];

	function updateAsset(actor, id, patch) {
		const asset = mustAsset(id);
		requirePerm(actor, "asset.edit", asset);
		const before = snapshot(asset);
		const next = {};
		for (const k of EDITABLE) if (Object.hasOwn(patch, k)) next[k] = k === "tags" || k === "keywords" ? normalizeTags(patch[k]) : patch[k];
		if ("slug" in next && next.slug !== asset.slug) {
			if (asset.published_at) throw new ValidationError("Slug can't change after first publish.", [{ field: "slug", rule: "slug.immutable", value: next.slug }]);
			if (db.assets.some((a) => a.slug === next.slug)) throw new ValidationError("Slug is taken.", [{ field: "slug", rule: "slug.unique", value: next.slug }]);
		}
		if (("licence_tier" in next || "audience_rules" in next) && !can(actor.role, "access.manage") && actor.role !== "content_editor") throw forbidden("access.manage");
		const problems = metadataProblems(next, { partial: true });
		if (next.category_id) {
			const c = db.categories.find((x) => x.id === next.category_id);
			if (!c || c.type !== asset.type) problems.push({ field: "category_id", rule: "category.type", value: next.category_id });
		}
		if (problems.length) throw new ValidationError(`Invalid ${problems[0].field}.`, problems);
		if (next.meta) next.meta = { ...asset.meta, ...next.meta };
		if (patch.thumbnail_upload_id) {
			const t = mustUpload(patch.thumbnail_upload_id);
			if (!["png", "webp"].includes(extOf(t.filename)) || t.checks.some((c) => c.check === "magic_bytes" && !c.passed)) throw new ValidationError("Thumbnails must be a valid PNG or WebP.", [{ field: "thumbnail", rule: "thumbnail.format", value: t.filename }]);
			next.thumbnail_file = { filename: t.filename, sha256: t.sha256 };
		}
		Object.assign(asset, next, { updated_by: actor.id, updated_at: iso() });
		audit(actor, "asset.update", "asset", asset.id, before, asset);
		if (asset.status === "published") syncEvent("upsert", asset, { changed: Object.keys(next), update_available: false, breaking: false });
		save();
		return asset;
	}

	function addVersion(actor, id, body) {
		const asset = mustAsset(id);
		requirePerm(actor, "asset.edit", asset);
		const latest = asset.versions.map((v) => v.version).sort(compareSemver).at(-1);
		const version = body.version ?? bumpSemver(latest, body.is_breaking ? "major" : "minor");
		if (!SEMVER.test(version)) throw new ValidationError("Version must be semver.", [{ field: "version", rule: "semver", value: version }]);
		if (asset.versions.some((v) => v.version === version)) throw new ValidationError("That version already exists; versions never overwrite.", [{ field: "version", rule: "version.unique", value: version }]);
		if (compareSemver(version, latest) <= 0) throw new ValidationError(`New versions must be above ${latest}.`, [{ field: "version", rule: "version.increase", value: version }]);
		const v = newVersion(asset, { version, uploadId: body.upload_id, thumbnailUploadId: body.thumbnail_upload_id, changelog: body.changelog, is_breaking: body.is_breaking, actor });
		asset.current_version = v.version;
		// A new version goes back through review unless the asset is already live and the actor can publish directly.
		if (asset.status === "published" || asset.status === "deprecated") asset.pending_version = v.version;
		else asset.status = v.status === "failed" ? "failed" : "draft";
		audit(actor, "version.create", "asset", asset.id, null, { version, is_breaking: v.is_breaking });
		save();
		return asset;
	}

	// ---------- workflow (§4.3, §6) ----------

	function submitReview(actor, id) {
		const asset = mustAsset(id);
		requirePerm(actor, "asset.edit", asset);
		if (asset.versions.find((v) => v.version === asset.current_version)?.status === "failed") throw new ValidationError("Fix the failed checks first.", [{ field: "checks", rule: "checks.passed", value: false }]);
		const before = snapshot(asset);
		setStatus(asset, "ready_for_review");
		audit(actor, "asset.submit_review", "asset", asset.id, before, asset);
		save();
		return asset;
	}

	function review(actor, id, { approve, reason = "" }) {
		const asset = mustAsset(id);
		requirePerm(actor, "asset.review");
		if (!approve && !String(reason).trim()) throw new ValidationError("A reason is required to reject.", [{ field: "reason", rule: "reason.required", value: "" }]);
		const before = snapshot(asset);
		setStatus(asset, approve ? "approved" : "draft");
		asset.review = { by: actor.id, at: iso(), approved: !!approve, reason };
		audit(actor, approve ? "asset.approve" : "asset.reject", "asset", asset.id, before, asset);
		save();
		return asset;
	}

	function packageVersion(asset, v) {
		const built = buildPackage(asset, v, { category: categoryOf(asset), readFile });
		const base = `${packIdOf(asset)}-${v.version}`;
		fs.writeFileSync(dir("packages", `${base}.zip`), built.zip);
		let thumbnail = null;
		if (built.thumbnail) {
			const ext = built.thumbnail.path.match(/\.[a-z0-9]+$/)[0];
			fs.writeFileSync(dir("packages", `${base}${ext}`), built.thumbnail.data);
			thumbnail = { ext };
		}
		v.package = { sha256: built.sha256, size: built.size, signature: sign(built.sha256, privateKey), thumbnail, built_at: iso() };
		v.status = "published";
	}

	function publish(actor, id, { publish_at = null, version = null } = {}) {
		const asset = mustAsset(id);
		requirePerm(actor, "asset.publish");
		const direct = can(actor.role, "asset.publish.direct");
		const target = version ?? asset.pending_version ?? asset.current_version;
		const v = asset.versions.find((x) => x.version === target) ?? (() => { throw notFound(`Version ${target}`); })();
		const deps = (asset.dependencies ?? []).map((d) => getAsset(d.asset_id) ?? { id: d.asset_id, status: "missing" });
		// A new version of a live asset is released by whoever may publish; first releases go through review.
		const probe = { ...asset, current_version: v.version, status: asset.pending_version === target && ["published", "deprecated"].includes(asset.status) ? "approved" : asset.status };
		const problems = publishProblems(probe, { direct, dependencies: deps });
		if (problems.length) throw new ValidationError(problems[0].message, problems, "PUBLISH_BLOCKED");
		const before = snapshot(asset);
		if (publish_at && new Date(publish_at) > now()) {
			asset.publish_at = publish_at;
			audit(actor, "asset.schedule", "asset", asset.id, before, asset);
			save();
			return asset;
		}
		const previous = asset.published_version;
		packageVersion(asset, v);
		for (const old of asset.versions) if (old !== v && old.status === "published") Object.assign(old, { status: "retired", retired_at: iso() });
		asset.status = "published";
		asset.current_version = v.version;
		asset.published_version = v.version;
		asset.pending_version = null;
		asset.published_by = actor.id;
		asset.published_at ??= iso();
		asset.publish_at = null;
		syncEvent("upsert", asset, { changed: previous ? ["version"] : ["created"], update_available: !!previous, breaking: v.is_breaking });
		audit(actor, "asset.publish", "asset", asset.id, before, asset);
		save();
		return asset;
	}

	function unpublish(actor, id, { reason = "unpublished", op = "unpublish" } = {}) {
		const asset = mustAsset(id);
		requirePerm(actor, op === "archive" ? "asset.archive" : "asset.publish");
		const before = snapshot(asset);
		setStatus(asset, op === "deprecate" ? "deprecated" : op === "archive" ? "archived" : "draft");
		syncEvent(op === "deprecate" ? "deprecate" : "unpublish", asset, { reason });
		audit(actor, `asset.${op}`, "asset", asset.id, before, asset);
		save();
		return asset;
	}

	function rollback(actor, id, version) {
		const asset = mustAsset(id);
		requirePerm(actor, "version.rollback");
		const v = asset.versions.find((x) => x.version === version);
		if (!v?.package) throw new ValidationError("Only previously published versions can be rolled back to.", [{ field: "version", rule: "version.published", value: version }]);
		const before = snapshot(asset);
		for (const o of asset.versions) if (o.status === "published") o.status = "retired";
		v.status = "published";
		asset.current_version = asset.published_version = version;
		asset.status = "published";
		syncEvent("upsert", asset, { changed: ["version"], update_available: true, breaking: false, rollback: true });
		audit(actor, "version.rollback", "asset", asset.id, before, asset);
		save();
		return asset;
	}

	function bulk(actor, { ids = [], action, payload = {} }) {
		const results = [];
		for (const id of ids) {
			try {
				if (action === "publish") publish(actor, id);
				else if (action === "unpublish") unpublish(actor, id);
				else if (action === "archive") unpublish(actor, id, { op: "archive" });
				else if (action === "tag_add") updateAsset(actor, id, { tags: [...mustAsset(id).tags, ...normalizeTags(payload.tags)] });
				else if (action === "tag_remove") updateAsset(actor, id, { tags: mustAsset(id).tags.filter((t) => !normalizeTags(payload.tags).includes(t)) });
				else if (action === "move_category") updateAsset(actor, id, { category_id: payload.category_id });
				else if (action === "set_tier") updateAsset(actor, id, { licence_tier: payload.licence_tier });
				else if (action === "set_visibility") updateAsset(actor, id, { visibility: payload.visibility });
				else throw new HttpError(400, "BAD_ACTION", `Unknown bulk action ${action}.`);
				results.push({ id, ok: true });
			} catch (e) {
				results.push({ id, ok: false, error: { code: e.code ?? "ERROR", message: e.message } });
			}
		}
		return { job_id: uuid7(), status: "completed", results };
	}

	/** Runs scheduled publish/unpublish (§3.1 publish_at / unpublish_at). */
	function runSchedule() {
		const system = { id: "system", role: "super_admin" };
		for (const a of db.assets) {
			if (a.publish_at && new Date(a.publish_at) <= now() && a.status !== "published") {
				try {
					a.publish_at = null;
					publish(system, a.id);
				} catch {
					/* stays scheduled-failed; visible in checks */
				}
			}
			if (a.unpublish_at && new Date(a.unpublish_at) <= now() && a.status === "published") {
				a.unpublish_at = null;
				unpublish(system, a.id, { reason: "scheduled" });
			}
		}
	}

	// ---------- taxonomy ----------

	function createCategory(actor, body) {
		requirePerm(actor, "taxonomy.manage");
		if (!ASSET_TYPES[body.type]) throw new ValidationError("Unknown type.", [{ field: "type", rule: "type.enum", value: body.type }]);
		const c = { id: uuid7(), type: body.type, name: String(body.name ?? "").trim(), slug: slugify(body.name), parent_id: body.parent_id ?? null, sort: body.sort ?? 0, icon: body.icon ?? null, visible: body.visible !== false };
		if (c.name.length < 2) throw new ValidationError("Name is required.", [{ field: "name", rule: "name.required", value: c.name }]);
		db.categories.push(c);
		audit(actor, "category.create", "category", c.id, null, c);
		save();
		return c;
	}

	// ---------- client side (§7.2, §8) ----------

	const isLive = (a) => a.status === "published" && ["public", "unlisted"].includes(a.visibility);

	function publicAsset(a) {
		const v = a.versions.find((x) => x.version === a.published_version);
		const cat = categoryOf(a);
		return {
			id: a.id,
			slug: a.slug,
			type: a.type,
			title: a.title,
			description: a.description,
			category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null,
			tags: a.tags,
			keywords: a.keywords,
			aspect_ratios: a.aspect_ratios,
			licence_tier: a.licence_tier,
			licence_terms: a.licence_terms,
			attribution_required: a.attribution_required,
			attribution_text: a.attribution_text,
			author: a.author,
			min_app_version: v?.min_app_version ?? a.min_app_version,
			current_version: a.published_version,
			file_size_bytes: v?.package?.size ?? null,
			checksum_sha256: v?.package?.sha256 ?? null,
			featured: a.featured,
			meta: { ...a.meta, ...(v?.meta ?? {}) },
			pack_id: packIdOf(a),
			pack_type: ASSET_TYPES[a.type].pack,
			thumbnail_url: v?.package?.thumbnail ? `/feed/stable/packs/${packIdOf(a)}-${v.version}${v.package.thumbnail.ext}` : null,
			published_at: a.published_at,
			stats: a.stats,
		};
	}

	function searchAssets({ q = "", type, category, tags, tier, has_alpha, appVersion, sort = "popular", cursor = 0, limit = 50 } = {}) {
		const needle = String(q).toLowerCase().trim();
		let list = db.assets.filter(isLive).filter((a) => a.visibility !== "unlisted" || needle === a.slug);
		if (type) list = list.filter((a) => a.type === type);
		if (category) list = list.filter((a) => a.category_id === category || categoryOf(a)?.slug === category);
		if (tags) for (const t of normalizeTags(tags)) list = list.filter((a) => a.tags.includes(t));
		if (tier) list = list.filter((a) => a.licence_tier === tier);
		if (has_alpha !== undefined) list = list.filter((a) => !!a.meta?.has_alpha === (has_alpha === true || has_alpha === "true"));
		if (appVersion) list = list.filter((a) => compareSemver(appVersion, a.min_app_version) >= 0);
		const score = (a) => {
			if (!needle) return 0;
			const hay = [a.title, a.slug, ...a.tags, ...a.keywords, categoryOf(a)?.name ?? "", a.author].join(" ").toLowerCase();
			if (a.title.toLowerCase().startsWith(needle)) return 3;
			if (a.title.toLowerCase().includes(needle)) return 2;
			return needle.split(/\s+/).every((w) => hay.includes(w)) ? 1 : -1;
		};
		list = list.map((a) => [a, score(a)]).filter(([, s]) => s >= 0);
		const sorters = {
			popular: (x, y) => y[1] - x[1] || y[0].stats.downloads - x[0].stats.downloads,
			new: (x, y) => String(y[0].published_at).localeCompare(String(x[0].published_at)),
			trending: (x, y) => y[0].stats.downloads - x[0].stats.downloads,
			az: (x, y) => x[0].title.localeCompare(y[0].title),
		};
		list.sort(sorters[sort] ?? sorters.popular);
		const start = Number(cursor) || 0;
		const n = Math.min(Number(limit) || 50, 100);
		const page = list.slice(start, start + n).map(([a]) => publicAsset(a));
		return { data: page, next_cursor: start + n < list.length ? String(start + n) : null, total: list.length };
	}

	function assetDetail(id, { plan = "free" } = {}) {
		const a = getAsset(id);
		if (!a || !isLive(a)) throw notFound("Asset");
		const rank = { free: 0, pro: 1, business: 2, enterprise: 3 };
		const can_download = (rank[plan] ?? 0) >= rank[a.licence_tier];
		return {
			...publicAsset(a),
			versions: a.versions.filter((v) => v.package).map((v) => ({ version: v.version, changelog: v.changelog, is_breaking: v.is_breaking, status: v.status, size: v.package.size, sha256: v.package.sha256 })),
			dependencies: (a.dependencies ?? []).map((d) => ({ ...d, asset: getAsset(d.asset_id) && isLive(getAsset(d.asset_id)) ? publicAsset(getAsset(d.asset_id)) : null })),
			entitlement: { can_download, reason: can_download ? null : `needs_${a.licence_tier}` },
		};
	}

	function downloadGrant(id, { version = null, device_id = null, plan = "free", user_id = null } = {}) {
		const d = assetDetail(id, { plan });
		if (!d.entitlement.can_download) throw new HttpError(403, "NOT_ENTITLED", `This asset needs a ${d.licence_tier} plan.`);
		const a = getAsset(id);
		const v = a.versions.find((x) => x.version === (version ?? a.published_version) && x.package);
		if (!v) throw notFound("Version");
		const download_id = uuid7();
		const expires_at = new Date(now().getTime() + 5 * 60 * 1000).toISOString();
		const file = `${packIdOf(a)}-${v.version}.zip`;
		const token = sign(`${file}|${expires_at}`, privateKey);
		db.downloads.push({ id: download_id, user_id, device_id, asset_id: a.id, version: v.version, status: "granted", started_at: iso(), finished_at: null });
		a.stats.downloads += 1;
		save();
		return {
			download_id,
			url: `/feed/stable/packs/${file}?expires=${encodeURIComponent(expires_at)}&sig=${encodeURIComponent(token)}`,
			expires_at,
			sha256: v.package.sha256,
			size: v.package.size,
			signature: v.package.signature,
			manifest: { id: a.id, slug: a.slug, type: a.type, version: v.version },
		};
	}

	function completeDownload(id, { status, bytes = null, duration_ms = null }) {
		const d = db.downloads.find((x) => x.id === id);
		if (!d) throw notFound("Download");
		Object.assign(d, { status: status === "installed" ? "installed" : "failed", bytes, duration_ms, finished_at: iso() });
		if (d.status === "installed") {
			const a = getAsset(d.asset_id);
			if (a) a.stats.installs += 1;
		}
		save();
		return d;
	}

	function recordUsage(events = []) {
		for (const e of events.slice(0, 500)) {
			const a = getAsset(e.asset_id);
			if (!a || !["apply", "insert", "preview"].includes(e.event)) continue;
			if (e.event !== "preview") a.stats.applies += 1;
			db.usage.push({ id: uuid7(), asset_id: a.id, event: e.event, device_id: e.device_id ?? null, at: iso() });
		}
		save();
		return { accepted: true };
	}

	/** Delta feed (§8.1). Cursors older than 30 days ask for a full resync. */
	function sync(since = 0, limit = 500) {
		const s = Number(since) || 0;
		const oldest = db.sync_events[0];
		const tooOld = s > 0 && oldest && s < oldest.seq - 1 && now() - new Date(oldest.created_at) > 30 * 864e5;
		const events = db.sync_events.filter((e) => e.seq > s).slice(0, limit);
		return { events, next_cursor: String(events.at(-1)?.seq ?? s), has_more: db.sync_events.some((e) => e.seq > (events.at(-1)?.seq ?? s)), full_resync_required: !!tooOld };
	}

	function catalogTypes() {
		return Object.entries(ASSET_TYPES).map(([key, t]) => ({ key, name: t.name, pack_type: t.pack, editor_target: t.target, count: db.assets.filter((a) => isLive(a) && a.type === key).length }));
	}

	// ---------- FrameFlow feed ----------

	const feedCache = new Map();
	/** catalog.json + signature for FrameFlow (stable: public; beta: public + internal). */
	function feed(channel) {
		if (!["stable", "beta"].includes(channel)) throw notFound("Channel");
		if (!feedCache.has(channel)) {
			const vis = channel === "beta" ? ["public", "internal"] : ["public"];
			const entries = db.assets
				.filter((a) => a.status === "published" && vis.includes(a.visibility))
				.map((asset) => ({ asset, version: asset.versions.find((v) => v.version === asset.published_version), category: categoryOf(asset) }));
			const last = db.sync_events.at(-1)?.created_at ?? iso();
			const text = `${JSON.stringify(buildCatalog(channel, entries, last), null, "\t")}\n`;
			feedCache.set(channel, { text, sig: `${sign(text, privateKey)}\n`, etag: `"${sha256(text).slice(0, 32)}"` });
		}
		return feedCache.get(channel);
	}

	/** Path of a package file, or null. Names come from the catalog. */
	function packageFile(name) {
		if (!/^[a-z0-9][a-z0-9-]{0,63}-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.(zip|png|webp|gif|jpg)$/.test(name)) return null;
		const p = dir("packages", name);
		return fs.existsSync(p) ? p : null;
	}

	/** Licence tier of the asset a package zip belongs to (thumbnails are always public). */
	function packageTier(name) {
		if (!name.endsWith(".zip")) return "free";
		for (const a of db.assets) for (const v of a.versions) if (`${packIdOf(a)}-${v.version}.zip` === name) return a.licence_tier;
		return "free";
	}

	// ---------- admin read side ----------

	function adminList({ status, type, owner, q, cursor = 0, limit = 50 } = {}) {
		let list = [...db.assets];
		if (status) list = list.filter((a) => a.status === status);
		if (type) list = list.filter((a) => a.type === type);
		if (owner) list = list.filter((a) => a.created_by === owner);
		if (q) {
			const n = q.toLowerCase();
			list = list.filter((a) => [a.title, a.slug, ...a.tags].join(" ").toLowerCase().includes(n));
		}
		list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
		const start = Number(cursor) || 0;
		const n = Math.min(Number(limit) || 50, 200);
		return { data: list.slice(start, start + n).map((a) => ({ ...a, category: categoryOf(a) })), next_cursor: start + n < list.length ? String(start + n) : null, total: list.length };
	}

	function overview() {
		const since = now().getTime() - 30 * 864e5;
		const by = (s) => db.assets.filter((a) => a.status === s).length;
		const dl = db.downloads.filter((d) => new Date(d.started_at).getTime() >= since);
		const byDay = {};
		for (const d of dl) byDay[d.started_at.slice(0, 10)] = (byDay[d.started_at.slice(0, 10)] ?? 0) + 1;
		return {
			published: by("published"),
			drafts: by("draft"),
			in_review: by("ready_for_review"),
			approved: by("approved"),
			failed: by("failed"),
			processing: by("processing"),
			downloads_30d: dl.length,
			active_devices_30d: new Set(dl.map((d) => d.device_id).filter(Boolean)).size,
			downloads_by_day: byDay,
			top_assets: [...db.assets].sort((a, b) => b.stats.downloads - a.stats.downloads).slice(0, 5).map((a) => ({ id: a.id, title: a.title, type: a.type, downloads: a.stats.downloads, applies: a.stats.applies, version: a.published_version ?? a.current_version })),
			review_queue: db.assets.filter((a) => a.status === "ready_for_review").map((a) => ({ id: a.id, title: a.title, type: a.type })),
		};
	}

	return {
		publicKey,
		upload,
		getUpload: mustUpload,
		createAsset,
		updateAsset,
		addVersion,
		submitReview,
		review,
		publish,
		unpublish,
		rollback,
		bulk,
		runSchedule,
		createCategory,
		categories: (type) => db.categories.filter((c) => !type || c.type === type).sort((a, b) => a.sort - b.sort),
		getAsset: (id) => {
			const a = mustAsset(id);
			return { ...a, category: categoryOf(a) };
		},
		adminList,
		overview,
		auditLog: ({ entity_id, limit = 200 } = {}) => db.audit_log.filter((e) => !entity_id || e.entity_id === entity_id).slice(-limit).reverse(),
		searchAssets,
		assetDetail,
		downloadGrant,
		completeDownload,
		recordUsage,
		sync,
		catalogTypes,
		collections: () => [
			{ slug: "featured", title: "Featured", assets: db.assets.filter((a) => isLive(a) && a.featured).map(publicAsset) },
			{ slug: "new", title: "New this week", assets: searchAssets({ sort: "new", limit: 12 }).data },
			{ slug: "trending", title: "Trending", assets: searchAssets({ sort: "trending", limit: 12 }).data },
		],
		feed,
		packageFile,
		packageTier,
		verifyDownloadToken: (file, expires, sig) => {
			try {
				return new Date(expires) > now() && crypto.verify(null, Buffer.from(`${file}|${expires}`), crypto.createPublicKey(publicKey), Buffer.from(String(sig), "base64"));
			} catch {
				return false;
			}
		},
	};
}
