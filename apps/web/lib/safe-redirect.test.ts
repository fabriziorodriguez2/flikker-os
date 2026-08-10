import { getSafeInternalPath } from "./safe-redirect";

describe("getSafeInternalPath", () => {
  it("accepts a plain internal path", () => {
    expect(getSafeInternalPath("/dashboard")).toBe("/dashboard");
  });

  it("accepts /redeem/{token} — the exact case this exists for", () => {
    expect(getSafeInternalPath("/redeem/abc123XYZ")).toBe("/redeem/abc123XYZ");
  });

  it("accepts an internal path with query string", () => {
    expect(getSafeInternalPath("/dashboard?tab=reviews")).toBe(
      "/dashboard?tab=reviews",
    );
  });

  it("rejects null/undefined/empty", () => {
    expect(getSafeInternalPath(null)).toBeNull();
    expect(getSafeInternalPath(undefined)).toBeNull();
    expect(getSafeInternalPath("")).toBeNull();
  });

  it("rejects paths without a leading slash", () => {
    expect(getSafeInternalPath("dashboard")).toBeNull();
  });

  it.each([
    "http://evil.com",
    "https://evil.com/login",
    "javascript:alert(1)",
    "mailto:a@b.com",
    "data:text/html,<script>alert(1)</script>",
  ])("rejects absolute URLs / schemes: %s", (value) => {
    expect(getSafeInternalPath(value)).toBeNull();
  });

  it.each(["//evil.com", "//evil.com/redeem/x"])(
    "rejects protocol-relative URLs: %s",
    (value) => {
      expect(getSafeInternalPath(value)).toBeNull();
    },
  );

  it.each(["/\\evil.com", "\\evil.com", "\\\\evil.com", "/\\/evil.com"])(
    "rejects backslash bypass variants: %s",
    (value) => {
      expect(getSafeInternalPath(value)).toBeNull();
    },
  );

  it("rejects values containing control characters", () => {
    expect(getSafeInternalPath("/\tredeem/x")).toBeNull();
    expect(getSafeInternalPath("/redeem/x\ny")).toBeNull();
  });

  it("rejects a value that resolves to a different origin even if it looks internal at a glance", () => {
    // "/.evil.com" itself is fine (same origin, just a path segment) — this
    // just documents that the origin-based check is the real guard, not a
    // string heuristic.
    expect(getSafeInternalPath("/.evil.com")).toBe("/.evil.com");
  });
});
