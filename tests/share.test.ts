import { describe, expect, it } from "vitest";
import { profileUrl, shareOnXUrl, shareText } from "@/lib/share";

describe("share on X", () => {
  it("uses the requested wording with a formatted rank", () => {
    expect(shareText(7)).toBe("I'm world #7 token maxxer!");
    expect(shareText(12345)).toBe("I'm world #12,345 token maxxer!");
  });

  it("builds an X composer link whose text and url survive decoding intact", () => {
    const u = new URL(shareOnXUrl(42));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe("I'm world #42 token maxxer!");
    expect(u.searchParams.get("url")).toBe("https://tokens.do");
    expect(u.hash).toBe(""); // a raw "#" would truncate the text
    expect(shareOnXUrl(42)).not.toContain("+");
  });

  it("links to the user's rank page when the handle is known", () => {
    const u = new URL(shareOnXUrl(3, "meraj"));
    expect(u.searchParams.get("text")).toBe("I'm world #3 token maxxer!");
    expect(u.searchParams.get("url")).toBe("https://tokens.do/u/meraj");
    expect(profileUrl("a_b")).toBe("https://tokens.do/u/a_b");
  });
});
