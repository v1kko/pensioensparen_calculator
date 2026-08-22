# Pensioenbeleggen calculator

Een statische rekentool die laat zien hoe een maandelijkse inleg tot je
pensioendatum uitgroeit — nominaal, gecorrigeerd voor inflatie, en afgezet
tegen wat je zelf hebt ingelegd.

## Uitgangspunten van de berekening

- Maandelijkse samengestelde groei; de inleg gaat aan het **begin** van de maand in
  en groeit die maand dus mee.
- Het nettorendement is `bruto rendement − fondskosten (TER)`, omgerekend naar een
  maandrente via `(1 + r)^(1/12) − 1`.
- De maandinleg wordt elk jaar verhoogd met het opgegeven indexatiepercentage.
- Het reële vermogen is het nominale vermogen gedeeld door `(1 + inflatie)^jaren`,
  oftewel de koopkracht in euro's van vandaag.
- "Betaalde fondskosten" is het verschil met dezelfde belegging zónder TER, dus
  inclusief het rendement dat je over die kosten misgelopen bent.

Belastingen (box 3, lijfrente-aftrek, jaarruimte) zitten er bewust niet in — dat
hangt te veel van je persoonlijke situatie af. Indicatief, geen financieel advies.

## Techniek

Geen build, geen dependencies, geen externe requests. Drie bestanden:

| Bestand | Inhoud |
|---|---|
| `index.html` | markup |
| `style.css` | design-tokens (licht/donker) en layout |
| `app.js` | rekenmodel, URL-state, met de hand getekende SVG-grafiek |

De grafiek is handgetekende inline SVG, geen chartlibrary. Dat scheelt een
dependency én een netwerkrequest, en het is voor één lijngrafiek nauwelijks meer
code dan het configureren van een library.

### Deelbare invoer

De invoer staat in de URL-hash, bijvoorbeeld:

```
index.html#a=35&p=68&s=10000&m=350&i=2&r=6.5&k=0.25&f=2
```

`a` leeftijd · `p` pensioenleeftijd · `s` startkapitaal · `m` maandinleg ·
`i` indexatie · `r` bruto rendement · `k` TER · `f` inflatie.

Een link delen bewaart dus het hele scenario. De hash wordt met
`history.replaceState` bijgewerkt, zodat het slepen van een slider niet honderd
entries in de terugknop achterlaat.

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

## Toegankelijkheid

Het kleurenpalet is gevalideerd op kleurenblindheid en contrast in zowel de
lichte als de donkere modus. Elke waarde is ook zonder hover bereikbaar via de
legenda, de eindlabels en de tabelweergave; de grafiek is focusbaar en met de
pijltjestoetsen te doorlopen.
