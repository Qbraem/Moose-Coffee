// Moose: kleine koffie-server zonder dependencies. Start met: node server.js
//   BARISTA_PIN=123456   code voor de baristakant (zonder deze variabele is er geen code)
//   NTFY_TOPIC=geheim    meldingen naar de telefoon via ntfy (zonder deze variabele geen meldingen)
//   (webmeldingen op de telefoon staan altijd aan; de sleutels maakt de server zelf)
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

let orders = [], off = [], subs = [], vapid = null, users = [], sess = [], caps = { list: [] }, tips = null, stats = null;
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, ""), REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const REDIS = !!(REDIS_URL && REDIS_TOKEN), KEY = "moose:state";
const redis = cmd => fetch(REDIS_URL, { method: "POST", headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmd) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status); return j.result; });
// Capsulevoorraad: per soort een naam, sterkte (Nespresso-schaal 1 tot 13, 0 = niet ingevuld), systeem (Original of Vertuo) en aantal.
// De gast kiest de soort bij het bestellen, en dat aantal gaat dan omlaag.
const SYSTEMS = ["Original", "Vertuo"];
// Siroopsuggesties: per drankje een siroop die goed past. De barista past dit aan, en zet het per capsule uit (bijvoorbeeld bij een sterke ristretto).
const DRINK_NAMES = ["Espresso", "Americano", "Cappuccino", "Latte", "Latte macchiato", "Flat white", "Macchiato", "Cortado"];
const COLORS = ["#E08A2E", "#E6D2B0", "#B98A52", "#8A4B2A", "#C0504D", "#7A9A5B", "#D9A441", "#8E6BA8"];
const DEFAULT_SYRUPS = [{ id: "pumpkin", name: "Pumpkin spice", color: "#E08A2E", season: true }, { id: "mocha", name: "White mocha", color: "#E6D2B0", season: false }, { id: "hazel", name: "Hazelnoot", color: "#B98A52", season: false }];
function normSyrups(l) {
  const src = Array.isArray(l) ? l : DEFAULT_SYRUPS, out = [];
  for (const x of src) {
    if (!x || typeof x.name !== "string") continue;
    const nm = x.name.trim().slice(0, 30);
    if (!nm || nm.toLowerCase() === "geen" || out.some(y => y.name.toLowerCase() === nm.toLowerCase())) continue;
    out.push({ id: typeof x.id === "string" && x.id ? x.id : crypto.randomBytes(4).toString("hex"), name: nm, color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : COLORS[0], season: x.season === true });
  }
  return out.slice(0, 20);
}
let syrups = normSyrups();
const hasSyrup = n => syrups.some(x => x.name === n);
const DEFAULT_TIPS = { "Latte": "Pumpkin spice", "Cappuccino": "Hazelnoot", "Latte macchiato": "White mocha" };
function normTips(t) {
  const src = t && typeof t === "object" ? t : DEFAULT_TIPS, out = {};
  for (const d of DRINK_NAMES) if (hasSyrup(src[d])) out[d] = src[d];
  return out;
}
tips = normTips();
function normCaps(c) {
  const list = c && Array.isArray(c.list) ? c.list.filter(x => x && typeof x.id === "string" && typeof x.name === "string" && Number.isInteger(x.n))
    .map(x => ({ id: x.id, name: x.name.slice(0, 30), n: x.n, str: Number.isInteger(x.str) && x.str >= 1 && x.str <= 13 ? x.str : 0, sys: SYSTEMS.includes(x.sys) ? x.sys : "", tip: x.tip !== false, deca: x.deca === true })).slice(0, 30) : [];
  return { list };
}
function capLow(c, before) {
  if (c.n === 0 && before > 0) notify("Capsules op: " + c.name, "Gasten kunnen de drankjes met deze capsule niet meer bestellen.", "moose-caps-" + c.id);
  else if (c.n <= 5 && before > 5) notify("Nog " + c.n + " capsules: " + c.name, "Vul aan en werk het aantal bij.", "moose-caps-" + c.id);
}
async function loadState() {
  if (REDIS) {
    // Start nooit leeg als Upstash even niet antwoordt: dan zou de eerste bewaring alles overschrijven. Liever opnieuw proberen en anders stoppen (de host start de dienst dan opnieuw).
    for (let i = 1; ; i++) {
      try {
        const raw = await redis(["GET", KEY]), st = raw ? JSON.parse(raw) : {};
        orders = Array.isArray(st.orders) ? st.orders : []; off = Array.isArray(st.off) ? st.off : [];
        subs = Array.isArray(st.subs) ? st.subs : []; vapid = st.vapid || null;
        users = Array.isArray(st.users) ? st.users : []; sess = Array.isArray(st.sess) ? st.sess : []; caps = normCaps(st.caps); syrups = normSyrups(st.syrups); tips = normTips(st.tips); stats = st.stats || null;
        return console.log("  Opslag: online (Upstash), " + orders.length + " bestellingen geladen");
      } catch (e) {
        console.log("  Opslag: Upstash niet bereikbaar (" + e.message + "), poging " + i + " van 4");
        if (i >= 4) { console.log("  Ik stop liever dan met een lege opslag te starten."); process.exit(1); }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  try { orders = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) {}
  try { const c = JSON.parse(fs.readFileSync(CFG, "utf8")); off = c.off || []; subs = c.subs || []; vapid = c.vapid || null; users = c.users || []; sess = c.sess || []; caps = normCaps(c.caps); syrups = normSyrups(c.syrups); tips = normTips(c.tips); stats = c.stats || null; } catch (e) {}
}
async function load() { await loadState(); ensureVapid(); }
function writer(file, get) {
  let t = null;
  return () => { clearTimeout(t); t = setTimeout(() => fs.writeFile(file + ".tmp", JSON.stringify(get()), e => { if (!e) fs.rename(file + ".tmp", file, () => {}); }), 100); };
}
let rt = null;
const saveRemote = () => { if (!REDIS) return; clearTimeout(rt); rt = setTimeout(() => redis(["SET", KEY, JSON.stringify({ orders, off, subs, vapid, users, sess, caps, syrups, tips, stats })]).catch(e => console.log("Opslaan online mislukt: " + e.message)), 400); };
const saveLocal = writer(DB, () => orders), saveCfgLocal = writer(CFG, () => ({ off, subs, vapid, users, sess, caps, syrups, tips, stats }));
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
// Elke melding gaat via twee wegen: webmelding op de telefoon (als iemand die aanzette) en ntfy (als je dat instelde).
const notify = (title, message, tag) => {
  push(NTFY_TOPIC, title, message);
  pushTo(x => x.roles.includes("barista"), { title, body: message, tag: tag || "moose-barista" });
};
const notifyClient = (o, title, message) => {
  const sl = slug(o.name); if (CLIENT_PREFIX && sl) push(CLIENT_PREFIX + sl, title, message);
  if (o.by) pushTo(x => x.roles.includes("klant") && x.by === o.by, { title, body: message, tag: "koffie-" + o.id });
};
const label = o => (o.dbl ? "dubbele " : "") + o.drink.toLowerCase();

// ---------- webmeldingen (Web Push, zonder extra pakketten) ----------
const SUBJECT = process.env.VAPID_SUBJECT || "https://" + (process.env.RENDER_EXTERNAL_HOSTNAME || "moose.example");
function ensureVapid() {
  if (vapid && vapid.x && vapid.y && vapid.d) return;
  const j = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
  vapid = { x: j.x, y: j.y, d: j.d }; saveCfg();
}
const vapidPub = () => Buffer.concat([Buffer.from([4]), Buffer.from(vapid.x, "base64url"), Buffer.from(vapid.y, "base64url")]).toString("base64url");
function vapidAuth(endpoint) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ typ: "JWT", alg: "ES256" }), body = b64({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT });
  const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", x: vapid.x, y: vapid.y, d: vapid.d }, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return "vapid t=" + head + "." + body + "." + sig + ", k=" + vapidPub();
}
// RFC 8291 (aes128gcm). "fixed" dient alleen voor tests.
function encryptPush(sub, text, fixed) {
  const ua = Buffer.from(sub.keys.p256dh, "base64url"), auth = Buffer.from(sub.keys.auth, "base64url");
  const ecdh = crypto.createECDH("prime256v1");
  if (fixed && fixed.asPrivate) ecdh.setPrivateKey(fixed.asPrivate); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secret = ecdh.computeSecret(ua), salt = (fixed && fixed.salt) || crypto.randomBytes(16);
  const kdf = (ikm, sa, info, n) => Buffer.from(crypto.hkdfSync("sha256", ikm, sa, Buffer.from(info, "latin1"), n));
  const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub]), 32));
  const cek = kdf(ikm, salt, "Content-Encoding: aes128gcm\0", 16), nonce = kdf(ikm, salt, "Content-Encoding: nonce\0", 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const enc = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const hdr = Buffer.alloc(21); salt.copy(hdr, 0); hdr.writeUInt32BE(4096, 16); hdr[20] = 65;
  return Buffer.concat([hdr, asPub, enc]);
}
// Alleen echte push-diensten: anders kon iemand de server naar een intern adres laten sturen.
const PUSH_HOST = /(^|\.)(push\.apple\.com|googleapis\.com|push\.services\.mozilla\.com|mozaws\.net|notify\.windows\.com)$/;
const endpointOk = u => { try { const x = new URL(u); return process.env.PUSH_ALLOW_ANY === "1" || (x.protocol === "https:" && PUSH_HOST.test(x.hostname)); } catch (e) { return false; } };
async function sendWebPush(sub, payload) {
  const r = await fetch(sub.endpoint, { method: "POST", body: encryptPush(sub, JSON.stringify(payload)), headers: {
    Authorization: vapidAuth(sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "3600", Urgency: "high" } });
  return r.status;
}
function pushTo(filter, payload) {
  for (const sb of subs.filter(filter))
    sendWebPush(sb, payload).then(st => {
      if (st === 404 || st === 410) { subs = subs.filter(x => x !== sb); saveCfg(); }
      else if (st >= 400) console.log("Webmelding mislukt: HTTP " + st);
    }).catch(e => console.log("Webmelding mislukt: " + e.message));
}

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


// ---------- accounts met naam en pincode ----------
// Geen e-mail en geen wachtwoord: een naam en een pincode van 4 tot 6 cijfers. De pincode wordt nooit leesbaar bewaard (scrypt met eigen zout),
// de sessie is een lange willekeurige sleutel op het toestel waarvan de server alleen de afgeschermde waarde kent.
const nameKey = n => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const sha = t => crypto.createHash("sha256").update(t).digest("hex");
const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString("hex");
const aFails = new Map(); let aG = { n: 0, t: 0 };
const aBlocked = req => (aG.n >= 60 && Date.now() - aG.t < 60000) || ((x => !!x && x.n >= 10 && Date.now() - x.t < 60000)(aFails.get(ipOf(req))));
const aFail = req => {
  if (Date.now() - aG.t >= 60000) aG = { n: 0, t: Date.now() }; aG.n++;
  const k = ipOf(req), f = aFails.get(k); if (!f || Date.now() - f.t >= 60000) aFails.set(k, { n: 1, t: Date.now() }); else f.n++; };
function userOf(req) {
  const t = String(req.headers["x-token"] || ""); if (t.length < 20) return null;
  const h = sha(t), se = sess.find(x => x.h === h); if (!se) return null;
  return users.find(u => u.id === se.u) || null;
}
function newSession(u) {
  const t = crypto.randomBytes(32).toString("base64url");
  sess.push({ h: sha(t), u: u.id, at: Date.now() });
  const mine = sess.filter(x => x.u === u.id); if (mine.length > 10) sess = sess.filter(x => x.u !== u.id || mine.slice(-10).includes(x));
  return t;
}
// Het gewone: de combinatie die het vaakst besteld is (bij gelijkstand de meest recente).
const sig = o => [o.drink, o.dbl ? 1 : 0, o.milk, o.syrup, o.sugar, o.capName || ""].join("|");
function gewone(u) {
  const c = new Map();
  for (const o of u.hist || []) { const k = sig(o), e = c.get(k); if (e) e.n++; else c.set(k, { n: 1, o }); }
  let best = null; for (const e of c.values()) if (!best || e.n > best.n) best = e;
  return best ? Object.assign({ count: best.n }, best.o) : null;
}
const pub = o => { const { uid, rateCredited, credited, ...r } = o; return r; };
// ---------- badges ----------
const streakOf = u => { const d = [...new Set(u.days || [])].sort((a, b) => a - b); let best = 0, run = 0, prev = null; for (const x of d) { run = prev !== null && x - prev === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; } return best; };
const MILES = [[1, "m1", "Eerste slok"], [10, "m10", "Jonge eland"], [20, "m20", "Vaste gast"], [50, "m50", "Eland van het huis"], [100, "m100", "Legende van het bos"]];
const BADGES = [
  ...MILES.map(([n, id, name]) => ({ id, name, kind: "mile", glyph: String(n), desc: n === 1 ? "Je eerste koffie bij Moose." : n + " koffies gedronken.", of: n, val: u => u.done || 0 })),
  { id: "all", name: "Alles geproefd", kind: "fun", glyph: "grid", desc: "Elk drankje op de kaart geprobeerd.", of: DRINK_NAMES.length, val: u => (u.tried || []).length },
  { id: "season", name: "Seizoensgast", kind: "fun", glyph: "leaf", desc: "Een seizoenssiroop geprobeerd.", of: 1, val: u => u.season ? 1 : 0 },
  { id: "streak5", name: "Vijf op rij", kind: "fun", glyph: "flame", desc: "Vijf dagen op rij koffie gehaald.", of: 5, val: u => streakOf(u) },
  { id: "jury", name: "Smaakjury", kind: "fun", glyph: "star", desc: "Zes koffies beoordeeld.", of: 6, val: u => u.rated || 0 },
  { id: "early", name: "Vroege vogel", kind: "fun", glyph: "sun", desc: "Koffie besteld voor 9 uur.", of: 1, val: u => u.early || 0 },
];
function checkBadges(u) { u.bd = u.bd || {}; for (const b of BADGES) if (!u.bd[b.id] && b.val(u) >= b.of) u.bd[b.id] = Date.now(); }
function creditDone(o) {
  const u = o.uid && users.find(x => x.id === o.uid); if (!u) return;
  const w = when(o.createdAt);
  u.done = (u.done || 0) + 1; u.tried = u.tried || []; if (!u.tried.includes(o.drink)) u.tried.push(o.drink);
  const sy = syrups.find(x => x.name === o.syrup); if (sy && sy.season) u.season = true;
  if (w.hour < 9) u.early = (u.early || 0) + 1;
  u.days = (u.days || []).concat(dayNum(w.day)).slice(-60);
  checkBadges(u); saveCfg();
}
const badgesOf = u => BADGES.map(b => ({ id: b.id, name: b.name, kind: b.kind, glyph: b.glyph, desc: b.desc, of: b.of, n: Math.min(b.of, b.val(u)), at: (u.bd || {})[b.id] || null }));
const me = u => ({ name: u.name, hist: (u.hist || []).slice(0, 12), gewone: gewone(u), total: u.total || 0, done: u.done || 0, badges: badgesOf(u) });

// ---------- statistieken ----------
// Alleen optellingen, geen bestellijst: dat blijft klein en past ook ver na de laatste 200 bestellingen nog. Een koffie telt mee zodra hij klaar is.
const tzf = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function when(t) { const p = {}; for (const x of tzf.formatToParts(new Date(t))) p[x.type] = x.value; return { day: p.year + "-" + p.month + "-" + p.day, hour: (+p.hour) % 24, wd: WD.indexOf(p.weekday) }; }
const bump = (m, k, d) => { if (!k) return; m[k] = (m[k] || 0) + d; if (m[k] <= 0) delete m[k]; };
function ensureStats() {
  if (stats) return;
  stats = { since: orders.length ? orders[orders.length - 1].createdAt : Date.now(), total: 0, caps: 0, dbl: 0, deca: 0, drinks: {}, milk: {}, syrup: {}, sugar: {}, capNames: {}, hours: Array(24).fill(0), wdays: Array(7).fill(0), days: {}, people: {}, wait: { n: 0, sum: 0, min: 0, max: 0 } };
  for (const o of orders.slice().reverse()) if (o.readyAt && o.status !== "geweigerd") { o.counted = true; tally(o, 1); } // bestaande bestellingen meetellen
}
function rate(st, o, d) {
  const r = st.rate || (st.rate = { n: 0, sum: 0, dist: [0, 0, 0, 0, 0], drinks: {} });
  r.n = Math.max(0, r.n + d); r.sum = Math.max(0, r.sum + d * o.rating); r.dist[o.rating - 1] = Math.max(0, r.dist[o.rating - 1] + d);
  const x = r.drinks[o.drink] || (r.drinks[o.drink] = { n: 0, sum: 0 }); x.n = Math.max(0, x.n + d); x.sum = Math.max(0, x.sum + d * o.rating);
  if (x.n === 0) delete r.drinks[o.drink];
}
function tally(o, d) {
  if (o.rating >= 1) rate(stats, o, d);
  const st = stats, w = when(o.createdAt), k = nameKey(o.name);
  st.total += d; st.caps += d * (o.capN || (o.dbl ? 2 : 1)); if (o.dbl) st.dbl += d; if (o.capDeca) st.deca += d;
  bump(st.drinks, o.drink, d); bump(st.milk, o.milk, d); bump(st.syrup, o.syrup, d); bump(st.sugar, o.sugar, d); bump(st.capNames, o.capName, d);
  st.hours[w.hour] = Math.max(0, st.hours[w.hour] + d); if (w.wd >= 0) st.wdays[w.wd] = Math.max(0, st.wdays[w.wd] + d); bump(st.days, w.day, d);
  if (st.people[k] || (d > 0 && Object.keys(st.people).length < 150)) { const pe = st.people[k] || (st.people[k] = { name: o.name, n: 0, drinks: {} }); pe.n += d; bump(pe.drinks, o.drink, d); if (pe.n <= 0) delete st.people[k]; }
  if (o.readyAt && o.readyAt > o.createdAt && o.readyAt - o.createdAt < 3 * 3600e3) {
    const sec = Math.round((o.readyAt - o.createdAt) / 1000); st.wait.n += d; st.wait.sum += d * sec;
    if (d > 0) { st.wait.min = st.wait.min ? Math.min(st.wait.min, sec) : sec; st.wait.max = Math.max(st.wait.max, sec); }
  }
  const ds = Object.keys(st.days).sort(); while (ds.length > 400) delete st.days[ds.shift()];
}
const dayNum = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
function statsOut() {
  ensureStats(); const st = stats, days = Object.keys(st.days).sort(), today = when(Date.now()).day;
  let best = null, max = 0, run = 0, prev = null;
  for (const d of days) { if (!best || st.days[d] > best.n) best = { day: d, n: st.days[d] }; run = prev !== null && dayNum(d) - dayNum(prev) === 1 ? run + 1 : 1; max = Math.max(max, run); prev = d; }
  const cur = days.length && dayNum(today) - dayNum(days[days.length - 1]) <= 1 ? run : 0;
  const last14 = []; for (let i = 13; i >= 0; i--) { const d = new Date((dayNum(today) - i) * 864e5).toISOString().slice(0, 10); last14.push({ day: d, n: st.days[d] || 0 }); }
  const people = Object.values(st.people).sort((a, b) => b.n - a.n).slice(0, 5).map(p => ({ name: p.name, n: p.n, fav: (Object.entries(p.drinks).sort((a, b) => b[1] - a[1])[0] || [""])[0] }));
  const rt = st.rate || { n: 0, sum: 0, dist: [0, 0, 0, 0, 0], drinks: {} };
  return { rate: { n: rt.n, avg: rt.n ? rt.sum / rt.n : 0, dist: rt.dist, drinks: Object.entries(rt.drinks).map(([d, x]) => ({ drink: d, n: x.n, avg: x.sum / x.n })).sort((a, b) => b.avg - a.avg || b.n - a.n) }, since: st.since, total: st.total, caps: st.caps, dbl: st.dbl, deca: st.deca, drinks: st.drinks, milk: st.milk, syrup: st.syrup, sugar: st.sugar, capNames: st.capNames, hours: st.hours, wdays: st.wdays, last14, best, streak: { cur, max }, wait: st.wait, people, activeDays: days.length, today: st.days[today] || 0 };
}

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

// Bij afsluiten (bijvoorbeeld tijdens een nieuwe uitrol) eerst alles wegschrijven, zodat de laatste wijziging niet verloren gaat.
async function flushAndExit() {
  try {
    if (REDIS) { clearTimeout(rt); await redis(["SET", KEY, JSON.stringify({ orders, off, subs, vapid, users, sess, caps, syrups, tips, stats })]); }
    else { fs.writeFileSync(DB, JSON.stringify(orders)); fs.writeFileSync(CFG, JSON.stringify({ off, subs, vapid, users, sess, caps, syrups, tips, stats })); }
  } catch (e) { console.log("Wegschrijven bij afsluiten mislukt: " + e.message); }
  process.exit(0);
}
process.on("SIGTERM", flushAndExit); process.on("SIGINT", flushAndExit);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname === "/api/orders" && req.method === "GET")
      return send(res, 200, { orders: orders.map(pub), now: Date.now(), off, pin: !!PIN, prefix: CLIENT_PREFIX, ntfy: NTFY_SERVER, push: true, caps, tips, syrups });
    if (url.pathname === "/api/pin" && req.method === "POST") {
      const b = await readBody(req);
      if (blocked(req)) return deny(res, req);
      if (!PIN || same(String(b.pin || ""), PIN)) return send(res, 200, { ok: true });
      failed(req); return deny(res, req);
    }
    if (url.pathname === "/api/push/key" && req.method === "GET") return send(res, 200, { key: vapidPub() });
    if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
      const b = await readBody(req), sub = b.sub || {}, k = sub.keys || {};
      if (!endpointOk(sub.endpoint) || typeof k.p256dh !== "string" || typeof k.auth !== "string" || Buffer.from(k.p256dh, "base64url").length !== 65 || Buffer.from(k.auth, "base64url").length !== 16)
        return send(res, 400, { error: "ongeldig abonnement" });
      const role = b.role === "barista" ? "barista" : "klant";
      if (role === "barista" && !authed(req)) return deny(res, req);
      let e = subs.find(x => x.endpoint === sub.endpoint);
      if (!e) { if (subs.length >= 300) return send(res, 429, { error: "te veel abonnementen" }); e = { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth }, roles: [], by: "" }; subs.push(e); }
      e.keys = { p256dh: k.p256dh, auth: k.auth };
      if (!e.roles.includes(role)) e.roles.push(role);
      if (role === "klant") e.by = s(b.by, 40);
      saveCfg();
      return send(res, 200, { roles: e.roles });
    }
    if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
      const b = await readBody(req), e = subs.find(x => x.endpoint === b.endpoint);
      if (!e) return send(res, 200, { roles: [] });
      e.roles = e.roles.filter(r => r !== b.role);
      if (!e.roles.length) subs = subs.filter(x => x !== e);
      saveCfg();
      return send(res, 200, { roles: e.roles });
    }
    if (url.pathname === "/api/push/test" && req.method === "POST") {
      if (!authed(req)) return deny(res, req);
      pushTo(x => x.roles.includes("barista"), { title: "Moose", body: "Meldingen werken. Je krijgt er een bij elke nieuwe bestelling.", tag: "moose-test" });
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/account/register" && req.method === "POST") {
      const b = await readBody(req), name = s(b.name, 30).trim().replace(/\s+/g, " "), pin = String(b.pin || "");
      if (aBlocked(req)) return send(res, 429, { error: "Te vaak geprobeerd. Wacht een minuut." });
      aFail(req); // elke poging telt mee, zodat niemand eindeloos accounts kan maken
      if (name.length < 2) return send(res, 400, { error: "Kies een naam van minstens 2 tekens" });
      if (!/^\d{4,6}$/.test(pin)) return send(res, 400, { error: "De pincode is 4 tot 6 cijfers" });
      if (users.some(u => u.key === nameKey(name))) return send(res, 409, { error: "Die naam is al in gebruik. Ben jij het? Log dan in." });
      if (users.length >= 300) return send(res, 429, { error: "Er zijn al te veel accounts" });
      const salt = crypto.randomBytes(16).toString("hex");
      const u = { id: crypto.randomBytes(8).toString("hex"), name, key: nameKey(name), salt, hash: hashPin(pin, salt), hist: [], total: 0, createdAt: Date.now(), fails: 0, lockUntil: 0 };
      users.push(u); const token = newSession(u); saveCfg();
      return send(res, 201, Object.assign({ token }, me(u)));
    }
    if (url.pathname === "/api/account/login" && req.method === "POST") {
      const b = await readBody(req), pin = String(b.pin || ""), u = users.find(x => x.key === nameKey(s(b.name, 30)));
      if (aBlocked(req)) return send(res, 429, { error: "Te vaak geprobeerd. Wacht een minuut." });
      if (u && u.lockUntil > Date.now()) return send(res, 429, { error: "Dit account is even vergrendeld na te veel pogingen. Probeer het over een paar minuten opnieuw." });
      // Altijd dezelfde rekentijd en hetzelfde antwoord, ook als de naam niet bestaat.
      const ok = u ? same(hashPin(pin, u.salt), u.hash) : (hashPin(pin, "00"), false);
      if (!ok) {
        aFail(req);
        if (u && ++u.fails >= 5) { u.fails = 0; u.lockUntil = Date.now() + 5 * 60000; }
        if (u) saveCfg();
        return send(res, 401, { error: "Naam of pincode klopt niet" });
      }
      u.fails = 0; u.lockUntil = 0; const token = newSession(u); saveCfg();
      return send(res, 200, Object.assign({ token }, me(u)));
    }
    if (url.pathname === "/api/me" && req.method === "GET") {
      const u = userOf(req); if (!u) return send(res, 401, { error: "niet ingelogd" });
      return send(res, 200, me(u));
    }
    if (url.pathname === "/api/account/logout" && req.method === "POST") {
      const t = String(req.headers["x-token"] || ""); if (t) { sess = sess.filter(x => x.h !== sha(t)); saveCfg(); }
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/account/delete" && req.method === "POST") {
      const u = userOf(req); if (!u) return send(res, 401, { error: "niet ingelogd" });
      const b = await readBody(req);
      if (aBlocked(req)) return send(res, 429, { error: "Te vaak geprobeerd. Wacht een minuut." });
      if (!same(hashPin(String(b.pin || ""), u.salt), u.hash)) { aFail(req); return send(res, 401, { error: "Pincode klopt niet" }); }
      users = users.filter(x => x !== u); sess = sess.filter(x => x.u !== u.id); saveCfg();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/caps" && req.method === "PATCH") {
      if (!authed(req)) return deny(res, req);
      const b = await readBody(req), num = (v, max) => (v !== "" && v !== null && typeof v !== "boolean" && Number.isFinite(Number(v))) ? Math.min(max, Math.max(0, Math.round(Number(v)))) : null;
      const fields = (o, c) => {
        if (o.name !== undefined) { const nm = s(o.name, 30).trim(); if (!nm) return "Geef een naam"; if (caps.list.some(x => x !== c && x.name.toLowerCase() === nm.toLowerCase())) return "Die soort bestaat al"; c.name = nm; }
        if (o.str !== undefined) { const v = num(o.str, 13); if (v === null) return "ongeldige sterkte"; c.str = v; }
        if (o.tip !== undefined) c.tip = o.tip !== false;
        if (o.deca !== undefined) c.deca = o.deca === true;
        if (o.sys !== undefined) { if (o.sys !== "" && !SYSTEMS.includes(o.sys)) return "ongeldig systeem"; c.sys = o.sys; }
        return "";
      };
      if (b.add) {
        const n = num(b.add.n, 9999); if (n === null) return send(res, 400, { error: "Geef een aantal" });
        if (caps.list.length >= 30) return send(res, 400, { error: "Er kunnen maximaal 30 soorten bij" });
        const c = { id: crypto.randomBytes(4).toString("hex"), name: "", n, str: 0, sys: "", tip: true, deca: false };
        if (b.add.name === undefined) return send(res, 400, { error: "Geef een naam" });
        const e = fields(b.add, c); if (e) return send(res, e.startsWith("Die") ? 409 : 400, { error: e });
        caps.list.push(c);
      } else if (b.set) {
        const c = caps.list.find(x => x.id === b.set.id); if (!c) return send(res, 404, { error: "niet gevonden" });
        if (b.set.n !== undefined) { const n = num(b.set.n, 9999); if (n === null) return send(res, 400, { error: "ongeldig aantal" }); const before = c.n; c.n = n; capLow(c, before); }
        const e = fields(b.set, c); if (e) return send(res, e.startsWith("Die") ? 409 : 400, { error: e });
      } else if (b.del) {
        if (!caps.list.some(x => x.id === b.del)) return send(res, 404, { error: "niet gevonden" });
        caps.list = caps.list.filter(x => x.id !== b.del);
      } else return send(res, 400, { error: "niets te doen" });
      saveCfg();
      return send(res, 200, { caps });
    }
    if (url.pathname === "/api/syrups" && req.method === "PATCH") {
      if (!authed(req)) return deny(res, req);
      const b = await readBody(req), okc = c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
      if (b.add) {
        const nm = s(b.add.name, 30).trim();
        if (!nm) return send(res, 400, { error: "Geef een naam" });
        if (nm.toLowerCase() === "geen" || syrups.some(x => x.name.toLowerCase() === nm.toLowerCase())) return send(res, 400, { error: "Die siroop bestaat al" });
        if (syrups.length >= 20) return send(res, 400, { error: "Maximaal 20 siropen" });
        syrups.push({ id: crypto.randomBytes(4).toString("hex"), name: nm, color: okc(b.add.color) ? b.add.color : COLORS[syrups.length % COLORS.length], season: b.add.season === true });
      } else if (b.set) {
        const x = syrups.find(y => y.id === b.set.id);
        if (!x) return send(res, 404, { error: "Siroop niet gevonden" });
        if (b.set.season !== undefined) x.season = b.set.season === true;
        if (b.set.color !== undefined) { if (!okc(b.set.color)) return send(res, 400, { error: "ongeldige kleur" }); x.color = b.set.color; }
      } else if (b.del) {
        const x = syrups.find(y => y.id === b.del);
        if (!x) return send(res, 404, { error: "Siroop niet gevonden" });
        syrups = syrups.filter(y => y !== x);
        for (const d of Object.keys(tips)) if (tips[d] === x.name) delete tips[d];
        off = off.filter(k => k !== "syrup:" + x.name);
      } else return send(res, 400, { error: "niets te doen" });
      saveCfg();
      return send(res, 200, { syrups, tips, off });
    }
    if (url.pathname === "/api/tips" && req.method === "PATCH") {
      if (!authed(req)) return deny(res, req);
      const b = await readBody(req);
      if (!DRINK_NAMES.includes(b.drink) || (b.syrup !== "" && !hasSyrup(b.syrup))) return send(res, 400, { error: "ongeldige suggestie" });
      if (b.syrup === "") delete tips[b.drink]; else tips[b.drink] = b.syrup;
      saveCfg();
      return send(res, 200, { tips });
    }
    if (url.pathname === "/api/off" && req.method === "PATCH") {
      if (!authed(req)) return deny(res, req);
      const b = await readBody(req), key = String(b.item || "");
      if (!(key === "shop:closed" || /^(drink|milk|syrup|sugar):[\w \-]{1,30}$/.test(key))) return send(res, 400, { error: "ongeldig item" });
      off = off.filter(x => x !== key);
      if (b.off) off.push(key);
      saveCfg();
      return send(res, 200, { off });
    }
    if (url.pathname === "/api/orders" && req.method === "POST") {
      if (off.includes("shop:closed")) return send(res, 409, { error: "Ons winkeltje is gesloten. Nog even geduld, onze moose is onderweg!" });
      const b = await readBody(req), name = s(b.name, 40).trim();
      if (!name || !b.drink) return send(res, 400, { error: "naam en drankje zijn verplicht" });
      const need = b.dbl ? 2 : 1, cp = caps.list.length ? caps.list.find(x => x.id === b.cap) : null;
      if (caps.list.length && !cp) return send(res, 400, { error: "Kies een capsule" });
      if (cp && cp.n < need) return send(res, 409, { error: cp.n <= 0 ? cp.name + " is op" : "Er is nog maar " + cp.n + " capsule " + cp.name + ", dus geen dubbele" });
      if (b.syrup && b.syrup !== "Geen" && !hasSyrup(s(b.syrup, 30))) return send(res, 400, { error: "Die siroop bestaat niet meer" });
      for (const [g, v] of [["drink", b.drink], ["milk", b.milk], ["syrup", b.syrup], ["sugar", b.sugar]])
        if (isOff(g, s(v, 30))) return send(res, 409, { error: s(v, 30) + " is op" });
      const au0 = userOf(req);
      const o = { uid: au0 ? au0.id : undefined, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), drink: s(b.drink, 30), dbl: !!b.dbl, milk: s(b.milk, 30), syrup: s(b.syrup, 30), sugar: s(b.sugar, 30), note: s(b.note, 200), name, by: s(b.by, 40), status: "nieuw", createdAt: Date.now() };
      if (cp) { o.capId = cp.id; o.capN = need; o.capName = cp.name; o.capStr = cp.str; o.capSys = cp.sys; o.capDeca = !!cp.deca; const before = cp.n; cp.n -= need; capLow(cp, before); saveCfg(); }
      orders.unshift(o); orders = orders.slice(0, 200);
      const au = userOf(req);
      if (au) { au.hist = [{ drink: o.drink, dbl: o.dbl, milk: o.milk, syrup: o.syrup, sugar: o.sugar, note: o.note, capId: o.capId || "", capName: o.capName || "", at: o.createdAt }].concat(au.hist || []).slice(0, 30); au.total = (au.total || 0) + 1; saveCfg(); }
      save();
      notify("Nieuwe koffie van " + o.name, label(o) + (o.note ? " (" + o.note + ")" : ""), "order-" + o.id);
      return send(res, 201, pub(o));
    }
    const m = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
    if (m && req.method === "PATCH") {
      const o = orders.find(x => x.id === m[1]);
      if (!o) return send(res, 404, { error: "bestelling niet gevonden" });
      const b = await readBody(req), keys = Object.keys(b);
      // Een klant mag alleen zijn bestelling sluiten of een voorstel aannemen. De rest vraagt de code.
      const customerAct = (b.status === "weg" && keys.length === 1) ||
        (o.status === "voorstel" && b.status === "nieuw" && b.accepted === true && keys.every(k => k === "status" || k === "accepted")) ||
        (keys.length === 1 && b.rating !== undefined);
      if (!customerAct && !authed(req)) return deny(res, req);
      const prev = o.status;
      if (b.status !== undefined) {
        if (!STATUS.includes(b.status)) return send(res, 400, { error: "ongeldige status" });
        o.status = b.status;
        if (b.status === "klaar") {
          o.etaAt = null; o.readyAt = Date.now();
          ensureStats(); if (!o.counted) { o.counted = true; tally(o, 1); saveCfg(); }
          if (!o.credited) { o.credited = true; creditDone(o); }
        }
      }
      if (b.accepted === true && b.status === "nieuw" && prev === "voorstel") notify(o.name + " neemt je voorstel aan", label(o), "order-" + o.id);
      if (b.status && b.status !== prev) {
        if (b.status === "klaar") notifyClient(o, "Je koffie is klaar!", label(o) + ": kom ’m maar halen. Hoe lekker was ze? Geef je sterren in de app.");
        if (b.status === "voorstel") notifyClient(o, "Voorstel van de barista", s(b.reply, 200));
        if (b.status === "geweigerd") notifyClient(o, "Helaas niet gelukt", "De barista kan je " + label(o) + " nu niet maken.");
      }
      // Mislukt of geannuleerd voor het klaar was: de capsules gaan terug in de voorraad.
      if (o.capId && !o.capBack && b.status && b.status !== prev && (b.status === "geweigerd" || (b.status === "weg" && prev !== "klaar" && prev !== "geweigerd"))) {
        const c = caps.list.find(x => x.id === o.capId); o.capBack = true; if (c) { c.n += o.capN || 1; saveCfg(); }
      }
      if (b.rating !== undefined) {
        const r = Math.round(Number(b.rating));
        if (!(r >= 1 && r <= 5)) return send(res, 400, { error: "ongeldige beoordeling" });
        if (!o.readyAt || !o.counted) return send(res, 409, { error: "Je kunt pas beoordelen als de koffie klaar is" });
        ensureStats(); if (o.rating) rate(stats, o, -1);
        o.rating = r; rate(stats, o, 1);
        const ru = o.uid && !o.rateCredited && users.find(x => x.id === o.uid); if (ru) { o.rateCredited = true; ru.rated = (ru.rated || 0) + 1; checkBadges(ru); }
        saveCfg();
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
      return send(res, 200, pub(o));
    }
    if (m && req.method === "DELETE") {
      if (!authed(req)) return deny(res, req);
      const i = orders.findIndex(x => x.id === m[1]);
      if (i < 0) return send(res, 404, { error: "bestelling niet gevonden" });
      const o = orders[i]; ensureStats();
      if (o.counted) tally(o, -1); // een verwijderde bestelling telt niet meer mee
      if (o.capId && !o.capBack && !o.readyAt && o.status !== "klaar") { const c = caps.list.find(x => x.id === o.capId); if (c) c.n += o.capN || 1; } // nooit klaar geweest: capsules terug
      orders.splice(i, 1); save(); saveCfg();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/stats" && req.method === "GET") return send(res, 200, statsOut());
    if (url.pathname === "/api/stats/reset" && req.method === "POST") {
      if (!authed(req)) return deny(res, req);
      orders = orders.filter(o => ["nieuw", "bezig", "voorstel"].includes(o.status));
      for (const o of orders) delete o.counted;
      stats = null; ensureStats(); stats.since = Date.now();
      save(); saveCfg();
      return send(res, 200, { ok: true });
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
