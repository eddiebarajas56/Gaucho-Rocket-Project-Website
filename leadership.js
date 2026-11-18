/* Halo leadership tree.
   Draws the teams side by side (Mechanical on the left, Avionics on the right) from a JSON block:

     <script type="application/json" id="halo-leadership-data">{ "teams": [ { "name": "Mechanical", "head": {...} }, ... ] }</script>
     <div class="lt" data-source="#halo-leadership-data"></div>

   A person is { name, title, photo, email, phone, linkedin, members: [...], leads: [...] }. Only name is needed.
   "leads" are the next row down, with headshots; each row is a little smaller than the one above.
   "members" are names only, listed under the person they report to.
   Clicking anyone opens a card with their contact info.

   Each tree's width follows how many columns of leads it has, so a growing team gets more room.
   When the trees no longer fit side by side they stack, and a tree that is still too narrow
   (phones) turns into an indented list. halo-timeline-preview.html has an editor for the data. */
(function () {
  'use strict';
  var FIELDS = ['name', 'title', 'photo', 'email', 'phone', 'linkedin'];
  var TEAM_NAMES = ['Mechanical', 'Avionics'];
  var MIN_COL = 84; // px: the narrowest a column of leads may get before the trees stack

  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var txt = function (s) { return String(s == null ? '' : s).trim(); };

  /* ---------- data ---------- */
  // leaders (heads and leads) carry members and leads; members are just a person
  function person(o, leader) {
    o = o && typeof o === 'object' ? o : {};
    var p = {};
    FIELDS.forEach(function (f) { p[f] = o[f] == null ? '' : String(o[f]); });
    if (leader) {
      p.members = (Array.isArray(o.members) ? o.members : []).map(function (x) { return person(x, false); });
      p.leads = (Array.isArray(o.leads) ? o.leads : []).map(function (x) { return person(x, true); });
    }
    return p;
  }
  function clean(d) {
    var teams = (d && Array.isArray(d.teams) ? d.teams : []).map(function (t, i) {
      return { name: t && t.name != null ? String(t.name) : (TEAM_NAMES[i] || 'Team'), head: person(t && t.head, true) };
    });
    while (teams.length < 2) teams.push({ name: TEAM_NAMES[teams.length], head: person({}, true) });
    return { teams: teams };
  }
  function read(src) {
    try { return clean(JSON.parse(src.textContent)); }
    catch (e) { if (window.console) console.warn('Leadership data is not valid JSON:', e); return clean(null); }
  }

  // every person in display order (head, their members, then each lead in turn), with where they sit
  function walk(data) {
    var list = [];
    data.teams.forEach(function (t, ti) {
      (function visit(p, depth, parent, arr) {
        list.push({ p: p, kind: 'leader', depth: depth, team: ti, parent: parent, arr: arr });
        p.members.forEach(function (m) { list.push({ p: m, kind: 'member', depth: depth + 1, team: ti, parent: p, arr: p.members }); });
        p.leads.forEach(function (l) { visit(l, depth + 1, p, p.leads); });
      })(t.head, 0, null, null);
    });
    list.forEach(function (e, i) { e.id = i; });
    return list;
  }
  // how many columns of leads sit under someone (at least one: their own)
  function cols(p) { return Math.max(1, p.leads.reduce(function (n, l) { return n + cols(l); }, 0)); }

  /* ---------- writing it back out ---------- */
  function strip(p) {
    var o = {};
    FIELDS.forEach(function (f) { var v = txt(p[f]); if (v || f === 'name') o[f] = v; });
    if (p.members && p.members.length) o.members = p.members.map(strip);
    if (p.leads && p.leads.length) o.leads = p.leads.map(strip);
    return o;
  }
  // JSON with each person who has no one under them on a single line
  function fmt(v, ind) {
    if (Array.isArray(v)) {
      return v.length ? '[\n' + v.map(function (x) { return ind + '  ' + fmt(x, ind + '  '); }).join(',\n') + '\n' + ind + ']' : '[]';
    }
    if (v && typeof v === 'object') {
      var ks = Object.keys(v), flat = ks.every(function (k) { return typeof v[k] !== 'object'; });
      if (flat) return '{ ' + ks.map(function (k) { return JSON.stringify(k) + ': ' + JSON.stringify(v[k]); }).join(', ') + ' }';
      return '{\n' + ks.map(function (k) { return ind + '  ' + JSON.stringify(k) + ': ' + fmt(v[k], ind + '  '); }).join(',\n') + '\n' + ind + '}';
    }
    return JSON.stringify(v);
  }
  function toJSON(data) {
    return fmt({ teams: data.teams.map(function (t) { return { name: txt(t.name), head: strip(t.head) }; }) }, '');
  }
  function toHTML(data) {
    // "<" is escaped so a name can never close the script tag early
    return '<script type="application/json" id="halo-leadership-data">\n' + toJSON(data).replace(/</g, '\\u003c') + '\n</script>';
  }

  /* ---------- drawing ---------- */
  function initials(name) {
    var w = txt(name).split(/\s+/).filter(Boolean);
    return w.length ? (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase() : '?';
  }
  function photoHTML(p, cls) {
    var src = txt(p.photo), ini = esc(initials(p.name));
    return src ? '<img class="' + cls + '" src="' + esc(src) + '" alt="" data-initials="' + ini + '">'
               : '<span class="' + cls + ' is-blank" aria-hidden="true">' + ini + '</span>';
  }
  var nameHTML = function (p) { return txt(p.name) ? esc(txt(p.name)) : '<i>Name</i>'; };

  function nodeHTML(p, depth, ids) {
    var h = '<li class="lt__node" data-d="' + Math.min(depth, 3) + '" style="--cols:' + cols(p) + '">' +
      '<button type="button" class="lt__person" data-pid="' + ids.get(p) + '" aria-haspopup="dialog">' + photoHTML(p, 'lt__ph') +
        '<span class="lt__txt"><span class="lt__name">' + nameHTML(p) + '</span>' +
        (txt(p.title) ? '<span class="lt__title">' + esc(txt(p.title)) + '</span>' : '') + '</span></button>';
    if (p.members.length) {
      h += '<ul class="lt__members">' + p.members.map(function (m) {
        return '<li><button type="button" class="lt__member" data-pid="' + ids.get(m) + '" aria-haspopup="dialog">' + nameHTML(m) + '</button></li>';
      }).join('') + '</ul>';
    }
    if (p.leads.length) h += '<ul class="lt__kids">' + p.leads.map(function (l) { return nodeHTML(l, depth + 1, ids); }).join('') + '</ul>';
    return h + '</li>';
  }
  function treeHTML(t, ti, ids) {
    var c = cols(t.head);
    // a small team still gets two columns' worth of room so its head isn't squeezed
    return '<div class="lt__tree" data-team="' + ti + '" data-cols="' + c + '" style="--cols:' + Math.max(2, c) + '">' +
      '<h3 class="lt__team"><span>' + (esc(txt(t.name)) || 'Team') + '</span></h3>' +
      '<ul class="lt__root">' + nodeHTML(t.head, 0, ids) + '</ul></div>';
  }

  // a photo that doesn't load turns into initials
  function swapBroken(e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-initials')) return;
    var s = document.createElement('span');
    s.className = img.className + ' is-blank';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = img.getAttribute('data-initials');
    img.replaceWith(s);
  }

  /* ---------- contact card (one <dialog>, shared by every tree on the page) ---------- */
  var dlg = null, current = null;
  function cardEl() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'lt-card';
    dlg.setAttribute('aria-labelledby', 'lt-card-name');
    document.body.appendChild(dlg);
    dlg.addEventListener('error', swapBroken, true);
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('.lt-card__x')) { dlg.close(); return; } // backdrop or ×
      var b = e.target.closest('[data-pid]');
      if (b && current) current.open(+b.getAttribute('data-pid'));
    });
    dlg.addEventListener('close', function () { if (current) current.closed(); });
    return dlg;
  }
  function linkedinHref(u) { u = txt(u); return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, ''); }
  function linkedinText(u) { return txt(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, ''); }

  function cardHTML(e, team, ids) {
    var p = e.p, links = [];
    if (txt(p.email)) links.push(['Email', 'mailto:' + txt(p.email), txt(p.email), false]);
    if (txt(p.phone)) links.push(['Phone', 'tel:' + p.phone.replace(/[^\d+]/g, ''), txt(p.phone), false]);
    if (txt(p.linkedin)) links.push(['LinkedIn', linkedinHref(p.linkedin), linkedinText(p.linkedin), true]);
    var chips = function (label, people) {
      if (!people || !people.length) return '';
      return '<div class="lt-card__rel"><b>' + label + '</b><span>' + people.map(function (q) {
        return '<button type="button" class="lt-card__chip" data-pid="' + ids.get(q) + '"' + (txt(q.title) ? ' title="' + esc(txt(q.title)) + '"' : '') + '>' + nameHTML(q) + '</button>';
      }).join('') + '</span></div>';
    };
    return '<div class="lt-card__in">' +
      '<button type="button" class="lt-card__x" aria-label="Close">&times;</button>' +
      photoHTML(p, 'lt-card__ph') +
      '<div class="lt-card__head"><p class="lt-card__team">' + (esc(txt(team.name)) || 'Team') + '</p>' +
        '<h3 class="lt-card__name" id="lt-card-name">' + nameHTML(p) + '</h3>' +
        (txt(p.title) ? '<p class="lt-card__title">' + esc(txt(p.title)) + '</p>' : '') + '</div>' +
      '<div class="lt-card__more">' +
        (links.length ? '<ul class="lt-card__links">' + links.map(function (l) {
          return '<li><span>' + l[0] + '</span><a href="' + esc(l[1]) + '"' + (l[3] ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[2]) + '</a></li>';
        }).join('') + '</ul>' : '<p class="lt-card__none">No contact info yet.</p>') +
        chips('Reports to', e.parent ? [e.parent] : []) +
        chips('Leads', p.leads) +
        chips('Members', p.members) +
      '</div></div>';
  }

  /* ---------- mount ----------
     getData() returns the data to draw (the editor passes its live copy).
     opts.onOpen(id, entry) runs when someone's card opens.
     Returns { render, highlight(id), open(id) }. */
  function mount(el, getData, opts) {
    opts = opts || {};
    var entries = [], ids = new Map(), shown = null, hi = null, lastW = 0, self;
    el.classList.add('lt');
    el.addEventListener('error', swapBroken, true);

    function render() {
      var data = getData();
      entries = walk(data);
      ids = new Map();
      entries.forEach(function (e) { ids.set(e.p, e.id); });
      el.innerHTML = data.teams.map(function (t, i) { return treeHTML(t, i, ids); }).join('');
      fit(true);
      highlight(hi);
    }

    // side by side if every column gets at least MIN_COL; otherwise stack, and list any tree that still doesn't fit
    function fit(force) {
      var W = el.clientWidth, trees = el.querySelectorAll('.lt__tree');
      if (!W || !trees.length || (W === lastW && !force)) return;
      lastW = W;
      var cs = getComputedStyle(trees[0]);
      var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      var gap = parseFloat(getComputedStyle(el).columnGap) || 0, weight = 0;
      trees.forEach(function (t) { weight += Math.max(2, +t.getAttribute('data-cols')); });
      var side = (W - gap * (trees.length - 1) - pad * trees.length) / weight >= MIN_COL;
      el.classList.toggle('is-stacked', !side);
      trees.forEach(function (t) { t.classList.toggle('is-list', !side && (W - pad) / +t.getAttribute('data-cols') < MIN_COL); });
    }
    if (window.ResizeObserver) new ResizeObserver(function () { fit(false); }).observe(el);
    else window.addEventListener('resize', function () { fit(false); });

    function highlight(id) {
      hi = id == null ? null : id;
      el.querySelectorAll('.is-editing').forEach(function (b) { b.classList.remove('is-editing'); });
      var b = hi == null ? null : el.querySelector('[data-pid="' + hi + '"]');
      if (b) b.classList.add('is-editing');
    }

    function open(id) {
      var e = entries[id];
      if (!e) return;
      var d = cardEl();
      current = self; shown = id;
      d.innerHTML = cardHTML(e, getData().teams[e.team], ids);
      if (!d.open) d.showModal();
      else d.querySelector('.lt-card__x').focus(); // moved to someone else from inside the card
      if (opts.onOpen) opts.onOpen(id, e);
    }
    // when the card closes, focus whoever it was showing
    function closed() {
      var b = shown == null ? null : el.querySelector('[data-pid="' + shown + '"]');
      if (b) b.focus();
    }

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pid]');
      if (b && el.contains(b)) open(+b.getAttribute('data-pid'));
    });

    self = { render: render, highlight: highlight, open: open, closed: closed };
    return self;
  }

  // pages like halo.html: <div class="lt" data-source="#halo-leadership-data"></div>
  function auto() {
    document.querySelectorAll('.lt[data-source]').forEach(function (el) {
      var src = document.querySelector(el.getAttribute('data-source'));
      if (!src) return;
      var data = read(src);
      mount(el, function () { return data; }).render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();

  window.HaloLeadership = { person: person, clean: clean, read: read, walk: walk, cols: cols, mount: mount, toJSON: toJSON, toHTML: toHTML };
})();
