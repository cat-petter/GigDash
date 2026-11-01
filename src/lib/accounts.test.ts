import { describe, expect, it } from "vitest";
import { confirmsDeletion, deviceName, isFirstRun, linksTo, removalProblem, selfDeletionProblem } from "./accounts";

describe("deviceName", () => {
  it("names the device and browser", () => {
    const agents: [string, string][] = [
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "iPhone · Safari"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1", "iPhone · Chrome"],
      ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "iPad · Safari"],
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", "Mac · Safari"],
      ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0", "Windows · Edge"],
      ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36", "Android · Chrome"],
      ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Linux · Firefox"],
    ];
    for (const [agent, name] of agents) expect(deviceName(agent)).toBe(name);
  });

  it("leaves out the browser when a Home Screen app doesn't name one", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("iPhone");
  });

  it("says so when it can't tell", () => {
    expect(deviceName(null)).toBe("Unknown device");
    expect(deviceName("")).toBe("Unknown device");
    expect(deviceName("curl/8.7.1")).toBe("Unknown device");
  });
});

describe("confirmsDeletion", () => {
  it("needs the whole email, in any case", () => {
    expect(confirmsDeletion(" A@Example.com ", "a@example.com")).toBe(true);
    expect(confirmsDeletion("a@example", "a@example.com")).toBe(false);
    expect(confirmsDeletion("", "a@example.com")).toBe(false);
  });
});

describe("selfDeletionProblem", () => {
  it("refuses the owner and no one else", () => {
    expect(selfDeletionProblem({ isOwner: true })).not.toBeNull();
    expect(selfDeletionProblem({ isOwner: false })).toBeNull();
  });
});

describe("removalProblem", () => {
  const owner = { id: "owner", isOwner: true };

  it("lets the owner remove someone else", () => {
    expect(removalProblem(owner, "someone")).toBeNull();
  });

  it("refuses anyone who isn't the owner, even for their own id", () => {
    const user = { id: "someone", isOwner: false };
    expect(removalProblem(user, "other")).toBe("Only the owner can remove users.");
    expect(removalProblem(user, "someone")).toBe("Only the owner can remove users.");
    expect(removalProblem(user, "owner")).toBe("Only the owner can remove users.");
  });

  it("refuses the owner's own account", () => {
    expect(removalProblem(owner, "owner")).toBe("You can't remove your own account.");
  });

  it("refuses anything that isn't an id", () => {
    for (const target of ["", null, undefined, 7, ["someone"], { id: "someone" }]) {
      expect(removalProblem(owner, target)).toBe("That user wasn't found.");
    }
  });
});

describe("linksTo", () => {
  const link = (id: string, email: string) => ({ id, value: JSON.stringify({ type: "magic-link", email }) });

  it("finds this address's links in any case, and only those", () => {
    const rows = [link("1", "a_b@x.com"), link("2", "A_B@X.com"), link("3", "axb@x.com"), link("4", "a_b@x.com.au")];
    expect(linksTo(rows, "a_b@x.com")).toEqual(["1", "2"]);
  });

  it("skips anything else stored in the table", () => {
    const rows = [
      { id: "1", value: "not json" },
      { id: "2", value: "null" },
      { id: "3", value: JSON.stringify({ email: 7 }) },
    ];
    expect(linksTo(rows, "a@x.com")).toEqual([]);
  });
});

describe("isFirstRun", () => {
  it("is for someone with no calendar and no gigs, outside Settings", () => {
    expect(isFirstRun({ connected: false, gigs: 0, tab: "overview" })).toBe(true);
    expect(isFirstRun({ connected: false, gigs: 0, tab: "gigs" })).toBe(true);
  });

  it("isn't for someone connected, someone with gigs, or Settings, where the account controls are", () => {
    expect(isFirstRun({ connected: true, gigs: 0, tab: "overview" })).toBe(false);
    expect(isFirstRun({ connected: false, gigs: 3, tab: "overview" })).toBe(false);
    expect(isFirstRun({ connected: false, gigs: 0, tab: "settings" })).toBe(false);
  });
});
