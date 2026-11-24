import { describe, expect, it } from "vitest";
import { migrateHydratedState, migrateLegacyAddress } from "@/store/migrate-address";

// Before full addresses, a service lived at subdomain + root domain, or at a
// per-service host override. Users updating the app must keep their address,
// scheme included.
describe("migrateLegacyAddress", () => {
  it("leaves an already-migrated url alone", () =>
    expect(migrateLegacyAddress({ url: "https://a.b" }, "x.com")).toBe("https://a.b"));

  it("keeps an http:// host override", () =>
    expect(migrateLegacyAddress({ host: "http://192.168.1.10:7878", subdomain: "radarr" }, "x.com")).toBe(
      "http://192.168.1.10:7878",
    ));

  it("turns a bare host override into https", () =>
    expect(migrateLegacyAddress({ host: "radarr.other.com" }, "x.com")).toBe("https://radarr.other.com"));

  it("joins subdomain and root domain", () =>
    expect(migrateLegacyAddress({ subdomain: "radarr" }, "valgrind.cloud")).toBe("https://radarr.valgrind.cloud"));

  it("yields nothing without a root domain", () =>
    expect(migrateLegacyAddress({ subdomain: "radarr" }, "")).toBeUndefined());

  it("yields nothing without a subdomain", () =>
    expect(migrateLegacyAddress({ subdomain: "" }, "x.com")).toBeUndefined());
});

describe("migrateHydratedState", () => {
  it("rewrites every service and drops the legacy fields", () => {
    const state: Record<string, unknown> = {
      rootDomain: "valgrind.cloud",
      services: {
        radarr: { subdomain: "radarr", status: "idle" },
        sonarr: { subdomain: "sonarr", host: "http://192.168.1.19:8989", status: "ok" },
      },
    };
    migrateHydratedState(state);

    expect(state.rootDomain).toBeUndefined();
    expect(state.services).toEqual({
      radarr: { url: "https://radarr.valgrind.cloud", status: "idle" },
      sonarr: { url: "http://192.168.1.19:8989", status: "ok" },
    });
  });

  // The hook runs on every launch, not just once: services that never had a
  // typed address (Plex, qui proxy) must keep their status.
  it("leaves services without a legacy address untouched", () => {
    const state: Record<string, unknown> = {
      services: { plex: { baseUrl: "https://1-2-3-4.plex.direct:32400", status: "ok" } },
    };
    migrateHydratedState(state);
    expect(state.services).toEqual({ plex: { baseUrl: "https://1-2-3-4.plex.direct:32400", status: "ok" } });
  });
});
