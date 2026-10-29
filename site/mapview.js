// The map screen: drag to pan, pinch or buttons to zoom, and an animated train ride.
(function () {
  const M = SkytrainMap, D = SkytrainData;
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

  function buildSvg(state, routePath) {
    const route = routePath && routePath.length > 1
      ? `<path d="${pathD(M.routePoints(routePath))}" fill="none" stroke="#ff7a1a" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>` : '';
    const V = M.VIEW;
    return `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" class="mapsvg" viewBox="${V.x} ${V.y} ${V.w} ${V.h}" role="img" aria-label="TransLink SkyTrain network map" style="touch-action:none">
      <g id="m-art">${window.SkytrainMapArt || ''}</g>${route}${stampsMarkup(state)}<g id="m-train"></g></svg>`;
  }

  function open(opts) {
    const state = opts.state;
    const ride = opts.mode === 'ride' && state.lastMove && state.lastMove.path.length > 1;
    const here = state.pos;
    const ov = document.createElement('div');
    ov.className = 'mapov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Map');
    ov.innerHTML = `<div class="maptop"><b>🗺 Map</b><div class="mapbtns">
        <button class="alt small" data-m="in" aria-label="Zoom in">＋</button><button class="alt small" data-m="out" aria-label="Zoom out">－</button>
        <button class="alt small" data-m="me" aria-label="Find the train">📍</button><button class="alt small" data-m="all" aria-label="Show the whole map">⤢</button>
        <button class="alt small" data-m="close" aria-label="Close the map">✕</button></div></div>
      <div class="mapbody">${buildSvg(state, state.lastMove && state.lastMove.path)}</div>
      <div class="mapfoot" id="mapfoot"></div><div class="credit">Map: © TransLink. Used with permission.</div>`;
    document.body.appendChild(ov);
    const svg = ov.querySelector('svg'), foot = ov.querySelector('#mapfoot'), train = ov.querySelector('#m-train');
    const prevFocus = document.activeElement;

    // ---- camera: the viewBox, kept inside the map and in a sensible zoom range
    let vb = { ...M.VIEW };
    const MIN_W = 70;
    const aspect = () => { const r = svg.getBoundingClientRect(); return r.height / (r.width || 1); };
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
    const fitAll = () => {   // whole map, as large as fits
      const a = aspect(), w = Math.max(M.VIEW.w, M.VIEW.h / a);
      setView(M.VIEW.x + M.VIEW.w / 2, M.VIEW.y + M.VIEW.h / 2, w);
      vb.w = w; apply();
    };

    // ---- the train marker
    const trainAt = (x, y) => { train.innerHTML = `<g transform="translate(${x} ${y})"><circle r="8" class="pulse"/><text y="-9" text-anchor="middle" class="mtrain">🚆</text></g>`; };
    const hereP = M.pos(here); trainAt(hereP.x, hereP.y);

    // ---- drag, pinch, wheel
    const pts = new Map(); let lastDist = 0;
    const toMap = (clientX, clientY) => { const r = svg.getBoundingClientRect(); return { x: vb.x + (clientX - r.left) / r.width * vb.w, y: vb.y + (clientY - r.top) / r.height * vb.h }; };
    function zoomAt(clientX, clientY, factor) {
      const before = toMap(clientX, clientY);
      const w = Math.max(MIN_W, Math.min(vb.w * factor, M.VIEW.w * 1.3)), h = w * aspect();
      const r = svg.getBoundingClientRect();
      vb = { x: before.x - (clientX - r.left) / r.width * w, y: before.y - (clientY - r.top) / r.height * h, w, h };
      apply();
    }
    svg.addEventListener('pointerdown', (e) => { stopFollow(); svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastDist = 0; });
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
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });

    // ---- the ride
    let follow = false, rideToken = 0;
    function stopFollow() { follow = false; }
    function say(html) { foot.innerHTML = html; }
    function finish() {
      const done = () => { close(); if (opts.onDone) opts.onDone(); };
      say(`<div class="dest"><b>Arrived!</b> <h3>${esc(here)}</h3></div><button data-m="deck">Go to the deck →</button>`);
      foot.querySelector('[data-m="deck"]').addEventListener('click', done);
    }
    function runRide() {
      const path = state.lastMove.path, token = ++rideToken;
      const startName = path[0];
      follow = true; focus(startName, 150); const s0 = M.pos(startName); trainAt(s0.x, s0.y);
      say(`<div class="dest"><span class="muted">Leaving</span> <h3>${esc(startName)}</h3></div><button class="alt" data-m="skip">Skip the ride</button>`);
      foot.querySelector('[data-m="skip"]').addEventListener('click', () => { rideToken++; follow = false; const p = M.pos(here); trainAt(p.x, p.y); focus(here, 150); finish(); });
      if (reduced()) { rideToken++; const p = M.pos(here); trainAt(p.x, p.y); focus(here, 150); finish(); return; }

      let i = 0;                       // index of the station we are heading to
      const hop = () => {
        if (token !== rideToken) return;
        if (i >= path.length - 1) { finish(); return; }
        const from = path[i], to = path[i + 1], geo = M.edgePoints(from, to);
        const lens = []; let total = 0;
        for (let k = 1; k < geo.length; k++) { const l = Math.hypot(geo[k][0] - geo[k - 1][0], geo[k][1] - geo[k - 1][1]); lens.push(l); total += l; }
        const dur = Math.max(550, total * 22), t0 = performance.now();
        say(`<div class="dest"><span class="muted">Stop ${i + 1} of ${path.length - 1}</span> <h3>${esc(to)}</h3></div><button class="alt" data-m="skip">Skip the ride</button>`);
        foot.querySelector('[data-m="skip"]').addEventListener('click', () => { rideToken++; follow = false; const p = M.pos(here); trainAt(p.x, p.y); focus(here, 150); finish(); });
        (function step(now) {
          if (token !== rideToken) return;
          const p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // ease in and out
          let d = e * total, k = 0;
          while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
          const f = lens[k] ? d / lens[k] : 1, x = geo[k][0] + (geo[k + 1][0] - geo[k][0]) * f, y = geo[k][1] + (geo[k + 1][1] - geo[k][1]) * f;
          trainAt(x, y);
          if (follow) { const c = centre(), cx = c.x + (x - c.x) * 0.18, cy = c.y + (y - c.y) * 0.18; setView(cx, cy, vb.w); }
          if (p < 1) return requestAnimationFrame(step);
          i++; setTimeout(hop, 350);
        })(t0);
      };
      setTimeout(hop, 700);
    }

    // ---- buttons, keyboard, closing
    function close() { rideToken++; follow = false; ov.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); }
    function onKey(e) { if (e.key === 'Escape') { close(); if (opts.mode === 'ride' && opts.onDone) opts.onDone(); } }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const m = b.dataset.m, r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (m === 'in') { stopFollow(); zoomAt(cx, cy, 1 / 1.5); }
      else if (m === 'out') { stopFollow(); zoomAt(cx, cy, 1.5); }
      else if (m === 'me') { stopFollow(); focus(here, 150); }
      else if (m === 'all') { stopFollow(); fitAll(); }
      else if (m === 'close') { close(); if (opts.mode === 'ride' && opts.onDone) opts.onDone(); }
    });

    // ---- start
    requestAnimationFrame(() => {
      if (ride) { runRide(); return; }
      focus(here, 150);
      const route = state.lastMove && state.lastMove.path.length > 1 ? `Last ride: ${esc(state.lastMove.path[0])} → ${esc(state.lastMove.path[state.lastMove.path.length - 1])}. ` : '';
      say(`<p class="muted">${route}📍 You are at <b>${esc(here)}</b>. Gold rings are stations you have stamped.</p>`);
    });
    ov.querySelector('[data-m="close"]').focus();
    return { close };
  }

  window.SkytrainMapView = { open };
})();
