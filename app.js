'use strict';

/* ------------------------------------------------------------------ model */

/** Fictieve bedragen: het gaat om de vorm van de curve, niet om de uitkomst. */
var MAANDINLEG = 100;     // euro per maand
var EENMALIG = 1000;      // euro, in jaar 0
var HORIZON = 30;         // jaren op de x-as

/** Belastingschijven box 1, bij benadering. Met pensioensparen is de inleg
 *  aftrekbaar; zonder pensioensparen blijft alleen het nettodeel over. */
var INLEG_SCHIJVEN = [
  { tarief: 35.7, omschrijving: 'inkomen tot ongeveer € 38.000' },
  { tarief: 37.6, omschrijving: 'inkomen tot ongeveer € 77.000' },
  { tarief: 49.5, omschrijving: 'inkomen daarboven' }
];

/** Bij uitbetaling geldt hetzelfde rijtje, plus het lagere tarief van de eerste
 *  schijf na de AOW-leeftijd: daarin zit geen AOW-premie meer. */
var UITKERING_SCHIJVEN = [
  { tarief: 17.9, omschrijving: 'eerste schijf ná de AOW-leeftijd, zonder AOW-premie' },
  { tarief: 35.7, omschrijving: 'eerste schijf vóór de AOW-leeftijd' },
  { tarief: 37.6, omschrijving: 'inkomen tot ongeveer € 77.000' },
  { tarief: 49.5, omschrijving: 'inkomen daarboven' }
];

/** De twee lijnen in de grafiek; beide na belasting. */
var SERIES = [
  { key: 'pensioen', naam: 'Met pensioensparen', kleur: '--series-1' },
  { key: 'eigen', naam: 'Zonder pensioensparen', kleur: '--series-2' }
];

/** Het vlak tussen de lijnen: groen waar pensioensparen wint, rood waar het verliest. */
var VLAKKEN = { plus: '--gain', min: '--loss' };

var state = {
  mode: 'maandelijks',    // 'maandelijks' | 'eenmalig'
  rendement: 6,           // procent per jaar
  inlegSchijf: 1,         // index in INLEG_SCHIJVEN
  uitkeringSchijf: 0,     // index in UITKERING_SCHIJVEN
  boete: 0                // procent revisierente over de afgetrokken inleg
};

var model = null;

/** Maandelijkse samengestelde groei; inleg aan het begin van de maand.
 *  Twee reeksen, allebei na belasting: het pensioenvermogen groeit met de
 *  volledige (aftrekbare) inleg en wordt bij opname belast, daarnaast groeit
 *  de inleg die na belasting overblijft. Eén punt per jaar, plus het startpunt.
 *
 *  De boeterente (revisierente) gaat er bij opname vóór de pensioendatum
 *  bovenop, gerekend over de inleg die is afgetrokken — niet over het
 *  rendement. Elk punt is dus: wat je in dát jaar zou overhouden. */
function project(s) {
  var mRate = Math.pow(1 + s.rendement / 100, 1 / 12) - 1;
  var naInleg = 1 - INLEG_SCHIJVEN[s.inlegSchijf].tarief / 100;
  var naUitkering = 1 - UITKERING_SCHIJVEN[s.uitkeringSchijf].tarief / 100;
  var boete = s.boete / 100;
  var monthly = s.mode === 'maandelijks' ? MAANDINLEG : 0;
  var start = s.mode === 'eenmalig' ? EENMALIG : 0;

  var saldo = { pensioen: start, eigen: start * naInleg };
  var reeksen = { pensioen: [], eigen: [] };
  var max = 0;

  for (var y = 0; y <= HORIZON; y++) {
    if (y > 0) {
      for (var m = 0; m < 12; m++) {
        saldo.pensioen = (saldo.pensioen + monthly) * (1 + mRate);
        saldo.eigen = (saldo.eigen + monthly * naInleg) * (1 + mRate);
      }
    }
    var ingelegd = start + monthly * 12 * y;
    var opname = Math.max(0, saldo.pensioen * naUitkering - boete * ingelegd);

    reeksen.pensioen.push({ year: y, value: opname });
    reeksen.eigen.push({ year: y, value: saldo.eigen });
    max = Math.max(max, opname, saldo.eigen);
  }
  return { reeksen: reeksen, max: max };
}

/* -------------------------------------------------------------- formatting */

var num1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ----------------------------------------------------------------- chart */

var hoverJaar = null;     // jaar onder de cursor, of null
var schaal = null;        // x()/y() van de laatste tekening
var hoverLaag = null;     // lijn + bollen die met de cursor meebewegen

var NS = 'http://www.w3.org/2000/svg';
var M = { top: 18, right: 20, bottom: 34, left: 20 };
var CHART_H = 344;

/** Knipt het vlak tussen twee reeksen op bij elke kruising, zodat elk stuk
 *  eenduidig positief (a boven b) of negatief is. Punten op een kruising
 *  krijgen een gebroken jaartal; de lijnen zijn recht tussen de jaarpunten,
 *  dus lineair interpoleren geeft precies het getekende snijpunt. */
function vlakken(a, b) {
  var uit = [], huidig = null;

  for (var i = 1; i < a.length; i++) {
    var d0 = a[i - 1].value - b[i - 1].value;
    var d1 = a[i].value - b[i].value;
    var van = { year: a[i - 1].year, a: a[i - 1].value, b: b[i - 1].value };
    var tot = { year: a[i].year, a: a[i].value, b: b[i].value };
    var stukken;

    if (d0 * d1 < 0) {
      var t = d0 / (d0 - d1);
      var kruis = {
        year: van.year + t * (tot.year - van.year),
        a: van.a + t * (tot.a - van.a)
      };
      kruis.b = kruis.a;
      stukken = [{ plus: d0 > 0, van: van, tot: kruis }, { plus: d1 > 0, van: kruis, tot: tot }];
    } else {
      stukken = [{ plus: (d0 || d1) > 0, van: van, tot: tot }];
    }

    stukken.forEach(function (stuk) {
      if (!huidig || huidig.plus !== stuk.plus) {
        huidig = { plus: stuk.plus, punten: [stuk.van] };
        uit.push(huidig);
      }
      huidig.punten.push(stuk.tot);
    });
  }
  return uit;
}

function svg(tag, attrs, text) {
  var n = document.createElementNS(NS, tag);
  for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function drawChart() {
  var host = document.getElementById('chart-wrap');
  var old = host.querySelector('svg');
  if (old) old.remove();

  var W = Math.max(320, host.clientWidth);
  var H = CHART_H;

  var x0 = M.left, x1 = W - M.right, y0 = H - M.bottom, y1 = M.top;
  var yMax = Math.max(model.max, 1);
  var x = function (year) { return x0 + year / HORIZON * (x1 - x0); };
  var y = function (v) { return y0 - v / yMax * (y0 - y1); };
  schaal = { x: x, y: y, x0: x0, x1: x1, y0: y0, y1: y1, W: W };

  var root = svg('svg', {
    width: W, height: H, viewBox: '0 0 ' + W + ' ' + H,
    role: 'img',
    'aria-label': 'Lijngrafiek van de vermogensgroei over ' + HORIZON + ' jaar bij ' +
      num1.format(state.rendement) + ' procent rendement per jaar, met een ' +
      (state.mode === 'maandelijks'
        ? 'maandelijkse inleg van ' + MAANDINLEG + ' euro'
        : 'eenmalige inleg van ' + EENMALIG + ' euro') +
      '. De ene lijn is pensioensparen, belast met ' +
      num1.format(UITKERING_SCHIJVEN[state.uitkeringSchijf].tarief) + ' procent bij uitbetaling, ' +
      'de andere dezelfde inleg na ' + num1.format(INLEG_SCHIJVEN[state.inlegSchijf].tarief) +
      ' procent belasting vooraf.' + (state.boete > 0
        ? ' Over de pensioeninleg komt ' + num1.format(state.boete) + ' procent boeterente.'
        : '') +
      ' Het vlak tussen de lijnen is groen waar pensioensparen meer oplevert en rood waar het minder oplevert.'
  });

  /* gridlines zonder bedragen — de hoogte is bewust niet af te lezen */
  var grid = token('--grid');
  for (var g = 0; g <= 5; g++) {
    var yy = Math.round(y1 + (y0 - y1) * g / 5) + 0.5;
    root.appendChild(svg('line', { x1: x0, x2: x1, y1: yy, y2: yy, stroke: grid, 'stroke-width': 1 }));
  }

  /* x-as: jaren */
  var axis = token('--axis'), muted = token('--text-muted');
  root.appendChild(svg('line', { x1: x0, x2: x1, y1: y0 + 0.5, y2: y0 + 0.5, stroke: axis, 'stroke-width': 1 }));
  for (var t = 0; t <= HORIZON; t += 5) {
    root.appendChild(svg('text', {
      x: x(t), y: y0 + 20,
      'text-anchor': t === 0 ? 'start' : t === HORIZON ? 'end' : 'middle',
      fill: muted, 'font-size': 11
    }, String(t)));
  }
  root.appendChild(svg('text', { x: x0, y: H - 2, fill: muted, 'font-size': 11 }, 'jaren'));

  /* het vlak tussen de lijnen: groen waar pensioensparen wint, rood waar niet */
  var kleurPlus = token(VLAKKEN.plus), kleurMin = token(VLAKKEN.min);
  vlakken(model.reeksen.pensioen, model.reeksen.eigen).forEach(function (vlak) {
    var heen = vlak.punten.map(function (p, i) {
      return (i ? 'L' : 'M') + x(p.year) + ' ' + y(p.a);
    }).join(' ');
    var terug = '';
    for (var i = vlak.punten.length - 1; i >= 0; i--) {
      terug += ' L' + x(vlak.punten[i].year) + ' ' + y(vlak.punten[i].b);
    }
    root.appendChild(svg('path', {
      d: heen + terug + ' Z',
      fill: vlak.plus ? kleurPlus : kleurMin, 'fill-opacity': 0.16
    }));
  });

  /* lijn per reeks */
  var surface = token('--surface-1');
  SERIES.forEach(function (reeks) {
    var pts = model.reeksen[reeks.key];
    var color = token(reeks.kleur);
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.year) + ' ' + y(p.value); }).join(' ');

    root.appendChild(svg('path', {
      d: line, fill: 'none', stroke: color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    var last = pts[pts.length - 1];
    root.appendChild(svg('circle', {
      cx: x(last.year), cy: y(last.value), r: 4,
      fill: color, stroke: surface, 'stroke-width': 2
    }));
  });

  /* laag die met de cursor meebeweegt; wordt bijgewerkt, niet opnieuw gebouwd */
  var laag = svg('g', { display: 'none', 'pointer-events': 'none' });
  var lijn = svg('line', {
    x1: 0, x2: 0, y1: y1, y2: y0,
    stroke: axis, 'stroke-width': 1, 'stroke-dasharray': '3 3'
  });
  laag.appendChild(lijn);
  var bollen = SERIES.map(function (reeks) {
    var bol = svg('circle', {
      r: 4.5, cx: 0, cy: 0,
      fill: token(reeks.kleur), stroke: surface, 'stroke-width': 2
    });
    laag.appendChild(bol);
    return bol;
  });
  root.appendChild(laag);
  hoverLaag = { g: laag, lijn: lijn, bollen: bollen };

  root.addEventListener('pointermove', function (e) {
    hoverJaar = jaarBijX(e.clientX - root.getBoundingClientRect().left);
    tekenHover();
  });
  root.addEventListener('pointerleave', function () {
    hoverJaar = null;
    tekenHover();
  });
  host.appendChild(root);
  tekenHover();
}

/* ------------------------------------------------------------------ hover */

/** Dichtstbijzijnde jaarpunt bij een x in pixels. */
function jaarBijX(px) {
  var deel = (px - schaal.x0) / (schaal.x1 - schaal.x0);
  return Math.min(HORIZON, Math.max(0, Math.round(deel * HORIZON)));
}

/** Wat de twee lijnen in dat jaar opleveren, en het verschil in procenten.
 *  Zonder inleg (jaar 0 bij maandelijks inleggen) is er niets te vergelijken. */
function standBij(jaar) {
  var pensioen = model.reeksen.pensioen[jaar].value;
  var eigen = model.reeksen.eigen[jaar].value;
  return {
    pensioen: pensioen,
    eigen: eigen,
    procent: eigen > 0 ? (pensioen - eigen) / eigen * 100 : null
  };
}

/** Markeert het jaar onder de cursor met een lijn, twee bollen en een tooltip. */
function tekenHover() {
  var tip = document.getElementById('tip');
  var jaar = hoverJaar;

  if (!hoverLaag || jaar === null) {
    if (hoverLaag) hoverLaag.g.setAttribute('display', 'none');
    tip.hidden = true;
    return;
  }

  var stand = standBij(jaar);
  var px = schaal.x(jaar);
  var ys = SERIES.map(function (reeks) { return schaal.y(model.reeksen[reeks.key][jaar].value); });

  hoverLaag.g.removeAttribute('display');
  hoverLaag.lijn.setAttribute('x1', px);
  hoverLaag.lijn.setAttribute('x2', px);
  hoverLaag.bollen.forEach(function (bol, i) {
    bol.setAttribute('cx', px);
    bol.setAttribute('cy', ys[i]);
  });

  tip.textContent = '';
  var kop = document.createElement('span');
  kop.className = 'kop';
  kop.textContent = 'Na ' + jaar + ' jaar';
  tip.appendChild(kop);

  if (stand.procent === null) {
    tip.appendChild(document.createTextNode('nog geen inleg'));
  } else {
    var cijfer = document.createElement('span');
    cijfer.className = stand.procent >= 0 ? 'op' : 'neer';
    cijfer.textContent = (stand.procent >= 0 ? '+' : '\u2212') + num1.format(Math.abs(stand.procent)) + ' %';
    tip.appendChild(cijfer);
    tip.appendChild(document.createTextNode(' met pensioensparen'));
  }

  var links = px > schaal.W * 0.62;
  tip.classList.toggle('links', links);
  tip.style.left = (px + (links ? -14 : 14)) + 'px';
  tip.style.top = Math.round((ys[0] + ys[1]) / 2) + 'px';
  tip.hidden = false;
}

/* -------------------------------------------------------------- controls */

function renderLegend() {
  var host = document.getElementById('legend');
  host.textContent = '';
  function item(naam, kleur, isVlak) {
    var el = document.createElement('span');
    el.className = 'item';
    var key = document.createElement('span');
    key.className = isVlak ? 'key vlak' : 'key';
    key.style.background = token(kleur);
    var name = document.createElement('span');
    name.textContent = naam;
    el.appendChild(key); el.appendChild(name);
    host.appendChild(el);
  }

  SERIES.forEach(function (reeks) { item(reeks.naam, reeks.kleur, false); });
  item('Voordeel pensioensparen', VLAKKEN.plus, true);
  item('Nadeel', VLAKKEN.min, true);
}

function hoofdletter(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function renderControls() {
  document.querySelectorAll('.segmented button[data-mode]').forEach(function (b) {
    b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  });
  document.querySelectorAll('.segmented button[data-inleg-schijf]').forEach(function (b) {
    b.setAttribute('aria-checked', String(Number(b.dataset.inlegSchijf) === state.inlegSchijf));
  });
  document.querySelectorAll('.segmented button[data-uitkering-schijf]').forEach(function (b) {
    b.setAttribute('aria-checked', String(Number(b.dataset.uitkeringSchijf) === state.uitkeringSchijf));
  });

  var inlegSchijf = INLEG_SCHIJVEN[state.inlegSchijf];
  var uitkeringSchijf = UITKERING_SCHIJVEN[state.uitkeringSchijf];

  document.getElementById('mode-hint').textContent = state.mode === 'maandelijks'
    ? 'Elke maand opnieuw hetzelfde bedrag.'
    : 'Eén keer inleggen, aan het begin.';
  document.getElementById('rendement-out').textContent = num1.format(state.rendement) + ' %';
  document.getElementById('inleg-schijf-hint').textContent =
    hoofdletter(inlegSchijf.omschrijving) + '. Zonder pensioensparen blijft ' +
    num1.format(100 - inlegSchijf.tarief) + ' % van je inleg over om te beleggen.';
  document.getElementById('uitkering-schijf-hint').textContent =
    hoofdletter(uitkeringSchijf.omschrijving) + '. Van je pensioenvermogen houd je ' +
    num1.format(100 - uitkeringSchijf.tarief) + ' % over.';
  document.getElementById('boete-out').textContent = num1.format(state.boete) + ' %';
  document.getElementById('boete-hint').textContent = state.boete === 0
    ? 'Opnemen op de pensioendatum: geen boete.'
    : 'Revisierente bij opnemen vóór de pensioendatum. Die wordt gerekend over de ' +
      'afgetrokken inleg, niet over het rendement.';
}

function render() {
  model = project(state);
  renderControls();
  renderLegend();
  drawChart();
}

/* ------------------------------------------------------------------ setup */

function applyTheme(mode) {
  if (mode) document.documentElement.setAttribute('data-theme', mode);
  else document.documentElement.removeAttribute('data-theme');
  try { mode ? localStorage.setItem('theme', mode) : localStorage.removeItem('theme'); } catch (e) { /* private mode */ }
}

function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* private mode */ }
  if (saved === 'dark' || saved === 'light') applyTheme(saved);

  document.getElementById('theme').addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.hasAttribute('data-theme') &&
        matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(dark ? 'light' : 'dark');
    render();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!document.documentElement.hasAttribute('data-theme')) render();
  });
}

function init() {
  document.getElementById('horizon').textContent = String(HORIZON);

  document.querySelectorAll('.segmented button[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.mode = b.dataset.mode;
      render();
    });
  });

  document.querySelectorAll('.segmented button[data-inleg-schijf]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.inlegSchijf = Number(b.dataset.inlegSchijf);
      render();
    });
  });

  document.querySelectorAll('.segmented button[data-uitkering-schijf]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.uitkeringSchijf = Number(b.dataset.uitkeringSchijf);
      render();
    });
  });

  var rendement = document.getElementById('rendement');
  rendement.value = state.rendement;
  rendement.addEventListener('input', function () {
    state.rendement = parseFloat(rendement.value);
    render();
  });

  var boete = document.getElementById('boete');
  boete.value = state.boete;
  boete.addEventListener('input', function () {
    state.boete = parseFloat(boete.value);
    render();
  });

  initTheme();
  render();

  if (window.ResizeObserver) {
    new ResizeObserver(function () { if (model) drawChart(); })
      .observe(document.getElementById('chart-wrap'));
  } else {
    window.addEventListener('resize', function () { if (model) drawChart(); });
  }
}

document.addEventListener('DOMContentLoaded', init);
