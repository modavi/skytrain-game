(function (root, factory) {
  const data = typeof require === 'function' ? require('./data.js') : root.SkytrainData;
  if (typeof module === 'object' && module.exports) module.exports = factory(data);
  else root.SkytrainGame = factory(data);
})(this, function (D) {
  // ---- The map ----------------------------------------------------------
  const adj = {};      // station -> array of neighbouring stations
  const lines = {};    // station -> lines that serve it
  const edgeLines = {}; // "a|b" -> lines that run between a and b

  const key = (a, b) => [a, b].sort().join('|');
  for (const seg of D.SEGMENTS) {
    seg.stops.forEach((s, i) => {
      adj[s] = adj[s] || [];
      lines[s] = lines[s] || [];
      if (!lines[s].includes(seg.line)) lines[s].push(seg.line);
      if (i === 0) return;
      const p = seg.stops[i - 1];
      if (!adj[s].includes(p)) adj[s].push(p);
      if (!adj[p].includes(s)) adj[p].push(s);
      const k = key(p, s);
      edgeLines[k] = edgeLines[k] || [];
      if (!edgeLines[k].includes(seg.line)) edgeLines[k].push(seg.line);
    });
  }
  const stations = Object.keys(adj);
  const linesBetween = (a, b) => edgeLines[key(a, b)] || [];

  // ---- Helpers ----------------------------------------------------------
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const total = (s) => Object.values(s.tokens).reduce((x, y) => x + y, 0);
  const cardById = (id) => D.CARDS.find((c) => c.id === id);

  // settings: { players:[names], mode:'coop'|'versus', goal:int(0=none), minutes:int(0=none),
  //             fork:'coin'|'choose', start:station }
  function newGame(settings, rng = Math.random, now = Date.now()) {
    return {
      settings,
      pos: settings.start,
      prev: null,
      phase: 'roll', // roll -> moving/fork -> arrived -> challenge -> roll ... -> over
      player: 0,
      tokens: Object.fromEntries(settings.players.map((_, i) => [i, 0])),
      stamps: [],
      remaining: 0,
      lastMove: null,
      forkOptions: [],
      card: null,
      timerEndsAt: null,
      draw: shuffle(D.CARDS.map((c) => c.id), rng),
      discard: [],
      endsAt: settings.minutes > 0 ? now + settings.minutes * 60000 : null,
      timeUp: false,
      result: null,
    };
  }

  // ---- Moving -----------------------------------------------------------
  function forkOptions(s) {
    const opts = adj[s.pos].filter((n) => n !== s.prev);
    return opts.length ? opts : [s.prev]; // dead end: turn around
  }

  function take(s, next) {
    s.prev = s.pos;
    s.pos = next;
    s.remaining--;
    s.lastMove.path.push(next);
  }

  function roll(rng = Math.random) { return 1 + Math.floor(rng() * 6); }

  // Before rolling, a train with more than one way forward picks its direction.
  const needsDirection = (s) => s.phase === 'roll' && !s.heading && forkOptions(s).length > 1;

  function setHeading(s, station, how = 'choice') {
    if (!needsDirection(s) || !forkOptions(s).includes(station)) throw new Error('Not a valid direction');
    s.heading = station;
    s.headingHow = how;
    return s;
  }

  // A coin settles two ways: heads is the first, tails is the second.
  function flipCoin(s, heads) {
    const opts = forkOptions(s);
    if (opts.length !== 2) throw new Error('A coin only settles two ways');
    setHeading(s, opts[heads ? 0 : 1], 'coin');
    return { picked: s.heading };
  }

  // Three or four ways: one spin of a wheel, every way an equal slice.
  function spinWheel(s, rng = Math.random) {
    const opts = forkOptions(s);
    const index = Math.floor(rng() * opts.length);
    setHeading(s, opts[index], 'wheel');
    return { index, picked: s.heading };
  }

  function startMove(s, n, rng = Math.random) {
    s.remaining = n;
    s.lastMove = { player: s.player, roll: n, path: [s.pos], forks: [] };
    s.phase = 'moving';
    if (s.heading) {
      s.lastMove.forks.push({ at: s.pos, options: forkOptions(s), picked: s.heading, how: s.headingHow, before: true });
      take(s, s.heading);
      s.heading = null;
    }
    return continueMove(s, rng);
  }

  function continueMove(s, rng = Math.random) {
    while (s.remaining > 0) {
      const opts = forkOptions(s);
      if (opts.length > 1) {
        if (s.settings.fork === 'coin') {
          const pick = opts[Math.floor(rng() * opts.length)];
          s.lastMove.forks.push({ at: s.pos, options: opts, picked: pick, how: 'coin' });
          take(s, pick);
        } else {
          s.phase = 'fork';
          s.forkOptions = opts;
          return s;
        }
      } else {
        take(s, opts[0]);
      }
    }
    s.phase = 'arrived';
    s.forkOptions = [];
    return s;
  }

  function chooseFork(s, station, rng = Math.random) {
    if (s.phase !== 'fork' || !s.forkOptions.includes(station)) throw new Error('Not a valid choice');
    s.lastMove.forks.push({ at: s.pos, options: s.forkOptions, picked: station, how: 'choice' });
    take(s, station);
    return continueMove(s, rng);
  }

  // ---- Cards and scoring ------------------------------------------------
  function drawCard(s, rng = Math.random) {
    if (!s.draw.length) { s.draw = shuffle(s.discard, rng); s.discard = []; }
    s.card = s.draw.pop();
    s.discard.push(s.card);
    s.timerEndsAt = null;
    s.phase = 'challenge';
    return cardById(s.card);
  }

  function startChallengeTimer(s, now = Date.now()) {
    const c = cardById(s.card);
    if (c && c.minutes) s.timerEndsAt = now + c.minutes * 60000;
  }

  function endGame(s) {
    const { mode, goal } = s.settings;
    const names = s.settings.players;
    s.phase = 'over';
    if (mode === 'coop') {
      s.result = { mode, score: total(s), won: goal > 0 && total(s) >= goal };
    } else {
      const best = Math.max(...Object.values(s.tokens));
      s.result = { mode, winners: names.filter((_, i) => s.tokens[i] === best), score: best };
    }
    return s;
  }

  function reachedGoal(s) {
    const { mode, goal } = s.settings;
    if (!goal) return false;
    return mode === 'coop' ? total(s) >= goal : s.tokens[s.player] >= goal;
  }

  function resolveChallenge(s, success) {
    if (success) {
      s.tokens[s.player]++;
      if (!s.stamps.includes(s.pos)) s.stamps.push(s.pos);
    }
    s.card = null;
    s.timerEndsAt = null;
    if (reachedGoal(s) || s.timeUp) return endGame(s);
    s.player = (s.player + 1) % s.settings.players.length;
    s.phase = 'roll';
    return s;
  }

  // Call regularly. Time running out ends the game at the next quiet moment.
  function checkTime(s, now = Date.now()) {
    if (s.endsAt && now >= s.endsAt && s.phase !== 'over') {
      s.timeUp = true;
      if (s.phase === 'roll') endGame(s);
    }
    return s;
  }

  return { adj, lines, stations, linesBetween, newGame, forkOptions, needsDirection, setHeading, flipCoin, spinWheel, roll, startMove, continueMove, chooseFork,
    drawCard, startChallengeTimer, resolveChallenge, checkTime, endGame, total, cardById };
});
