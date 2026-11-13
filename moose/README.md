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

## Accounts, favoriet en wachttijd
- **Account met naam en pincode (niet verplicht):** een gast kiest een naam en een pincode van 4 tot 6 cijfers. Daarna onthoudt Moose
  je favoriet (de combinatie die het vaakst besteld is) en de laatste bestellingen, op elke telefoon waar je inlogt.
  De pincode wordt nooit leesbaar bewaard (scrypt met eigen zout). Na 5 foute pogingen is een account 5 minuten vergrendeld, en per adres geldt een limiet.
  Gasten kunnen uitloggen en hun account zelf wissen (met hun pincode). Zonder account kun je gewoon blijven bestellen.
- **Wachttijd:** onder elke wachtende bestelling staat hoeveel koffies er nog voor staan en een schatting in minuten.
- **Capsules (barista en gast):** onder Voorraad voeg je soorten toe met een naam, een aantal, een sterkte (1 tot 13), een systeem (Original of Vertuo) en of het een Deca (cafeïnevrij) is.
  De gast kiest bij het bestellen zelf een soort. Dat aantal gaat dan omlaag (twee bij dubbel), en komt terug als je een bestelling weigert of de gast annuleert.
  Bij 5 of minder krijg je een melding en staat de soort in het rood, bij 0 kan de gast die soort niet meer kiezen. Bij elke bestelling ziet de barista welke capsule gekozen is.
  Heb je geen soorten ingevoerd, dan verandert er niets aan het bestellen.

- **Ticket en delen:** na het bestellen krijgt de gast een ticket met nummer (zelfde nummer bij de barista), streepjescode en #MooseCoffee. "Deel ticket" maakt een afbeelding (deelmenu op de telefoon, anders een download) en je kunt de tekst kopiëren. Op de statistiekenpagina staat "Deel de cijfers".
- **Mascotte:** de eland duikt af en toe op met een zinnetje (tik op het logo of op de eland voor een nieuwe). Hij zit ook op de statistiekenpagina. De liefdesknop onderaan laat hartjes opstijgen.
- **Winkel open of gesloten:** bovenaan het baristascherm staat een knop om de winkel te sluiten. Gasten zien dan "Ons winkeltje is gesloten. Nog even geduld, onze moose is onderweg!", de bestelknop staat op Gesloten en bestellen wordt ook door de server geweigerd. Bestaande bestellingen lopen gewoon door.
- **Capsules compact en reset:** elke capsulesoort is één regel met aantal, -1, +1 en "Meer" voor de overige instellingen. Onderaan het baristascherm zet "Alles op nul zetten" (met bevestiging) de statistieken en afgeronde bestellingen terug naar 0. Lopende bestellingen, capsules, siropen en accounts blijven.
- **Siropen beheren:** in het baristascherm (onder Voorraad) voeg je nieuwe siropen toe met naam en kleur, en verwijder je siropen die je niet meer hebt. Met het label **Seizoen** krijgt een siroop een gele badge bij de gasten, handig voor tijdelijke smaken. Verwijder je een siroop, dan verdwijnen ook de tips en "op"-markeringen ervan.
- **Siroopsuggesties:** bij het bestellen krijgt de gast een tip met een siroop die past bij het gekozen drankje (standaard: latte met pumpkin spice,
  cappuccino met hazelnoot, latte macchiato met white mocha). De barista past dat per drankje aan onder Voorraad, en zet de tips per capsule uit
  (bijvoorbeeld bij een sterke ristretto). Is de siroop op of heeft de gast al een siroop gekozen, dan verschijnt er geen tip.

## Statistieken en bestelgeschiedenis
- **Stats-tab (voor iedereen):** het totaal aantal koffies, een weetje dat je telkens kunt vernieuwen ("Wist je dat…": favoriet drankje, dubbel of niet,
  melk, siroop, drukste uur en dag, recorddag, koffie-reeks, gemiddelde wachttijd, grootste koffieliefhebber, favoriete capsule), de populairste drankjes
  en grafiekjes per dag, per uur en per weekdag. Een koffie telt mee zodra hij klaar is. Er worden alleen optellingen bewaard, dus het blijft klein.
  De namen van de gasten staan in de lijst van koffieliefhebbers.
- **Eerdere bestellingen (barista):** onder het baristascherm staat een lijst van afgesloten bestellingen. Tik erop voor alle details (opties, capsule,
  opmerking, tijden) en verwijder ze indien nodig. Een verwijderde bestelling telt ook niet meer mee in de statistieken. De laatste 200 bestellingen blijven bewaard.

## Webmeldingen op de telefoon
Moose kan meldingen sturen naar de telefoon, ook als de app dicht is. Dat vraagt een https-adres (een host zoals Render geeft dat)
en op iPhone iOS 16.4 of nieuwer met Moose op het beginscherm (Safari, Deel, "Zet op beginscherm"). Er is niets extra te installeren
en geen instelling op de server: de sleutels maakt de server zelf aan en bewaart ze samen met de bestellingen.
- **Barista:** op het baristascherm staat een kaart "Meldingen aanzetten". Je krijgt een melding bij elke nieuwe bestelling en als iemand
  je voorstel aanneemt. Met "Testmelding" controleer je of het werkt. Dit vraagt de code.
- **Gast:** onder het bestelformulier staat "Meld me als hij klaar is". Je krijgt een melding als je koffie klaar is, bij een voorstel
  of als het niet lukt. Het is gekoppeld aan het toestel waarmee je bestelde.
Een telefoon die zich afmeldt of niet meer bestaat, wordt vanzelf uit de lijst gehaald. Meldingen op iOS zijn soms trager dan in een gewone app.

## Melding voor je gasten met ntfy (alternatief)
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
