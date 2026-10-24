// OneAuth / Worksuite Cloud access tokens (blueprint §7.1). FrameFlow signs
// in with OIDC Authorization Code + PKCE (worksuite-frameflow
// electron/account.js) and sends its access token; this verifies the JWT
// against the issuer's JWKS (RS256, ES256 or EdDSA), its issuer, audience
// and expiry, and maps claims to a library principal:
//   { id, plan, org_id, device_id, role }   role only for admins
// Static tokens (LIBRARY_ADMIN_TOKENS) stay as the dev and
// server-to-server path.
import crypto from "node:crypto";

const ALGS = { RS256: "sha256", ES256: "sha256", EdDSA: null };
const PLANS = ["free", "pro", "business", "enterprise"];
const ROLES = ["super_admin", "library_manager", "content_editor", "reviewer", "analyst"];

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

/**
 * @param {object} o
 * @param {string} o.issuer        e.g. https://accounts.worksuitecloud.com
 * @param {string} [o.audience]    expected `aud` (default: frameflow-library)
 * @param {string} [o.roleClaim]   claim holding library admin roles (default: library_roles)
 * @param {typeof fetch} [o.fetch]
 * @param {() => number} [o.now]   ms
 */
export function createOidcVerifier({ issuer, audience = "frameflow-library", roleClaim = "library_roles", fetch: fetchImpl = globalThis.fetch, now = Date.now }) {
	const base = issuer.replace(/\/$/, "");
	let jwks = null;
	let jwksAt = 0;

	async function keys(force = false) {
		if (!force && jwks && now() - jwksAt < 10 * 60 * 1000) return jwks;
		const conf = await (await fetchImpl(`${base}/.well-known/openid-configuration`)).json();
		const res = await fetchImpl(conf.jwks_uri);
		if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
		jwks = (await res.json()).keys ?? [];
		jwksAt = now();
		return jwks;
	}

	/** The verified claims, or null when the token isn't valid. */
	async function verify(token) {
		const parts = String(token).split(".");
		if (parts.length !== 3) return null;
		let header;
		let claims;
		try {
			header = b64json(parts[0]);
			claims = b64json(parts[1]);
		} catch {
			return null;
		}
		if (!(header.alg in ALGS)) return null;
		let jwk = (await keys()).find((k) => k.kid === header.kid);
		// Unknown kid: the issuer may have rotated keys.
		if (!jwk) jwk = (await keys(true)).find((k) => k.kid === header.kid);
		if (!jwk) return null;
		let ok = false;
		try {
			const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
			const data = Buffer.from(`${parts[0]}.${parts[1]}`);
			const sig = Buffer.from(parts[2], "base64url");
			ok = crypto.verify(ALGS[header.alg], data, header.alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key, sig);
		} catch {
			return null;
		}
		if (!ok) return null;
		const t = Math.floor(now() / 1000);
		if (claims.iss !== base && claims.iss !== `${base}/`) return null;
		const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (!aud.includes(audience)) return null;
		if (typeof claims.exp !== "number" || claims.exp < t - 30) return null;
		if (typeof claims.nbf === "number" && claims.nbf > t + 30) return null;
		return claims;
	}

	/** A library principal from a bearer token, or null. */
	async function principal(token) {
		const c = await verify(token);
		if (!c?.sub) return null;
		const roles = [].concat(c[roleClaim] ?? []).filter((r) => ROLES.includes(r));
		// The highest library role wins (order in ROLES).
		const role = ROLES.find((r) => roles.includes(r)) ?? null;
		return { id: String(c.sub), plan: PLANS.includes(c.plan) ? c.plan : "free", org_id: c.org_id ?? null, device_id: c.device_id ?? null, role, scopes: String(c.scope ?? "").split(" ").filter(Boolean) };
	}

	return { verify, principal };
}

export const planRank = (plan) => Math.max(0, PLANS.indexOf(plan));
