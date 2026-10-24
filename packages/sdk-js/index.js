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
	async function call(method, path, body) {
		const token = await getToken();
		const res = await fetchImpl(`${root}/api/v1${path}`, {
			method,
			headers: {
				Accept: "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(appVersion ? { "X-App-Version": appVersion } : {}),
				...(deviceId ? { "X-Device-Id": deviceId } : {}),
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
		requestDownload: (id, { version } = {}) => call("POST", `/assets/${encodeURIComponent(id)}/download`, { version, device_id: deviceId }).then((g) => ({ ...g, url: new URL(g.url, `${root}/`).toString() })),
		completeDownload: (downloadId, report) => call("POST", `/downloads/${encodeURIComponent(downloadId)}/complete`, report),
		reportUsage: (events) => call("POST", "/me/usage", { events: events.map((e) => ({ device_id: deviceId, ...e })) }),
		sync: (since = 0) => call("GET", `/sync${qs({ since, device_id: deviceId })}`),
		entitlements: () => call("GET", "/entitlements"),
		/** Where FrameFlow's asset store reads the signed catalog (WSC_ASSET_URL). */
		feedBase: `${root}/feed`,
	};
}
