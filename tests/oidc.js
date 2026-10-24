// A local OIDC issuer for tests: serves the discovery document and JWKS over
// HTTP (the backend fetches them) and mints RS256 access tokens.
import crypto from "node:crypto";
import http from "node:http";

export async function startIssuer(t) {
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
	const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
	let issuer = "";
	const server = http.createServer((req, res) => {
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify(req.url.endsWith("openid-configuration") ? { issuer, jwks_uri: `${issuer}/jwks` } : { keys: [jwk] }));
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	issuer = `http://127.0.0.1:${server.address().port}`;
	t.after(() => server.close());
	/** An access token with `claims` (iss, aud, exp filled in), signed with `key`. */
	const jwt = (claims, key = privateKey) => {
		const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
		const head = `${enc({ alg: "RS256", kid: "k1", typ: "JWT" })}.${enc({ iss: issuer, aud: "frameflow-library", exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
		return `${head}.${crypto.sign("sha256", Buffer.from(head), key).toString("base64url")}`;
	};
	return { issuer, jwt };
}
