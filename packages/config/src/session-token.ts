import { SESSION_TOKEN_TTL_SEC, SessionTokenClaims } from "@stage-ready/shared";
import { SignJWT, jwtVerify } from "jose";

const key = (secret: string) => new TextEncoder().encode(secret);

/** Signs a WebSocket token scoped to one session, valid for 15 minutes. */
export async function signSessionToken(claims: SessionTokenClaims, secret: string, now = Date.now()): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_TOKEN_TTL_SEC)
    .setAudience("stage-ready-realtime")
    .sign(key(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionTokenClaims & { exp: number }> {
  const { payload } = await jwtVerify(token, key(secret), { audience: "stage-ready-realtime", algorithms: ["HS256"] });
  return { ...SessionTokenClaims.parse(payload), exp: payload.exp ?? 0 };
}
