// Moose: kleine koffie-server zonder dependencies. Start met: node server.js
//   BARISTA_PIN=123456   code voor de baristakant (zonder deze variabele is er geen code)
//   NTFY_TOPIC=geheim    meldingen naar de telefoon via ntfy (zonder deze variabele geen meldingen)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   bewaart alles online (nodig op gratis hosting met wisselend schijfgeheugen)
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "orders.json"), CFG = path.join(__dirname, "settings.json"), PUB = path.join(__dirname, "public");
const PIN = String(process.env.BARISTA_PIN || "");
const STATUS = ["nieuw", "voorstel", "bezig", "klaar", "geweigerd", "weg"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".json": "application/json", ".webmanifest": "application/manifest+json"
};

let orders = [], off = [];
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, ""), REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const REDIS = !!(REDIS_URL && REDIS_TOKEN), KEY = "moose:state";
const redis = cmd => fetch(REDIS_URL, { method: "POST", headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmd) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status); return j.result; });
async function load() {
  if (REDIS) {
    try {
      const raw = await redis(["GET", KEY]), st = raw ? JSON.parse(raw) : {};
      orders = Array.isArray(st.orders) ? st.orders : []; off = Array.isArray(st.off) ? st.off : [];
      return console.log("  Opslag: online (Upstash), " + orders.length + " bestellingen geladen");
    } catch (e) { console.log("  Opslag: Upstash niet bereikbaar (" + e.message + "), ik start leeg"); return; }
  }
  try { orders = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) {}
  try { off = JSON.parse(fs.readFileSync(CFG, "utf8")).off || []; } catch (e) {}
}
function writer(file, get) {
  let t = null;
  return () => { clearTimeout(t); t = setTimeout(() => fs.writeFile(file + ".tmp", JSON.stringify(get()), e => { if (!e) fs.rename(file + ".tmp", file, () => {}); }), 100); };
}
let rt = null;
const saveRemote = () => { if (!REDIS) return; clearTimeout(rt); rt = setTimeout(() => redis(["SET", KEY, JSON.stringify({ orders, off })]).catch(e => console.log("Opslaan online mislukt: " + e.message)), 400); };
const saveLocal = writer(DB, () => orders), saveCfgLocal = writer(CFG, () => ({ off }));
const save = () => { if (REDIS) saveRemote(); else saveLocal(); }, saveCfg = () => { if (REDIS) saveRemote(); else saveCfgLocal(); };

// ---------- meldingen via ntfy ----------
const NTFY_SERVER = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";
// Klanten krijgen een eigen onderwerp per naam. Het voorvoegsel is afgeleid van je geheime onderwerp,
// zodat het baristaonderwerp zelf nooit naar de klanten gaat.
const CLIENT_PREFIX = NTFY_TOPIC ? "moose-" + crypto.createHash("sha1").update("klant:" + NTFY_TOPIC).digest("hex").slice(0, 10) + "-" : "";
const slug = n => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
function push(topic, title, message) {
  if (!topic) return;
  fetch(NTFY_SERVER + "/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title, message, priority: 4, tags: ["coffee"] })
  }).then(r => { if (!r.ok) console.log("Melding mislukt: HTTP " + r.status); })
    .catch(e => console.log("Melding mislukt: " + e.message));
}
const notify = (title, message) => push(NTFY_TOPIC, title, message);
const notifyClient = (o, title, message) => { const sl = slug(o.name); if (CLIENT_PREFIX && sl) push(CLIENT_PREFIX + sl, title, message); };
const label = o => (o.dbl ? "dubbele " : "") + o.drink.toLowerCase();

// ---------- code voor de barista ----------
const fails = new Map();
// Achter de proxy van een host zit het echte adres in x-forwarded-for.
const ipOf = req => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
// Naast de limiet per adres geldt een totaal: wie adressen vervalst, kan zo toch geen codes blijven proberen.
let gFails = { n: 0, t: 0 };
const blocked = req => {
  if (gFails.n >= 30 && Date.now() - gFails.t < 60000) return true;
  const f = fails.get(ipOf(req)); return !!f && f.n >= 5 && Date.now() - f.t < 60000; };
const failed = req => {
  if (Date.now() - gFails.t >= 60000) gFails = { n: 0, t: Date.now() }; gFails.n++;
  const k = ipOf(req), f = fails.get(k); if (!f || Date.now() - f.t >= 60000) fails.set(k, { n: 1, t: Date.now() }); else f.n++; };
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function authed(req) {
  if (!PIN) return true;
  if (blocked(req)) return false;
  const given = req.headers["x-pin"];
  const ok = same(String(given || ""), PIN);
  if (!ok && given) failed(req);
  return ok;
}
const deny = (res, req) => send(res, blocked(req) ? 429 : 401, { error: blocked(req) ? "Te vaak geprobeerd. Wacht een minuut." : "Code klopt niet" });

// ---------- voorraad ----------
const isOff = (g, v) => g === "sugar" ? (v === "Zoetstof" ? off.includes("sugar:Zoetstof") : v !== "Geen" && off.includes("sugar:Suiker"))
  : v !== "Geen" && v !== "Geen melk" && off.includes(g + ":" + v);

const s = (v, n) => String(v == null ? "" : v).slice(0, n);
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let d = "";
  req.on("data", c => { d += c; if (d.length > 10000) { no(new Error("te groot")); req.destroy(); } });
  req.on("end", () => { try { ok(JSON.parse(d || "{}")); } catch (e) { no(e); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname === "/api/orders" && req.method === "GET")
      return send(res, 200, { orders, now: Date.now(), off, pin: !!PIN, prefix: CLIENT_PREFIX, ntfy: NTFY_SERVER });
    if (url.pathname === "/api/pin" && req.method === "POST") {
      const b = await readBody(req);
      if (blocked(req)) return deny(res, req);
      if (!PIN || same(String(b.pin || ""), PIN)) return send(res, 200, { ok: true });
      failed(req); return deny(res, req);
    }
    if (url.pathname === "/api/off" && req.method === "PATCH") {
      if (!authed(req)) return deny(res, req);
      const b = await readBody(req), key = String(b.item || "");
      if (!/^(drink|milk|syrup|sugar):[\w \-]{1,30}$/.test(key)) return send(res, 400, { error: "ongeldig item" });
      off = off.filter(x => x !== key);
      if (b.off) off.push(key);
      saveCfg();
      return send(res, 200, { off });
    }
    if (url.pathname === "/api/orders" && req.method === "POST") {
      const b = await readBody(req), name = s(b.name, 40).trim();
      if (!name || !b.drink) return send(res, 400, { error: "naam en drankje zijn verplicht" });
      for (const [g, v] of [["drink", b.drink], ["milk", b.milk], ["syrup", b.syrup], ["sugar", b.sugar]])
        if (isOff(g, s(v, 30))) return send(res, 409, { error: s(v, 30) + " is op" });
      const o = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), drink: s(b.drink, 30), dbl: !!b.dbl, milk: s(b.milk, 30), syrup: s(b.syrup, 30), sugar: s(b.sugar, 30), note: s(b.note, 200), name, by: s(b.by, 40), status: "nieuw", createdAt: Date.now() };
      orders.unshift(o); orders = orders.slice(0, 200); save();
      notify("Nieuwe koffie van " + o.name, label(o) + (o.note ? " (" + o.note + ")" : ""));
      return send(res, 201, o);
    }
    const m = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
    if (m && req.method === "PATCH") {
      const o = orders.find(x => x.id === m[1]);
      if (!o) return send(res, 404, { error: "bestelling niet gevonden" });
      const b = await readBody(req), keys = Object.keys(b);
      // Een klant mag alleen zijn bestelling sluiten of een voorstel aannemen. De rest vraagt de code.
      const customerAct = (b.status === "weg" && keys.length === 1) ||
        (o.status === "voorstel" && b.status === "nieuw" && b.accepted === true && keys.every(k => k === "status" || k === "accepted"));
      if (!customerAct && !authed(req)) return deny(res, req);
      const prev = o.status;
      if (b.status !== undefined) {
        if (!STATUS.includes(b.status)) return send(res, 400, { error: "ongeldige status" });
        o.status = b.status;
        if (b.status === "klaar") { o.etaAt = null; o.readyAt = Date.now(); }
      }
      if (b.accepted === true && b.status === "nieuw" && prev === "voorstel") notify(o.name + " neemt je voorstel aan", label(o));
      if (b.status && b.status !== prev) {
        if (b.status === "klaar") notifyClient(o, "Je koffie is klaar!", label(o) + ": kom ’m maar halen.");
        if (b.status === "voorstel") notifyClient(o, "Voorstel van de barista", s(b.reply, 200));
        if (b.status === "geweigerd") notifyClient(o, "Helaas niet gelukt", "De barista kan je " + label(o) + " nu niet maken.");
      }
      if (b.reply !== undefined) o.reply = s(b.reply, 200);
      if (b.accepted !== undefined) o.accepted = !!b.accepted;
      // Bereidingstijd: de server rekent met zijn eigen klok, zodat alle toestellen dezelfde countdown zien.
      if (b.etaMin !== undefined) {
        const min = Math.min(30, Math.max(1, Math.round(Number(b.etaMin)) || 1));
        o.etaMin = min; o.etaAt = Date.now() + min * 60000;
      }
      if (b.addMin !== undefined && o.etaAt) {
        const add = Math.min(10, Math.max(1, Math.round(Number(b.addMin)) || 1));
        o.etaMin = (o.etaMin || 0) + add; o.etaAt += add * 60000;
      }
      save();
      return send(res, 200, o);
    }
    if (req.method === "GET") {
      let p = path.normalize(decodeURIComponent(url.pathname));
      if (p === "/" || p === "\\") p = "/index.html";
      const f = path.join(PUB, p);
      if (!f.startsWith(PUB)) return send(res, 403, {});
      return fs.readFile(f, (e, d) => {
        if (e) { res.writeHead(404); return res.end("Niet gevonden"); }
        // Altijd even navragen bij de server (ETag): gewijzigde foto's verschijnen meteen, ongewijzigde komen uit het geheugen van de telefoon.
        const ext = path.extname(f), etag = '"' + crypto.createHash("sha1").update(d).digest("hex").slice(0, 20) + '"';
        const head = { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-cache", ETag: etag };
        if (req.headers["if-none-match"] === etag) { res.writeHead(304, head); return res.end(); }
        res.writeHead(200, head);
        res.end(d);
      });
    }
    send(res, 405, { error: "niet toegestaan" });
  } catch (e) { send(res, 400, { error: "ongeldig verzoek" }); }
});
load().then(() => server.listen(PORT, "0.0.0.0", () => {
  console.log("Moose draait!\n  Op deze computer: http://localhost:" + PORT);
  Object.values(os.networkInterfaces()).flat().filter(i => i.family === "IPv4" && !i.internal)
    .forEach(i => console.log("  Op je wifi (telefoon/tablet): http://" + i.address + ":" + PORT));
  console.log(PIN ? "  Baristakant: beveiligd met code" : "  Baristakant: zonder code (zet BARISTA_PIN=... om een code te vragen)");
  console.log(NTFY_TOPIC ? "  Meldingen: aan" : "  Meldingen: uit (zet NTFY_TOPIC=... om ze aan te zetten)");
}));
