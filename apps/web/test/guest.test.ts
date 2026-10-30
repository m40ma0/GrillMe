import { describe, expect, it } from "vitest";
import { GUEST_TTL_MS, guestCookie, guestToken, readGuestToken } from "../src/lib/server/guest";

const secret = "0123456789abcdef0123456789abcdef";
const id = "3f1c2b8e-9a3d-4c55-8e21-6f0b7d9a1c42";

describe("guest demo cookie", () => {
  it("round-trips the guest user id", () => {
    expect(readGuestToken(guestToken(id, secret), secret)).toBe(id);
  });

  it("rejects a token signed with another secret, a tampered id, or garbage", () => {
    const token = guestToken(id, secret);
    expect(readGuestToken(token, "another-secret-another-secret-00")).toBeNull();
    expect(readGuestToken(token.replace(id, "11111111-1111-4111-8111-111111111111"), secret)).toBeNull();
    expect(readGuestToken("not.a.token", secret)).toBeNull();
    expect(readGuestToken(undefined, secret)).toBeNull();
  });

  it("expires after 24 hours", () => {
    const now = Date.now();
    const token = guestToken(id, secret, now);
    expect(readGuestToken(token, secret, now + GUEST_TTL_MS - 1000)).toBe(id);
    expect(readGuestToken(token, secret, now + GUEST_TTL_MS + 1000)).toBeNull();
  });

  it("is an httpOnly, same-site cookie that lasts as long as the token", () => {
    expect(guestCookie("t", true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: GUEST_TTL_MS / 1000 });
  });
});
