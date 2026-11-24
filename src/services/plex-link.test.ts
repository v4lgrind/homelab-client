import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const request = vi.fn();
const browserOpen = vi.fn(async (_opts: unknown) => {});

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: "dev-id" }), set: async () => {}, remove: async () => {} },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: (o: unknown) => browserOpen(o),
    close: async () => {},
    addListener: async () => ({ remove: () => {} }),
  },
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: async () => ({ remove: () => {} }) },
}));

import { createPin } from "@/services/plex";
import { useConnectionStore } from "@/store/connection-store";

// Plex sign-in by code: the app shows a short code, the user types it at
// plex.tv/link from any device, and the app notices on its own.
type Reply = { status: number; data: unknown } | Error;

function plexTv(pin: { expiresIn?: number }, polls: Reply[]) {
  request.mockImplementation(async (opts: { url: string; method: string }) => {
    if (opts.method === "POST" && opts.url.includes("/pins")) {
      return { status: 201, data: { id: 42, code: "7K2Q", ...pin }, headers: {} };
    }
    if (opts.url.includes("/pins/42")) {
      const next = polls.length > 1 ? polls.shift()! : polls[0];
      if (next instanceof Error) throw next;
      return { ...next, headers: {} };
    }
    throw new Error(`unexpected ${opts.method} ${opts.url}`);
  });
}

beforeEach(() => {
  request.mockReset();
  browserOpen.mockClear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("createPin", () => {
  it("asks for a short plex.tv/link code, not a strong PIN", async () => {
    plexTv({}, [{ status: 200, data: {} }]);
    vi.useRealTimers();
    await createPin();

    const { url, method } = request.mock.calls[0][0];
    expect(method).toBe("POST");
    expect(url).toMatch(/^https:\/\/plex\.tv\/api\/v2\/pins\?/);
    expect(url).toContain("strong=false");
    expect(url).not.toContain("strong=true");
  });
});

describe("startPlexAuth", () => {
  it("shows the code and collects the token, riding out a network drop", async () => {
    plexTv({ expiresIn: 900 }, [
      { status: 200, data: { id: 42, authToken: null } },
      new Error("Unable to resolve host"),
      { status: 200, data: { id: 42, authToken: "tok" } },
    ]);
    const c = useConnectionStore();
    const discover = vi.spyOn(c, "discoverPlex").mockResolvedValue(true);

    const done = c.startPlexAuth();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.pairing.plex).toEqual({ active: true, code: "7K2Q" });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(await done).toBe(true);
    expect(c.apiKeys.plex).toBe("tok");
    expect(discover).toHaveBeenCalled();
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it("stops quietly when cancelled", async () => {
    plexTv({ expiresIn: 900 }, [{ status: 200, data: { id: 42, authToken: null } }]);
    const c = useConnectionStore();

    const done = c.startPlexAuth();
    await vi.advanceTimersByTimeAsync(3_000);
    c.cancelPairing("plex");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await done).toBe(false);
    expect(c.services.plex.error).toBeUndefined();
  });

  it("gives up when the code expires", async () => {
    plexTv({ expiresIn: 10 }, [{ status: 200, data: { id: 42, authToken: null } }]);
    const c = useConnectionStore();

    const done = c.startPlexAuth();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(await done).toBe(false);
    expect(c.services.plex.error).toBe("Code expiré — réessaie");
  });
});

// Review I2: "Annuler" and "Se connecter à Plex" sit in the same spot, so a
// double tap cancels and restarts within one poll interval. The first loop must
// not survive: when its code expires it would fail the new attempt, which the
// user is still typing in at plex.tv/link.
describe("restarting Plex sign-in right after cancelling", () => {
  it("leaves only the new attempt running", async () => {
    let pinId = 0;
    const t0 = Date.now();
    request.mockImplementation(async (opts: { url: string; method: string }) => {
      if (opts.method === "POST") {
        pinId++;
        const expiresIn = pinId === 1 ? 10 : 900;
        return { status: 201, data: { id: pinId, code: pinId === 1 ? "AAAA" : "BBBB", expiresIn }, headers: {} };
      }
      // The new code gets linked 20 s in — after the first one has expired.
      const linked = opts.url.includes("/pins/2") && Date.now() - t0 > 20_000;
      return { status: 200, data: { authToken: linked ? "tok" : null }, headers: {} };
    });
    const c = useConnectionStore();
    vi.spyOn(c, "discoverPlex").mockImplementation(async () => {
      c.services.plex.status = "ok";
      return true;
    });

    const first = c.startPlexAuth();
    await vi.advanceTimersByTimeAsync(1_000);
    c.cancelPairing("plex");
    const second = c.startPlexAuth();
    await vi.advanceTimersByTimeAsync(40_000);

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(c.services.plex.status).toBe("ok");
    expect(c.services.plex.error).toBeUndefined();
  });
});

describe("openPlexLink", () => {
  it("opens plex.tv/link", async () => {
    vi.useRealTimers();
    await useConnectionStore().openPlexLink();
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://plex.tv/link" });
  });
});
