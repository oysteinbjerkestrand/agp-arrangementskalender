// sync.mjs — henter arrangementer fra Places.nu og skriver docs/events.json
//
// Kjøres av GitHub Actions tre ganger i døgnet. API-nøkkelen leses fra
// miljøvariabelen PLACES_API_KEY, som ligger som repository secret.
// Nøkkelen skal aldri inn i denne filen.

import { writeFile, mkdir } from "node:fs/promises";

const API = "https://places.nu/api/partner/events/";
const THUMB_PREFIX = "https://places.nu/media/__sized__/";
const OUT_DIR = "docs";
const OUT_FILE = `${OUT_DIR}/events.json`;

// Hvor mange kommende datoer vi tar med for gjentakende arrangementer.
const MAX_REPEATS = 12;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

// Enlinjefelt: navn, arrangør, sted.
function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// Beskrivelser: behold linjeskiftene, de bærer struktur i programoppsett
// og lister. Rydd bort alt annet overflødig mellomrom.
function cleanText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Places legger bildet på event.image. Mangler det, arver arrangementet
// stedets bilde. Vi tar vare på både full størrelse og forhåndsvisning.
function pickImage(ev) {
  const has = (o) => o && (o.url || o.thumbnail);
  const img = (has(ev.image) ? ev.image : null)
    || (ev.location && has(ev.location.image) ? ev.location.image : null);
  if (!img) return null;

  const strip = (url, prefix) =>
    url && url.startsWith(prefix) ? url.slice(prefix.length) : url;

  return {
    thumb: strip(img.thumbnail || img.url, THUMB_PREFIX),
    full: img.url || null,
    credit: img.credit || null,
  };
}

// Gjør om Places' format til det kompakte formatet kalenderen leser.
// Eksportert slik at den kan testes uten nett.
export function transform(events, today = isoToday()) {
  const out = [];

  for (const ev of events) {
    if (!ev || !ev.start_date) continue;

    const row = {};
    row.n = clean(ev.name);
    row.d = cleanText(ev.description);
    row.s = ev.start_date.slice(0, 16);
    if (ev.end_date) row.e = ev.end_date.slice(11, 16);

    // Bare framtidige datoer i serien, og ikke flere enn vi trenger.
    const repeats = Array.isArray(ev.recurring_dates)
      ? ev.recurring_dates.filter((d) => d >= today).slice(0, MAX_REPEATS)
      : [];
    if (repeats.length) row.r = repeats;

    row.no = ev.next_occurrence || ev.start_date.slice(0, 10);

    // Hopp over arrangementer som er ferdige.
    if (!repeats.length && row.no < today) continue;

    row.o = clean(ev.organizer);
    row.v = ev.location ? clean(ev.location.name) : "";
    row.m = (ev.location && ev.location.municipality) || "";

    if (ev.is_free !== null && ev.is_free !== undefined) row.f = ev.is_free ? 1 : 0;
    if (ev.ticket_url) row.t = ev.ticket_url;
    row.u = ev.url;

    // Fellesskapet arrangementet er registrert gjennom. "places.nu" er
    // fallbacken deres og betyr i praksis "ikke registrert i et fellesskap".
    if (ev.community && ev.community.name && ev.community.name !== "places.nu") {
      row.cn = clean(ev.community.name);
      row.cu = ev.community.url;
    }

    const img = pickImage(ev);
    if (img) {
      if (img.thumb) row.i = img.thumb;      // kortvisning, 600×400
      if (img.full) row.iu = img.full;       // detaljvisning, originalen
      if (img.credit) row.ic = clean(img.credit);
    }

    out.push(row);
  }

  out.sort((a, b) => {
    const da = a.r && a.r.length ? a.r[0] : a.no;
    const db = b.r && b.r.length ? b.r[0] : b.no;
    if (da !== db) return da < db ? -1 : 1;
    return a.s < b.s ? -1 : 1;
  });

  return out;
}

async function main() {
  const key = process.env.PLACES_API_KEY;
  if (!key) {
    console.error("Mangler PLACES_API_KEY. Legg den inn som repository secret.");
    process.exit(1);
  }

  const res = await fetch(API, { headers: { "X-API-Key": key } });
  if (!res.ok) {
    console.error(`Places svarte ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json();
  const events = Array.isArray(data.events) ? data.events : [];

  // Sikkerhetsventil: en tom eller nesten tom feed er nesten alltid en feil
  // hos kilden, ikke at det plutselig ikke skjer noe i Aust-Agder.
  // Da lar vi den forrige filen stå i stedet for å tømme kalenderen.
  if (events.length < 5) {
    console.error(`Fikk bare ${events.length} arrangementer. Avbryter uten å skrive.`);
    process.exit(1);
  }

  const rows = transform(events);

  // Arrangementer vi selv har skjult redaksjonelt. Legg inn Places-URL-er
  // i skjul.json hvis noe må bort raskt uten å vente på kilden.
  let hidden = [];
  try {
    const raw = await import("node:fs/promises").then((fs) => fs.readFile("skjul.json", "utf8"));
    hidden = JSON.parse(raw);
  } catch {
    // Fila finnes ikke, og det er helt greit.
  }
  const visible = hidden.length ? rows.filter((r) => !hidden.includes(r.u)) : rows;

  const payload = {
    updated: new Date().toISOString(),
    source: "Places.nu",
    count: visible.length,
    events: visible,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload), "utf8");

  const skipped = rows.length - visible.length;
  console.log(
    `Skrev ${visible.length} arrangementer til ${OUT_FILE}` +
      (skipped ? ` (${skipped} skjult redaksjonelt)` : "")
  );
}

// Kjør bare når fila startes direkte, ikke når testen importerer transform().
if (process.argv[1] && process.argv[1].endsWith("sync.mjs")) {
  main().catch((err) => {
    console.error("Synk feilet:", err);
    process.exit(1);
  });
}
