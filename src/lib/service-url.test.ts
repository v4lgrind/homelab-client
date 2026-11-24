import { describe, expect, it } from "vitest";
import { normalizeServiceUrl } from "@/lib/service-url";

describe("normalizeServiceUrl", () => {
  it.each([
    ["radarr.example.com", "https://radarr.example.com"],
    ["  HTTPS://Radarr.example.com/ ", "https://radarr.example.com"],
    ["http://192.168.1.10:7878", "http://192.168.1.10:7878"],
    ["HTTP://192.168.1.10:7878/", "http://192.168.1.10:7878"],
    ["radarr.example.com:7878", "https://radarr.example.com:7878"],
    ["https://x.com/radarr/", "https://x.com/radarr"],
  ])("normalises %s", (raw, out) => expect(normalizeServiceUrl(raw)).toBe(out));

  it.each(["ftp://x.com", "https://", "http://exa mple.com", "://x"])("rejects %s", (raw) =>
    expect(normalizeServiceUrl(raw)).toBeNull(),
  );

  it("treats blank input as empty, not invalid", () => expect(normalizeServiceUrl("   ")).toBe(""));
});
