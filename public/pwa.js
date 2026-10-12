/* Crewbrain PWA layer — side-effect only, no imports.
 * - registers sw.js (relative, so it works under any sub-path)
 * - offline banner
 * - outbox: chat messages sent while offline are saved and sent when back online
 * - install guidance (Android/Chrome prompt, iOS Safari Share hint)
 *
 * Events for the app:
 *   window "crewbrain:outbox-sent"  detail { url, path, status, ok, data, queuedAt, remaining }
 *   window "crewbrain:sw-updated"   detail { version } (a new version took over)
 */
(() => {
  if (window.__crewbrainPWA) return;
  window.__crewbrainPWA = true;

  const OUTBOX_RE = /(?:^|\/)api\/(?:agents\/[^/]+\/chat|creator\/message)$/;
  const VOICE_RE = /(?:^|\/)api\/voice\//;
  const LS_DISMISS = "crewbrain.install.dismissed";
  const LS_IOS_SHOWN = "crewbrain.install.iosShown";
  const LS_OUTBOX = "crewbrain.outbox";
  const QUEUED_REPLY = "Saved. I'll send this as soon as you're back online.";

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };

  const isStandalone = () =>
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  const isDemo = /(?:^|\/)demo\.html$/.test(location.pathname);

  /* ---------------------------------------------------------------- styles */
  const css = `
.cbp{--cbp-bg:var(--ink,#14181f);--cbp-fg:var(--paper,#eef1f4);--cbp-tag:var(--tag,#f5c400);--cbp-tag-ink:var(--tag-ink,#1a1500);
  font-family:var(--f-body,system-ui,-apple-system,"Segoe UI",sans-serif);box-sizing:border-box;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){.cbp{--cbp-bg:var(--ink,#e8ecf1);--cbp-fg:var(--paper,#0e1217)}}
.cbp *{box-sizing:border-box}
.cbp-banner{position:fixed;left:0;right:0;top:0;z-index:2147483000;padding:calc(env(safe-area-inset-top,0px) + 10px) max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));
  background:var(--cbp-tag);color:var(--cbp-tag-ink);font-size:.95rem;line-height:1.35;font-weight:700;display:flex;gap:10px;align-items:flex-start;
  box-shadow:0 2px 0 rgba(0,0,0,.18);transform:translateY(-110%);transition:transform .25s ease;pointer-events:none}
.cbp-banner.cbp-show{transform:none;pointer-events:auto}
.cbp-banner svg{flex:0 0 auto;width:20px;height:20px;margin-top:1px}
.cbp-banner.cbp-ok{background:var(--ok,#1f7a4a);color:#fff}
.cbp-card{position:fixed;z-index:2147482999;left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));
  bottom:calc(env(safe-area-inset-bottom,0px) + var(--tabbar-h,0px) + 12px);max-width:28rem;margin:0 auto;
  background:var(--cbp-bg);color:var(--cbp-fg);border-radius:10px;padding:14px 14px 14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.35);
  display:flex;gap:12px;align-items:center;transform:translateY(calc(100% + 40px));opacity:0;transition:transform .3s ease,opacity .3s ease}
.cbp-card.cbp-show{transform:none;opacity:1}
.cbp-card img{width:44px;height:44px;border-radius:10px;flex:0 0 auto}
.cbp-card .cbp-txt{flex:1 1 auto;min-width:0}
.cbp-card .cbp-t{font-weight:700;font-size:1rem;line-height:1.25;margin:0}
.cbp-card .cbp-s{font-size:.9rem;line-height:1.35;margin:2px 0 0;opacity:.85}
.cbp-card .cbp-share{display:inline-block;width:18px;height:18px;vertical-align:-3px;margin:0 2px}
.cbp-btn{min-height:44px;min-width:44px;border:0;border-radius:6px;font:inherit;font-weight:700;cursor:pointer;flex:0 0 auto}
.cbp-btn:focus-visible{outline:3px solid var(--cbp-tag);outline-offset:2px}
.cbp-install{background:var(--cbp-tag);color:var(--cbp-tag-ink);padding:0 16px}
.cbp-x{background:transparent;color:inherit;font-size:1.4rem;line-height:1;padding:0;opacity:.8}
@media (prefers-reduced-motion:reduce){.cbp-banner,.cbp-card{transition:none}}
`;
  function injectStyle() {
    if (document.getElementById("cbp-style")) return;
    const s = document.createElement("style");
    s.id = "cbp-style";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  function whenBody(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  /* ---------------------------------------------------------------- banner */
  const OFFLINE_TEXT = "You're offline. You can still read your helpers and knowledge. New messages will send when you're back online.";
  const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 4.5-2.8M10 4.6A15 15 0 0 1 22 8.5M5.5 12a10 10 0 0 1 3.2-2M15 10.2a10 10 0 0 1 3.5 1.8M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/><path d="M3 3l18 18"/></svg>';
  const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';
  let banner = null;
  let servedFromCache = false;
  let okTimer = 0;

  function ensureBanner() {
    if (banner) return banner;
    injectStyle();
    banner = document.createElement("div");
    banner.className = "cbp cbp-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.id = "crewbrain-offline-banner";
    document.body.appendChild(banner);
    return banner;
  }
  function renderBanner() {
    whenBody(() => {
      const off = !navigator.onLine || servedFromCache;
      const b = ensureBanner();
      if (off) {
        clearTimeout(okTimer);
        b.classList.remove("cbp-ok");
        b.innerHTML = ICON_OFF + "<span></span>";
        b.lastChild.textContent = OFFLINE_TEXT;
        b.classList.add("cbp-show");
        document.documentElement.classList.add("is-offline");
      } else if (!b.classList.contains("cbp-ok")) {
        b.classList.remove("cbp-show");
        document.documentElement.classList.remove("is-offline");
      }
    });
  }
  function flashOk(text) {
    whenBody(() => {
      const b = ensureBanner();
      b.classList.add("cbp-ok");
      b.innerHTML = ICON_OK + "<span></span>";
      b.lastChild.textContent = text;
      b.classList.add("cbp-show");
      clearTimeout(okTimer);
      okTimer = setTimeout(() => { b.classList.remove("cbp-show"); setTimeout(() => b.classList.remove("cbp-ok"), 300); }, 3500);
    });
  }

  /* ---------------------------------------------------------------- outbox store */
  const idb = (() => {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("no idb"));
        let req;
        try { req = indexedDB.open("crewbrain", 1); } catch (e) { return reject(e); }
        req.onupgradeneeded = () => req.result.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("blocked"));
      });
      dbp.catch(() => { dbp = null; });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const t = db.transaction("outbox", mode);
        const store = t.objectStore("outbox");
        let out;
        Promise.resolve(fn(store)).then((v) => { out = v; });
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }));
    }
    const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return {
      add: (item) => tx("readwrite", (s) => req2p(s.add(item))),
      all: () => tx("readonly", (s) => req2p(s.getAll())),
      del: (id) => tx("readwrite", (s) => req2p(s.delete(id))),
    };
  })();
  const ls = {
    read() { try { return JSON.parse(lsGet(LS_OUTBOX) || "[]"); } catch (_) { return []; } },
    write(list) { lsSet(LS_OUTBOX, JSON.stringify(list)); },
    async add(item) { const l = this.read(); item.id = "ls-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7); l.push(item); this.write(l); return item.id; },
    async all() { return this.read(); },
    async del(id) { this.write(this.read().filter((x) => x.id !== id)); },
  };
  const outbox = {
    async add(item) { try { return await idb.add(item); } catch (_) { return ls.add(item); } },
    async all() {
      let a = [];
      try { a = await idb.all(); } catch (_) { /* no idb */ }
      const b = await ls.all();
      return a.concat(b).sort((x, y) => (x.queuedAt - y.queuedAt) || 0);
    },
    async del(id) { if (typeof id === "string" && id.startsWith("ls-")) return ls.del(id); try { await idb.del(id); } catch (_) { /* ignore */ } },
  };

  /* ---------------------------------------------------------------- fetch patch */
  const nativeFetch = window.fetch.bind(window);

  function resolveUrl(input) {
    try { return new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href); }
    catch (_) { return null; }
  }
  function headersToObject(h) {
    const o = {};
    try { new Headers(h || {}).forEach((v, k) => { o[k] = v; }); } catch (_) { /* ignore */ }
    return o;
  }
  async function snapshotRequest(input, init, url) {
    const method = ((init && init.method) || (input instanceof Request ? input.method : "GET")).toUpperCase();
    let headers = headersToObject(init && init.headers);
    let body = init && init.body;
    if (input instanceof Request) {
      if (!init || !init.headers) headers = headersToObject(input.headers);
      if (body == null) { try { body = await input.clone().text(); } catch (_) { body = null; } }
    }
    if (body != null && typeof body !== "string") {
      if (body instanceof URLSearchParams) body = body.toString();
      else if (body instanceof Blob) body = await body.text();
      else return null; // FormData/streams: not queueable
    }
    return { url: url.href, method, headers, body: body == null ? null : body, queuedAt: Date.now() };
  }
  function queuedResponse() {
    return new Response(JSON.stringify({ reply: QUEUED_REPLY, queued: true }), {
      status: 202,
      statusText: "Accepted",
      headers: { "Content-Type": "application/json", "X-Crewbrain-Queued": "1" },
    });
  }
  function noteResponse(res, url) {
    if (!url || url.origin !== location.origin || !/\/api\//.test(url.pathname)) return;
    const flagged = res.headers && res.headers.get("X-Crewbrain-Offline") === "1";
    if (flagged !== servedFromCache) { servedFromCache = flagged; renderBanner(); }
  }

  window.fetch = async function crewbrainFetch(input, init) {
    const url = resolveUrl(input);
    const method = ((init && init.method) || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const queueable = url && url.origin === location.origin && method === "POST" &&
      OUTBOX_RE.test(url.pathname) && !VOICE_RE.test(url.pathname);

    if (queueable && !navigator.onLine) {
      const snap = await snapshotRequest(input, init, url);
      if (snap) { await outbox.add(snap); renderBanner(); return queuedResponse(); }
    }
    let snapPromise = null;
    if (queueable) snapPromise = snapshotRequest(input, init, url); // before the body is consumed
    try {
      const res = await nativeFetch(input, init);
      noteResponse(res, url);
      return res;
    } catch (err) {
      if (queueable && err && err.name !== "AbortError") {
        const snap = await snapPromise;
        if (snap) { await outbox.add(snap); servedFromCache = true; renderBanner(); return queuedResponse(); }
      }
      throw err;
    }
  };

  let flushing = false;
  async function flushOutbox() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    let sent = 0;
    try {
      const items = await outbox.all();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let res;
        try {
          res = await nativeFetch(it.url, { method: it.method, headers: it.headers, body: it.body, credentials: "same-origin" });
        } catch (_) {
          break; // still offline — keep the rest, in order
        }
        await outbox.del(it.id);
        sent++;
        let data = null;
        try { data = await res.clone().json(); } catch (_) { try { data = await res.text(); } catch (__) { data = null; } }
        const u = new URL(it.url);
        window.dispatchEvent(new CustomEvent("crewbrain:outbox-sent", {
          detail: { url: it.url, path: u.pathname, body: it.body, status: res.status, ok: res.ok, data, queuedAt: it.queuedAt, remaining: items.length - i - 1 },
        }));
      }
    } finally {
      flushing = false;
    }
    if (sent) flashOk(sent === 1 ? "You're back online. Your saved message was sent." : `You're back online. ${sent} saved messages were sent.`);
  }
  window.crewbrainOutbox = { flush: flushOutbox, list: () => outbox.all() };

  window.addEventListener("online", () => { servedFromCache = false; renderBanner(); flushOutbox(); });
  window.addEventListener("offline", renderBanner);
  if (!navigator.onLine) renderBanner();
  else setTimeout(flushOutbox, 1500);

  /* ---------------------------------------------------------------- service worker */
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.type === "crewbrain:sw-activated" && (d.updated || hadController)) {
        window.dispatchEvent(new CustomEvent("crewbrain:sw-updated", { detail: { version: d.version } }));
      }
    });
    const register = () => navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => { /* ignore */ });
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }

  /* ---------------------------------------------------------------- install guidance */
  const ua = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua);
  const SHARE_ICON = '<svg class="cbp-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M6 11H5v10h14V11h-1"/></svg>';
  let card = null;
  let deferredPrompt = null;

  const installAllowed = () => !isDemo && !isStandalone() && lsGet(LS_DISMISS) !== "1";

  function hideCard(remember) {
    if (remember) lsSet(LS_DISMISS, "1");
    if (!card) return;
    const c = card;
    card = null;
    c.classList.remove("cbp-show");
    setTimeout(() => c.remove(), 350);
  }
  function showCard({ title, sub, subHTML, action }) {
    if (card || !installAllowed()) return;
    whenBody(() => {
      injectStyle();
      card = document.createElement("div");
      card.className = "cbp cbp-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", title);
      const icon = document.createElement("img");
      icon.src = "icons/icon-192.png";
      icon.alt = "";
      const txt = document.createElement("div");
      txt.className = "cbp-txt";
      const t = document.createElement("p");
      t.className = "cbp-t";
      t.textContent = title;
      const s = document.createElement("p");
      s.className = "cbp-s";
      if (subHTML) s.innerHTML = subHTML; else s.textContent = sub;
      txt.append(t, s);
      card.append(icon, txt);
      if (action) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cbp-btn cbp-install";
        b.textContent = action.label;
        b.addEventListener("click", action.onClick);
        card.append(b);
      }
      const x = document.createElement("button");
      x.type = "button";
      x.className = "cbp-btn cbp-x";
      x.setAttribute("aria-label", "Not now");
      x.textContent = "×";
      x.addEventListener("click", () => hideCard(true));
      card.append(x);
      document.body.appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => card && card.classList.add("cbp-show")));
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!installAllowed()) return;
    setTimeout(() => showCard({
      title: "Add Crewbrain to your home screen",
      sub: "Open it like an app. Works even with a weak signal.",
      action: {
        label: "Install",
        onClick: async () => {
          const p = deferredPrompt;
          deferredPrompt = null;
          hideCard(false);
          if (!p) return;
          try {
            p.prompt();
            const choice = await p.userChoice;
            if (choice && choice.outcome === "dismissed") lsSet(LS_DISMISS, "1");
          } catch (_) { /* ignore */ }
        },
      },
    }), 2500);
  });
  window.addEventListener("appinstalled", () => { lsSet(LS_DISMISS, "1"); hideCard(false); });

  if (isIOSSafari && installAllowed() && lsGet(LS_IOS_SHOWN) !== "1") {
    setTimeout(() => {
      if (!installAllowed()) return;
      lsSet(LS_IOS_SHOWN, "1"); // one-time
      showCard({
        title: "Add Crewbrain to your home screen",
        subHTML: "Tap Share " + SHARE_ICON + ", then <b>Add to Home Screen</b>.",
      });
    }, 3000);
  }
})();
