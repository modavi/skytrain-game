// The map: TransLink's artwork with the game drawn on top. It can sit inside a game screen (mount)
// or fill the screen (open). Drag to pan, pinch or wheel to zoom.
(function () {
  const M = SkytrainMap;
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pathD = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');

  function stampsMarkup(state) {
    return (state ? state.stamps : []).map((n) => {
      const { x, y } = M.pos(n), big = M.INTERCHANGES.includes(n);
      return `<circle cx="${x}" cy="${y}" r="${big ? 9 : 7.5}" fill="rgba(242,177,0,.25)" stroke="#f2b100" stroke-width="2.4"/>`;
    }).join('');
  }

  // The ways you can go: a coloured arrow along the track, ending in a numbered badge.
  // options: [{ path: [station, ...], color, badge }]
  function optionsMarkup(options) {
    return (options || []).map((o) => {
      const pts = M.routePoints(o.path);
      const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1];
      const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const b = M.pos(o.path[1]);
      return `<path d="${pathD(pts)}" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
        <path d="${pathD(pts)}" fill="none" stroke="${o.color}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M-5 -5 L6 0 L-5 5 Z" transform="translate(${x2} ${y2}) rotate(${ang})" fill="${o.color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
        <g transform="translate(${b.x} ${b.y})"><circle r="7.5" fill="${o.color}" stroke="#fff" stroke-width="1.8"/><text y="3.4" text-anchor="middle" class="mbadge">${esc(o.badge)}</text></g>`;
    }).join('');
  }

  function buildSvg(cfg) {
    const route = cfg.route && cfg.route.length > 1
      ? `<path d="${pathD(M.routePoints(cfg.route))}" fill="none" stroke="#ff7a1a" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>` : '';
    const V = M.VIEW;
    return `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" class="mapsvg" viewBox="${V.x} ${V.y} ${V.w} ${V.h}" role="img" aria-label="TransLink SkyTrain network map" style="touch-action:none">
      <g id="m-art">${window.SkytrainMapArt || ''}</g>${route}${stampsMarkup(cfg.state)}${optionsMarkup(cfg.options)}<g id="m-train"></g></svg>`;
  }

  // ---- put a map into any box. Returns the camera controls.
  function mount(host, cfg) {
    host.innerHTML = buildSvg(cfg);
    const svg = host.querySelector('svg'), train = host.querySelector('#m-train');
    if (!window.SkytrainMapArt) window.addEventListener('load', () => { host.querySelector('#m-art').innerHTML = window.SkytrainMapArt || ''; }, { once: true });

    let vb = { ...M.VIEW }, moved = null;       // moved: called when the player drags or zooms themselves
    const MIN_W = 70;
    const aspect = () => { const r = svg.getBoundingClientRect(); return r.height / (r.width || 1) || 1; };
    const apply = () => {   // keep the camera on the map
      const X = M.VIEW, pad = 12;
      vb.x = vb.w >= X.w + 2 * pad ? X.x + X.w / 2 - vb.w / 2 : Math.max(X.x - pad, Math.min(vb.x, X.x + X.w + pad - vb.w));
      vb.y = vb.h >= X.h + 2 * pad ? X.y + X.h / 2 - vb.h / 2 : Math.max(X.y - pad, Math.min(vb.y, X.y + X.h + pad - vb.h));
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    };
    function setView(cx, cy, w) {
      w = Math.max(MIN_W, Math.min(w, M.VIEW.w));
      const h = w * aspect();
      vb = { x: cx - w / 2, y: cy - h / 2, w, h };
      apply();
    }
    const centre = () => ({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
    const focus = (name, w) => { const p = M.pos(name); setView(p.x, p.y, w); };
    function fitAll() {
      const w = Math.max(M.VIEW.w, M.VIEW.h / aspect());
      setView(M.VIEW.x + M.VIEW.w / 2, M.VIEW.y + M.VIEW.h / 2, w);
      vb.w = w; vb.h = w * aspect(); apply();
    }
    function fitPoints(pts, pad = 26) {   // as close as it can be while showing every point
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), a = aspect();
      setView((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0 + 2 * pad, (y1 - y0 + 2 * pad) / a, 100));
    }
    const trainAt = (x, y) => { train.innerHTML = `<g transform="translate(${x} ${y})"><circle r="8" class="pulse"/><text y="-9" text-anchor="middle" class="mtrain">🚆</text></g>`; };

    const pts = new Map(); let lastDist = 0;
    const toMap = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: vb.x + (cx - r.left) / r.width * vb.w, y: vb.y + (cy - r.top) / r.height * vb.h }; };
    function zoomAt(cx, cy, factor) {
      const before = toMap(cx, cy);
      const w = Math.max(MIN_W, Math.min(vb.w * factor, M.VIEW.w * 1.3)), h = w * aspect();
      const r = svg.getBoundingClientRect();
      vb = { x: before.x - (cx - r.left) / r.width * w, y: before.y - (cy - r.top) / r.height * h, w, h };
      apply();
    }
    function zoomBy(factor) { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor); }
    const touched = () => { if (moved) moved(); };
    svg.addEventListener('pointerdown', (e) => { touched(); svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastDist = 0; });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = svg.getBoundingClientRect();
      if (pts.size === 1) { vb.x -= (e.clientX - prev.x) / r.width * vb.w; vb.y -= (e.clientY - prev.y) / r.height * vb.h; apply(); }
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, lastDist / d);
        lastDist = d;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); lastDist = 0; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); touched(); zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });

    return { svg, setView, centre, focus, fitAll, fitPoints, trainAt, zoomBy, getView: () => vb, onMoved: (fn) => { moved = fn; } };
  }

  // Show the ways you can go inside a game screen, framed to fit them all. Re-frames if the box resizes.
  function mountChoices(host, state, options) {
    const cam = mount(host, { state, route: null, options });
    const frame = () => cam.fitPoints([[M.pos(state.pos).x, M.pos(state.pos).y]].concat(...options.map((o) => M.routePoints(o.path))));
    let framed = true;
    cam.onMoved(() => { framed = false; });
    cam.trainAt(M.pos(state.pos).x, M.pos(state.pos).y);
    requestAnimationFrame(frame);
    if (window.ResizeObserver) new ResizeObserver(() => { if (framed) frame(); }).observe(host);
    return cam;
  }

  // ---- the full-screen map
  // mode 'view': where the train is.  'ride': the train travels the last move.  'choices': the ways you can go.
  function open(opts) {
    const state = opts.state;
    const ride = opts.mode === 'ride' && state.lastMove && state.lastMove.path.length > 1;
    const choices = opts.mode === 'choices' ? opts.options : null;
    const here = state.pos;
    const ov = document.createElement('div');
    ov.className = 'mapov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Map');
    ov.innerHTML = `<div class="maptop"><b class="maptitle">${choices ? 'Which way?' : '🗺 Map'}</b><div class="mapbtns">
        <button class="alt small" data-m="in" aria-label="Zoom in">＋</button><button class="alt small" data-m="out" aria-label="Zoom out">－</button>
        <button class="alt small" data-m="me" aria-label="${choices ? 'Show the ways' : 'Find the train'}">📍</button><button class="alt small" data-m="all" aria-label="Show the whole map">⤢</button>
        <button class="alt small" data-m="close" aria-label="Close the map">✕</button></div></div>
      <div class="mapbody"></div><div class="mapfoot" id="mapfoot"></div><div class="credit">Map: © TransLink. Used with permission.</div>`;
    document.body.appendChild(ov);
    const foot = ov.querySelector('#mapfoot');
    const prevFocus = document.activeElement;
    const cam = mount(ov.querySelector('.mapbody'), { state, route: choices ? null : (state.lastMove && state.lastMove.path), options: choices });
    const hereP = M.pos(here); cam.trainAt(hereP.x, hereP.y);

    let follow = false, rideToken = 0;
    cam.onMoved(() => { follow = false; });
    function say(html) { foot.innerHTML = html; }
    function showChoices() {
      cam.fitPoints([[hereP.x, hereP.y]].concat(...choices.map((o) => M.routePoints(o.path))));
    }
    function finish() {
      say(`<div class="dest"><b>Arrived!</b> <h3>${esc(here)}</h3></div><button data-m="deck">Go to the deck →</button>`);
      foot.querySelector('[data-m="deck"]').addEventListener('click', () => { close(); if (opts.onDone) opts.onDone(); });
    }
    function skipRide() { rideToken++; follow = false; cam.trainAt(hereP.x, hereP.y); cam.focus(here, 150); finish(); }
    function runRide() {
      const path = state.lastMove.path, token = ++rideToken;
      follow = true; cam.focus(path[0], 150); const s0 = M.pos(path[0]); cam.trainAt(s0.x, s0.y);
      say(`<div class="dest"><span class="muted">Leaving</span> <h3>${esc(path[0])}</h3></div><button class="alt" data-m="skip">Skip the ride</button>`);
      foot.querySelector('[data-m="skip"]').addEventListener('click', skipRide);
      if (reduced()) { skipRide(); return; }
      let i = 0;
      const hop = () => {
        if (token !== rideToken) return;
        if (i >= path.length - 1) { finish(); return; }
        const to = path[i + 1], geo = M.edgePoints(path[i], to);
        const lens = []; let total = 0;
        for (let k = 1; k < geo.length; k++) { const l = Math.hypot(geo[k][0] - geo[k - 1][0], geo[k][1] - geo[k - 1][1]); lens.push(l); total += l; }
        const dur = Math.max(550, total * 22), t0 = performance.now();
        say(`<div class="dest"><span class="muted">Stop ${i + 1} of ${path.length - 1}</span> <h3>${esc(to)}</h3></div><button class="alt" data-m="skip">Skip the ride</button>`);
        foot.querySelector('[data-m="skip"]').addEventListener('click', skipRide);
        (function step(now) {
          if (token !== rideToken) return;
          const p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          let d = e * total, k = 0;
          while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
          const f = lens[k] ? d / lens[k] : 1, x = geo[k][0] + (geo[k + 1][0] - geo[k][0]) * f, y = geo[k][1] + (geo[k + 1][1] - geo[k][1]) * f;
          cam.trainAt(x, y);
          if (follow) { const c = cam.centre(); cam.setView(c.x + (x - c.x) * 0.18, c.y + (y - c.y) * 0.18, cam.getView().w); }
          if (p < 1) return requestAnimationFrame(step);
          i++; setTimeout(hop, 350);
        })(t0);
      };
      setTimeout(hop, 700);
    }

    function close() { rideToken++; follow = false; ov.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); }
    function onKey(e) { if (e.key === 'Escape') { close(); if (opts.mode === 'ride' && opts.onDone) opts.onDone(); } }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const m = b.dataset.m;
      if (m === 'in') { follow = false; cam.zoomBy(1 / 1.5); }
      else if (m === 'out') { follow = false; cam.zoomBy(1.5); }
      else if (m === 'me') { follow = false; if (choices) showChoices(); else cam.focus(here, 150); }
      else if (m === 'all') { follow = false; cam.fitAll(); }
      else if (m === 'close' || m === 'back') { close(); if (opts.mode === 'ride' && opts.onDone) opts.onDone(); }
    });

    requestAnimationFrame(() => {
      if (ride) { runRide(); return; }
      if (choices) {
        showChoices();
        say(`<ul class="map">${choices.map((o) => `<li><span class="dot" style="background:${o.color}">${esc(o.badge)}</span> ${o.text}</li>`).join('')}</ul><button data-m="back">Back to the game</button>`);
        return;
      }
      cam.focus(here, 150);
      const route = state.lastMove && state.lastMove.path.length > 1 ? `Last ride: ${esc(state.lastMove.path[0])} → ${esc(state.lastMove.path[state.lastMove.path.length - 1])}. ` : '';
      say(`<p class="muted">${route}📍 You are at <b>${esc(here)}</b>. Gold rings are stations you have stamped.</p>`);
    });
    ov.querySelector('[data-m="close"]').focus();
    return { close };
  }

  window.SkytrainMapView = { open, mount, mountChoices };
})();
