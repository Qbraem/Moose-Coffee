# Moose koffie

Bestel-app voor je thuisbarista. Bewoners kiezen een drankje uit de filmstrook, de barista
neemt het aan en geeft een bereidingstijd. Geen account, geen database, niets te installeren
behalve Node.js.

## Gratis online zetten (Render + Upstash)
Zo draait Moose zonder dat een computer thuis aan hoeft te staan, op een https-adres dat je kunt delen.
Alles hieronder is gratis en vraagt geen betaalkaart. Controleer wel zelf de actuele voorwaarden van beide diensten.
1. **GitHub:** maak een gratis account, een nieuwe repository (private mag) en upload de inhoud van deze map
   (`server.js`, `package.json`, `render.yaml`, `public/`).
2. **Upstash (geheugen):** maak op upstash.com een gratis Redis-database. Kopieer onder "REST API" de
   `UPSTASH_REDIS_REST_URL` en de `UPSTASH_REDIS_REST_TOKEN`. Zonder dit wist Render je bestellingen en
   voorraad bij elke herstart.
3. **Render (de server):** kies op render.com "New > Web Service", koppel je repository en kies het gratis plan.
   Start command: `node server.js`. Voeg onder "Environment" toe:
   `BARISTA_PIN` (liefst 6 cijfers), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` en eventueel `NTFY_TOPIC`.
4. Je krijgt een adres als `https://moose-xxxx.onrender.com`. Zet het op de beginschermen van je gasten.
5. **Wakker houden:** het gratis plan slaapt na 15 minuten zonder bezoek en heeft dan ± 1 minuut nodig om te starten.
   Een gratis ping-dienst zoals UptimeRobot die elke 5 minuten `https://jouw-adres/healthz` opent, voorkomt dat.

Op een openbaar adres kan iedereen met de link bestellen. De code beschermt de baristakant, de rest bewust niet.

## Starten
1. Installeer Node.js (versie 18 of nieuwer) van nodejs.org.
2. Open een terminal in deze map en typ: `node server.js`
3. De terminal toont twee adressen:
   - `http://localhost:3000` op de computer zelf
   - `http://192.168.x.x:3000` voor telefoons en tablets op hetzelfde wifi

Op een telefoon: open het wifi-adres en kies "Zet op beginscherm". Dan opent Moose als een echte app.
Tip: laat de Barista-kant open op een tablet in de keuken. Die piept bij elke nieuwe bestelling
(na één tik op het scherm; aan/uit via de knop "Geluid").

## Eigen foto's gebruiken
De foto's staan in `public/photos/`. Vervang bijvoorbeeld `latte.jpg` door je eigen foto
(liefst staand, verhouding 4:5, ca. 800 x 1000 px). Dezelfde bestandsnaam is genoeg.
Namen: espresso, americano, cappuccino, latte, latte-macchiato, flat-white, macchiato, cortado.

## Melding op je iPhone
Een webpagina kan een iPhone niet wakker maken als de app dicht is. Daarom stuurt de server op
wens een melding via de gratis app ntfy. Je krijgt die ook op een vergrendeld scherm.
1. Installeer de app "ntfy" uit de App Store en kies "Abonneren op onderwerp".
2. Verzin een lange, geheime naam, bijvoorbeeld `moose-k7x2q9-thuis`, en vul die in de app in.
3. Start de server met die naam: `NTFY_TOPIC=moose-k7x2q9-thuis node server.js`
Je krijgt dan een melding bij elke nieuwe bestelling en als iemand je voorstel aanneemt.
De computer met de server moet internet hebben. Per melding gaan alleen de naam, het drankje en de
opmerking via ntfy.sh. Wie je onderwerpnaam kent, kan meelezen, dus houd die geheim.
(Zelf hosten kan ook: zet `NTFY_SERVER=https://jouw-server` erbij.)

## Melding voor je gasten
Zodra `NTFY_TOPIC` aan staat, krijgt elke gast onder zijn bestelformulier een eigen onderwerp te zien
(bijvoorbeeld `moose-1a2b3c4d5e-zoe`). Die abonneert zich in de ntfy-app op dat onderwerp en krijgt een
melding als de koffie klaar is, als jij een voorstel stuurt of als het niet lukt. Het onderwerp hangt af van
de ingevulde naam, dus gasten gebruiken altijd dezelfde naam. Het voorvoegsel is afgeleid van jouw
geheime onderwerp, maar wie een gastonderwerp kent, kan meelezen met die ene gast.

## Code voor de barista
Start met een code: `BARISTA_PIN=4321 node server.js`. Zonder code kan niemand bestellingen aannemen,
voorstellen sturen of de voorraad wijzigen. De server controleert dat zelf, niet alleen het scherm. Je telefoon
onthoudt de code. Na 5 foute pogingen is het een minuut geblokkeerd. Gasten kunnen nog wel bestellen,
hun voorstel aannemen en hun eigen bestelling sluiten. Let op: de code reist onversleuteld over je wifi.
Dat is prima thuis, maar niet op een open netwerk.

## Uitverkocht
In het baristascherm staat onderaan "Voorraad". Tik aan wat op is: een drankje, melk, een siroop of
suiker/zoetstof. Gasten zien het meteen grijs en doorgestreept en kunnen het niet meer kiezen. De server
weigert zo'n bestelling ook. De keuze blijft bewaard in `settings.json`.

## Nespresso-recepten voor de barista
Op elke bestelling in het baristascherm staat een kaartje "Recept" met de hoeveelheden voor Nespresso Original en Vertuo:
welke maat (Ristretto 25 ml, Espresso 40 ml, Lungo 110 ml, Double Espresso 80 ml) en hoeveel melk of heet water.
Dubbel betekent bij Original 2 capsules en bij Vertuo een Double Espresso. De maten komen uit de officiële Nespresso-recepten
(onder andere cappuccino 40 ml + 100 ml melk, flat white 40 ml + 90 ml melk, latte macchiato 220 ml melk, americano 25 ml + 125 ml water).
Een * betekent dat Nespresso zelf geen maat geeft voor dat systeem en dat de hoeveelheid is afgeleid van een verwant recept.
Je past de maten aan in `public/index.html`, bij `RCP`.

## Goed om te weten
- Bestellingen staan in `orders.json` en de voorraad in `settings.json`, naast `server.js`. Ze blijven bewaard na een herstart.
- Andere poort: `PORT=8080 node server.js`.
- De lettertypes komen van Google Fonts. Zonder internet valt de app terug op systeemletters.
- Zonder `BARISTA_PIN` is er geen beveiliging: iedereen op je wifi kan dan ook als barista aannemen.
  Zet de app niet zomaar open op internet.
- Altijd aan? Draai hem op een Raspberry Pi, een NAS of een oude laptop.
