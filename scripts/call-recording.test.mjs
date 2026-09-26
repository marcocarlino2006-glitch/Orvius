import assert from "node:assert/strict";
import test from "node:test";
import { vapiRecordingRedirect } from "../src/lib/vapi.ts";

test("recordings resolve through Vapi's signed redirect, never the raw storage URL", async () => {
  const realFetch = globalThis.fetch;
  const prevKey = process.env.VAPI_API_KEY;
  process.env.VAPI_API_KEY = "test-key";
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), redirect: init?.redirect, auth: init?.headers?.Authorization });
    return String(url).includes("missing")
      ? new Response("", { status: 404 })
      : new Response(null, { status: 302, headers: { location: "https://signed.example/rec.wav?sig=1" } });
  };
  try {
    assert.equal(await vapiRecordingRedirect("call-1"), "https://signed.example/rec.wav?sig=1");
    assert.equal(seen[0].url, "https://api.vapi.ai/call/call-1/mono-recording");
    assert.equal(seen[0].redirect, "manual");
    assert.equal(seen[0].auth, "Bearer test-key");
    assert.equal(await vapiRecordingRedirect("missing"), null);
    delete process.env.VAPI_API_KEY;
    assert.equal(await vapiRecordingRedirect("call-1"), null);
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.VAPI_API_KEY;
    else process.env.VAPI_API_KEY = prevKey;
  }
});
