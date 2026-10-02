import { describe, expect, it } from "vitest";
import { isBot } from "@/lib/visits";

describe("isBot", () => {
  it("skips crawlers, unfurlers, scripts and missing user agents", () => {
    for (const ua of [
      "Twitterbot/1.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
      "curl/8.4.0",
      "python-requests/2.31",
      "",
      null,
    ]) {
      expect(isBot(ua), String(ua)).toBe(true);
    }
  });

  it("counts real browsers", () => {
    expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe(false);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe(false);
  });
});
