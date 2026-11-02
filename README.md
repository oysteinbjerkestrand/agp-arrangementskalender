# Arrangementskalender — oppsett av synkjobben

Tre filer, én kveld. Når dette står, henter kalenderen på agp.no seg selv tre
ganger i døgnet uten at noen rører den.

**Slik henger det sammen:** GitHub kjører `sync.mjs` på faste klokkeslett.
Scriptet henter fra Places, skriver `docs/events.json`, og GitHub Pages
serverer den filen på en åpen adresse. Widgeten på agp.no leser bare den
filen — den snakker aldri med Places direkte.

---

## 1. Lag repoet

Lag et nytt, **offentlig** repo på GitHub, for eksempel `agp-detskjer`.
Det må være offentlig for at GitHub Pages skal være gratis. Innholdet er
offentlig arrangementsinformasjon uansett, og Places har sagt ja til at
datafilen ligger åpent.

Legg inn to filer med denne strukturen:

```
agp-detskjer/
├─ sync.mjs
└─ .github/
   └─ workflows/
      └─ sync.yml
```

`sync.yml` er filen som heter `sync.yml` i denne leveransen — den skal ligge
i mappen `.github/workflows/`.

## 2. Legg inn API-nøkkelen

**Settings → Secrets and variables → Actions → New repository secret**

- Name: `PLACES_API_KEY`
- Secret: nøkkelen fra Levi

Nøkkelen skal aldri skrives inn i `sync.mjs` eller committes. Den leses fra
dette hemmelige feltet når jobben kjører.

## 3. Kjør jobben første gang

**Actions-fanen → "Synk arrangementer fra Places" → Run workflow**

Tar under et minutt. Når den er grønn, ligger det en ny fil på
`docs/events.json` i repoet. Åpne den og se at den inneholder arrangementer.

Blir den rød, står feilmeldingen i loggen. De vanligste er feil navn på
secreten, eller at `sync.yml` ligger feil sted.

## 4. Slå på GitHub Pages

**Settings → Pages → Source: Deploy from a branch → Branch: `main`,
mappe: `/docs` → Save**

Etter et par minutter ligger filen på:

```
https://<brukernavn>.github.io/agp-detskjer/events.json
```

Åpne adressen i nettleseren og sjekk at du får JSON. Virker ikke dette,
virker heller ikke kalenderen.

## 5. Koble widgeten til

Åpne widget-filen, finn denne linjen nær toppen av `<script>`:

```js
dataUrl: "",
```

Lim inn adressen fra forrige steg:

```js
dataUrl: "https://<brukernavn>.github.io/agp-detskjer/events.json",
```

Det er hele endringen. Når feltet er tomt, kjører widgeten på dataene som
ligger i filen (demomodus). Så snart det har en adresse, henter den derfra.

## 6. Lim widgeten inn i CMS-et

Som før: hele filen, fra `<meta charset="UTF-8">` og ned.

---

## Når noe går galt

Kalenderen er bygget til å **forsvinne i stillhet framfor å lyve.** Den
skjuler seg selv hvis:

- datafilen ikke svarer
- datafilen er tom
- dataene er eldre enn 26 timer

I alle tre tilfellene legger den en forklaring i nettleserkonsollen med
prefikset `[ap-kalender]`. Står kalenderen plutselig tom på agp.no, er det
der du først skal se.

Synkjobben har samme forsiktighet: får den færre enn fem arrangementer fra
Places, avbryter den uten å skrive. En nesten tom feed er nesten alltid en
feil hos kilden, ikke at det har sluttet å skje ting i Aust-Agder.

## Fellen du må kjenne til

GitHub slår av planlagte jobber i offentlige repo når det ikke har vært
aktivitet på 60 dager, og botens egne commits teller ikke alltid med. Du får
e-postvarsel før det skjer, men hvis du ikke leser den, stopper kalenderen.

Enkleste mottiltak: gjør en liten commit i repoet nå og da. Eller flytt
jobben til en Cloudflare Worker med cron-trigger, som ikke har denne regelen.

## Skjule et arrangement raskt

Lag en fil `skjul.json` i rota av repoet:

```json
["https://places.nu/event/noe-som-ma-bort-1234/"]
```

Arrangementer med disse adressene droppes ved neste synk. Ment som
sikkerhetsventil, ikke som redigeringsflate — feil i dataene skal meldes til
Places, ikke lappes hos oss.

## Endre hvor ofte den kjører

I `sync.yml`:

```yaml
- cron: "0 5,11,17 * * *"
```

Tidene er UTC. Dette blir 06, 12 og 18 norsk vintertid, 07, 13 og 19 om
sommeren. Vil du ha fire ganger, legg til et tall i lista.

## Teste endringer i scriptet

```
node test/test.mjs
```

Tester omformingen mot en liten testfil uten å gå på nett. Kjør den hvis du
endrer `sync.mjs`.
