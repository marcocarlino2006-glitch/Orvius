import { publicShop } from "@/lib/online-booking";

/*
  The one line a shop pastes into its website:
    <script src="https://<orvius>/embed.js?shop=<slug>" async></script>
  It draws a chat button and opens /w/<slug> in a panel. Nothing renders
  when web chat is off, so a stale snippet is invisible rather than broken.
*/
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("shop") ?? "";
  const shop = await publicShop(slug, "webChatOn");
  const headers = {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  };
  if (!shop) return new Response("/* Orvius web chat is off for this business. */", { headers });

  const chatUrl = `${url.origin}/w/${encodeURIComponent(shop.slug)}?embed=1`;
  const label = JSON.stringify(`Message ${shop.name}`);
  const script = `(function(){
  if (window.__orviusChat) return; window.__orviusChat = true;
  var base = ${JSON.stringify(chatUrl)};
  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", ${label});
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.style.cssText = "position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:30px;border:0;background:#f2a93b;color:#1b1203;box-shadow:0 8px 28px rgba(0,0,0,.28);cursor:pointer;z-index:2147483646;display:flex;align-items:center;justify-content:center";
  var frame = null;
  function open(){
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = ${label};
      frame.src = base + "&page=" + encodeURIComponent(location.href.slice(0, 300));
      frame.style.cssText = "position:fixed;right:20px;bottom:92px;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));border:0;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.35);z-index:2147483647;background:#0f1013";
      document.body.appendChild(frame);
    } else { frame.style.display = "block"; }
  }
  function close(){ if (frame) frame.style.display = "none"; }
  btn.addEventListener("click", function(){ frame && frame.style.display !== "none" ? close() : open(); });
  window.addEventListener("message", function(e){ if (e.origin === ${JSON.stringify(url.origin)} && e.data && e.data.type === "orvius-chat:close") close(); });
  (document.body ? Promise.resolve() : new Promise(function(r){ document.addEventListener("DOMContentLoaded", r); })).then(function(){ document.body.appendChild(btn); });
})();`;
  return new Response(script, { headers });
}
