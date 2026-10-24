// Download Center admin (blueprint §11): A1 Dashboard, A2 Asset Library,
// A3 Upload Center, A4 Asset Editor, A6 Review Queue, A8 Categories, audit log.
// Plain modules, no build step; talks to /api/v1/admin/*.
import { ASSET_TYPES, LICENCE_TERMS, TIERS, VISIBILITIES, can } from "./schema.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const COLORS = { graphic: "#0ea5e9", sfx: "#10b981", text_template: "#f59e0b", video_template: "#8b5cf6", motion: "#ec4899", transition: "#6366f1", lut: "#f97316", font: "#64748b", filter: "#14b8a6", brand_kit: "#a855f7", gif_sticker: "#eab308", lottie: "#22c55e" };
const PILL = { published: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", ready_for_review: "bg-amber-50 text-amber-800 ring-amber-600/20", approved: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", processing: "bg-sky-50 text-sky-700 ring-sky-600/20", failed: "bg-red-50 text-red-700 ring-red-600/20", draft: "bg-gray-50 text-gray-700 ring-gray-500/20", deprecated: "bg-orange-50 text-orange-700 ring-orange-600/20", archived: "bg-gray-100 text-gray-500 ring-gray-400/20" };
const pill = (s) => `<span class="rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL[s] ?? PILL.draft}">${esc(s.replace(/_/g, " "))}</span>`;
const typeName = (t) => ASSET_TYPES[t]?.name.split(" ")[0] ?? t;
const ago = (iso) => {
	const s = (Date.now() - new Date(iso)) / 1000;
	return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

let token = null;
try {
	token = sessionStorage.getItem("fflib.token");
} catch {}
let me = null;
let categories = [];

async function api(method, path, body, { raw, headers = {} } = {}) {
	const res = await fetch(`/api/v1${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() } : {}), ...headers },
		body: raw ?? (body ? JSON.stringify(body) : undefined),
	});
	const data = res.status === 204 ? null : await res.json().catch(() => null);
	if (res.status === 401) {
		signOut();
		throw new Error("Session expired");
	}
	if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? `Request failed (${res.status})`), { details: data?.error?.details ?? [] });
	return data;
}

function toast(message, kind = "ok") {
	const el = $("#toast");
	el.className = `fixed bottom-4 right-4 max-w-md rounded-md px-4 py-3 text-sm shadow-lg ${kind === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`;
	el.textContent = message;
	clearTimeout(toast.t);
	toast.t = setTimeout(() => el.classList.add("hidden"), 5000);
}
const fail = (e) => toast(e.details?.length ? `${e.message} (${e.details.map((d) => d.rule).join(", ")})` : e.message, "error");

// ---------- shell ----------

const NAV = [
	["dashboard", "Dashboard"],
	["library", "Asset Library"],
	["upload", "Upload Center", "asset.create"],
	["review", "Review Queue", "asset.review"],
	["categories", "Categories & Tags"],
	["audit", "Audit log", "analytics.view"],
];

function renderNav(current) {
	$("#nav").innerHTML = NAV.filter(([, , perm]) => !perm || can(me.role, perm))
		.map(([id, label]) => `<a href="#/${id}" class="block rounded-md px-2 py-1.5 ${current === id ? "bg-gray-800 text-white" : "hover:bg-gray-800"}">${label}</a>`)
		.join("");
}

async function router() {
	const [, view = "dashboard", arg] = location.hash.split("/");
	renderNav(view === "asset" ? "library" : view);
	const el = $("#view");
	el.innerHTML = `<p class="text-sm text-gray-500">Loading…</p>`;
	try {
		await (VIEWS[view] ?? VIEWS.dashboard)(el, arg);
	} catch (e) {
		el.innerHTML = `<p class="text-sm text-red-600">${esc(e.message)}</p>`;
	}
}

// ---------- A1 dashboard ----------

async function dashboard(el) {
	const o = await api("GET", "/admin/analytics/overview");
	const kpi = (label, value, note = "", warn = false) => `<div class="rounded-lg bg-white p-4 ring-1 ${warn ? "ring-red-200" : "ring-gray-200"}"><dt class="text-xs text-gray-500">${label}</dt><dd class="mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-red-600" : ""}">${value.toLocaleString()}</dd><p class="text-xs text-gray-500">${note}</p></div>`;
	const days = Object.entries(o.downloads_by_day).sort();
	const max = Math.max(1, ...days.map(([, n]) => n));
	el.innerHTML = `
		<div class="flex flex-wrap items-center justify-between gap-2"><h1 class="text-xl font-semibold">Dashboard</h1>${can(me.role, "asset.create") ? `<a href="#/upload" class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Upload assets</a>` : ""}</div>
		<dl class="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
			${kpi("Published assets", o.published, `${o.drafts} drafts`)}${kpi("Downloads (30d)", o.downloads_30d)}${kpi("Active devices (30d)", o.active_devices_30d)}${kpi("In review", o.in_review, `${o.approved} approved`)}${kpi("Failed checks", o.failed, o.failed ? "needs attention" : "", o.failed > 0)}
		</dl>
		<div class="mt-6 grid gap-6 lg:grid-cols-3">
			<div class="lg:col-span-2 rounded-lg bg-white p-5 ring-1 ring-gray-200"><h2 class="text-sm font-semibold">Downloads per day</h2>
				${days.length ? `<div class="mt-4 flex h-40 items-end gap-1">${days.map(([d, n]) => `<div class="flex-1 rounded-t bg-indigo-500" style="height:${(n / max) * 100}%" title="${d}: ${n}"></div>`).join("")}</div>` : `<p class="mt-4 text-sm text-gray-500">No downloads yet.</p>`}
			</div>
			<div class="rounded-lg bg-white p-5 ring-1 ring-gray-200"><h2 class="text-sm font-semibold">Review queue <span class="ml-1 rounded-full bg-amber-100 px-2 text-xs text-amber-800">${o.review_queue.length}</span></h2>
				<ul class="mt-3 divide-y divide-gray-100 text-sm">${o.review_queue.slice(0, 6).map((r) => `<li class="flex justify-between py-2"><a href="#/asset/${r.id}" class="font-medium">${esc(r.title)}</a><span class="text-xs text-gray-500">${typeName(r.type)}</span></li>`).join("") || `<li class="py-2 text-gray-500">Nothing waiting.</li>`}</ul>
				${can(me.role, "asset.review") ? `<a href="#/review" class="mt-3 inline-block text-sm font-semibold text-indigo-600">Open review queue →</a>` : ""}
			</div>
		</div>
		<div class="mt-6 overflow-x-auto rounded-lg bg-white ring-1 ring-gray-200"><h2 class="px-5 pt-4 text-sm font-semibold">Top assets</h2>
			<table class="mt-2 w-full text-sm"><thead class="text-left text-xs text-gray-500"><tr><th class="px-5 py-2">Asset</th><th>Type</th><th>Downloads</th><th>Applied</th><th>Version</th></tr></thead>
			<tbody class="divide-y divide-gray-100">${o.top_assets.map((a) => `<tr><td class="px-5 py-2"><a href="#/asset/${a.id}" class="font-medium">${esc(a.title)}</a></td><td>${typeName(a.type)}</td><td class="tabular-nums">${a.downloads}</td><td class="tabular-nums">${a.applies}</td><td class="font-mono text-xs">${esc(a.version)}</td></tr>`).join("")}</tbody></table>
		</div>`;
}

// ---------- A2 asset library ----------

const libState = { type: "", status: "", q: "", selected: new Set() };

async function library(el) {
	const params = new URLSearchParams(Object.entries({ type: libState.type, status: libState.status, q: libState.q }).filter(([, v]) => v));
	const { data, total } = await api("GET", `/admin/assets?${params}&limit=200`);
	const sel = libState.selected;
	el.innerHTML = `
		<div class="flex flex-wrap items-center justify-between gap-2"><div><h1 class="text-xl font-semibold">Asset Library</h1><p class="text-sm text-gray-500">${total} assets</p></div>${can(me.role, "asset.create") ? `<a href="#/upload" class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">+ Upload</a>` : ""}</div>
		<div class="mt-5 flex flex-wrap gap-1 border-b border-gray-200 text-sm" role="tablist">${[["", "All"], ...Object.keys(ASSET_TYPES).map((t) => [t, typeName(t)])].map(([t, n]) => `<button data-type="${t}" class="px-3 py-2 ${libState.type === t ? "border-b-2 border-indigo-600 font-semibold text-indigo-600" : "text-gray-500"}">${n}</button>`).join("")}</div>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			<input id="q" value="${esc(libState.q)}" class="w-full sm:w-72 rounded-md px-3 py-2 text-sm ring-1 ring-gray-300" placeholder="Search title, tag, slug…">
			<select id="status" class="rounded-md px-3 py-2 text-sm ring-1 ring-gray-300"><option value="">Status: All</option>${Object.keys(PILL).map((s) => `<option ${libState.status === s ? "selected" : ""} value="${s}">${s.replace(/_/g, " ")}</option>`).join("")}</select>
		</div>
		<div id="bulk" class="mt-4 ${sel.size ? "flex" : "hidden"} flex-wrap items-center gap-3 rounded-md bg-indigo-50 px-4 py-2 text-sm text-indigo-900">
			<b>${sel.size} selected</b>
			${can(me.role, "asset.publish") ? `<button data-bulk="publish" class="font-semibold">Publish</button><button data-bulk="unpublish" class="font-semibold">Unpublish</button>` : ""}
			<button data-bulk="tag_add" class="font-semibold">Add tags</button>
			${can(me.role, "access.manage") ? `<button data-bulk="set_tier" class="font-semibold">Set tier</button>` : ""}
			${can(me.role, "asset.archive") ? `<button data-bulk="archive" class="font-semibold text-red-600">Archive</button>` : ""}
		</div>
		<div class="mt-3 overflow-x-auto"><table class="w-full text-sm"><thead class="border-b text-left text-xs text-gray-500"><tr><th class="w-8 py-2"><input type="checkbox" id="all" aria-label="Select all"></th><th>Asset</th><th>Type</th><th>Category</th><th>Status</th><th>Tier</th><th>Version</th><th>Downloads</th><th>Updated</th></tr></thead>
		<tbody class="divide-y divide-gray-100">${data.map((a) => `<tr class="${sel.has(a.id) ? "bg-indigo-50/40" : ""}"><td class="py-2.5"><input type="checkbox" data-id="${a.id}" ${sel.has(a.id) ? "checked" : ""} aria-label="Select ${esc(a.title)}"></td><td><a href="#/asset/${a.id}" class="flex items-center gap-3"><span class="thumb size-9 shrink-0 rounded" style="--a:${COLORS[a.type]}"></span><span class="font-medium">${esc(a.title)}</span></a></td><td class="text-gray-600">${typeName(a.type)}</td><td class="text-gray-600">${esc(a.category?.name ?? "—")}</td><td>${pill(a.status)}</td><td>${esc(a.licence_tier)}</td><td class="font-mono text-xs">${esc(a.current_version)}</td><td class="tabular-nums">${a.stats.downloads}</td><td class="text-gray-500">${ago(a.updated_at)}</td></tr>`).join("") || `<tr><td colspan="9" class="py-6 text-center text-gray-500">No assets match.</td></tr>`}</tbody></table></div>`;
	el.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => ((libState.type = b.dataset.type), library(el))));
	$("#q", el).onchange = (e) => ((libState.q = e.target.value), library(el));
	$("#status", el).onchange = (e) => ((libState.status = e.target.value), library(el));
	$("#all", el).onchange = (e) => {
		for (const a of data) e.target.checked ? sel.add(a.id) : sel.delete(a.id);
		library(el);
	};
	el.querySelectorAll("[data-id]").forEach((c) => (c.onchange = () => (c.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id), library(el))));
	el.querySelectorAll("[data-bulk]").forEach(
		(b) =>
			(b.onclick = async () => {
				const action = b.dataset.bulk;
				const payload = {};
				if (action === "tag_add") payload.tags = prompt("Tags to add (comma separated)") ?? "";
				if (action === "set_tier") payload.licence_tier = prompt(`Tier (${TIERS.join(", ")})`) ?? "";
				try {
					const { results } = await api("POST", "/admin/assets/bulk", { ids: [...sel], action, payload });
					const bad = results.filter((r) => !r.ok);
					toast(bad.length ? `${results.length - bad.length} done, ${bad.length} failed: ${bad[0].error.message}` : `${results.length} updated`, bad.length ? "error" : "ok");
					sel.clear();
					library(el);
				} catch (e) {
					fail(e);
				}
			}),
	);
}

// ---------- A3 upload center ----------

async function upload(el) {
	const rows = [];
	el.innerHTML = `
		<h1 class="text-xl font-semibold">Upload Center</h1>
		<div class="mt-4 grid gap-6 lg:grid-cols-3">
			<div class="lg:col-span-2">
				<label id="drop" class="block cursor-pointer rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-10 text-center">
					<input id="files" type="file" multiple class="sr-only">
					<p class="text-sm font-semibold">Drag files here, or <span class="text-indigo-600">browse</span></p>
					<p class="text-xs text-gray-500">PNG, SVG, WebP, WAV, MP3, .cube, TTF/OTF/WOFF2, GIF, Lottie JSON, .fftext, .fftemplate, .ffx, .ffbrand</p>
				</label>
				<ul id="list" class="mt-5 divide-y divide-gray-100 rounded-lg bg-white ring-1 ring-gray-200"></ul>
			</div>
			<form id="defaults" class="self-start rounded-lg bg-white p-5 ring-1 ring-gray-200 text-sm">
				<h2 class="font-semibold">Defaults for this batch</h2>
				<label class="mt-4 block text-xs font-medium">Tags</label><input name="tags" class="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-gray-300" placeholder="wedding, cinematic">
				<label class="mt-3 block text-xs font-medium">Licence tier</label><select name="licence_tier" class="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-gray-300">${TIERS.map((t) => `<option>${t}</option>`).join("")}</select>
				<label class="mt-3 block text-xs font-medium">Min FrameFlow version</label><input name="min_app_version" value="1.0.0" class="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-gray-300">
				<label class="mt-3 flex items-center gap-2"><input type="checkbox" name="submit_for_review" checked> Submit for review when processed</label>
				<button id="create" class="mt-5 w-full rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50" disabled>Create drafts</button>
				<p id="skip" class="mt-2 text-xs text-gray-500"></p>
			</form>
		</div>`;
	const list = $("#list", el);
	const draw = () => {
		list.innerHTML = rows
			.map((r, i) => {
				const failed = r.upload?.checks.filter((c) => !c.passed) ?? [];
				const status = r.error ? `<span class="text-red-600">${esc(r.error)}</span>` : !r.upload ? "Uploading…" : failed.length ? `<span class="text-red-600">Blocked · ${esc(failed[0].detail?.message ?? `${failed[0].detail?.rule ?? failed[0].check}${failed[0].detail?.value != null ? ` = ${JSON.stringify(failed[0].detail.value)}` : ""}`)}</span>` : `<span class="text-emerald-600">Valid${r.upload.duplicate_of ? " · duplicate of an existing asset" : ""}</span>`;
				return `<li class="flex flex-wrap items-center gap-3 p-3 text-sm"><select data-i="${i}" class="w-36 rounded px-2 py-1 text-xs ring-1 ring-gray-300" aria-label="Type"><option value="">Type…</option>${Object.keys(ASSET_TYPES).map((t) => `<option value="${t}" ${r.type === t ? "selected" : ""}>${typeName(t)}</option>`).join("")}</select><div class="min-w-0 flex-1"><p class="truncate font-medium">${esc(r.file.name)}</p><div class="bar mt-1"><i style="width:${r.upload || r.error ? 100 : 30}%;${failed.length || r.error ? "background:#ef4444" : ""}"></i></div><p class="mt-1 text-xs">${status}</p></div><span class="text-xs text-gray-500">${(r.file.size / 1024).toFixed(0)} KB</span></li>`;
			})
			.join("");
		list.querySelectorAll("select[data-i]").forEach((s) => (s.onchange = () => send(rows[s.dataset.i], s.value)));
		const ok = rows.filter((r) => r.upload && r.type && r.upload.checks.every((c) => c.passed));
		$("#create", el).disabled = !ok.length;
		$("#create", el).textContent = `Create ${ok.length} draft${ok.length === 1 ? "" : "s"}`;
		const skipped = rows.length - ok.length;
		$("#skip", el).textContent = skipped ? `${skipped} file${skipped === 1 ? " is" : "s are"} blocked or need a type and will be skipped.` : "";
	};
	async function send(row, type = "") {
		row.upload = null;
		row.error = null;
		draw();
		try {
			row.upload = await api("POST", `/admin/uploads${type ? `?type=${type}` : ""}`, null, { raw: row.file, headers: { "X-Filename": encodeURIComponent(row.file.name) } });
			row.type = row.upload.type;
		} catch (e) {
			row.error = e.message;
		}
		draw();
	}
	const add = (files) => {
		for (const file of files) {
			const row = { file, upload: null, type: null };
			rows.push(row);
			send(row);
		}
	};
	$("#files", el).onchange = (e) => add(e.target.files);
	const drop = $("#drop", el);
	drop.ondragover = (e) => (e.preventDefault(), drop.classList.add("bg-indigo-100"));
	drop.ondragleave = () => drop.classList.remove("bg-indigo-100");
	drop.ondrop = (e) => (e.preventDefault(), drop.classList.remove("bg-indigo-100"), add(e.dataTransfer.files));
	$("#defaults", el).onsubmit = async (e) => {
		e.preventDefault();
		const f = new FormData(e.target);
		const defaults = { tags: f.get("tags"), licence_tier: f.get("licence_tier"), min_app_version: f.get("min_app_version"), submit_for_review: f.get("submit_for_review") === "on" };
		const items = rows.filter((r) => r.upload && r.type && r.upload.checks.every((c) => c.passed)).map((r) => ({ upload_id: r.upload.id, type: r.type }));
		try {
			const { data } = await api("POST", "/admin/assets", { defaults, items });
			const bad = data.filter((d) => !d.ok);
			toast(bad.length ? `${data.length - bad.length} drafts created; ${bad.length} failed: ${bad[0].error.message}` : `${data.length} drafts created`, bad.length ? "error" : "ok");
			location.hash = "#/library";
		} catch (err) {
			fail(err);
		}
	};
}

// ---------- A4 asset editor ----------

async function assetEditor(el, id) {
	const a = await api("GET", `/admin/assets/${id}`);
	const editable = can(me.role, "asset.edit.all") || (can(me.role, "asset.edit.own") && a.created_by === me.id);
	const v = a.versions.find((x) => x.version === a.current_version) ?? a.versions.at(-1);
	const cats = categories.filter((c) => c.type === a.type);
	const field = (label, name, value, attrs = "") => `<div><label class="text-xs font-medium" for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(value)}" ${attrs} class="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-gray-300"></div>`;
	const select = (label, name, options, value) => `<div><label class="text-xs font-medium" for="f-${name}">${label}</label><select id="f-${name}" name="${name}" class="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-gray-300">${options.map(([v, n]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;
	const actions = [];
	if (editable && ["draft", "failed"].includes(a.status)) actions.push(["submit-review", "Submit for review", "bg-white ring-1 ring-gray-300"]);
	if (can(me.role, "asset.review") && a.status === "ready_for_review") actions.push(["approve", "Approve", "bg-emerald-600 text-white"], ["reject", "Reject…", "bg-white text-red-600 ring-1 ring-red-200"]);
	if (can(me.role, "asset.publish") && (["approved", "deprecated"].includes(a.status) || a.pending_version || (can(me.role, "asset.publish.direct") && ["draft", "ready_for_review"].includes(a.status)))) actions.push(["publish", a.pending_version ? `Publish ${a.pending_version}` : "Publish", "bg-indigo-600 text-white"]);
	if (can(me.role, "asset.publish") && a.status === "published") actions.push(["unpublish", "Unpublish", "bg-white ring-1 ring-gray-300"], ["deprecate", "Deprecate", "bg-white ring-1 ring-gray-300"]);
	if (can(me.role, "asset.archive") && !["archived"].includes(a.status)) actions.push(["archive", "Archive", "bg-white text-red-600 ring-1 ring-red-200"]);
	el.innerHTML = `
		<p class="text-xs text-gray-500"><a href="#/library">Asset Library</a> / ${typeName(a.type)} / ${esc(a.title)}</p>
		<div class="mt-1 flex flex-wrap items-center gap-3"><h1 class="text-xl font-semibold">${esc(a.title)}</h1>${pill(a.status)}<span class="text-xs text-gray-500">v${esc(a.current_version)} · ${esc(a.type)}${a.published_version ? ` · live ${esc(a.published_version)}` : ""}</span></div>
		${a.review && !a.review.approved ? `<p class="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: ${esc(a.review.reason)}</p>` : ""}
		<div class="mt-6 grid gap-8 lg:grid-cols-3">
			<form id="meta" class="lg:col-span-2 grid gap-4 sm:grid-cols-2 text-sm">
				<div class="sm:col-span-2">${field("Title", "title", a.title)}</div>
				${field("Slug", "slug", a.slug, a.published_at ? "readonly title='Immutable after first publish'" : "")}
				${select("Category", "category_id", cats.map((c) => [c.id, c.name]), a.category_id)}
				<div class="sm:col-span-2"><label class="text-xs font-medium" for="f-description">Description</label><textarea id="f-description" name="description" rows="3" class="mt-1 w-full rounded-md px-3 py-2 ring-1 ring-gray-300">${esc(a.description)}</textarea></div>
				<div class="sm:col-span-2">${field("Tags (comma separated)", "tags", a.tags.join(", "))}</div>
				<div class="sm:col-span-2">${field("Search keywords (incl. Sinhala / Tamil)", "keywords", a.keywords.join(", "))}</div>
				${select("Licence tier", "licence_tier", TIERS.map((t) => [t, t]), a.licence_tier)}
				${select("Licence terms", "licence_terms", LICENCE_TERMS.map((t) => [t, t.replace(/_/g, " ")]), a.licence_terms)}
				${select("Visibility", "visibility", VISIBILITIES.map((t) => [t, t]), a.visibility)}
				${field("Min FrameFlow version", "min_app_version", a.min_app_version)}
				${field("Author / source", "author", a.author)}
				${field("Attribution text", "attribution_text", a.attribution_text)}
				<label class="flex items-center gap-2"><input type="checkbox" name="attribution_required" ${a.attribution_required ? "checked" : ""}> Attribution required</label>
				<label class="flex items-center gap-2"><input type="checkbox" name="featured" ${a.featured ? "checked" : ""}> Featured</label>
				<div class="sm:col-span-2"><p class="text-xs font-medium">Detected metadata</p><pre class="mt-1 max-h-48 overflow-auto rounded-md bg-gray-50 p-3 text-xs ring-1 ring-gray-200">${esc(JSON.stringify(a.meta, null, 2))}</pre></div>
				${editable ? `<div class="sm:col-span-2"><button class="rounded-md bg-white px-3 py-2 font-semibold ring-1 ring-gray-300">Save details</button></div>` : ""}
			</form>
			<div class="space-y-4 text-sm">
				<div class="rounded-lg bg-white p-4 ring-1 ring-gray-200"><h2 class="font-semibold">Publishing</h2>
					<div class="mt-3 flex flex-col gap-2">${actions.map(([act, label, cls]) => `<button data-act="${act}" class="rounded-md px-3 py-2 font-semibold ${cls}">${label}</button>`).join("") || `<p class="text-gray-500">No actions for your role.</p>`}</div>
					${can(me.role, "asset.publish") ? `<label class="mt-3 block text-xs" for="sched">Schedule publish</label><input id="sched" type="datetime-local" class="mt-1 w-full rounded-md px-2 py-1.5 ring-1 ring-gray-300"><button data-act="schedule" class="mt-2 text-xs font-semibold text-indigo-600">Schedule</button>${a.publish_at ? `<p class="mt-1 text-xs text-gray-500">Scheduled for ${esc(new Date(a.publish_at).toLocaleString())}</p>` : ""}` : ""}
				</div>
				<div class="rounded-lg bg-white p-4 ring-1 ring-gray-200"><h2 class="font-semibold">Checks · v${esc(v?.version)}</h2>
					<ul class="mt-2 space-y-1.5">${(v?.checks ?? []).map((c) => `<li class="flex justify-between gap-2"><span>${esc(c.check.replace(/[._]/g, " "))}</span><span class="${c.passed ? "text-emerald-600" : "text-red-600"}">${c.passed ? "Passed" : esc(c.detail?.message ?? `Failed (${c.detail?.rule}: ${JSON.stringify(c.detail?.value)})`)}</span></li>`).join("")}
					<li class="flex justify-between"><span>Thumbnail</span><span class="${a.thumbnail_file ? "text-emerald-600" : "text-amber-600"}">${a.thumbnail_file ? "Present" : "Missing"}</span></li>
					<li class="flex justify-between"><span>Reviewer approval</span><span class="${["approved", "published"].includes(a.status) ? "text-emerald-600" : "text-amber-600"}">${["approved", "published"].includes(a.status) ? "Done" : "Pending"}</span></li></ul>
				</div>
				<div class="rounded-lg bg-white p-4 ring-1 ring-gray-200"><h2 class="font-semibold">Versions</h2>
					<ul class="mt-2 space-y-1 text-xs">${[...a.versions].reverse().map((x) => `<li class="flex items-center justify-between gap-2"><span class="font-mono">${esc(x.version)}${x.is_breaking ? " ⚠ breaking" : ""}</span><span>${esc(x.status)}${x.version === a.published_version ? " · current" : ""}</span>${x.package && x.version !== a.published_version && can(me.role, "version.rollback") ? `<button data-rollback="${esc(x.version)}" class="font-semibold text-indigo-600">Roll back</button>` : ""}</li>`).join("")}</ul>
					${editable ? `<div class="mt-3 border-t pt-3"><label class="text-xs font-medium" for="nv">Upload new version</label><input id="nv" type="file" class="mt-1 block w-full text-xs"><input id="nvlog" placeholder="Changelog" class="mt-2 w-full rounded-md px-2 py-1.5 text-xs ring-1 ring-gray-300"><label class="mt-2 flex items-center gap-2 text-xs"><input id="nvbreak" type="checkbox"> Breaking change</label><button id="nvgo" class="mt-2 text-xs font-semibold text-indigo-600">Upload version</button></div>` : ""}
					${editable ? `<div class="mt-3 border-t pt-3"><label class="text-xs font-medium" for="thumb">Replace thumbnail (640×360)</label><input id="thumb" type="file" accept="image/png,image/webp" class="mt-1 block w-full text-xs"></div>` : ""}
				</div>
				<div class="rounded-lg bg-white p-4 ring-1 ring-gray-200"><h2 class="font-semibold">Activity</h2><ul id="activity" class="mt-2 space-y-1 text-xs text-gray-600"></ul></div>
			</div>
		</div>`;
	const reload = () => assetEditor(el, a.id);
	$("#meta", el).onsubmit = async (e) => {
		e.preventDefault();
		const f = new FormData(e.target);
		const patch = Object.fromEntries(["title", "slug", "category_id", "description", "tags", "keywords", "licence_tier", "licence_terms", "visibility", "min_app_version", "author", "attribution_text"].map((k) => [k, f.get(k) ?? ""]));
		if (patch.slug === a.slug) delete patch.slug;
		patch.tags = patch.tags.split(",");
		patch.keywords = patch.keywords.split(",");
		patch.attribution_required = f.get("attribution_required") === "on";
		patch.featured = f.get("featured") === "on";
		try {
			await api("PATCH", `/admin/assets/${a.id}`, patch);
			toast("Saved");
			reload();
		} catch (err) {
			fail(err);
		}
	};
	el.querySelectorAll("[data-act]").forEach(
		(b) =>
			(b.onclick = async () => {
				const act = b.dataset.act;
				try {
					if (act === "reject") {
						const reason = prompt("Reason for rejecting");
						if (!reason) return;
						await api("POST", `/admin/assets/${a.id}/reject`, { reason });
					} else if (act === "schedule") {
						const at = $("#sched", el).value;
						if (!at) return;
						await api("POST", `/admin/assets/${a.id}/publish`, { publish_at: new Date(at).toISOString() });
					} else await api("POST", `/admin/assets/${a.id}/${act}`, {});
					toast("Done");
					reload();
				} catch (err) {
					fail(err);
				}
			}),
	);
	el.querySelectorAll("[data-rollback]").forEach(
		(b) =>
			(b.onclick = async () => {
				if (!confirm(`Make ${b.dataset.rollback} the current version again?`)) return;
				try {
					await api("POST", `/admin/assets/${a.id}/versions/${b.dataset.rollback}/rollback`, {});
					reload();
				} catch (err) {
					fail(err);
				}
			}),
	);
	const uploadFile = (file) => api("POST", "/admin/uploads", null, { raw: file, headers: { "X-Filename": encodeURIComponent(file.name) } });
	$("#nvgo", el)?.addEventListener("click", async () => {
		const file = $("#nv", el).files[0];
		if (!file) return;
		try {
			const up = await api("POST", `/admin/uploads?type=${a.type}`, null, { raw: file, headers: { "X-Filename": encodeURIComponent(file.name) } });
			await api("POST", `/admin/assets/${a.id}/versions`, { upload_id: up.id, changelog: $("#nvlog", el).value, is_breaking: $("#nvbreak", el).checked });
			toast("New version uploaded");
			reload();
		} catch (err) {
			fail(err);
		}
	});
	$("#thumb", el)?.addEventListener("change", async (e) => {
		try {
			const up = await uploadFile(e.target.files[0]);
			await api("PATCH", `/admin/assets/${a.id}`, { thumbnail_upload_id: up.id });
			toast("Thumbnail replaced; it ships with the next publish");
			reload();
		} catch (err) {
			fail(err);
		}
	});
	if (can(me.role, "analytics.view")) {
		const { data } = await api("GET", `/admin/audit-log?entity_id=${a.id}`);
		$("#activity", el).innerHTML = data.map((e) => `<li>${esc(e.action)} · ${esc(e.actor_role)} · ${ago(e.at)}</li>`).join("") || "<li>No activity.</li>";
	}
}

// ---------- A6 review queue ----------

async function review(el) {
	const { data } = await api("GET", "/admin/assets?status=ready_for_review&limit=200");
	el.innerHTML = `<h1 class="text-xl font-semibold">Review Queue</h1>
		<ul class="mt-4 divide-y rounded-lg bg-white ring-1 ring-gray-200 text-sm">${data.map((a) => {
			const v = a.versions.find((x) => x.version === a.current_version);
			const ok = v?.checks.every((c) => c.passed);
			return `<li class="flex flex-wrap items-center gap-4 p-4"><span class="thumb size-12 shrink-0 rounded" style="--a:${COLORS[a.type]}"></span><div class="min-w-0 flex-1"><a href="#/asset/${a.id}" class="font-medium">${esc(a.title)}</a><p class="text-xs text-gray-500">${typeName(a.type)} · v${esc(a.current_version)} · ${ok ? "all checks passed" : "checks failed"} · ${ago(a.updated_at)}</p></div><button data-approve="${a.id}" class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Approve</button><button data-reject="${a.id}" class="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200">Reject…</button></li>`;
		}).join("") || `<li class="p-6 text-center text-gray-500">Nothing waiting for review.</li>`}</ul>`;
	el.querySelectorAll("[data-approve]").forEach((b) => (b.onclick = () => api("POST", `/admin/assets/${b.dataset.approve}/approve`, {}).then(() => (toast("Approved"), review(el)), fail)));
	el.querySelectorAll("[data-reject]").forEach(
		(b) =>
			(b.onclick = () => {
				const reason = prompt("Reason for rejecting");
				if (reason) api("POST", `/admin/assets/${b.dataset.reject}/reject`, { reason }).then(() => (toast("Rejected"), review(el)), fail);
			}),
	);
}

// ---------- A8 categories ----------

async function categoriesView(el) {
	categories = (await api("GET", "/admin/categories")).data;
	el.innerHTML = `<h1 class="text-xl font-semibold">Categories</h1>
		${can(me.role, "taxonomy.manage") ? `<form id="newcat" class="mt-4 flex flex-wrap gap-2 text-sm"><select name="type" class="rounded-md px-3 py-2 ring-1 ring-gray-300" aria-label="Type">${Object.keys(ASSET_TYPES).map((t) => `<option value="${t}">${typeName(t)}</option>`).join("")}</select><input name="name" required placeholder="New category" class="rounded-md px-3 py-2 ring-1 ring-gray-300"><button class="rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white">Add</button></form>` : ""}
		<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${Object.keys(ASSET_TYPES).map((t) => `<div class="rounded-lg bg-white p-4 ring-1 ring-gray-200"><p class="flex items-center gap-2 text-sm font-semibold"><i class="size-2 rounded-full" style="background:${COLORS[t]}"></i>${esc(ASSET_TYPES[t].name)}</p><p class="text-xs text-gray-500">Installs to ${esc(ASSET_TYPES[t].dir)}/ · ${esc(ASSET_TYPES[t].target)}</p><ul class="mt-2 text-sm text-gray-700">${categories.filter((c) => c.type === t).map((c) => `<li>${esc(c.name)}</li>`).join("")}</ul></div>`).join("")}</div>`;
	$("#newcat", el)?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const f = new FormData(e.target);
		try {
			await api("POST", "/admin/categories", { type: f.get("type"), name: f.get("name") });
			categoriesView(el);
		} catch (err) {
			fail(err);
		}
	});
}

// ---------- audit ----------

async function audit(el) {
	const { data } = await api("GET", "/admin/audit-log");
	el.innerHTML = `<h1 class="text-xl font-semibold">Audit log</h1><div class="mt-4 overflow-x-auto rounded-lg bg-white ring-1 ring-gray-200"><table class="w-full text-sm"><thead class="text-left text-xs text-gray-500"><tr><th class="px-4 py-2">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Change</th></tr></thead><tbody class="divide-y divide-gray-100">${data.map((e) => `<tr><td class="px-4 py-2 whitespace-nowrap text-gray-500">${esc(new Date(e.at).toLocaleString())}</td><td>${esc(e.actor_role)}</td><td class="font-mono text-xs">${esc(e.action)}</td><td><a class="text-indigo-600" href="#/asset/${esc(e.entity_id)}">${esc(e.entity)}</a></td><td class="max-w-md truncate font-mono text-xs" title="${esc(JSON.stringify(e.diff))}">${esc(JSON.stringify(e.diff.after))}</td></tr>`).join("")}</tbody></table></div>`;
}

const VIEWS = { dashboard, library, upload, asset: assetEditor, review, categories: categoriesView, audit };

// ---------- auth ----------

function signOut() {
	token = null;
	try {
		sessionStorage.removeItem("fflib.token");
	} catch {}
	$("#app").classList.add("hidden");
	$("#signin").classList.remove("hidden");
}

async function boot() {
	if (!token) return signOut();
	try {
		me = await api("GET", "/admin/me");
		categories = (await api("GET", "/admin/categories")).data;
	} catch {
		return signOut();
	}
	$("#signin").classList.add("hidden");
	$("#app").classList.remove("hidden");
	$("#who").textContent = me.role.replace(/_/g, " ");
	router();
}

$("#signinForm").onsubmit = async (e) => {
	e.preventDefault();
	token = $("#token").value.trim();
	try {
		sessionStorage.setItem("fflib.token", token);
	} catch {}
	await boot();
	if (!me) $("#signinError").textContent = "That token wasn't accepted.";
};
$("#signout").onclick = signOut;
window.addEventListener("hashchange", router);
boot();
