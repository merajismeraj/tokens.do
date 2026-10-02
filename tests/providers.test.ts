import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropic } from "@/lib/providers/anthropic";
import { openai } from "@/lib/providers/openai";
import { openrouter } from "@/lib/providers/openrouter";
import { ProviderAuthError } from "@/lib/providers/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

const start = new Date("2026-09-01T00:00:00Z");
const end = new Date("2026-09-03T12:00:00Z");

describe("openai adapter", () => {
  it("paginates usage and merges rows per day+model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: [
            {
              start_time: 1756684800, // 2025-09-01T00:00:00Z
              results: [{ model: "gpt-5", input_tokens: 1000, output_tokens: 200, input_cached_tokens: 400 }],
            },
          ],
          has_more: true,
          next_page: "p2",
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: [
            {
              start_time: 1756684800,
              results: [
                { model: "gpt-5", input_tokens: 10, output_tokens: 5, input_cached_tokens: 0 },
                { model: "gpt-5-mini", input_tokens: 0, output_tokens: 0 },
              ],
            },
          ],
          has_more: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await openai.fetchDailyUsage("sk-admin-x", start, end);
    expect(rows).toEqual([
      { date: "2025-09-01", model: "gpt-5", inputTokens: 1010n, outputTokens: 205n, cachedTokens: 400n },
    ]);

    const firstUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(firstUrl.pathname).toBe("/v1/organization/usage/completions");
    expect(firstUrl.searchParams.get("bucket_width")).toBe("1d");
    expect(firstUrl.searchParams.get("group_by")).toBe("model");
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("page")).toBe("p2");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-admin-x");
  });

  it("identifies the org by its oldest project", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        json({
          data: [
            { id: "proj_new", created_at: 200 },
            { id: "proj_default", created_at: 100 },
          ],
          has_more: false,
        }),
      ),
    );
    await expect(openai.identify("sk-admin-x")).resolves.toEqual({ orgId: "proj_default" });
  });

  it("throws ProviderAuthError on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "nope" }, 401)));
    await expect(openai.identify("sk-admin-bad")).rejects.toBeInstanceOf(ProviderAuthError);
  });
});

describe("anthropic adapter", () => {
  it("sums uncached, cache-write and cache-read input", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({
        data: [
          {
            starting_at: "2026-09-01T00:00:00Z",
            results: [
              {
                model: "claude-opus-4",
                uncached_input_tokens: 100,
                cache_creation: { ephemeral_1h_input_tokens: 20, ephemeral_5m_input_tokens: 30 },
                cache_read_input_tokens: 50,
                output_tokens: 70,
              },
            ],
          },
        ],
        has_more: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await anthropic.fetchDailyUsage("sk-ant-admin-x", start, end);
    expect(rows).toEqual([
      { date: "2026-09-01", model: "claude-opus-4", inputTokens: 200n, outputTokens: 70n, cachedTokens: 50n },
    ]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/organizations/usage_report/messages");
    expect(url.searchParams.getAll("group_by[]")).toEqual(["model"]);
    expect(fetchMock.mock.calls[0][1].headers["x-api-key"]).toBe("sk-ant-admin-x");
  });

  it("identifies the org via /organizations/me", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ id: "org_123", name: "Acme" })));
    await expect(anthropic.identify("sk-ant-admin-x")).resolves.toEqual({ orgId: "org_123", orgName: "Acme" });
  });
});

describe("openrouter adapter", () => {
  it("maps activity rows to daily usage within the range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        data: [
          { date: "2026-09-01", model: "anthropic/claude-opus-4", prompt_tokens: 900, completion_tokens: 100, requests: 3 },
          { date: "2026-09-01", model: "anthropic/claude-opus-4", prompt_tokens: 100, completion_tokens: 0 }, // second endpoint
          { date: "2026-09-02", model: "openai/gpt-5", prompt_tokens: 50, completion_tokens: 5 },
          { date: "2026-08-15", model: "openai/gpt-5", prompt_tokens: 999, completion_tokens: 9 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const rows = await openrouter.fetchDailyUsage("sk-or-v1-x", start, end);
    expect(rows).toEqual([
      { date: "2026-09-01", model: "anthropic/claude-opus-4", inputTokens: 1000n, outputTokens: 100n, cachedTokens: 0n },
      { date: "2026-09-02", model: "openai/gpt-5", inputTokens: 50n, outputTokens: 5n, cachedTokens: 0n },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/activity");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-or-v1-x");
  });

  it("rejects a non-management key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Only management keys" } }, 403)));
    await expect(openrouter.identify("sk-or-v1-regular")).rejects.toBeInstanceOf(ProviderAuthError);
  });
});
