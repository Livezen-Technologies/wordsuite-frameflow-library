// The signed-in user's side (docs/api-v1-additions.md): devices and plan
// limits, favorites, download history, the installs mirror and the SSE
// live-sync stream.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLibraryClient } from "../packages/sdk-js/index.js";
import { cube, publishAsset } from "./fixtures.js";
import { caller, startTarget, target } from "./harness.js";
import { startIssuer } from "./oidc.js";

const own = { skip: target === "external" && "starts its own backend" };

test("devices: plan limits, re-registration, revocation and downloads with sign-in", own, async (t) => {
	const { issuer, jwt } = await startIssuer(t);
	const s = await startTarget({ tokens: "", env: { LIBRARY_OIDC_ISSUER: issuer } });
	t.after(() => s.server.close());
	const call = caller(s.base);
	const admin = jwt({ sub: "u-admin", library_roles: ["super_admin"], plan: "enterprise" });
	const free = jwt({ sub: "u-free", plan: "free" });
	const pro = jwt({ sub: "u-pro", plan: "pro" });
	const a = await publishAsset(call, admin, "warm.cube", cube(17), { title: "Warm Film" });
	const reg = (token, fingerprint_hash, extra = {}) => call("POST", "/api/v1/devices/register", { token, body: { fingerprint_hash, os: "windows", app_version: "2.1.0", ...extra } });

	assert.equal((await reg(undefined, "fp-anon-0001")).status, 401);
	assert.equal((await reg(free, "x")).data.error.details[0].rule, "device.fingerprint");
	assert.equal((await reg(free, "fp-free-0001", { os: "beos" })).data.error.details[0].rule, "device.os");

	const d1 = await reg(free, "fp-free-0001", { name: "Studio PC" });
	assert.equal(d1.status, 201);
	assert.deepEqual(Object.keys(d1.data).sort(), ["app_version", "created_at", "id", "last_seen_at", "name", "os"]);
	assert.equal(d1.data.name, "Studio PC");
	const again = await reg(free, "fp-free-0001", { app_version: "2.2.0" });
	assert.equal(again.status, 200);
	assert.equal(again.data.id, d1.data.id);
	assert.equal(again.data.app_version, "2.2.0");
	assert.equal((await reg(free, "fp-free-0002")).status, 201);
	const over = await reg(free, "fp-free-0003");
	assert.equal(over.status, 409);
	assert.equal(over.data.error.code, "DEVICE_LIMIT");
	assert.deepEqual(over.data.error.details, [{ field: "device", rule: "device.limit", value: 2 }]);
	const mine = await call("GET", "/api/v1/me/devices", { token: free });
	assert.equal(mine.data.limit, 2);
	assert.equal(mine.data.data.length, 2);
	assert.ok(mine.headers.get("etag"));
	assert.equal((await call("GET", "/api/v1/me/devices", { token: pro })).data.limit, 3);

	// Downloads need a non-revoked device of the caller.
	const dl = (token, device) => call("POST", `/api/v1/assets/${a.id}/download`, { token, body: {}, headers: device ? { "X-Device-Id": device } : {} });
	assert.equal((await dl(free)).data.error.code, "DEVICE_REQUIRED");
	assert.equal((await dl(pro, d1.data.id)).data.error.code, "DEVICE_REQUIRED");
	const grant = await dl(free, d1.data.id);
	assert.equal(grant.status, 200, JSON.stringify(grant.data));
	assert.equal((await call("DELETE", `/api/v1/me/devices/${d1.data.id}`, { token: pro })).status, 404);
	assert.equal((await call("DELETE", `/api/v1/me/devices/${d1.data.id}`, { token: free })).status, 204);
	assert.equal((await dl(free, d1.data.id)).status, 403);
	// The freed slot can be used again.
	assert.equal((await reg(free, "fp-free-0003")).status, 201);
	assert.equal((await call("GET", "/api/v1/me/downloads", { token: free })).data.data[0].device_id, d1.data.id);
});

test("my library: favorites, download history and the installs mirror through the SDK", own, async (t) => {
	const s = await startTarget({ tokens: "su:super_admin:u1,alice:analyst:alice,bob:analyst:bob" });
	t.after(() => s.server.close());
	const call = caller(s.base);
	const warm = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Warm Film" });
	const cool = await publishAsset(call, "su", "cool.cube", cube(17), { title: "Cool Film" });
	const alice = createLibraryClient({ baseUrl: s.base, getToken: () => "alice", appVersion: "2.0.0" });
	const device = await alice.registerDevice({ fingerprintHash: "fp-alice-laptop", os: "linux" });
	alice.useDevice(device.id);

	assert.equal((await call("GET", "/api/v1/me/favorites")).status, 401);
	await alice.addFavorite(warm.id);
	await alice.addFavorite(warm.id);
	await alice.mergeFavorites([cool.slug, warm.id, "no-such-asset"]).then((r) => assert.deepEqual(r, { merged: 2, failed: ["no-such-asset"] }));
	assert.deepEqual((await alice.favorites()).map((a) => a.slug), ["cool-film", "warm-film"]);
	assert.equal((await alice.asset(warm.id)).stats.favorites, 1);
	await call("PUT", `/api/v1/me/favorites/${warm.id}`, { token: "bob" });
	assert.equal((await alice.asset(warm.id)).stats.favorites, 2);
	assert.equal((await call("DELETE", `/api/v1/me/favorites/${warm.id}`, { token: "alice" })).status, 204);
	assert.equal((await call("DELETE", `/api/v1/me/favorites/${warm.id}`, { token: "alice" })).status, 204);
	assert.equal((await alice.asset(warm.id)).stats.favorites, 1);
	assert.equal((await call("PUT", "/api/v1/me/favorites/missing", { token: "alice" })).status, 404);

	for (const a of [warm, cool, warm]) {
		const g = await alice.requestDownload(a.id);
		await alice.completeDownload(g.download_id, { status: "installed", bytes: g.size });
	}
	const page1 = await alice.downloads({ limit: 2 });
	assert.deepEqual(page1.data.map((d) => [d.asset.slug, d.status, d.device_id]), [["warm-film", "installed", device.id], ["cool-film", "installed", device.id]]);
	assert.ok(page1.next_cursor);
	const page2 = await alice.downloads({ limit: 2, cursor: page1.next_cursor });
	assert.deepEqual(page2.data.map((d) => d.asset.slug), ["warm-film"]);
	assert.equal(page2.next_cursor, null);
	assert.deepEqual((await call("GET", "/api/v1/me/downloads", { token: "bob" })).data.data, []);

	const inst = await call("POST", "/api/v1/me/installs", { token: "alice", body: { device_id: device.id, asset_id: warm.id, version: "1.0.0" } });
	assert.equal(inst.status, 201);
	assert.deepEqual(Object.keys(inst.data).sort(), ["asset_id", "device_id", "installed_at", "last_used_at", "version"]);
	await alice.recordInstall({ assetId: warm.id, version: "1.0.0" });
	await alice.recordInstall({ assetId: cool.id, version: "1.0.0", deviceId: "other-machine" });
	assert.equal((await call("POST", "/api/v1/me/installs", { token: "alice", body: { device_id: device.id, asset_id: warm.id, version: "9.9.9" } })).status, 422);
	assert.deepEqual((await alice.installs()).map((i) => i.asset_id), [warm.id]);
	assert.equal((await call("GET", "/api/v1/me/installs", { token: "alice" })).data.data.length, 2);
	await alice.reportUsage([{ asset_id: warm.id, event: "apply" }]);
	assert.ok((await alice.installs())[0].last_used_at);
	await alice.removeInstall(warm.id);
	assert.deepEqual(await alice.installs(), []);
	assert.equal((await call("GET", "/api/v1/me/installs", { token: "alice" })).data.data.length, 1);
	assert.deepEqual((await alice.devices()).data.map((d) => d.id), [device.id]);
});

/** Reads an SSE response; `until(events)` decides when to stop. */
async function readSse(res, until) {
	const events = [];
	const decoder = new TextDecoder();
	let buf = "";
	for await (const chunk of res.body) {
		buf += decoder.decode(chunk, { stream: true });
		let at;
		while ((at = buf.indexOf("\n\n")) >= 0) {
			const block = buf.slice(0, at);
			buf = buf.slice(at + 2);
			const e = { comment: [] };
			for (const line of block.split("\n")) {
				if (line.startsWith(":")) e.comment.push(line.slice(1).trim());
				else if (line) e[line.slice(0, line.indexOf(":"))] = line.slice(line.indexOf(":") + 1).trim();
			}
			events.push(e);
			if (until(events)) return events;
		}
	}
	return events;
}

test("live sync: /sync/stream sends past and new events, pings, and says bye", own, async (t) => {
	const s = await startTarget({ tokens: "su:super_admin:u1", env: { LIBRARY_SSE_MAX_SECONDS: "4", LIBRARY_SSE_POLL_MS: "100", LIBRARY_SSE_PING_SECONDS: "1" } });
	t.after(() => s.server.close());
	const call = caller(s.base);
	const first = await publishAsset(call, "su", "warm.cube", cube(17), { title: "Warm Film" });

	const res = await fetch(`${s.base}/api/v1/sync/stream?since=0`, { headers: { Origin: "https://example.com" } });
	assert.equal(res.status, 200);
	assert.match(res.headers.get("content-type"), /^text\/event-stream/);
	assert.equal(res.headers.get("access-control-allow-origin"), "*");
	const reading = readSse(res, (ev) => ev.some((e) => e.event === "bye"));
	// Published while connected.
	await new Promise((r) => setTimeout(r, 300));
	const second = await publishAsset(call, "su", "cool.cube", cube(17), { title: "Cool Film" });
	const events = await reading;
	const sync = events.filter((e) => e.event === "sync").map((e) => ({ id: e.id, ...JSON.parse(e.data) }));
	assert.deepEqual(sync.map((e) => [e.op, e.asset_id]), [["upsert", first.id], ["upsert", second.id]]);
	assert.deepEqual(sync.map((e) => e.id), sync.map((e) => String(e.seq)));
	assert.ok(events.some((e) => e.comment.includes("ping")), "pings");
	assert.equal(JSON.parse(events.at(-1).data).last_seq, sync[1].seq);

	// Last-Event-ID resumes after that seq.
	const resumed = await fetch(`${s.base}/api/v1/sync/stream`, { headers: { "Last-Event-ID": String(sync[0].seq) } });
	const later = await readSse(resumed, (ev) => ev.some((e) => e.event === "sync"));
	assert.equal(JSON.parse(later.find((e) => e.event === "sync").data).asset_id, second.id);
	await resumed.body.cancel().catch(() => {});

	// The SDK helper reconnects with the last seq after "bye".
	const client = createLibraryClient({ baseUrl: s.base });
	const got = [];
	const stream = client.stream({ since: sync[1].seq, onEvent: (e) => got.push(e), retryMs: 100 });
	t.after(() => stream.close());
	await new Promise((r) => setTimeout(r, 4500));
	const third = await call("POST", `/api/v1/admin/assets/${first.id}/unpublish`, { token: "su", body: { reason: "test" } });
	assert.equal(third.status, 200);
	for (let i = 0; i < 50 && got.length < 1; i++) await new Promise((r) => setTimeout(r, 100));
	stream.close();
	assert.deepEqual(got.map((e) => [e.op, e.asset_id, e.reason]), [["unpublish", first.id, "test"]]);
	assert.equal(stream.lastSeq, got[0].seq);
});
