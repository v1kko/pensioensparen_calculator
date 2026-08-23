# Pensioenbeleggen calculator

Een statische rekentool met één uitgangspunt en één knop: leg maandelijks in of
in één keer, kies een verwacht jaarrendement, en zie de vorm van de groei.

## Uitgangspunten van de berekening

- Twee scenario's met **fictieve** bedragen: € 100 per maand, of € 1.000 eenmalig
  aan het begin.
- Maandelijkse samengestelde groei; de maandinleg gaat aan het **begin** van de
  maand in en groeit die maand dus mee. De maandrente is `(1 + r)^(1/12) − 1`.
- Vast jaarrendement van 0 tot 20 %, over een horizon van 30 jaar.
- De verticale as heeft bewust **geen** bedragen: de bedragen zijn verzonnen, het
  gaat om de vorm van de curve.

Inflatie, kosten en belastingen zitten er niet in. Indicatief, geen financieel advies.

## Techniek

Geen build, geen dependencies, geen externe requests. Drie bestanden:

| Bestand | Inhoud |
|---|---|
| `index.html` | markup |
| `style.css` | design-tokens (licht/donker) en layout |
| `app.js` | rekenmodel en de met de hand getekende SVG-grafiek |

De grafiek is handgetekende inline SVG, geen chartlibrary. De bedragen en de
horizon staan als constanten (`MAANDINLEG`, `EENMALIG`, `HORIZON`) bovenin
`app.js`.

## Lokaal draaien

Open `index.html` in een browser. Er is geen server nodig.

## Publiceren op GitHub Pages

Elke push naar `main` publiceert automatisch via
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). De workflow doet een
syntaxcheck op `app.js` en uploadt daarna de repo-root ongewijzigd als artifact —
er is geen buildstap.

Eenmalig instellen: **Settings → Pages → Source: GitHub Actions**. Daarna verschijnt
de site op `https://<gebruiker>.github.io/<repo>/`. Alle paden in de HTML zijn
relatief, dus de submap in die URL vraagt geen configuratie.

Het bestand `.nojekyll` is voor deze workflow niet nodig (Jekyll draait hier niet),
maar staat er zodat overschakelen naar *Deploy from a branch* ook meteen werkt.
