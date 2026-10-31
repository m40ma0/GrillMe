import { describe, expect, it } from "vitest";
import { STORAGE_UNAVAILABLE_MESSAGE, storageFailure } from "../src/storage";

describe("storageFailure", () => {
  it("reads a bad key from Backblaze, AWS and R2 as credentials", () => {
    expect(storageFailure(Object.assign(new Error("Malformed Access Key Id"), { name: "InvalidAccessKeyId" }))).toBe("credentials");
    expect(storageFailure({ name: "SignatureDoesNotMatch", message: "The request signature we calculated does not match" })).toBe("credentials");
    expect(storageFailure({ name: "Unknown", message: "", $metadata: { httpStatusCode: 403 } })).toBe("credentials");
  });

  it("tells a missing bucket and an unreachable endpoint apart", () => {
    expect(storageFailure({ name: "NoSuchBucket", message: "The specified bucket does not exist" })).toBe("bucket");
    expect(storageFailure(Object.assign(new Error("getaddrinfo ENOTFOUND s3.example.com"), { code: "ENOTFOUND" }))).toBe("unreachable");
  });

  it("never puts the raw error in the user-facing message", () => {
    expect(STORAGE_UNAVAILABLE_MESSAGE).not.toMatch(/Access Key/);
  });
});
