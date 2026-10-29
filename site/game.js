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
      line: null, // the line the train is riding
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
  // A train stays on its line. It goes straight on, turns around at the end of the line, and only
  // has a choice where the track really splits (Columbia and Bridgeport). To change line or
  // direction you stop at a transfer station and choose your way out at the start of your next turn.
  const LINE_ORDER = ['expo', 'millennium', 'canada'];
  const lineAdj = {}; // line -> station -> neighbours along that line
  for (const seg of D.SEGMENTS) {
    const m = (lineAdj[seg.line] = lineAdj[seg.line] || {});
    seg.stops.forEach((st, i) => {
      m[st] = m[st] || [];
      if (!i) return;
      const p = seg.stops[i - 1];
      m[p] = m[p] || [];
      if (!m[st].includes(p)) m[st].push(p);
      if (!m[p].includes(st)) m[p].push(st);
    });
  }
  // Trains do not run straight from one arm of a split to the other.
  const NO_THROUGH = { expo: { 'Columbia': [['Sapperton', 'Scott Road']] }, canada: { 'Bridgeport': [['Capstan', 'Templeton']] } };
  // Where you choose your way out when you start a turn: the transfers between lines, and the two
  // splits where you can change trains to the other branch.
  const TURN_POINTS = new Set(['Waterfront', 'Commercial–Broadway', 'Lougheed Town Centre', 'Production Way–University', 'Columbia', 'Bridgeport']);

  // Where a train on `line` that came from `prev` can go next. Empty at the end of the line.
  function ahead(line, pos, prev) {
    const banned = ((NO_THROUGH[line] || {})[pos] || []).filter((pr) => pr.includes(prev)).map((pr) => pr.find((x) => x !== prev));
    return ((lineAdj[line] || {})[pos] || []).filter((n) => n !== prev && !banned.includes(n));
  }

  // While riding: the stations the train can reach next (it turns around at the end of the line).
  function forkOptions(s) {
    const c = ahead(s.line, s.pos, s.prev);
    return c.length ? c : [s.prev];
  }

  // At the start of a turn: every way out as { to, line }.
  function startOptions(s) {
    if (s.prev && s.line && !TURN_POINTS.has(s.pos)) return forkOptions(s).map((to) => ({ to, line: s.line }));
    const out = [];
    for (const line of LINE_ORDER) if (lines[s.pos].includes(line)) for (const to of lineAdj[line][s.pos]) out.push({ to, line });
    return out;
  }

  // The next few stations along a way out, for showing it on the map.
  function lookAhead(from, opt, count = 3) {
    const path = [from, opt.to];
    let prev = from, pos = opt.to;
    while (path.length <= count) {
      const c = ahead(opt.line, pos, prev);
      if (c.length !== 1) break;
      prev = pos; pos = c[0]; path.push(pos);
    }
    return path;
  }

  function take(s, next) {
    s.prev = s.pos;
    s.pos = next;
    s.remaining--;
    s.lastMove.path.push(next);
  }

  function roll(rng = Math.random) { return 1 + Math.floor(rng() * 6); }

  // Before rolling, a train with more than one way out picks its direction.
  const needsDirection = (s) => s.phase === 'roll' && !s.heading && startOptions(s).length > 1;

  const sameWay = (a, b) => a.to === b.to && a.line === b.line;

  function setHeading(s, opt, how = 'choice') {
    const found = needsDirection(s) && startOptions(s).find((o) => sameWay(o, opt));
    if (!found) throw new Error('Not a valid direction');
    s.heading = { to: found.to, line: found.line };
    s.headingHow = how;
    return s;
  }

  // A coin settles two ways: heads is the first, tails is the second.
  function flipCoin(s, heads) {
    const opts = startOptions(s);
    if (opts.length !== 2) throw new Error('A coin only settles two ways');
    setHeading(s, opts[heads ? 0 : 1], 'coin');
    return { picked: s.heading };
  }

  // Three or four ways: one spin of a wheel, every way an equal slice.
  function spinWheel(s, rng = Math.random) {
    const opts = startOptions(s);
    const index = Math.floor(rng() * opts.length);
    setHeading(s, opts[index], 'wheel');
    return { index, picked: s.heading };
  }

  function startMove(s, n, rng = Math.random) {
    s.remaining = n;
    s.lastMove = { player: s.player, roll: n, path: [s.pos], forks: [] };
    s.phase = 'moving';
    const opts = startOptions(s);
    let way = s.heading, how = s.headingHow;
    if (!way) { way = opts[opts.length > 1 ? Math.floor(rng() * opts.length) : 0]; how = 'coin'; }
    if (opts.length > 1) s.lastMove.forks.push({ at: s.pos, options: opts.map((o) => o.to), picked: way.to, how, before: true });
    s.line = way.line;
    s.heading = null;
    take(s, way.to);
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

  // Shuffle what is left in the deck. If it has run out, the discards come back in.
  function shuffleDeck(s, rng = Math.random) {
    if (!s.draw.length) { s.draw = s.discard; s.discard = []; }
    s.draw = shuffle(s.draw, rng);
    return s;
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

  return { adj, lines, stations, linesBetween, newGame, forkOptions, needsDirection, startOptions, lookAhead, setHeading, flipCoin, spinWheel, roll, startMove, continueMove, chooseFork,
    drawCard, shuffleDeck, startChallengeTimer, resolveChallenge, checkTime, endGame, total, cardById };
});
