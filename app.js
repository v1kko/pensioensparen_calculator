'use strict';

/* ------------------------------------------------------------------ model */

/** Every input: its hash key, bounds and default. Single source of truth for
 *  the UI, the URL state and the projection. */
var FIELDS = [
  { key: 'a', id: 'leeftijd',  label: 'Huidige leeftijd',        min: 18, max: 70,     step: 1,    def: 35,   fmt: 'jaar' },
  { key: 'p', id: 'pensioen',  label: 'Pensioenleeftijd',        min: 50, max: 75,     step: 1,    def: 68,   fmt: 'jaar' },
  { key: 's', id: 'start',     label: 'Startkapitaal',           min: 0,  max: 250000, step: 1000, def: 10000, fmt: 'eur' },
  { key: 'm', id: 'inleg',     label: 'Maandelijkse inleg',      min: 0,  max: 2500,   step: 25,   def: 350,  fmt: 'eur' },
  { key: 'i', id: 'indexatie', label: 'Inleg verhogen per jaar', min: 0,  max: 10,     step: 0.5,  def: 2,    fmt: 'pct' },
  { key: 'r', id: 'rendement', label: 'Verwacht bruto rendement',min: 0,  max: 12,     step: 0.1,  def: 6.5,  fmt: 'pct' },
  { key: 'k', id: 'kosten',    label: 'Fondskosten (TER)',       min: 0,  max: 2,      step: 0.05, def: 0.25, fmt: 'pct' },
  { key: 'f', id: 'inflatie',  label: 'Inflatie',                min: 0,  max: 6,      step: 0.1,  def: 2,    fmt: 'pct' }
];

var SERIES = [
  { id: 'nominaal', name: 'Vermogen nominaal', color: '--series-1' },
  { id: 'reeel',    name: "Vermogen in euro's van nu", color: '--series-2' },
  { id: 'inleg',    name: 'Totale inleg', color: '--series-3' }
];

var state = {};
var model = null;

/** Monthly compounding: deposit at the start of the month, then growth.
 *  Returns one point per completed year plus the starting point. */
function project(s) {
  var years = Math.max(1, s.pensioen - s.leeftijd);
  var netRate = (s.rendement - s.kosten) / 100;
  var mNet = Math.pow(1 + netRate, 1 / 12) - 1;
  var mGross = Math.pow(1 + s.rendement / 100, 1 / 12) - 1;

  var balance = s.start;      // na kosten
  var gross = s.start;        // zelfde belegging zonder fondskosten
  var paid = s.start;         // eigen inleg, cumulatief
  var monthly = s.inleg;

  var points = [{ age: s.leeftijd, nominaal: balance, reeel: balance, inleg: paid }];

  for (var y = 1; y <= years; y++) {
    for (var m = 0; m < 12; m++) {
      balance = (balance + monthly) * (1 + mNet);
      gross = (gross + monthly) * (1 + mGross);
      paid += monthly;
    }
    monthly *= 1 + s.indexatie / 100;
    var deflator = Math.pow(1 + s.inflatie / 100, y);
    points.push({
      age: s.leeftijd + y,
      nominaal: balance,
      reeel: balance / deflator,
      inleg: paid
    });
  }

  var last = points[points.length - 1];
  return {
    points: points,
    years: years,
    eindNominaal: last.nominaal,
    eindReeel: last.reeel,
    totaleInleg: last.inleg,
    winst: last.nominaal - last.inleg,
    kosten: gross - balance
  };
}

/* -------------------------------------------------------------- formatting */

var eur0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
var num1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

function money(v) { return eur0.format(Math.round(v)); }

/** Compact euros for axis ticks and end labels: € 250k, € 1,2 mln. */
function moneyShort(v) {
  var a = Math.abs(v);
  if (a >= 1e9) return '€ ' + num1.format(v / 1e9) + ' mld';
  if (a >= 1e6) return '€ ' + num1.format(v / 1e6) + ' mln';
  if (a >= 1e4) return '€ ' + Math.round(v / 1e3).toLocaleString('nl-NL') + 'k';
  return money(v);
}

function fieldText(f, v) {
  if (f.fmt === 'eur') return money(v);
  if (f.fmt === 'pct') return num1.format(v) + ' %';
  return v + ' jaar';
}

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ------------------------------------------------------------- URL state */

function clamp(v, f) { return Math.min(f.max, Math.max(f.min, v)); }

function readState() {
  var q = new URLSearchParams(location.hash.replace(/^#/, ''));
  var s = {};
  FIELDS.forEach(function (f) {
    var raw = parseFloat(q.get(f.key));
    s[f.id] = isFinite(raw) ? clamp(raw, f) : f.def;
  });
  if (s.pensioen <= s.leeftijd) s.pensioen = Math.min(75, s.leeftijd + 1);
  return s;
}

/** replaceState, not a hash assignment — dragging a slider must not fill up
 *  the back button with a hundred history entries. */
function writeState() {
  var q = new URLSearchParams();
  FIELDS.forEach(function (f) { q.set(f.key, String(state[f.id])); });
  history.replaceState(null, '', location.pathname + location.search + '#' + q.toString());
}

/* -------------------------------------------------------------- controls */

var inputs = {};

function buildControls() {
  var host = document.getElementById('fields');
  FIELDS.forEach(function (f) {
    var wrap = document.createElement('div');
    wrap.className = 'field';

    var row = document.createElement('div');
    row.className = 'row';
    var label = document.createElement('label');
    label.textContent = f.label;
    label.htmlFor = f.id + '-num';
    var num = document.createElement('input');
    num.type = 'number';
    num.className = 'num';
    num.id = f.id + '-num';
    num.min = f.min; num.max = f.max; num.step = f.step;
    row.appendChild(label);
    row.appendChild(num);

    var range = document.createElement('input');
    range.type = 'range';
    range.id = f.id + '-range';
    range.min = f.min; range.max = f.max; range.step = f.step;
    range.setAttribute('aria-label', f.label);

    wrap.appendChild(row);
    wrap.appendChild(range);
    host.appendChild(wrap);

    inputs[f.id] = { range: range, num: num };

    range.addEventListener('input', function () { commit(f, parseFloat(range.value)); });
    num.addEventListener('input', function () {
      var v = parseFloat(num.value);
      if (isFinite(v)) commit(f, clamp(v, f), true);
    });
    num.addEventListener('blur', function () { syncControls(); });
  });
}

/** Apply one field change, keeping the two age fields from crossing. */
function commit(f, value, fromNumber) {
  state[f.id] = value;
  if (f.id === 'leeftijd' && state.pensioen <= value) state.pensioen = Math.min(75, value + 1);
  if (f.id === 'pensioen' && value <= state.leeftijd) state.leeftijd = Math.max(18, value - 1);
  syncControls(fromNumber ? f.id : null);
  writeState();
  render();
}

function syncControls(skipId) {
  FIELDS.forEach(function (f) {
    var v = state[f.id];
    inputs[f.id].range.value = v;
    if (f.id !== skipId) inputs[f.id].num.value = v;
  });
}

/* ----------------------------------------------------------------- chart */

var NS = 'http://www.w3.org/2000/svg';
var M = { top: 18, right: 104, bottom: 34, left: 68 };
var CHART_H = 344;
var geom = null;   // { x(), y(), plot bounds } — shared with the hover layer

function svg(tag, attrs, text) {
  var n = document.createElementNS(NS, tag);
  for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

/** 1 / 2 / 5 × 10^n ticks covering [0, max]. */
function ticks(max, count) {
  if (max <= 0) return [0];
  var raw = max / count;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var norm = raw / mag;
  var step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  var out = [];
  var n = Math.ceil(max / step);   // the top tick must sit at or above max
  for (var i = 0; i <= n; i++) out.push(i * step);
  return out;
}

function drawChart() {
  var host = document.getElementById('chart-wrap');
  var old = host.querySelector('svg');
  if (old) old.remove();

  var W = Math.max(320, host.clientWidth);
  var H = CHART_H;
  var pts = model.points;

  var top = ticks(model.eindNominaal, 5);
  var yMax = Math.max(top[top.length - 1], 1);

  // On a phone the end-label gutter costs more than it gives: drop it and let
  // the legend, tooltip and table view carry the final values.
  var showEndLabels = W >= 560;
  var x0 = M.left, x1 = W - (showEndLabels ? M.right : 46), y0 = H - M.bottom, y1 = M.top;
  var x = function (age) { return x0 + (age - pts[0].age) / model.years * (x1 - x0); };
  var y = function (v) { return y0 - v / yMax * (y0 - y1); };
  geom = { x: x, y: y, x0: x0, x1: x1, y0: y0, y1: y1, W: W, H: H };

  var root = svg('svg', {
    width: W, height: H, viewBox: '0 0 ' + W + ' ' + H,
    role: 'img', tabindex: '0',
    'aria-label': 'Lijngrafiek van de vermogensopbouw van leeftijd ' + pts[0].age +
      ' tot ' + pts[pts.length - 1].age + '. Eindkapitaal ' + money(model.eindNominaal) +
      ' nominaal, ' + money(model.eindReeel) + " in euro's van nu, bij een totale inleg van " +
      money(model.totaleInleg) + '.'
  });

  /* gridlines + y ticks */
  var grid = token('--grid'), muted = token('--text-muted'), surface = token('--surface-1');
  top.forEach(function (v) {
    var yy = Math.round(y(v)) + 0.5;
    root.appendChild(svg('line', { x1: x0, x2: x1, y1: yy, y2: yy, stroke: grid, 'stroke-width': 1 }));
    root.appendChild(svg('text', {
      x: x0 - 10, y: yy + 4, 'text-anchor': 'end', fill: muted,
      'font-size': 11, style: 'font-variant-numeric:tabular-nums'
    }, v === 0 ? '0' : moneyShort(v)));
  });

  /* x axis: ages at a round interval */
  var axis = token('--axis');
  root.appendChild(svg('line', { x1: x0, x2: x1, y1: y0 + 0.5, y2: y0 + 0.5, stroke: axis, 'stroke-width': 1 }));
  var stepYears = model.years <= 12 ? 2 : model.years <= 30 ? 5 : 10;
  var lastIdx = pts.length - 1;
  for (var i = 0; i <= lastIdx; i++) {
    var edge = i === 0 || i === lastIdx;
    if (!edge && (pts[i].age - pts[0].age) % stepYears !== 0) continue;
    // never let a regular tick crowd the two edge labels
    if (!edge && (x(pts[lastIdx].age) - x(pts[i].age) < 26 || x(pts[i].age) - x(pts[0].age) < 26)) continue;
    root.appendChild(svg('text', {
      x: x(pts[i].age), y: y0 + 20,
      'text-anchor': i === lastIdx ? 'end' : i === 0 ? 'start' : 'middle',
      fill: muted, 'font-size': 11
    }, String(pts[i].age)));
  }
  root.appendChild(svg('text', { x: x0, y: H - 2, fill: muted, 'font-size': 11 }, 'leeftijd'));

  /* area wash under the nominal line, then the three lines */
  var colors = SERIES.map(function (s) { return token(s.color); });
  var areaD = 'M' + x(pts[0].age) + ' ' + y0;
  pts.forEach(function (p) { areaD += ' L' + x(p.age) + ' ' + y(p.nominaal); });
  areaD += ' L' + x1 + ' ' + y0 + ' Z';
  root.appendChild(svg('path', { d: areaD, fill: colors[0], 'fill-opacity': 0.10 }));

  SERIES.forEach(function (s, si) {
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.age) + ' ' + y(p[s.id]); }).join(' ');
    root.appendChild(svg('path', {
      d: d, fill: 'none', stroke: colors[si], 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
  });

  /* end dots + direct labels, dropped where they would collide */
  var last = pts[pts.length - 1];
  var ends = SERIES.map(function (s, si) {
    return { y: y(last[s.id]), value: last[s.id], color: colors[si] };
  }).sort(function (a, b) { return a.y - b.y; });

  var lastLabelY = -Infinity;
  ends.forEach(function (e) {
    root.appendChild(svg('circle', {
      cx: x1, cy: e.y, r: 4, fill: e.color, stroke: surface, 'stroke-width': 2
    }));
    if (!showEndLabels || e.y - lastLabelY < 15) return;   // leave it to the legend and the tooltip
    lastLabelY = e.y;
    root.appendChild(svg('text', {
      x: x1 + 12, y: e.y + 4, fill: token('--text-secondary'), 'font-size': 12
    }, moneyShort(e.value)));
  });

  /* hover layer */
  var hover = svg('g', { id: 'hover', visibility: 'hidden' });
  hover.appendChild(svg('line', { id: 'crosshair', y1: y1, y2: y0, stroke: axis, 'stroke-width': 1 }));
  SERIES.forEach(function (s, si) {
    hover.appendChild(svg('circle', {
      class: 'hp', r: 4, fill: colors[si], stroke: surface, 'stroke-width': 2
    }));
  });
  root.appendChild(hover);

  host.insertBefore(root, host.firstChild);
  bindHover(root);
}

/* -------------------------------------------------------- hover & tooltip */

var hoverIndex = -1;

function bindHover(root) {
  var wrap = document.getElementById('chart-wrap');

  function nearest(clientX) {
    var box = root.getBoundingClientRect();
    var t = (clientX - box.left - geom.x0) / (geom.x1 - geom.x0);
    var i = Math.round(t * (model.points.length - 1));
    return Math.min(model.points.length - 1, Math.max(0, i));
  }

  root.addEventListener('pointermove', function (e) { showHover(nearest(e.clientX)); });
  root.addEventListener('pointerdown', function (e) { showHover(nearest(e.clientX)); });
  root.addEventListener('pointerleave', hideHover);
  root.addEventListener('blur', hideHover);
  root.addEventListener('focus', function () {
    showHover(hoverIndex < 0 ? model.points.length - 1 : hoverIndex);
  });
  root.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    var i = hoverIndex < 0 ? model.points.length - 1 : hoverIndex;
    showHover(Math.min(model.points.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1))));
  });

  if (hoverIndex >= 0 && hoverIndex < model.points.length) showHover(hoverIndex);
  else wrap.querySelector('.tooltip').dataset.open = 'false';
}

function showHover(i) {
  hoverIndex = i;
  var p = model.points[i];
  var root = document.querySelector('#chart-wrap svg');
  var g = root.querySelector('#hover');
  var px = geom.x(p.age);

  g.setAttribute('visibility', 'visible');
  g.querySelector('#crosshair').setAttribute('x1', px);
  g.querySelector('#crosshair').setAttribute('x2', px);
  var dots = g.querySelectorAll('.hp');
  SERIES.forEach(function (s, si) {
    dots[si].setAttribute('cx', px);
    dots[si].setAttribute('cy', geom.y(p[s.id]));
  });

  var tip = document.getElementById('tooltip');
  tip.textContent = '';
  var head = document.createElement('div');
  head.className = 'tt-head';
  head.textContent = 'Leeftijd ' + p.age + ' · na ' + (p.age - model.points[0].age) + ' jaar';
  tip.appendChild(head);
  SERIES.forEach(function (s) {
    var row = document.createElement('div');
    row.className = 'tt-row';
    var key = document.createElement('span');
    key.className = 'key';
    key.style.background = token(s.color);
    var name = document.createElement('span');
    name.className = 'tt-name';
    name.textContent = s.name;
    var val = document.createElement('span');
    val.className = 'tt-val';
    val.textContent = money(p[s.id]);
    row.appendChild(key); row.appendChild(name); row.appendChild(val);
    tip.appendChild(row);
  });

  tip.dataset.open = 'true';
  var w = tip.offsetWidth;
  var left = px + 16;
  if (left + w > geom.W) left = px - w - 16;
  tip.style.left = Math.max(0, left) + 'px';
  tip.style.top = Math.max(0, Math.min(geom.y0 - tip.offsetHeight, geom.y(p.nominaal) - 20)) + 'px';
}

function hideHover() {
  hoverIndex = -1;
  var g = document.querySelector('#chart-wrap #hover');
  if (g) g.setAttribute('visibility', 'hidden');
  document.getElementById('tooltip').dataset.open = 'false';
}

/* ------------------------------------------------------- figures & table */

function renderLegend() {
  var host = document.getElementById('legend');
  host.textContent = '';
  SERIES.forEach(function (s) {
    var item = document.createElement('span');
    item.className = 'item';
    var key = document.createElement('span');
    key.className = 'key';
    key.style.background = token(s.color);
    var name = document.createElement('span');
    name.textContent = s.name;
    item.appendChild(key); item.appendChild(name);
    host.appendChild(item);
  });
}

function renderFigures() {
  document.getElementById('hero-value').textContent = money(model.eindReeel);
  document.getElementById('hero-sub').textContent =
    'Op je ' + state.pensioen + 'e, na ' + model.years + ' jaar beleggen. Nominaal is dat ' +
    money(model.eindNominaal) + '.';

  var tiles = [
    { label: 'Totale inleg', value: money(model.totaleInleg) },
    { label: 'Beleggingswinst', value: money(model.winst) },
    { label: 'Betaalde fondskosten', value: money(model.kosten) },
    { label: 'Koopkracht­verlies door inflatie', value: money(model.eindNominaal - model.eindReeel) }
  ];
  var host = document.getElementById('stats');
  host.textContent = '';
  tiles.forEach(function (t) {
    var card = document.createElement('div');
    card.className = 'card stat';
    var l = document.createElement('div');
    l.className = 'label';
    l.textContent = t.label;
    var v = document.createElement('div');
    v.className = 'value';
    v.textContent = t.value;
    card.appendChild(l); card.appendChild(v);
    host.appendChild(card);
  });
}

function renderTable() {
  var table = document.getElementById('table');
  var head = table.tHead, body = table.tBodies[0];
  head.textContent = '';
  body.textContent = '';

  var hr = document.createElement('tr');
  ['Leeftijd', 'Totale inleg', 'Vermogen nominaal', "Vermogen in euro's van nu"].forEach(function (h) {
    var th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    hr.appendChild(th);
  });
  head.appendChild(hr);

  model.points.forEach(function (p) {
    var tr = document.createElement('tr');
    [String(p.age), money(p.inleg), money(p.nominaal), money(p.reeel)].forEach(function (c) {
      var td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function render() {
  model = project(state);
  renderFigures();
  renderLegend();
  drawChart();
  renderTable();
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
  state = readState();
  buildControls();
  syncControls();
  initTheme();
  writeState();
  render();

  document.getElementById('reset').addEventListener('click', function () {
    FIELDS.forEach(function (f) { state[f.id] = f.def; });
    syncControls();
    writeState();
    render();
  });

  document.getElementById('copy').addEventListener('click', function (e) {
    var btn = e.currentTarget;
    var done = function (ok) {
      btn.textContent = ok ? 'Gekopieerd' : 'Kopiëren mislukt';
      setTimeout(function () { btn.textContent = 'Link kopiëren'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  // Someone pasted a link or used the back button.
  window.addEventListener('hashchange', function () {
    state = readState();
    syncControls();
    render();
  });

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { if (model) drawChart(); });
    ro.observe(document.getElementById('chart-wrap'));
  } else {
    window.addEventListener('resize', function () { if (model) drawChart(); });
  }
}

document.addEventListener('DOMContentLoaded', init);
