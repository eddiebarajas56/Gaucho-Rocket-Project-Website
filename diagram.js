/*
  Pan-and-zoom diagrams (halo.html, "Propulsion Architecture").
  Markup: <section data-diagram="images/x.svg"> for a single drawing, or <section data-diagram> with
    one button per drawing:  data-src="images/x.svg" (and data-label for screen readers); aria-pressed="true" on the first shown,
    .fw__canvas > .fw__stage   where the drawing goes,
    .fw__controls buttons data-zoom="in" | "out" | "fit",   and an optional .fw__hint line.
  Each SVG is loaded into the page (not as an image) so it stays sharp at every zoom level, and only when first shown.
  Mouse: drag to move, double-click to zoom in, Ctrl/Cmd + scroll (or trackpad pinch) to zoom; plain scrolling
  still scrolls the page. Touch: one finger scrolls the page, two fingers move and zoom. Keys: + - 0 and arrows.
  Opened straight from disk (no web server), browsers block loading the files this way, so the drawings show as
  plain pictures instead (the switch still works, but no zooming).
*/
(function () {
  var MAX_SCALE = 3;          // closest zoom: 3 screen px per drawing unit (11px labels show at 33px)
  var mac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  document.querySelectorAll('[data-diagram]').forEach(mount);

  function mount(root) {
    var canvas = root.querySelector('.fw__canvas'), stage = root.querySelector('.fw__stage'), hint = root.querySelector('.fw__hint');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-src]'));
    // a single drawing: data-diagram="images/x.svg" on the section itself, no switch
    if (!tabs.length && root.getAttribute('data-diagram')) {
      var only = document.createElement('span');
      only.setAttribute('data-src', root.getAttribute('data-diagram'));
      only.setAttribute('data-label', root.getAttribute('data-label') || '');
      only.setAttribute('aria-pressed', 'true');
      tabs = [only];
    }
    var svg = null, region = null, W = 0, H = 0, cur = { s: 1, x: 0, y: 0 }, anim = null, cache = {}, staticMode = false;
    var baseHint = coarse ? 'Two fingers to move and zoom' : 'Drag to move · ' + (mac ? '⌘' : 'Ctrl') + ' + scroll or pinch to zoom · Double-click to zoom in';
    if (hint) hint.textContent = baseHint;

    // legend: always open on wider screens (its bar is hidden there); on phones it starts folded away
    var legend = root.querySelector('details.fw__legend');
    if (legend && window.matchMedia) {
      var phone = matchMedia('(max-width: 600px)');
      var sync = function () { legend.open = !phone.matches; };
      sync();
      if (phone.addEventListener) phone.addEventListener('change', sync); else if (phone.addListener) phone.addListener(sync);
    }

    // fetch a drawing once and keep it; resolves to the <svg> element
    function load(url) {
      if (!cache[url]) cache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (txt) {
        var doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
        if (doc.querySelector('parsererror')) throw new Error('bad svg');
        var el = document.importNode(doc.documentElement, true);
        var vb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        el.removeAttribute('width'); el.removeAttribute('height');
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        el.setAttribute('focusable', 'false');
        el._region = { x: vb[0] || 0, y: vb[1] || 0, w: vb[2] || 1, h: vb[3] || 1 };
        return el;
      });
      return cache[url];
    }
    var first = tabs.filter(function (t) { return t.getAttribute('aria-pressed') === 'true'; })[0] || tabs[0];
    load(first.getAttribute('data-src')).then(function () { root.classList.add('is-ready'); show(first, true); }).catch(function () {
      staticMode = true; root.classList.add('is-static'); show(first, true);
    });

    /* ---------- view state: s = screen px per drawing unit; (x, y) = drawing point at the top-left corner ---------- */
    // margins (screen px) matching the faded edges, so nothing important sits in the fade or under the hint
    var IX = 0, IY = 0;
    function measure() { W = canvas.clientWidth; H = canvas.clientHeight; IX = W * 0.06 + 10; IY = H * 0.08 + 14; }
    // phones: the drawing is much wider than tall, so the canvas takes the drawing's shape (with a minimum height)
    // instead of a tall box with empty space above and below
    function sizeCanvas() {
      var w = canvas.clientWidth;
      if (w >= 600 || !region) { canvas.style.height = ''; return; }
      var a = (w - 2 * (w * 0.06 + 10)) * region.h / region.w;   // drawing height at "fit"; margins as in measure()
      canvas.style.height = Math.round(Math.max(360, (a + 28) / 0.84)) + 'px';
    }
    function fitScale() { return Math.min((W - 2 * IX) / region.w, (H - 2 * IY) / region.h); }
    function limits(s) { var f = fitScale(); return Math.min(Math.max(s, f), Math.max(MAX_SCALE, f * 2)); }
    // keep the view on the area (plus the margins): centred along any side that fits on screen, otherwise no panning past its edges
    function settle(v) {
      var s = limits(v.s), w = W / s, h = H / s, mx = IX / s, my = IY / s;
      var rx = region.x - mx, ry = region.y - my, rw = region.w + 2 * mx, rh = region.h + 2 * my;
      var x = w >= rw ? rx + (rw - w) / 2 : Math.min(Math.max(v.x, rx), rx + rw - w);
      var y = h >= rh ? ry + (rh - h) / 2 : Math.min(Math.max(v.y, ry), ry + rh - h);
      return { s: s, x: x, y: y };
    }
    function draw() {
      if (!svg || !W) return;
      svg.setAttribute('viewBox', [cur.x, cur.y, W / cur.s, H / cur.s].map(function (n) { return Math.round(n * 100) / 100; }).join(' '));
      root.classList.toggle('is-zoomed', cur.s > fitScale() * 1.01);
      root.classList.toggle('is-max', cur.s >= limits(Infinity) * 0.99);
    }
    function set(v) { cur = settle(v); draw(); }
    function fitView() { var s = fitScale(); return settle({ s: s, x: region.x, y: region.y }); }
    // zoom by factor f keeping the drawing point under screen point (px, py) in place
    function zoomed(f, px, py, from) {
      from = from || cur;
      var s = limits(from.s * f), ux = from.x + px / from.s, uy = from.y + py / from.s;
      return { s: s, x: ux - px / s, y: uy - py / s };
    }
    // smooth moves for buttons, keys and double-click (gestures follow the hand directly)
    function animateTo(v) {
      var a = cur, b = settle(v), t0 = performance.now(), D = 260;
      cancelAnimationFrame(anim && anim.raf); clearTimeout(anim && anim.done);
      var step = function () {
        var k = Math.min(1, (performance.now() - t0) / D), e = 1 - Math.pow(1 - k, 3);
        // zoom moves in proportion (log scale) so it feels even; the anchor point follows
        var s = a.s * Math.pow(b.s / a.s, e);
        var cxA = a.x + W / 2 / a.s, cyA = a.y + H / 2 / a.s, cxB = b.x + W / 2 / b.s, cyB = b.y + H / 2 / b.s;
        var cx = cxA + (cxB - cxA) * e, cy = cyA + (cyB - cyA) * e;
        cur = { s: s, x: cx - W / 2 / s, y: cy - H / 2 / s }; draw();
        if (k < 1) anim.raf = requestAnimationFrame(step); else { cur = b; draw(); }
      };
      anim = { raf: requestAnimationFrame(step), done: setTimeout(function () { cancelAnimationFrame(anim.raf); cur = b; draw(); }, D + 120) };
    }
    function stopAnim() { if (anim) { cancelAnimationFrame(anim.raf); clearTimeout(anim.done); anim = null; } }

    /* ---------- views (Halo / Ortus): toggle buttons, arrow keys move between them ---------- */
    var showing = 0;
    function show(tab, instant) {
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', t === tab); });
      canvas.setAttribute('aria-label', tab.getAttribute('data-label') || tab.textContent);
      var url = tab.getAttribute('data-src'), ticket = ++showing;
      if (staticMode) { stage.innerHTML = '<img src="' + url + '" alt="">'; return; }
      var put = function (el) {
        if (ticket !== showing) return;                 // another view was picked meanwhile
        stage.innerHTML = ''; stage.appendChild(el);
        svg = el; region = el._region;
        sizeCanvas(); measure(); stopAnim(); cur = fitView(); draw();
        root.classList.remove('is-switching');
      };
      if (instant || !svg) return load(url).then(put);
      root.classList.add('is-switching');               // fade out, swap, fade back in
      Promise.all([load(url), new Promise(function (r) { setTimeout(r, 220); })]).then(function (res) { put(res[0]); })
        .catch(function () { root.classList.remove('is-switching'); });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { if (t.getAttribute('aria-pressed') !== 'true') show(t); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); n.click();
      });
    });

    /* ---------- controls ---------- */
    root.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!svg) return;
        var z = b.getAttribute('data-zoom');
        animateTo(z === 'fit' ? fitView() : zoomed(z === 'in' ? 1.6 : 1 / 1.6, W / 2, H / 2));
      });
    });
    var flashT;
    function flash(text) {
      if (!hint) return;
      hint.textContent = text || baseHint; hint.classList.add('is-flash');
      clearTimeout(flashT); flashT = setTimeout(function () { hint.classList.remove('is-flash'); hint.textContent = baseHint; }, 1600);
    }
    var local = function (e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    /* mouse and pen: drag to move, double-click to zoom in (Shift: out) */
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) {
      if (!svg || e.pointerType === 'touch' || e.button !== 0 || e.target.closest('.fw__controls')) return;
      stopAnim();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: cur };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      set({ s: drag.from.s, x: drag.from.x - (e.clientX - drag.x) / drag.from.s, y: drag.from.y - (e.clientY - drag.y) / drag.from.s });
    });
    var endDrag = function (e) { if (drag && e.pointerId === drag.id) { drag = null; canvas.classList.remove('is-dragging'); } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('dblclick', function (e) {
      if (!svg || e.target.closest('.fw__controls')) return;
      var p = local(e); animateTo(zoomed(e.shiftKey ? 1 / 2 : 2, p.x, p.y));
    });

    /* wheel: Ctrl/Cmd + scroll and trackpad pinch zoom; plain scrolling is left to the page */
    canvas.addEventListener('wheel', function (e) {
      if (!svg) return;
      if (!(e.ctrlKey || e.metaKey)) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) flash((mac ? '⌘' : 'Ctrl') + ' + scroll or pinch to zoom'); return; }
      e.preventDefault(); stopAnim();
      var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      var p = local(e); set(zoomed(Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.008), p.x, p.y));
    }, { passive: false });

    /* touch: two fingers move and zoom; one finger keeps scrolling the page */
    var pinch = null;
    var mid = function (t) { var r = canvas.getBoundingClientRect(); return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) }; };
    canvas.addEventListener('touchstart', function (e) {
      if (!svg) return;
      if (e.touches.length === 2) { stopAnim(); pinch = { m: mid(e.touches), from: cur }; e.preventDefault(); }
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      if (!svg) return;
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        var m = mid(e.touches), f = m.d / (pinch.m.d || 1), s = limits(pinch.from.s * f);
        var ux = pinch.from.x + pinch.m.x / pinch.from.s, uy = pinch.from.y + pinch.m.y / pinch.from.s;
        set({ s: s, x: ux - m.x / s, y: uy - m.y / s });
      } else if (e.touches.length === 1 && !e.target.closest('.fw__controls')) flash();
    }, { passive: false });
    canvas.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });

    /* keyboard, while the drawing has focus */
    canvas.addEventListener('keydown', function (e) {
      if (!svg) return;
      var k = e.key, step = 80 / cur.s, v = null;
      if (k === '+' || k === '=') v = zoomed(1.6, W / 2, H / 2);
      else if (k === '-' || k === '_') v = zoomed(1 / 1.6, W / 2, H / 2);
      else if (k === '0') v = fitView();
      else if (k === 'ArrowLeft') v = { s: cur.s, x: cur.x - step, y: cur.y };
      else if (k === 'ArrowRight') v = { s: cur.s, x: cur.x + step, y: cur.y };
      else if (k === 'ArrowUp' && cur.s > fitScale() * 1.01) v = { s: cur.s, x: cur.x, y: cur.y - step };
      else if (k === 'ArrowDown' && cur.s > fitScale() * 1.01) v = { s: cur.s, x: cur.x, y: cur.y + step };
      if (!v) return;
      e.preventDefault(); animateTo(v);
    });

    /* resizing keeps the same spot in the middle and the same zoom relative to "fit" */
    var onResize = function () {
      if (!svg || !region) return;
      if (!W || !H) { measure(); cur = fitView(); return draw(); }
      var rel = cur.s / fitScale(), cx = cur.x + W / 2 / cur.s, cy = cur.y + H / 2 / cur.s; // still the old size here
      if (canvas.clientWidth !== W) sizeCanvas();
      measure();
      if (!W || !H) return;
      var s = fitScale() * rel;
      set({ s: s, x: cx - W / 2 / s, y: cy - H / 2 / s });
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas); else addEventListener('resize', onResize);
  }
})();
