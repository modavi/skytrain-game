(function () {
  const G = SkytrainGame, D = SkytrainData;
  const GAME_KEY = 'skytrain.game.v1', FORM_KEY = 'skytrain.form.v1';
  const app = document.getElementById('app');

  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const chips = (ls) => ls.map((l) => `<span class="chip ${l}" style="background:${D.LINES[l].color}">${D.LINES[l].name}</span>`).join('');
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieFace = (n) => String.fromCharCode(0x267F + n);

  const defaultForm = () => ({ players: ['Player 1', 'Player 2'], mode: 'coop', goal: 5, minutes: 0, fork: 'coin', start: 'Waterfront' });
  const PRESETS = {
    together: { label: 'Together: reach 5 tokens', mode: 'coop', goal: 5, minutes: 0 },
    race: { label: 'Race: first to 5', mode: 'versus', goal: 5, minutes: 0 },
    clock: { label: 'Beat the clock: most tokens in 60 min', mode: 'versus', goal: 0, minutes: 60 },
  };

  let state = load(GAME_KEY);
  let form = Object.assign(defaultForm(), load(FORM_KEY) || {});

  function commit() { save(GAME_KEY, state); render(); }

  // ---------- Setup ----------
  const PRESET_LABELS = { together: 'Together: reach 5 tokens', race: 'Race: first to 5 tokens', clock: 'Beat the clock: 60 minutes' };
  const presetOn = (k) => { const p = PRESETS[k]; return form.mode === p.mode && form.goal === p.goal && form.minutes === p.minutes; };
  const describe = () => `${form.mode === 'coop' ? 'Together' : 'Against each other'} · ${form.goal ? 'goal ' + form.goal + ' tokens' : 'no token goal'} · ${form.minutes ? form.minutes + ' min limit' : 'no time limit'}`;

  function renderSetup() {
    const opts = G.stations.slice().sort().map((s) => `<option ${s === form.start ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `
      <h1>Skytrain 🚆</h1>
      <section class="card stack">
        <div class="stack tight">
          ${form.players.map((p, i) => `<div class="row"><input data-field="name" data-i="${i}" value="${esc(p)}" maxlength="20" aria-label="Player ${i + 1} name">
            ${form.players.length > 1 ? `<button class="bad small" data-act="removePlayer" data-arg="${i}" aria-label="Remove player ${i + 1}">✕</button>` : ''}</div>`).join('')}
          ${form.players.length < 6 ? '<button class="alt small" data-act="addPlayer">+ Add player</button>' : ''}
        </div>
        <div class="stack tight">
          ${Object.keys(PRESETS).map((k) => `<button class="${presetOn(k) ? '' : 'alt'}" data-act="preset" data-arg="${k}" aria-pressed="${presetOn(k)}">${PRESET_LABELS[k]}</button>`).join('')}
        </div>
        <div><span class="muted">At a fork in the track</span>
          <div class="row" style="margin-top:4px"><button class="${form.fork === 'coin' ? '' : 'alt'}" data-act="forkrule" data-arg="coin">🪙 Flip a coin</button><button class="${form.fork === 'choose' ? '' : 'alt'}" data-act="forkrule" data-arg="choose">👆 I choose</button></div></div>
        <details><summary class="muted">More options: ${describe()}</summary>
          <div class="stack tight" style="margin-top:8px">
            <label>How do you play?
              <select data-field="mode">
                <option value="coop" ${form.mode === 'coop' ? 'selected' : ''}>Together (one shared pile of tokens)</option>
                <option value="versus" ${form.mode === 'versus' ? 'selected' : ''}>Against each other (own tokens)</option>
              </select></label>
            <label>Token goal <span class="hint">0 means no goal</span>
              <input type="number" min="0" max="50" data-field="goal" value="${form.goal}"></label>
            <label>Time limit in minutes <span class="hint">0 means no limit; when time is up, most tokens wins</span>
              <input type="number" min="0" max="600" data-field="minutes" value="${form.minutes}"></label>
            <label>Start at
              <select data-field="start">${opts}</select></label>
          </div></details>
        <button data-act="start">Start the game</button>
      </section>`;
  }

  // ---------- Game ----------
  function topbar(s) {
    const { players, mode, goal } = s.settings, g = goal ? '/' + goal : '';
    const scores = mode === 'coop'
      ? `<div class="pl on"><span>Team</span><b>${G.total(s)}${g}</b></div>`
      : players.map((p, i) => `<div class="pl ${i === s.player && s.phase !== 'over' ? 'on' : ''}"><span>${esc(p)}</span><b>${s.tokens[i]}${g}</b></div>`).join('');
    const clockChip = s.endsAt && s.phase !== 'over' ? '<div class="pl"><span>⏱</span><b class="clock" id="game-clock"></b></div>' : '';
    const stamps = s.stamps.length ? `<div class="pl" title="Stations stamped"><span>🚉</span><b>${s.stamps.length}</b></div>` : '';
    return `<div class="topbar"><div class="scores">${scores}${stamps}${clockChip}</div><button class="alt small" data-act="newGame" aria-label="End game">✕</button></div>`;
  }

  const where = (s) => `<div class="where">📍 <b>${esc(s.pos)}</b> ${chips(G.lines[s.pos])}</div>`;
  const stops = (n) => `${n} stop${n === 1 ? '' : 's'}`;
  const lineButtons = (s, opts, act, label) => `<div class="choices ${opts.length > 2 ? 'two' : ''}">${opts.map((o, i) => `<button class="alt" data-act="${act}" data-arg="${esc(o)}">${label ? label(i) : ''}${esc(o)}<br>${chips(G.linesBetween(s.pos, o))}</button>`).join('')}</div>`;

  const deckCount = (s) => {
    const n = s.draw.length;
    return n ? `${n} card${n === 1 ? '' : 's'} in the deck. Tap the deck or press Draw.` : 'The deck is empty, so the used cards will be shuffled back in.';
  };

  function cardFront(c, s) {
    return `<div class="cf-top">Challenge</div>
      <h3 class="cf-title">${esc(c.title)}</h3>
      <p class="cf-text">${esc(c.text)}</p>
      <div class="cf-foot">${c.minutes ? `<span class="cf-time">⏱ ${c.minutes} min</span>` : '<span class="cf-time">No timer</span>'}<span class="cf-at">${esc(s.pos)}</span></div>`;
  }

  // The deck lying on the table (arrived) or the card already turned over (challenge).
  function renderCardStage(s) {
    const c = s.card ? G.cardById(s.card) : null;
    const layers = Math.max(1, Math.min(s.draw.length, 10));
    const deck = c ? '' : `<div class="deckshadow"></div>
      <div class="deck3d" id="deck3d" data-act="draw" role="button" tabindex="0" aria-label="Deck of challenge cards. Tap to draw the top card.">
        ${Array.from({ length: layers }, (_, i) => `<div class="dcard cback" style="transform:translateZ(${(i * 1.8).toFixed(1)}px)">${i === layers - 1 ? '<span class="cb-icon">🚆</span>' : ''}</div>`).join('')}
      </div>`;
    return `<div class="viz" data-design="380"><div class="cardstage" id="cardstage">${deck}
      <div class="flipper ${c ? 'revealed' : ''}" id="flipper"><div class="cface cback"><span class="cb-icon big">🚆</span></div><div class="cface cfront" id="cfront">${c ? cardFront(c, s) : ''}</div></div></div></div>`;
  }

  function challengeControls(s) {
    const c = G.cardById(s.card);
    const timer = c.minutes
      ? (s.timerEndsAt ? '<p class="clock bigclock" id="chal-clock"></p>'
        : `<button class="alt" data-act="startTimer">Start ${c.minutes}-minute timer</button>`)
      : '';
    return `${timer}${s.timeUp ? '<p><b>Time is up!</b> Finish this challenge and the game ends.</p>' : ''}
      <div class="row"><button class="ok" data-act="done">We did it! +1 token</button><button class="bad" data-act="skip">Skip</button></div>`;
  }

  const WHEEL = ['#d9482b', '#e0a100', '#1f9d55', '#3a74c9'];

  function renderDirection(s, name) {
    const opts = G.forkOptions(s);
    const head = `<header><h2>${name}, which way?</h2>${where(s)}</header>`;
    const way = (o) => `${esc(o)} ${chips(G.linesBetween(s.pos, o))}`;
    if (s.settings.fork !== 'coin') return head + lineButtons(s, opts, 'heading');
    if (opts.length === 2) {
      const table = opts.map((o, i) => `<li><b>${i === 0 ? 'Heads 🍁' : 'Tails 🚆'}</b> → ${way(o)}</li>`).join('');
      return head + `<ul class="map">${table}</ul>
        <div class="viz" data-design="310"><div class="stage"><div class="shadow" id="shadow"></div>
          <div class="coin-wrap" id="coin-wrap"><div class="cam"><div class="coin" id="coin" role="button" tabindex="0" aria-label="Coin. Press and hold to shake it, let go to flip it.">
            ${[-2, -1, 0, 1, 2].map((z) => `<div class="edge" style="transform:translateZ(${z}px)"></div>`).join('')}
            <div class="side heads">🍁</div><div class="side tails">🚆</div></div></div></div></div></div>
        <footer class="sf" id="coinresult" aria-live="polite"><p class="muted hint" id="hint">Press and hold the coin, then let go to flip it.</p>
          <details id="physical"><summary class="muted">Flipped a real coin instead?</summary>
            <div class="row" style="margin-top:6px"><button class="alt" data-act="physicalCoin" data-arg="1">Heads 🍁</button><button class="alt" data-act="physicalCoin" data-arg="0">Tails 🚆</button></div></details></footer>`;
    }
    // three or four ways: a wheel with one equal, numbered, coloured slice per way
    const n = opts.length, S = 360 / n;
    const grad = opts.map((_, i) => `${WHEEL[i]} ${i * S}deg ${(i + 1) * S}deg`).join(', ');
    const labels = opts.map((_, i) => `<span class="lab" style="transform:rotate(${(i + 0.5) * S}deg) translateY(-78px) rotate(${-(i + 0.5) * S}deg)">${i + 1}</span>`).join('');
    const table = opts.map((o, i) => `<li><span class="dot" style="background:${WHEEL[i]}">${i + 1}</span> ${way(o)}</li>`).join('');
    return head + `<ul class="map two">${table}</ul>
      <div class="viz" data-design="290"><div class="wheelbox" id="wheelbox"><div class="pointer"></div>
        <div class="wheel" id="wheel" role="button" tabindex="0" aria-label="Wheel. Press and hold to wind it up, let go to spin." style="background:conic-gradient(${grad})">${labels}<span class="hub"></span></div></div></div>
      <footer class="sf" id="coinresult" aria-live="polite"><p class="muted hint" id="hint">Press and hold the wheel, then let go to spin it.</p>
        <details id="physical"><summary class="muted">Chose another way, or used a real spinner?</summary>
          <div class="stack tight" style="margin-top:6px">${opts.map((o, i) => `<button class="alt" data-act="heading" data-arg="${esc(o)}">${i + 1}. ${esc(o)}</button>`).join('')}</div></details></footer>`;
  }

  function renderGame(s) {
    const name = esc(s.settings.players[s.player]);
    let body = '';
    if (s.phase === 'roll' && G.needsDirection(s)) {
      body = renderDirection(s, name);
    } else if (s.phase === 'roll') {
      const face = (n) => `<div class="face f${n}" data-n="${n}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => `<i class="${PIPS[n].includes(c) ? 'pip' : ''}"></i>`).join('')}</div>`;
      const next = s.heading || G.forkOptions(s)[0];
      body = `<header><h2>${name}, roll the die!</h2>${where(s)}<div class="where">➡️ Heading toward <b>${esc(next)}</b></div></header>
        <div class="viz" data-design="310"><div class="stage"><div class="shadow" id="shadow"></div>
          <div class="die-wrap" id="die-wrap"><div class="cam"><div class="die" id="die" role="button" tabindex="0" aria-label="Die. Press and hold to shake it, let go to throw it.">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div></div></div></div></div>
        <footer class="sf tall">
          <p class="muted hint" id="hint">Press and hold the die, then let go to throw it.</p>
          <details id="physical"><summary class="muted">Rolled a real die instead?</summary>
            <div class="dice">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="alt" data-act="physical" data-arg="${n}" aria-label="${n}">${dieFace(n)}</button>`).join('')}</div></details>
          <div id="rollnum" class="rollnum" aria-live="polite"></div>
          <div id="outcome" class="stack tight"></div></footer>`;
    } else if (s.phase === 'fork') {
      body = `<header><h2>Fork at ${esc(s.pos)}!</h2><div class="where">${name} picks the way. ${stops(s.remaining)} left.</div></header>${lineButtons(s, s.forkOptions, 'fork')}`;
    } else if (s.phase === 'arrived') {
      body = `<header><h2>You arrived at ${esc(s.pos)}!</h2><div class="where">${chips(G.lines[s.pos])}</div></header>
        ${renderCardStage(s)}
        <footer class="sf mid" id="challenge-controls"><p class="muted hint" id="deckhint">${deckCount(s)}</p>
          <div class="row"><button class="alt" data-act="shuffle" id="shuffle-btn">🔀 Shuffle</button><button data-act="draw" id="draw-btn">Draw a card</button></div></footer>`;
    } else if (s.phase === 'challenge') {
      body = `<header><h2>${name}'s challenge</h2>${where(s)}</header>${renderCardStage(s)}<footer class="sf mid" id="challenge-controls">${challengeControls(s)}</footer>`;
    } else if (s.phase === 'over') {
      const r = s.result;
      const msg = r.mode === 'coop'
        ? (r.won ? `🎉 You did it together with ${r.score} tokens!` : `Time is up. Your team collected ${r.score} token${r.score === 1 ? '' : 's'}.`)
        : (r.winners.length === 1 ? `🎉 ${esc(r.winners[0])} wins with ${r.score} token${r.score === 1 ? '' : 's'}!` : `It is a tie between ${r.winners.map(esc).join(' and ')} (${r.score} each).`);
      body = `<header><h2>Game over</h2></header><div class="overmsg"><p>${msg}</p><p class="muted">${s.stamps.length} station${s.stamps.length === 1 ? '' : 's'} stamped</p></div><button data-act="newGame">Play again</button>`;
    }
    return `${topbar(s)}<section class="card screen">${body}</section>`;
  }

  // Scale each 3D area so it fits the room left on the screen.
  let resizer = null;
  function fit() {
    document.querySelectorAll('.viz').forEach((v) => {
      const k = Math.max(0.45, Math.min(1, v.clientHeight / (+v.dataset.design || 300)));
      v.style.setProperty('--k', k.toFixed(3));
    });
  }
  window.addEventListener('resize', fit);

  function render() {
    dieToken++;
    app.className = state ? 'game' : 'setup';
    app.innerHTML = state ? renderGame(state) : renderSetup();
    fit();
    if (window.ResizeObserver) {
      if (resizer) resizer.disconnect();
      resizer = new ResizeObserver(fit);
      document.querySelectorAll('.viz').forEach((v) => resizer.observe(v));
    }
    if (state && state.phase === 'roll') (G.needsDirection(state) ? (G.forkOptions(state).length === 2 ? setupCoin : setupWheel) : setupDie)();
    tick();
  }

  function tick() {
    if (!state) return;
    const before = state.phase;
    G.checkTime(state);
    if (state.phase !== before) { save(GAME_KEY, state); return render(); }
    const g = document.getElementById('game-clock');
    if (g && state.endsAt) g.textContent = state.timeUp ? "Time's up!" : clock(state.endsAt - Date.now());
    const c = document.getElementById('chal-clock');
    if (c && state.timerEndsAt) { const left = state.timerEndsAt - Date.now(); c.textContent = left > 0 ? clock(left) : "Time's up!"; }
  }
  setInterval(tick, 1000);


  // ---------- Throwing things: the die and the coin ----------
  // Rotation (x, y, z) that puts each face of the die on top, pointing at the ceiling.
  const FACE_ROT = { 1: [90, 0, 0], 2: [0, 0, -90], 3: [0, 0, 0], 4: [180, 0, 0], 5: [0, 0, 90], 6: [-90, 0, 0] };
  const COIN_ROT = { heads: [90, 0, 0], tails: [-90, 0, 0] };
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dieToken = 0; // bumped on every screen draw so old animations stop themselves

  function showOutcome() {
    const box = document.getElementById('outcome');
    if (!box || !state) return;
    const s = state;
    if (s.phase === 'fork') {
      box.innerHTML = `<div class="where"><b>Fork at ${esc(s.pos)}!</b> ${esc(s.settings.players[s.player])} picks the way. ${stops(s.remaining)} left.</div>${lineButtons(s, s.forkOptions, 'fork')}`;
    } else {
      box.innerHTML = `<div class="dest"><span class="muted">Riding to</span> <h3>${esc(s.pos)}</h3> ${chips(G.lines[s.pos])}</div><button data-act="toDeck">Go to the deck →</button>`;
    }
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  }

  // Press and hold to spin, let go to throw it up, watch it land.
  // cfg: el, wrap (element ids), pose (start rotation), spin (spin weights per axis), minSpin (degrees of tumbling),
  //      height, release() -> { result, angles } (decide and save the result), settled(result, api)
  function throwable(cfg) {
    const el = document.getElementById(cfg.el);
    if (!el) return null;
    const wrap = document.getElementById(cfg.wrap), shadow = document.getElementById('shadow'), hint = document.getElementById('hint');
    const token = dieToken, calm = reduced();
    const live = () => token === dieToken && el.isConnected;
    let mode = 'idle', raf = 0, holdStart = 0, last = 0;
    let [rx, ry, rz] = cfg.pose;

    function draw(h, scale) {
      wrap.style.transform = `translateY(${-h}px) scale(${scale})`;
      el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      const f = Math.max(0, 1 - h / 260);
      shadow.style.transform = `translateX(-50%) scale(${0.45 + 0.55 * f})`;
      shadow.style.opacity = 0.15 + 0.35 * f;
    }
    draw(0, 1);

    function hold(t) {
      if (!live() || mode !== 'hold') return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const speed = 300 + 700 * Math.min(1, (t - holdStart) / 1500);
      if (!calm) { rx += speed * dt * cfg.spin[0]; ry += speed * dt * cfg.spin[1]; rz += speed * dt * cfg.spin[2]; }
      draw(14 + (calm ? 0 : Math.sin(t / 40) * 3), 1.12);
      raf = requestAnimationFrame(hold);
    }

    function press() {
      if (mode !== 'idle') return;
      mode = 'hold'; holdStart = last = performance.now();
      hint.textContent = 'Let go to throw!';
      raf = requestAnimationFrame(hold);
    }

    function release() {
      if (mode !== 'hold') return;
      mode = 'throw'; cancelAnimationFrame(raf);
      const { result, angles: [bx, by, bz] } = cfg.release();
      hint.textContent = '';
      const ahead = (cur, base) => base + 360 * Math.ceil((cur + cfg.minSpin - base) / 360); // ends exactly on the target
      const sx = rx, sy = ry, sz = rz, tx = ahead(sx, bx), ty = ahead(sy, by), tz = ahead(sz, bz);
      const H = calm ? 0 : cfg.height, T = calm ? 250 : 900, B1 = calm ? 0 : 260, B2 = calm ? 0 : 140, rotDur = T + B1;
      const arc = (u, peak) => peak * 4 * u * (1 - u);
      const t0 = performance.now();
      (function step(now) {
        if (!live()) return;
        const e = now - t0;
        let h;
        if (e < T) { const u = e / T; h = arc(u, H) + 14 * (1 - u); }
        else if (e < T + B1) h = arc((e - T) / B1, 28);
        else if (e < T + B1 + B2) h = arc((e - T - B1) / B2, 8);
        else h = 0;
        const p = Math.min(1, e / rotDur), k = 1 - Math.pow(1 - p, 3);
        rx = sx + (tx - sx) * k; ry = sy + (ty - sy) * k; rz = sz + (tz - sz) * k;
        draw(h, 1 + 0.12 * Math.max(0, 1 - e / 250));
        if (e < T + B1 + B2) return requestAnimationFrame(step);
        rx = tx; ry = ty; rz = tz; draw(0, 1);
        cfg.settled(result, api);
      })(t0);
    }

    const api = { calm, live };
    bindHold(el, press, release);
    return api;
  }

  // Press and hold with a finger, mouse or the space bar; letting go releases.
  function bindHold(el, press, release) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} press(); });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
    el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  }

  function setupDie() {
    const num = document.getElementById('rollnum');
    throwable({
      el: 'die', wrap: 'die-wrap', pose: [-25, 35, 0], spin: [1, 1.3, 0.5], minSpin: 540, height: 170,
      release() {
        const n = G.roll();
        G.startMove(state, n); save(GAME_KEY, state); // decided now, so a refresh cannot re-roll
        document.getElementById('physical').hidden = true;
        return { result: n, angles: FACE_ROT[n] };
      },
      settled(n, api) {
        setTimeout(() => {
          if (!api.live()) return;
          document.getElementById('die-wrap').style.transform = ''; document.getElementById('die-wrap').classList.add('lifted');
          num.innerHTML = `<span class="n">${n}</span> stop${n === 1 ? '' : 's'}`;
          num.classList.add('show');
          setTimeout(() => { if (api.live()) showOutcome(); }, api.calm ? 200 : 1000);
        }, api.calm ? 100 : 350);
      },
    });
  }

  // Shows how the direction was decided, then waits for the player to carry on to the die.
  function showDirectionResult(label, picked) {
    const box = document.getElementById('coinresult');
    if (!box) return;
    box.innerHTML = `<div class="dest"><b>${label}</b> <span class="muted">Heading toward</span> <h3>${esc(picked)}</h3> ${chips(G.linesBetween(state.pos, picked))}</div>
      <button data-act="continue">Now roll the die →</button>`;
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  }

  function setupCoin() {
    throwable({
      el: 'coin', wrap: 'coin-wrap', pose: [90, 0, 0], spin: [1, 0, 0], minSpin: 1260, height: 200,
      release() {
        const heads = Math.random() < 0.5;
        const r = G.flipCoin(state, heads); save(GAME_KEY, state); // decided now, so a refresh cannot re-flip
        document.getElementById('physical').hidden = true;
        return { result: { label: heads ? 'Heads!' : 'Tails!', picked: r.picked }, angles: COIN_ROT[heads ? 'heads' : 'tails'] };
      },
      settled(r, api) {
        setTimeout(() => { if (api.live()) showDirectionResult(r.label, r.picked); }, api.calm ? 100 : 400);
      },
    });
  }

  // Wind the wheel up while held, let go and it spins down onto a slice.
  function setupWheel() {
    const el = document.getElementById('wheel');
    if (!el) return;
    const hint = document.getElementById('hint');
    const token = dieToken, calm = reduced();
    const live = () => token === dieToken && el.isConnected;
    const n = G.forkOptions(state).length, S = 360 / n;
    let mode = 'idle', raf = 0, angle = 0, holdStart = 0, last = 0;
    const draw = () => { el.style.transform = `rotate(${angle}deg)`; };

    function hold(t) {
      if (!live() || mode !== 'hold') return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (!calm) angle += (200 + 700 * Math.min(1, (t - holdStart) / 1500)) * dt;
      draw(); raf = requestAnimationFrame(hold);
    }
    function press() {
      if (mode !== 'idle') return;
      mode = 'hold'; holdStart = last = performance.now();
      hint.textContent = 'Let go to spin!';
      raf = requestAnimationFrame(hold);
    }
    function release() {
      if (mode !== 'hold') return;
      mode = 'spin'; cancelAnimationFrame(raf);
      const r = G.spinWheel(state); save(GAME_KEY, state); // decided now, so a refresh cannot re-spin
      document.getElementById('physical').hidden = true;
      hint.textContent = '';
      // the pointer is at the top: put the middle of the chosen slice under it, a little off-centre like a real wheel
      const centre = (r.index + 0.5) * S + (Math.random() - 0.5) * S * 0.6;
      const start = angle, end = -centre + 360 * Math.ceil((start + (calm ? 0 : 1080) + centre) / 360);
      const dur = calm ? 300 : 2800, t0 = performance.now();
      (function step(now) {
        if (!live()) return;
        const p = Math.min(1, (now - t0) / dur);
        angle = start + (end - start) * (1 - Math.pow(1 - p, 3));
        draw();
        if (p < 1) return requestAnimationFrame(step);
        setTimeout(() => { if (live()) showDirectionResult(`Number ${r.index + 1}!`, r.picked); }, calm ? 100 : 400);
      })(t0);
    }
    bindHold(el, press, release);
  }

  // ---------- The deck ----------
  let deckBusy = false;

  function shuffleAnimation() {
    const layers = [...document.querySelectorAll('#deck3d .dcard')];
    const n = layers.length;
    layers.forEach((el, i) => {
      const z = i * 1.8, dir = i % 2 ? 1 : -1;
      el.animate([
        { transform: `translateZ(${z}px)` },
        { transform: `translateX(${dir * 110}px) translateY(${dir * -12}px) translateZ(${z}px) rotateZ(${dir * 9}deg)`, offset: 0.3 },
        { transform: `translateZ(${z}px)`, offset: 0.55 },
        { transform: `translateX(${-dir * 90}px) translateZ(${z}px) rotateZ(${-dir * 7}deg)`, offset: 0.75 },
        { transform: `translateZ(${z}px)` },
      ], { duration: 1200, delay: (n - 1 - i) * 45, easing: 'ease-in-out' });
    });
    return 1200 + n * 45;
  }

  function shuffleDeckUI() {
    if (deckBusy || !state || state.phase !== 'arrived') return;
    deckBusy = true;
    G.shuffleDeck(state); save(GAME_KEY, state); // saved straight away: the new order is real
    const hint = document.getElementById('deckhint');
    const ms = reduced() ? 150 : shuffleAnimation();
    hint.textContent = 'Shuffling…';
    const token = dieToken;
    setTimeout(() => {
      deckBusy = false;
      if (token === dieToken) hint.textContent = 'Shuffled! ' + deckCount(state) + '.';
    }, ms);
  }

  function drawUI() {
    if (deckBusy || !state || state.phase !== 'arrived') return;
    deckBusy = true;
    const token = dieToken;
    const layers = [...document.querySelectorAll('#deck3d .dcard')];
    const c = G.drawCard(state); save(GAME_KEY, state); // decided now, so a refresh cannot re-draw
    const flipper = document.getElementById('flipper');
    document.getElementById('cfront').innerHTML = cardFront(c, state);
    document.getElementById('shuffle-btn').disabled = true;
    document.getElementById('draw-btn').disabled = true;

    const done = () => {
      deckBusy = false;
      if (token !== dieToken || !flipper.isConnected) return;
      flipper.classList.add('revealed');
      const deck = document.getElementById('deck3d');
      if (deck) deck.style.display = 'none';
      const shadow = document.querySelector('.deckshadow'); if (shadow) shadow.style.display = 'none';
      document.querySelector('.screen h2').textContent = state.settings.players[state.player] + "'s challenge";
      const box = document.getElementById('challenge-controls');
      box.innerHTML = challengeControls(state);
      box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    };

    if (reduced()) { done(); return; }
    const top = Math.max(0, layers.length - 1) * 1.8;
    if (layers.length) layers[layers.length - 1].style.visibility = 'hidden';
    flipper.classList.add('flying');
    const lying = `translate(-50%,-50%) rotateX(52deg) translateZ(${top}px) scale(0.8636)`;
    flipper.animate([
      { transform: lying },
      { transform: 'translate(-50%,-66%) translateZ(110px) rotateX(24deg) rotateY(80deg) scale(0.95)', offset: 0.45 },
      { transform: 'translate(-50%,-50%) rotateX(0deg) rotateY(180deg) scale(1)' },
    ], { duration: 1000, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).onfinish = done;
  }

  // ---------- Events ----------
  app.addEventListener('input', (e) => {
    const f = e.target.dataset.field;
    if (!f) return;
    if (f === 'name') form.players[+e.target.dataset.i] = e.target.value;
    else form[f] = (f === 'goal' || f === 'minutes') ? Math.max(0, parseInt(e.target.value, 10) || 0) : e.target.value;
    save(FORM_KEY, form);
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const arg = el.dataset.arg;
    switch (el.dataset.act) {
      case 'preset': Object.assign(form, PRESETS[arg]); delete form.label; save(FORM_KEY, form); return render();
      case 'forkrule': form.fork = arg; save(FORM_KEY, form); return render();
      case 'addPlayer': form.players.push('Player ' + (form.players.length + 1)); save(FORM_KEY, form); return render();
      case 'removePlayer': form.players.splice(+arg, 1); save(FORM_KEY, form); return render();
      case 'start': {
        const players = form.players.map((p, i) => p.trim() || 'Player ' + (i + 1));
        if (!form.goal && !form.minutes) return alert('Pick a token goal or a time limit so the game can end.');
        state = G.newGame({ players, mode: form.mode, goal: form.goal, minutes: form.minutes, fork: form.fork, start: form.start });
        return commit();
      }
      case 'heading': G.setHeading(state, arg); return commit();
      case 'physicalCoin': {
        const r = G.flipCoin(state, arg === '1'); save(GAME_KEY, state);
        document.getElementById('physical').hidden = true;
        showDirectionResult(arg === '1' ? 'Heads!' : 'Tails!', r.picked);
        return;
      }
      case 'continue': return render();
      case 'roll': G.startMove(state, G.roll()); return commit();
      case 'physical': G.startMove(state, +arg); return commit();
      case 'fork':
        G.chooseFork(state, arg); save(GAME_KEY, state);
        return document.getElementById('outcome') ? showOutcome() : render();
      case 'toDeck': return render();
      case 'draw': return drawUI();
      case 'shuffle': return shuffleDeckUI();
      case 'startTimer': G.startChallengeTimer(state); return commit();
      case 'done': G.resolveChallenge(state, true); return commit();
      case 'skip': G.resolveChallenge(state, false); return commit();
      case 'newGame':
        if (state.phase !== 'over' && !confirm('End this game and start over?')) return;
        state = null; return commit();
    }
  });

  app.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'deck3d') { e.preventDefault(); drawUI(); }
  });

  render();
})();
