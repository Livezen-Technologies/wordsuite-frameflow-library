// Typed client for the FrameFlow Library API (blueprint §7.2). Used by the
// FrameFlow desktop module; works in Node 22+, Electron and browsers.

export class LibraryError extends Error {
	constructor(status, body) {
		super(body?.error?.message ?? `Library request failed (${status})`);
		this.status = status;
		this.code = body?.error?.code ?? "HTTP_ERROR";
		this.details = body?.error?.details ?? [];
		this.requestId = body?.error?.request_id ?? null;
	}
}

/**
 * @param {object} options
 * @param {string} options.baseUrl  e.g. https://library.frameflow.worksuite.lk
 * @param {() => string | null | Promise<string | null>} [options.getToken]  OneAuth access token
 * @param {string} [options.appVersion]  sent as X-App-Version (hides incompatible assets)
 * @param {string} [options.deviceId]
 * @param {string} [options.plan]  dev only; production derives the plan from the token
 * @param {typeof fetch} [options.fetch]
 */
export function createLibraryClient({ baseUrl, getToken = () => null, appVersion, deviceId, plan, fetch: fetchImpl = globalThis.fetch }) {
	const root = baseUrl.replace(/\/$/, "");
	let currentDevice = deviceId;
	async function call(method, path, body) {
		const token = await getToken();
		const res = await fetchImpl(`${root}/api/v1${path}`, {
			method,
			headers: {
				Accept: "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(appVersion ? { "X-App-Version": appVersion } : {}),
				...(currentDevice ? { "X-Device-Id": currentDevice } : {}),
				...(plan ? { "X-Plan": plan } : {}),
				...(body ? { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = await res.json().catch(() => null);
		if (!res.ok) throw new LibraryError(res.status, data);
		return data;
	}
	const qs = (o) => {
		const p = new URLSearchParams(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
		return p.size ? `?${p}` : "";
	};
	return {
		types: () => call("GET", "/catalog/types").then((r) => r.data),
		categories: (type) => call("GET", `/catalog/categories${qs({ type })}`).then((r) => r.data),
		search: (params = {}) => call("GET", `/assets${qs(params)}`),
		asset: (id) => call("GET", `/assets/${encodeURIComponent(id)}`),
		suggest: (q) => call("GET", `/search/suggest${qs({ q })}`).then((r) => r.data),
		collections: () => call("GET", "/collections").then((r) => r.data),
		collection: (slug) => call("GET", `/collections/${encodeURIComponent(slug)}`),
		/** Signed, 5-minute download grant; `url` is made absolute. */
		requestDownload: (id, { version } = {}) => call("POST", `/assets/${encodeURIComponent(id)}/download`, { version, device_id: currentDevice }).then((g) => ({ ...g, url: new URL(g.url, `${root}/`).toString() })),
		completeDownload: (downloadId, report) => call("POST", `/downloads/${encodeURIComponent(downloadId)}/complete`, report),
		reportUsage: (events) => call("POST", "/me/usage", { events: events.map((e) => ({ device_id: currentDevice, ...e })) }),
		sync: (since = 0) => call("GET", `/sync${qs({ since, device_id: currentDevice })}`),
		entitlements: () => call("GET", "/entitlements"),

		/** Device binding (§7.1): registers this machine (same fingerprint → same device). */
		registerDevice: ({ fingerprintHash, os, appVersion: version = appVersion, name } = {}) => call("POST", "/devices/register", { fingerprint_hash: fingerprintHash, os, app_version: version, name }),
		devices: () => call("GET", "/me/devices"),
		/** Sends `id` as X-Device-Id from now on (downloads need it once sign-in is configured). */
		useDevice: (id) => {
			currentDevice = id;
		},
		removeDevice: (id) => call("DELETE", `/me/devices/${encodeURIComponent(id)}`),

		favorites: () => call("GET", "/me/favorites").then((r) => r.data),
		addFavorite: (assetId) => call("PUT", `/me/favorites/${encodeURIComponent(assetId)}`),
		removeFavorite: (assetId) => call("DELETE", `/me/favorites/${encodeURIComponent(assetId)}`),
		/** Union of offline favorites on sign-in (§8.6): PUT is idempotent. */
		mergeFavorites: async (assetIds) => {
			const failed = [];
			for (const id of assetIds) await call("PUT", `/me/favorites/${encodeURIComponent(id)}`).catch(() => failed.push(id));
			return { merged: assetIds.length - failed.length, failed };
		},

		downloads: ({ cursor, limit } = {}) => call("GET", `/me/downloads${qs({ cursor, limit })}`),
		installs: ({ deviceId: device = currentDevice } = {}) => call("GET", `/me/installs${qs({ device_id: device })}`).then((r) => r.data),
		recordInstall: ({ assetId, version, deviceId: device = currentDevice }) => call("POST", "/me/installs", { device_id: device, asset_id: assetId, version }),
		removeInstall: (assetId, { deviceId: device = currentDevice } = {}) => call("DELETE", `/me/installs/${encodeURIComponent(assetId)}${qs({ device_id: device })}`),

		/**
		 * Live sync (§8.2): calls `onEvent(syncEvent)` for every event after `since`
		 * and as they happen, reconnecting with the last seq when the server ends
		 * the stream (every 5 minutes) or the connection drops. Returns { close() }.
		 */
		stream: ({ since = 0, onEvent, onError = () => {}, retryMs = 3000 } = {}) => {
			const ctrl = new AbortController();
			let last = Number(since) || 0;
			(async () => {
				while (!ctrl.signal.aborted) {
					try {
						const res = await fetchImpl(`${root}/api/v1/sync/stream${qs({ since: last })}`, { headers: { Accept: "text/event-stream" }, signal: ctrl.signal });
						if (!res.ok || !res.body) throw new LibraryError(res.status, null);
						const decoder = new TextDecoder();
						let buf = "";
						for await (const chunk of res.body) {
							buf += decoder.decode(chunk, { stream: true });
							let at;
							while ((at = buf.indexOf("\n\n")) >= 0) {
								const block = buf.slice(0, at);
								buf = buf.slice(at + 2);
								const fields = {};
								for (const line of block.split("\n")) {
									if (!line || line.startsWith(":")) continue;
									const i = line.indexOf(":");
									const k = i < 0 ? line : line.slice(0, i);
									const v = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
									fields[k] = fields[k] === undefined ? v : `${fields[k]}\n${v}`;
								}
								if (fields.event === "sync" && fields.data) {
									const e = JSON.parse(fields.data);
									last = Math.max(last, Number(e.seq) || 0);
									onEvent?.(e);
								}
							}
						}
					} catch (e) {
						if (ctrl.signal.aborted) return;
						onError(e);
					}
					if (!ctrl.signal.aborted) await new Promise((r) => setTimeout(r, retryMs));
				}
			})();
			return { close: () => ctrl.abort(), get lastSeq() { return last; } };
		},

		/** Where FrameFlow's asset store reads the signed catalog (WSC_ASSET_URL). */
		feedBase: `${root}/feed`,
	};
}
