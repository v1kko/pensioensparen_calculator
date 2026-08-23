'use strict';

/* ------------------------------------------------------------------ model */

/** Fictieve bedragen: het gaat om de vorm van de curve, niet om de uitkomst. */
var MAANDINLEG = 100;     // euro per maand
var EENMALIG = 1000;      // euro, in jaar 0
var HORIZON = 30;         // jaren op de x-as

var state = {
  mode: 'maandelijks',    // 'maandelijks' | 'eenmalig'
  rendement: 6            // procent per jaar
};

var model = null;

/** Maandelijkse samengestelde groei; inleg aan het begin van de maand.
 *  Eén punt per afgerond jaar, plus het startpunt. */
function project(s) {
  var mRate = Math.pow(1 + s.rendement / 100, 1 / 12) - 1;
  var monthly = s.mode === 'maandelijks' ? MAANDINLEG : 0;
  var balance = s.mode === 'eenmalig' ? EENMALIG : 0;

  var points = [{ year: 0, value: balance }];
  for (var y = 1; y <= HORIZON; y++) {
    for (var m = 0; m < 12; m++) balance = (balance + monthly) * (1 + mRate);
    points.push({ year: y, value: balance });
  }
  return { points: points, max: balance };
}

/* -------------------------------------------------------------- formatting */

var num1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ----------------------------------------------------------------- chart */

var NS = 'http://www.w3.org/2000/svg';
var M = { top: 18, right: 20, bottom: 34, left: 20 };
var CHART_H = 344;

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
  var pts = model.points;

  var x0 = M.left, x1 = W - M.right, y0 = H - M.bottom, y1 = M.top;
  var yMax = Math.max(model.max, 1);
  var x = function (year) { return x0 + year / HORIZON * (x1 - x0); };
  var y = function (v) { return y0 - v / yMax * (y0 - y1); };

  var root = svg('svg', {
    width: W, height: H, viewBox: '0 0 ' + W + ' ' + H,
    role: 'img',
    'aria-label': 'Lijngrafiek van de vermogensgroei over ' + HORIZON + ' jaar bij ' +
      num1.format(state.rendement) + ' procent rendement per jaar, met een ' +
      (state.mode === 'maandelijks'
        ? 'maandelijkse inleg van ' + MAANDINLEG + ' euro'
        : 'eenmalige inleg van ' + EENMALIG + ' euro') + '.'
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

  /* vlak + lijn */
  var color = token('--series-1');
  var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.year) + ' ' + y(p.value); }).join(' ');
  root.appendChild(svg('path', {
    d: 'M' + x0 + ' ' + y0 + ' ' + line.slice(1) + ' L' + x1 + ' ' + y0 + ' Z',
    fill: color, 'fill-opacity': 0.10
  }));
  root.appendChild(svg('path', {
    d: line, fill: 'none', stroke: color, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round'
  }));

  var last = pts[pts.length - 1];
  root.appendChild(svg('circle', {
    cx: x(last.year), cy: y(last.value), r: 4,
    fill: color, stroke: token('--surface-1'), 'stroke-width': 2
  }));

  host.appendChild(root);
}

/* -------------------------------------------------------------- controls */

function renderLegend() {
  var host = document.getElementById('legend');
  host.textContent = '';
  var item = document.createElement('span');
  item.className = 'item';
  var key = document.createElement('span');
  key.className = 'key';
  key.style.background = token('--series-1');
  var name = document.createElement('span');
  name.textContent = 'Vermogen';
  item.appendChild(key); item.appendChild(name);
  host.appendChild(item);
}

function renderControls() {
  document.querySelectorAll('.segmented button').forEach(function (b) {
    b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  });
  document.getElementById('mode-hint').textContent = state.mode === 'maandelijks'
    ? '€ ' + MAANDINLEG + ' per maand, elke maand opnieuw.'
    : '€ ' + EENMALIG + ' in één keer, aan het begin.';
  document.getElementById('rendement-out').textContent = num1.format(state.rendement) + ' %';
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

  document.querySelectorAll('.segmented button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.mode = b.dataset.mode;
      render();
    });
  });

  var slider = document.getElementById('rendement');
  slider.value = state.rendement;
  slider.addEventListener('input', function () {
    state.rendement = parseFloat(slider.value);
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
