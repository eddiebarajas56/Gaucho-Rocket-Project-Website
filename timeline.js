/*
  Halo timeline: a to-scale vertical timeline where clicking a topic spawns its steps as dots.
  Used by halo.html (mounts itself on any .tlA[data-source]) and by halo-timeline-preview.html,
  which mounts it next to an editor through window.HaloTimeline.
  The entries live in the page as <ol class="htl-data">; see the comment above that list for the format.
*/
(function () {
  var DAY = 864e5;
  var TYPES = { design: 'Design milestone', test: 'Test', flight: 'Flight', event: 'Team event' };
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* Today's date. Add ?today=2027-06-01 to the URL to preview another day. */
  var override = (location.search.match(/[?&]today=(\d{4}-\d{2}-\d{2})/) || [])[1];
  var offset = override ? new Date(override + 'T12:00:00').getTime() - Date.now() : 0;
  var nowT = function () { return Date.now() + offset; };

  var fmtFull = function (t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  var fmtShort = function (t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  var DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/;
  function parseDate(raw) {
    var m = String(raw || '').trim().match(DATE_RE);
    return m ? { date: new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 15, 12), hasDay: !!m[3] } : null;
  }
  function byT(a, b) { return a.t - b.t; }
  var DEFAULT_SPACING = 0.6; // pixels per day on page open: the slider's minimum (crowded stretches still widen to fit)
  function clampSpacing(v) { v = parseFloat(v); return isFinite(v) ? Math.min(6, Math.max(0.6, Math.round(v * 10) / 10)) : DEFAULT_SPACING; }
  // the same, without rounding to the slider's 0.1 steps (so a trackpad pinch can change it smoothly)
  function clampSpacingFine(v) { return Math.min(6, Math.max(0.6, v)); }
  var MAC = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

  /* ---------------- Data: entries with optional steps ---------------- */
  var nextId = 0;
  function entry(o) {
    return { id: ++nextId, date: o.date || '', type: TYPES[o.type] ? o.type : 'event', title: o.title || '', body: o.body || '',
             team: String(o.team || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' '),
             subs: (o.subs || []).map(function (s) { return { date: s.date || '', text: s.text || '' }; }) };
  }
  function readModel(src) {
    return Array.prototype.map.call(src.querySelectorAll(':scope > li'), function (li) {
      var h = li.querySelector(':scope > h3'), p = li.querySelector(':scope > p');
      return entry({ date: (li.getAttribute('data-date') || '').trim(), type: li.getAttribute('data-type'), team: li.getAttribute('data-team'),
        title: h ? h.innerHTML.trim() : '', body: p ? p.innerHTML.trim() : '',
        subs: Array.prototype.map.call(li.querySelectorAll(':scope > ol > li'), function (s) {
          return { date: (s.getAttribute('data-date') || '').trim(), text: s.innerHTML.trim() };
        }) });
    });
  }
  function toItems(model) {
    return model.map(function (e) {
      var pd = parseDate(e.date);
      if (!pd) return null;
      var subs = e.subs.map(function (s) {
        var sd = parseDate(s.date);
        return sd ? { t: sd.date.getTime(), date: sd.date, hasDay: sd.hasDay, html: s.text } : null;
      }).filter(Boolean).sort(byT);
      return { id: e.id, t: pd.date.getTime(), date: pd.date, type: e.type, subs: subs, title: e.title, body: e.body, teams: e.team ? e.team.split(' ') : [],
               label: pd.hasDay ? fmtFull(pd.date) : MONTHS[pd.date.getMonth()] + ' ' + pd.date.getFullYear() };
    }).filter(Boolean).sort(byT);
  }
  function toHTML(model) {
    var q = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); };
    return '<ol class="htl-data" id="halo-timeline-data">\n' + model.map(function (e) {
      var subs = e.subs.length ? '\n    <ol>\n' + e.subs.map(function (s) { return '      <li data-date="' + q(s.date) + '">' + s.text + '</li>'; }).join('\n') + '\n    </ol>\n  ' : '';
      return '  <li data-date="' + q(e.date) + '" data-type="' + q(e.type) + '"' + (e.team ? ' data-team="' + q(e.team) + '"' : '') + '><h3>' + e.title + '</h3><p>' + e.body + '</p>' + subs + '</li>';
    }).join('\n') + '\n</ol>';
  }
  /* step date: "Nov 20" or "Nov"; the year is added when it differs from the entry's */
  function subLabel(s, parent) {
    var d = s.date, y = d.getFullYear(), other = y !== parent.date.getFullYear();
    return MONTHS[d.getMonth()] + (s.hasDay ? ' ' + d.getDate() + (other ? ', ' + y : '') : (other ? ' ' + y : ''));
  }
  function range(items) {
    var all = [];
    items.forEach(function (it) { all.push(it.t); it.subs.forEach(function (s) { all.push(s.t); }); });
    var f = new Date(Math.min.apply(null, all)), l = new Date(Math.max.apply(null, all)), n = nowT();
    var a = new Date(f.getFullYear(), f.getMonth() - 1, 1).getTime(), b = new Date(l.getFullYear(), l.getMonth() + 2, 1).getTime();
    return [Math.min(a, n - 30 * DAY), Math.max(b, n + 30 * DAY)];
  }
  var mark = function (type) { return '<span class="htl-mark t-' + type + '"></span>'; };
  var legendKeys = '<li class="htl-legend__key"><span class="htl-now" aria-hidden="true"></span>Today</li>' +
    '<li class="htl-legend__key"><span class="htl-faded" aria-hidden="true">' + mark('design') + mark('test') + '</span>Faded = planned</li>';
  var legend = '<ul class="htl-legend">' + Object.keys(TYPES).map(function (k) { return '<li>' + mark(k) + TYPES[k] + '</li>'; }).join('') + legendKeys + '</ul>';
  // the timeline's own legend: each type is a button that shows or hides that type (hidden ones are greyed out)
  var SHORT = { design: 'Design', test: 'Test', flight: 'Flight', event: 'Event' };   // button labels on phones
  function toggleLegend(shown) {
    return '<ul class="htl-legend htl-legend--toggles" aria-label="Show on the timeline">' + Object.keys(TYPES).map(function (k) {
      return '<li><button type="button" class="htl-toggle' + (shown[k] ? '' : ' is-off') + '" data-type="' + k + '" aria-pressed="' + !!shown[k] + '">' + mark(k) +
        '<span class="htl-toggle__full">' + TYPES[k] + '</span><span class="htl-toggle__short">' + SHORT[k] + '</span></button></li>';
    }).join('') + legendKeys + '</ul>';
  }

  var renderers = [];

  /* ---------------- Timeline (Option A) ---------------- */
  /* opts: spacing (px per day on open); show -> types shown on open (default: data-show on the element, else events only);
     side(item, index) -> 'L', 'R' or 'C' (centred on the line, below its dot);
     itemAttrs(item) -> extra attributes for the entry; metaExtra(item) -> extra HTML in the card's top line */
  function mountTimeline(root, getItems, onOpenChange, opts) {
    opts = opts || {};
    var items = [], lis = [], open = -1, openId = null, tickEls = {}, hiddenAll = false;
    var spacing = clampSpacing(opts.spacing), showAll = false;
    // which types are on the line; the legend buttons toggle them
    var shown = {};
    (opts.show || (root.getAttribute('data-show') || 'event').split(/[\s,]+/)).forEach(function (k) { if (TYPES[k]) shown[k] = true; });
    // data-zoom-base="1120": the timeline is laid out for that width and, on wider screens, zoomed up as a whole to fill it
    var zoomBase = +(root.getAttribute('data-zoom-base') || opts.zoomBase || 0), zoom = 1;
    // the legend sits in the toolbar, which sticks to the top of the screen
    root.innerHTML = '<div class="tlA__tools" data-keep-open>' + toggleLegend(shown) +
      '<button type="button" class="tlA__expand" aria-pressed="false">Show all descriptions</button>' +
      '<label class="tlA__spacing">Spacing <input type="range" min="0.6" max="6" step="0.1"> <output></output></label>' +
      '<span class="tlA__zoomhint">or ' + (MAC ? '\u2318' : 'Ctrl') + ' + scroll' + (MAC ? ' / pinch' : '') + ' over the timeline</span></div>' +
      '<div class="tlA__stage"><div class="tlA__axis"></div><div class="tlA__progress"></div><div class="tlA__span" aria-hidden="true"></div><div class="tlA__ticks" aria-hidden="true"></div>' +
      '<svg class="tlA__links" aria-hidden="true"></svg>' +
      '<div class="tlA__today" aria-hidden="true"><span class="tlA__todayLine"></span><span class="htl-now"></span><span class="tlA__todayLabel"><b>Today</b><span></span><span></span></span></div>' +
      '<ol class="tlA__list"></ol></div>';
    var stage = root.querySelector('.tlA__stage'), list = root.querySelector('.tlA__list'), svg = root.querySelector('.tlA__links'),
        ticks = root.querySelector('.tlA__ticks'), today = root.querySelector('.tlA__today'), todayTxt = today.querySelectorAll('.tlA__todayLabel span'),
        progress = root.querySelector('.tlA__progress'), spanEl = root.querySelector('.tlA__span');
    var uid = 'tlA' + Math.random().toString(36).slice(2, 7);
    var expandBtn = root.querySelector('.tlA__expand'), slider = root.querySelector('.tlA__spacing input'), sliderOut = root.querySelector('.tlA__spacing output');
    // the readout is in screen pixels, so it includes the zoom on wide screens
    function showSpacing() { slider.value = spacing; sliderOut.textContent = '1 month \u2248 ' + Math.round(spacing * 30.44 * (zoom || 1)) + ' px'; }
    showSpacing();
    // show or hide every card's description at once (steps still open by clicking a card)
    expandBtn.addEventListener('click', function () {
      showAll = !showAll;
      root.classList.toggle('show-all', showAll);
      expandBtn.setAttribute('aria-pressed', showAll);
      expandBtn.textContent = showAll ? 'Hide descriptions' : 'Show all descriptions';
      layout(false);
    });
    // spacing between dates; cards follow the slider without lag while it moves
    var slideEnd;
    slider.addEventListener('input', function () {
      spacing = clampSpacing(slider.value); showSpacing();
      root.classList.add('is-sliding'); clearTimeout(slideEnd);
      slideEnd = setTimeout(function () { root.classList.remove('is-sliding'); }, 200);
      layout(false);
      if (opts.onSpacing) opts.onSpacing(spacing);
    });
    // Cmd/Ctrl + scroll (or a trackpad pinch) over the timeline changes the spacing too, like zooming the diagrams;
    // the date under the pointer stays under the pointer. Plain scrolling still scrolls the page.
    var curMap = null;
    root.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey) || !curMap) return;
      e.preventDefault();
      var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      var next = clampSpacingFine(spacing * Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.008));
      if (next === spacing) return;
      var py = (e.clientY - stage.getBoundingClientRect().top) / zoom, t = curMap.timeAt(py);
      spacing = next; showSpacing();
      root.classList.add('is-sliding'); clearTimeout(slideEnd);
      slideEnd = setTimeout(function () { root.classList.remove('is-sliding'); }, 200);
      layout(false);
      window.scrollBy({ top: (curMap.y(t) - py) * zoom, behavior: 'instant' });   // the site scrolls smoothly; this must not
      if (opts.onSpacing) opts.onSpacing(spacing);
    }, { passive: false });

    // legend buttons: show or hide a type. The date at the top of the screen stays put while the line re-flows.
    var toggles = root.querySelectorAll('.htl-toggle');
    function setShown(k, on) {
      shown[k] = on;
      toggles.forEach(function (b) {
        if (b.getAttribute('data-type') !== k) return;
        b.setAttribute('aria-pressed', on); b.classList.toggle('is-off', !on);
      });
    }
    toggles.forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-type'), st = stage.getBoundingClientRect().top, py = null, t = null;
        var barBottom = Math.max(0, root.querySelector('.tlA__tools').getBoundingClientRect().bottom);
        if (curMap && items.length && st < barBottom) { py = (barBottom - st) / zoom; t = curMap.timeAt(py); }
        setShown(k, !shown[k]);
        root.classList.add('is-sliding'); clearTimeout(slideEnd);
        slideEnd = setTimeout(function () { root.classList.remove('is-sliding'); }, 200);
        build();
        if (t != null && curMap && items.length) window.scrollBy({ top: (curMap.y(t) - py) * zoom, behavior: 'instant' });
      });
    });

    function build() {
      var all = getItems();
      items = all.filter(function (it) { return shown[it.type]; });
      hiddenAll = all.length > 0 && !items.length;
      open = -1;
      items.forEach(function (it, k) { if (it.id === openId) open = k; });
      // the open entry's type was just hidden: it closes
      if (openId != null && open < 0) { openId = null; if (onOpenChange) onOpenChange(null); }
      list.innerHTML = items.map(function (it, k) {
        var subDots = it.subs.map(function () { return '<span class="tlA__sub' + (k === open ? ' is-shown' : '') + '" aria-hidden="true">' + mark(it.type) + '</span>'; }).join('');
        var subRows = it.subs.map(function (s) {
          return '<li>' + mark(it.type) + '<span class="tlA__subdate">' + subLabel(s, it) + '</span><span class="tlA__subtxt">' + s.html + '</span></li>';
        }).join('');
        return '<li class="tlA__item t-' + it.type + '"' + (opts.itemAttrs ? opts.itemAttrs(it) : '') + '>' + subDots +
          '<span class="tlA__dot" aria-hidden="true">' + mark(it.type) + '</span>' +
          '<div class="tlA__card"><button class="tlA__head" type="button" aria-expanded="false" aria-controls="' + uid + k + '">' +
            '<span class="tlA__meta"><span class="htl-chip">' + mark(it.type) + '<span class="htl-chip__txt">' + TYPES[it.type] + '</span></span><span class="tlA__date">' + it.label + '</span><span class="tlA__status"></span>' +
            (it.subs.length ? '<span class="tlA__count">' + it.subs.length + ' step' + (it.subs.length === 1 ? '' : 's') + '</span>' : '') +
            (opts.metaExtra ? opts.metaExtra(it) : '') + '</span>' +
            '<span class="tlA__title">' + it.title + '</span></button>' +
          '<div class="tlA__body' + (it.body.trim() ? '' : ' tlA__body--nodesc') + '" id="' + uid + k + '" hidden>' + (it.body.trim() ? '<p>' + it.body + '</p>' : '') +
            (subRows ? '<ol class="tlA__subs" aria-label="Steps">' + subRows + '</ol>' : '') + '</div></div></li>';
      }).join('');
      lis = list.querySelectorAll(':scope > .tlA__item');
      lis.forEach(function (li, k) {
        li.querySelector('.tlA__head').addEventListener('click', function () { toggle(k); });
        li.querySelector('.tlA__dot').addEventListener('click', function () { toggle(k); });
        // hovering a step row lights up its dot on the line, and the other way round
        var sd = li.querySelectorAll('.tlA__sub'), rows = li.querySelectorAll('.tlA__subs li');
        rows.forEach(function (row, j) {
          var on = function () { sd[j].classList.add('is-hot'); row.classList.add('is-hot'); };
          var off = function () { sd[j].classList.remove('is-hot'); row.classList.remove('is-hot'); };
          [row, sd[j]].forEach(function (el) { el.addEventListener('mouseenter', on); el.addEventListener('mouseleave', off); });
        });
      });
      applyOpen();
      layout(false);
    }
    function applyOpen() {
      root.classList.toggle('has-focus', open > -1);
      lis.forEach(function (li, j) {
        li.classList.toggle('is-open', j === open);
        li.classList.toggle('is-dim', open > -1 && j !== open);
        li.querySelector('.tlA__head').setAttribute('aria-expanded', j === open);
        li.querySelector('.tlA__body').hidden = j !== open;
      });
    }
    function toggle(k, quiet) {
      open = open === k ? -1 : k;
      openId = open > -1 ? items[open].id : null;
      applyOpen();
      layout(true);
      // spawn: each step dot starts on its entry's dot and slides out to its own date
      lis.forEach(function (li, j) {
        li.querySelectorAll('.tlA__sub').forEach(function (sd) {
          if (j === open) { sd.offsetHeight; sd.classList.add('is-shown'); } else sd.classList.remove('is-shown');
        });
      });
      if (onOpenChange && !quiet) onOpenChange(openId);
    }
    function openById(id) {
      // an entry of a hidden type (e.g. picked in the preview editor) turns its type back on first
      if (!items.some(function (it) { return it.id === id; })) {
        var hit = getItems().filter(function (it) { return it.id === id; })[0];
        if (!hit || shown[hit.type]) return;
        setShown(hit.type, true); build();
      }
      for (var k = 0; k < items.length; k++) {
        if (items[k].id !== id) continue;
        if (k !== open) toggle(k, true);
        var card = lis[k].querySelector('.tlA__card');
        setTimeout(function () {
          var r = card.getBoundingClientRect();
          if (r.top < 0 || r.bottom > innerHeight) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 480);
        return;
      }
    }
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open > -1) { var k = open; toggle(k); lis[k].querySelector('.tlA__head').focus(); } });
    // clicking anywhere outside the open card closes it (dots and other cards switch topics instead)
    document.addEventListener('click', function (e) {
      if (open < 0) return;
      var t = e.target;
      if (lis[open].querySelector('.tlA__card').contains(t) || (t.closest && t.closest('.tlA__dot, .tlA__sub, [data-keep-open]'))) return;
      toggle(open);
    });

    function layout(spawn) {
      root.classList.toggle('is-empty', !items.length);
      if (!items.length) {
        list.innerHTML = '<li class="tlA__empty">' + (hiddenAll ? 'Every type is hidden. Turn one on in the legend above.' : 'No entries with a valid date yet.') + '</li>';
        stage.style.height = '120px'; svg.innerHTML = ''; ticks.innerHTML = ''; tickEls = {}; curMap = null; return;
      }
      var r = range(items), d0 = r[0], d1 = r[1], now = nowT();
      if (zoomBase) {   // fit the screen: zoom = available width / design width (never below 1)
        var avail = root.clientWidth;
        zoom = avail > zoomBase ? avail / zoomBase : 1;
        stage.style.zoom = zoom === 1 ? '' : String(zoom);
        showSpacing();
      }
      var W = zoom !== 1 ? root.clientWidth / zoom : stage.clientWidth, narrow = W < 720;
      var axisX = narrow ? 62 : W / 2, gap = narrow ? 34 : 64, ppd = spacing, pad = 40;
      var DOT_GAP = 18, STEP_GAP = 24, CARD_GAP = 14;
      root.classList.toggle('is-narrow', narrow);
      stage.style.setProperty('--axis-x', axisX + 'px');

      // 1. size every card first (their heights decide how much room each stretch of time needs)
      var sides = [], hs = [];
      lis.forEach(function (li, k) {
        var it = items[k], side = narrow ? 'R' : (opts.side ? opts.side(it, k) : (k % 2 ? 'R' : 'L')), future = it.t > now;
        sides[k] = side;
        li.setAttribute('data-side', side);
        li.classList.toggle('is-future', future);
        li.querySelector('.tlA__status').textContent = future ? 'Planned' : '';
        var card = li.querySelector('.tlA__card'), cw = narrow ? W - axisX - gap : side === 'C' ? Math.min(440, W * 0.44) : Math.min(460, axisX - gap);
        card.style.width = cw + 'px';
        card.style.left = (side === 'C' ? axisX - cw / 2 : side === 'R' ? axisX + gap : axisX - gap - cw) + 'px';
      });
      lis.forEach(function (li, k) { hs[k] = li.querySelector('.tlA__card').getBoundingClientRect().height / zoom; });

      // 2. place dots top to bottom. Where there's room, the gap matches the real time between dates;
      //    where cards would collide, the line stretches just enough for each card to sit level with its dot.
      //    The open topic's steps take part too, so they spread out instead of piling on one spot.
      var pts = items.map(function (it, k) { return { t: it.t, k: k }; });
      if (open > -1) items[open].subs.forEach(function (s, j) { pts.push({ t: s.t, k: -1, j: j }); });
      pts.sort(function (a, b) { return a.t - b.t || (a.k < 0) - (b.k < 0); });
      //    A centred card hangs below its dot and spans the line, so it must clear both sides and nothing sits on the line behind it.
      var lastOnSide = { L: null, R: null }, prev = null, lineFree = 0;
      var cardOff = function (k) { return sides[k] === 'C' ? 16 : -20; }; // card top relative to its dot
      pts.forEach(function (p) {
        var py = prev ? prev.y + (p.t - prev.t) / DAY * ppd : pad + (p.t - d0) / DAY * ppd;
        if (prev) py = Math.max(py, prev.y + (p.k < 0 || prev.k < 0 ? STEP_GAP : DOT_GAP));
        py = Math.max(py, lineFree);
        if (p.k > -1) {
          var side = sides[p.k], lanes = side === 'C' ? ['L', 'R'] : [side];
          lanes.forEach(function (s) {
            var q = lastOnSide[s];
            if (q) py = Math.max(py, q.y + cardOff(q.k) + hs[q.k] + CARD_GAP - cardOff(p.k));
          });
          lanes.forEach(function (s) { lastOnSide[s] = p; });
          if (side === 'C') lineFree = py + cardOff(p.k) + hs[p.k] + DOT_GAP;
        }
        p.y = py; prev = p;
      });
      // time -> position along the line, through those points (used for ticks, "Today" and hidden steps)
      var knots = [];
      pts.forEach(function (p) { var kn = knots[knots.length - 1]; if (kn && kn.t === p.t) kn.y1 = p.y; else knots.push({ t: p.t, y0: p.y, y1: p.y }); });
      var y = function (t) {
        var n = knots.length;
        if (t <= knots[0].t) return knots[0].y0 - (knots[0].t - t) / DAY * ppd;
        if (t >= knots[n - 1].t) return knots[n - 1].y1 + (t - knots[n - 1].t) / DAY * ppd;
        for (var i = 0; i < n - 1; i++) {
          var a = knots[i], b = knots[i + 1];
          if (t < b.t) return t === a.t ? a.y0 : a.y1 + (b.y0 - a.y1) * (t - a.t) / (b.t - a.t);
        }
      };
      var dotY = [], stepY = [];
      pts.forEach(function (p) { if (p.k > -1) dotY[p.k] = p.y; else stepY[p.j] = p.y; });
      var nowY = y(Math.min(Math.max(now, d0), d1));

      // 3. month ticks; years always labelled, months labelled wherever the line has stretched enough to fit them
      var keep = {}, lastLabel = -1e9, d = new Date(d0); d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      while (d.getTime() < d1) {
        var key = d.getTime(), ty = y(key), te = tickEls[key], jan = d.getMonth() === 0;
        keep[key] = 1;
        if (!te) {
          te = tickEls[key] = { tick: document.createElement('span'), label: document.createElement('span') };
          te.tick.className = 'tlA__tick' + (jan ? ' is-major' : '');
          te.label.className = 'tlA__year' + (jan ? '' : ' is-month');
          te.label.textContent = jan ? d.getFullYear() : MONTHS[d.getMonth()];
          ticks.appendChild(te.tick); ticks.appendChild(te.label);
        }
        te.tick.style.top = ty + 'px';
        te.label.style.top = ty + 'px';
        var show = Math.abs(ty - nowY) >= 40 && (jan || ty - lastLabel >= 46);
        te.label.style.visibility = show ? '' : 'hidden';
        if (show) lastLabel = ty;
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
      Object.keys(tickEls).forEach(function (key) { if (!keep[key]) { tickEls[key].tick.remove(); tickEls[key].label.remove(); delete tickEls[key]; } });

      // 4. cards level with their dots, plus connector lines
      var bottom = 0, paths = '', subPaths = '';
      lis.forEach(function (li, k) {
        var it = items[k], side = sides[k], future = it.t > now, dim = open > -1 && k !== open;
        var dy = dotY[k], top = dy + (side === 'C' ? 16 : -20), h = hs[k], card = li.querySelector('.tlA__card');
        li.querySelector('.tlA__dot').style.top = dy + 'px';
        card.style.top = top + 'px';
        bottom = Math.max(bottom, top + h);
        var dir = side === 'R' ? 1 : -1, sx = axisX + 12 * dir, ex = axisX + gap * dir;
        if (side !== 'C') paths += '<path class="t-' + it.type + (future ? ' is-future' : '') + (dim ? ' is-dim' : '') + (spawn ? ' is-spawn' : '') + '" style="animation-delay:380ms" d="M' + sx + ',' + dy + ' L' + ex + ',' + dy + '"/>';
        // step dots: positions are set every time; they only show for the open entry
        var rows = li.querySelectorAll('.tlA__subs li');
        li.querySelectorAll('.tlA__sub').forEach(function (sd, j) {
          var s = it.subs[j], sy = k === open ? stepY[j] : y(s.t), sFuture = s.t > now;
          sd.style.setProperty('--py', dy + 'px');
          sd.style.setProperty('--y', sy + 'px');
          sd.style.setProperty('--d', (90 + j * 70) + 'ms');
          sd.classList.toggle('is-future', sFuture);
          rows[j].classList.toggle('is-future', sFuture);
          if (k === open && side !== 'C') {
            var rr = rows[j].getBoundingClientRect(), cr = card.getBoundingClientRect();
            var ry = top + (rr.top - cr.top + rr.height / 2) / zoom, mx = axisX + gap * 0.5 * dir;
            subPaths += '<path class="t-' + it.type + ' is-sub' + (sFuture ? ' is-future' : '') + (spawn ? ' is-spawn' : '') + '" style="animation-delay:' + (480 + j * 70) + 'ms" d="M' + (axisX + 7 * dir) + ',' + sy + ' L' + mx + ',' + sy + ' L' + ex + ',' + ry + '"/>';
          }
        });
      });
      svg.innerHTML = paths + subPaths;
      // highlight band on the line covering the open entry and all of its steps
      if (open > -1) {
        var ys = [dotY[open]].concat(stepY.filter(function (v) { return v != null; }));
        var lo = Math.min.apply(null, ys) - 9, hi = Math.max.apply(null, ys) + 9;
        spanEl.className = 'tlA__span is-on t-' + items[open].type;
        spanEl.style.top = lo + 'px'; spanEl.style.height = (hi - lo) + 'px';
      } else spanEl.classList.remove('is-on');
      stage.style.height = (Math.max(y(d1), bottom) + pad) + 'px';
      // remembered for Cmd/Ctrl + scroll: position -> date (y only ever grows with time, so halve the interval)
      curMap = { y: y, timeAt: function (py) {
        var lo = d0 - 3650 * DAY, hi = d1 + 3650 * DAY;
        for (var i = 0; i < 48; i++) { var mid = (lo + hi) / 2; if (y(mid) < py) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
      } };
      today.style.top = nowY + 'px';
      progress.style.height = nowY + 'px';
      todayTxt[0].textContent = fmtShort(now);
      todayTxt[1].textContent = new Date(now).getFullYear();
    }
    renderers.push(function () { layout(false); });
    build();
    return { rebuild: build, openById: openById, setSpacing: function (v) { spacing = clampSpacing(v); showSpacing(); layout(false); } };
  }

  /* keep "today" moving: re-place it every minute and whenever the tab comes back */
  function redraw() { renderers.forEach(function (f) { f(); }); }
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 80); });
  setInterval(redraw, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) redraw(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  window.HaloTimeline = { TYPES: TYPES, DEFAULT_SPACING: DEFAULT_SPACING, nowT: nowT, parseDate: parseDate, entry: entry,
    readModel: readModel, toItems: toItems, toHTML: toHTML, mount: mountTimeline, redraw: redraw,
    onRedraw: function (f) { renderers.push(f); },
    util: { DAY: DAY, MONTHS: MONTHS, mark: mark, legend: legend, subLabel: subLabel, range: range, fmtShort: fmtShort, clampSpacing: clampSpacing } };

  // halo.html: every timeline with a data-source list mounts itself (the preview page mounts its own, with the editor)
  document.querySelectorAll('.tlA[data-source]').forEach(function (root) {
    var src = document.querySelector(root.getAttribute('data-source'));
    if (!src) return;
    var model = readModel(src);
    mountTimeline(root, function () { return toItems(model); }, null, { spacing: DEFAULT_SPACING });
  });
})();
