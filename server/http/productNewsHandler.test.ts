import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createProductNewsHandler } from "./productNewsHandler";

async function request(
  url: string,
  read = vi.fn().mockResolvedValue([]),
  method = "GET"
) {
  const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
  res.writeHead.mockReturnValue(res);
  await createProductNewsHandler(read)(
    { url, method } as IncomingMessage,
    res as unknown as ServerResponse
  );
  return { res, read };
}
describe("news API", () => {
  it("uses the change month with correct year rollover and caches success", async () => {
    const { res, read } = await request("/?q=RTX%205070&month=2025-12");
    expect(read).toHaveBeenCalledWith(
      '"RTX 5070" after:2025-12-01 before:2026-01-01'
    );
    expect(res.writeHead).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      expect.stringContaining("s-maxage=900")
    );
  });
  it("uses recent news when no month is selected", async () => {
    expect((await request("/?q=RTX%205070")).read).toHaveBeenCalledWith(
      '"RTX 5070" when:90d'
    );
  });
  it.each([
    "/?q=x",
    "/?q=RTX&month=2026-13",
    "/?q=%22%22",
    "/?q=RTX&month=bad",
  ])("rejects invalid input %s", async url => {
    const { res, read } = await request(url);
    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects writes", async () => {
    expect(
      (await request("/?q=RTX", undefined, "POST")).res.writeHead
    ).toHaveBeenCalledWith(405);
  });
  it("reports unavailable news without exposing upstream error details", async () => {
    const { res } = await request(
      "/?q=RTX",
      vi.fn().mockRejectedValue(new Error("private error"))
    );
    expect(res.writeHead).toHaveBeenCalledWith(503);
    expect(res.end).toHaveBeenCalledWith('{"error":"NEWS_UNAVAILABLE"}');
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
});
