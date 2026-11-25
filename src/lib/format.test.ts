import { describe, expect, it } from "vitest";
import { shortFingerprint } from "@/lib/format";

describe("shortFingerprint", () => {
  it("keeps the first three and last two bytes", () => {
    const fp = "4F:9A:1C:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:7E:C2";
    expect(shortFingerprint(fp)).toBe("4F:9A:1C:…:7E:C2");
  });

  it("leaves a short value untouched", () => {
    expect(shortFingerprint("AA:BB")).toBe("AA:BB");
  });
});
