// The Library API's worker endpoints (apps/api/src/server.js "processing workers").
export function createApiClient({ baseUrl, token, fetch: fetchImpl = globalThis.fetch }) {
	const root = baseUrl.replace(/\/$/, "");
	async function call(method, path, { body, headers = {}, raw = false } = {}) {
		const res = await fetchImpl(`${root}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
		if (res.status === 204) return null;
		if (!res.ok) {
			const text = await res.text();
			let message = text;
			try {
				message = JSON.parse(text).error?.message ?? text;
			} catch {}
			throw Object.assign(new Error(`${method} ${path} → ${res.status}: ${message}`), { status: res.status });
		}
		return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
	}
	return {
		claim: () => call("POST", "/worker/jobs/claim"),
		file: (jobId, sha) => call("GET", `/worker/jobs/${jobId}/files/${sha}`, { raw: true }),
		putPreview: (jobId, kind, ext, buf) => call("PUT", `/worker/jobs/${jobId}/previews/${kind}?ext=${ext}`, { body: buf, headers: { "Content-Type": "application/octet-stream" } }),
		complete: (jobId, result) => call("POST", `/worker/jobs/${jobId}/complete`, { body: JSON.stringify(result), headers: { "Content-Type": "application/json" } }),
	};
}
