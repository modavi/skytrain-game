(function () {
  const G = SkytrainGame, D = SkytrainData;
  const GAME_KEY = 'skytrain.game.v1', FORM_KEY = 'skytrain.form.v1';
  const app = document.getElementById('app');

  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const chips = (ls) => ls.map((l) => `<span class="chip ${l}" style="background:${D.LINES[l].color}">${D.LINES[l].name}</span>`).join('');
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
  function renderSetup() {
    const opts = G.stations.slice().sort().map((s) => `<option ${s === form.start ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `
      <h1>Skytrain</h1>
      <p class="muted">Roll the die, ride that many stops, then do a challenge at the station.</p>
      <section class="card stack">
        <h2>Quick start</h2>
        ${Object.entries(PRESETS).map(([k, p]) => `<button class="alt" data-act="preset" data-arg="${k}">${p.label}</button>`).join('')}
      </section>
      <section class="card stack">
        <h2>Players</h2>
        ${form.players.map((p, i) => `<div class="row"><input data-field="name" data-i="${i}" value="${esc(p)}" maxlength="20" aria-label="Player ${i + 1} name">
          ${form.players.length > 1 ? `<button class="bad small" data-act="removePlayer" data-arg="${i}" aria-label="Remove player">✕</button>` : ''}</div>`).join('')}
        ${form.players.length < 6 ? '<button class="alt" data-act="addPlayer">+ Add player</button>' : ''}
        <label>How do you play?
          <select data-field="mode">
            <option value="coop" ${form.mode === 'coop' ? 'selected' : ''}>Together (one shared pile of tokens)</option>
            <option value="versus" ${form.mode === 'versus' ? 'selected' : ''}>Against each other (own tokens)</option>
          </select></label>
        <label>Token goal <span class="hint">First to reach it wins (or the team wins). 0 means no goal.</span>
          <input type="number" min="0" max="50" data-field="goal" value="${form.goal}"></label>
        <label>Time limit in minutes <span class="hint">0 means no limit. When time is up, most tokens wins.</span>
          <input type="number" min="0" max="600" data-field="minutes" value="${form.minutes}"></label>
        <label>When the train reaches a fork
          <select data-field="fork">
            <option value="coin" ${form.fork === 'coin' ? 'selected' : ''}>Flip a coin (random)</option>
            <option value="choose" ${form.fork === 'choose' ? 'selected' : ''}>The person who rolled chooses</option>
          </select></label>
        <label>Start at
          <select data-field="start">${opts}</select></label>
        <button data-act="start">Start the game</button>
      </section>`;
  }

  // ---------- Game ----------
  function scoreboard(s) {
    const { players, mode, goal } = s.settings;
    if (mode === 'coop') {
      return `<div class="score"><div class="on"><span class="muted">Team tokens</span><b>${G.total(s)}${goal ? ' / ' + goal : ''}</b></div></div>`;
    }
    return `<div class="score">${players.map((p, i) => `<div class="${i === s.player && s.phase !== 'over' ? 'on' : ''}"><span class="muted">${esc(p)}</span><b>${s.tokens[i]}${goal ? ' / ' + goal : ''}</b></div>`).join('')}</div>`;
  }

  function summary(s) {
    const m = s.lastMove;
    if (!m) return '';
    const forks = m.forks.map((f) => `<li>${f.how === 'coin' ? (f.options.length === 2 ? 'Coin flip' : 'Random pick') : 'Chose'} at <b>${esc(f.at)}</b>: ${esc(f.picked)}</li>`).join('');
    return `<p class="path muted">${esc(s.settings.players[m.player])} rolled ${dieFace(m.roll)} (${m.roll}): ${m.path.map(esc).join(' → ')}</p>${forks ? `<ol class="log">${forks}</ol>` : ''}`;
  }

  function renderGame(s) {
    const name = esc(s.settings.players[s.player]);
    const here = `<b>${esc(s.pos)}</b><br>${chips(G.lines[s.pos])}`;
    let body = '';
    if (s.phase === 'roll') {
      body = `<h2>${name}, roll the die!</h2><p>You are at ${here}</p>${summary(s)}
        <button data-act="roll">🎲 Roll the die</button>
        <p class="muted">Rolled a real die instead? Tap what it shows:</p>
        <div class="dice">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="alt" data-act="physical" data-arg="${n}" aria-label="${n}">${dieFace(n)}</button>`).join('')}</div>`;
    } else if (s.phase === 'fork') {
      body = `<h2>Fork at ${esc(s.pos)}!</h2><p>${name} picks the way. ${s.remaining} stop${s.remaining === 1 ? '' : 's'} left.</p>
        <div class="stack">${s.forkOptions.map((o) => `<button class="alt" data-act="fork" data-arg="${esc(o)}">${esc(o)}<br>${chips(G.linesBetween(s.pos, o))}</button>`).join('')}</div>`;
    } else if (s.phase === 'arrived') {
      body = `<h2>You arrived!</h2><div class="big">🚉</div><p style="text-align:center">${here}</p>${summary(s)}
        <button data-act="draw">Draw a challenge card</button>`;
    } else if (s.phase === 'challenge') {
      const c = G.cardById(s.card);
      const timer = c.minutes
        ? (s.timerEndsAt ? `<p class="clock" style="font-size:1.6rem;text-align:center" id="chal-clock"></p>`
          : `<button class="alt" data-act="startTimer">Start ${c.minutes}-minute timer</button>`)
        : '';
      body = `<h2>${esc(c.title)}</h2><p>${esc(c.text)}</p><p class="muted">At ${esc(s.pos)} · ${name}'s challenge</p>${timer}
        ${s.timeUp ? '<p><b>Time is up!</b> Finish this challenge and the game ends.</p>' : ''}
        <div class="row"><button class="ok" data-act="done">We did it! +1 token</button><button class="bad" data-act="skip">Skip</button></div>`;
    } else if (s.phase === 'over') {
      const r = s.result;
      const msg = r.mode === 'coop'
        ? (r.won ? `🎉 You did it together with ${r.score} tokens!` : `Time is up. Your team collected ${r.score} token${r.score === 1 ? '' : 's'}.`)
        : (r.winners.length === 1 ? `🎉 ${esc(r.winners[0])} wins with ${r.score} token${r.score === 1 ? '' : 's'}!` : `It is a tie between ${r.winners.map(esc).join(' and ')} (${r.score} each).`);
      body = `<h2>Game over</h2><p style="font-size:1.2rem">${msg}</p><button data-act="newGame">Play again</button>`;
    }
    const clockLine = s.endsAt && s.phase !== 'over' ? `<p class="muted">Time left: <span class="clock" id="game-clock"></span></p>` : '';
    return `<h1>Skytrain</h1>${scoreboard(s)}${clockLine}
      <section class="card stack">${body}</section>
      ${s.stamps.length ? `<section class="card"><h3>Stations stamped (${s.stamps.length})</h3><div class="stamps">${s.stamps.map((x) => `<span>${esc(x)}</span>`).join('')}</div></section>` : ''}
      ${s.phase === 'over' ? '' : '<button class="alt small" data-act="newGame">End game / new game</button>'}`;
  }

  function render() {
    app.innerHTML = state ? renderGame(state) : renderSetup();
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
      case 'addPlayer': form.players.push('Player ' + (form.players.length + 1)); save(FORM_KEY, form); return render();
      case 'removePlayer': form.players.splice(+arg, 1); save(FORM_KEY, form); return render();
      case 'start': {
        const players = form.players.map((p, i) => p.trim() || 'Player ' + (i + 1));
        if (!form.goal && !form.minutes) return alert('Pick a token goal or a time limit so the game can end.');
        state = G.newGame({ players, mode: form.mode, goal: form.goal, minutes: form.minutes, fork: form.fork, start: form.start });
        return commit();
      }
      case 'roll': G.startMove(state, G.roll()); return commit();
      case 'physical': G.startMove(state, +arg); return commit();
      case 'fork': G.chooseFork(state, arg); return commit();
      case 'draw': G.drawCard(state); return commit();
      case 'startTimer': G.startChallengeTimer(state); return commit();
      case 'done': G.resolveChallenge(state, true); return commit();
      case 'skip': G.resolveChallenge(state, false); return commit();
      case 'newGame':
        if (state.phase !== 'over' && !confirm('End this game and start over?')) return;
        state = null; return commit();
    }
  });

  render();
})();
