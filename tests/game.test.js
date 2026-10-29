const test = require('node:test');
const assert = require('node:assert');
const G = require('../site/game.js');
const D = require('../site/data.js');

const settings = (o = {}) => ({ players: ['A', 'B'], mode: 'versus', goal: 3, minutes: 0, fork: 'coin', start: 'Waterfront', ...o });
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('map: 54 stations, transfers are shared, no station has more than four neighbours', () => {
  assert.strictEqual(G.stations.length, 54);
  for (const t of ['Waterfront', 'Commercial–Broadway', 'Lougheed Town Centre', 'Production Way–University'])
    assert.ok(G.lines[t].length >= 2, t);
  for (const s of G.stations) assert.ok(G.adj[s].length <= 4, s);
});

test('map: every station can be reached from Waterfront', () => {
  const seen = new Set(['Waterfront']); const q = ['Waterfront'];
  while (q.length) for (const n of G.adj[q.pop()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.strictEqual(seen.size, G.stations.length);
});

// A game with the train already riding `line`, having just come from `prev`.
const riding = (pos, prev, line, o = {}) => { const s = G.newGame(settings(o)); s.pos = pos; s.prev = prev; s.line = line; return s; };
const ride = (s, n, picks = []) => {   // ride n stops, answering any fork from `picks`
  G.startMove(s, n, seq(0));
  while (s.phase === 'fork') G.chooseFork(s, picks.shift() || s.forkOptions[0]);
  return s.lastMove.path;
};

test('moving: straight ride along the Expo Line', () => {
  const s = riding('Burrard', 'Waterfront', 'expo');
  assert.deepStrictEqual(ride(s, 3), ['Burrard', 'Granville', 'Stadium–Chinatown', 'Main Street–Science World']);
});

test('moving: a train turns around at the end of its line, on the same line', () => {
  const s = riding('Surrey Central', 'Gateway', 'expo');
  assert.deepStrictEqual(ride(s, 3), ['Surrey Central', 'King George', 'Surrey Central', 'Gateway']);
  const w = riding('Burrard', 'Granville', 'expo');          // riding in to Waterfront: the Expo Line ends there
  assert.deepStrictEqual(ride(w, 3), ['Burrard', 'Waterfront', 'Burrard', 'Granville']);
});

test('moving: you stay on your line through a transfer station', () => {
  assert.deepStrictEqual(ride(riding('Main Street–Science World', 'Stadium–Chinatown', 'expo'), 3),
    ['Main Street–Science World', 'Commercial–Broadway', 'Nanaimo', '29th Avenue']);
  assert.deepStrictEqual(ride(riding('VCC–Clark', null, 'millennium'), 3),
    ['VCC–Clark', 'Commercial–Broadway', 'Renfrew', 'Rupert']);
  assert.deepStrictEqual(ride(riding('Lake City Way', 'Sperling–Burnaby Lake', 'millennium'), 4),
    ['Lake City Way', 'Production Way–University', 'Lougheed Town Centre', 'Burquitlam', 'Moody Centre']);
  assert.deepStrictEqual(ride(riding('Braid', 'Sapperton', 'expo'), 3),   // the Expo branch ends at Production Way
    ['Braid', 'Lougheed Town Centre', 'Production Way–University', 'Lougheed Town Centre']);
});

test('moving: the Expo Line splits at Columbia, but only on the way out from New Westminster', () => {
  const s = riding('New Westminster', '22nd Street', 'expo', { fork: 'choose' });
  G.startMove(s, 3);
  assert.strictEqual(s.phase, 'fork');
  assert.deepStrictEqual(s.forkOptions.slice().sort(), ['Sapperton', 'Scott Road']);
  assert.deepStrictEqual(ride(riding('New Westminster', '22nd Street', 'expo'), 3, ['Scott Road']), ['New Westminster', 'Columbia', 'Scott Road', 'Gateway']);
});

test('moving: you cannot ride from Sapperton to Scott Road, or from Scott Road to Sapperton', () => {
  assert.deepStrictEqual(ride(riding('Sapperton', 'Braid', 'expo'), 3), ['Sapperton', 'Columbia', 'New Westminster', '22nd Street']);
  assert.deepStrictEqual(ride(riding('Gateway', 'Surrey Central', 'expo'), 3), ['Gateway', 'Scott Road', 'Columbia', 'New Westminster']);
});

test('moving: the Canada Line splits at Bridgeport, and Richmond and the airport do not connect directly', () => {
  assert.deepStrictEqual(ride(riding('Capstan', 'Aberdeen', 'canada'), 3), ['Capstan', 'Bridgeport', 'Marine Drive', 'Langara–49th Avenue']);
  assert.deepStrictEqual(ride(riding('Sea Island Centre', 'YVR–Airport', 'canada'), 3), ['Sea Island Centre', 'Templeton', 'Bridgeport', 'Marine Drive']);
  const s = riding('Langara–49th Avenue', 'Oakridge–41st Avenue', 'canada', { fork: 'choose' });
  G.startMove(s, 3);
  assert.strictEqual(s.phase, 'fork');
  assert.deepStrictEqual(s.forkOptions.slice().sort(), ['Capstan', 'Templeton']);
});

test('moving: a coin decides a split mid-ride when the setting is coin', () => {
  const s = riding('New Westminster', '22nd Street', 'expo');
  G.startMove(s, 3, seq(0.9));
  assert.deepStrictEqual(s.lastMove.path, ['New Westminster', 'Columbia', 'Sapperton', 'Braid']);
  assert.strictEqual(s.lastMove.forks[0].how, 'coin');
});

test('direction: you choose your way out only at transfers and splits, or at the very start', () => {
  assert.ok(G.needsDirection(G.newGame(settings({ start: 'Waterfront' }))));
  assert.ok(G.needsDirection(G.newGame(settings({ start: 'Granville' }))));            // the very start: either way
  assert.ok(!G.needsDirection(riding('Granville', 'Burrard', 'expo')));                 // carries on towards Stadium–Chinatown
  assert.ok(!G.needsDirection(riding('King George', 'Surrey Central', 'expo')));        // the end of the line turns around
  for (const [pos, prev, line, n] of [['Waterfront', 'Burrard', 'expo', 2], ['Commercial–Broadway', 'Nanaimo', 'expo', 4], ['Lougheed Town Centre', 'Braid', 'expo', 4],
    ['Production Way–University', 'Lake City Way', 'millennium', 3], ['Columbia', 'Sapperton', 'expo', 3], ['Bridgeport', 'Templeton', 'canada', 3]]) {
    const s = riding(pos, prev, line);
    assert.ok(G.needsDirection(s), pos);
    assert.strictEqual(G.startOptions(s).length, n, pos);
  }
});

test('direction: at Columbia you can change to the other branch, because you change trains there', () => {
  const s = riding('Columbia', 'Sapperton', 'expo');
  assert.deepStrictEqual(G.startOptions(s).map((o) => o.to).sort(), ['New Westminster', 'Sapperton', 'Scott Road']);
  G.setHeading(s, { to: 'Scott Road', line: 'expo' });
  assert.deepStrictEqual(ride(s, 2), ['Columbia', 'Scott Road', 'Gateway']);
});

test('direction: where two lines share track, the line you pick decides where you end up', () => {
  const opts = G.startOptions(riding('Lougheed Town Centre', 'Braid', 'expo'));
  assert.deepStrictEqual(opts.map((o) => o.to + ' ' + o.line).sort(),
    ['Braid expo', 'Burquitlam millennium', 'Production Way–University expo', 'Production Way–University millennium']);
  const m = riding('Lougheed Town Centre', 'Braid', 'expo');
  G.setHeading(m, { to: 'Production Way–University', line: 'millennium' });
  assert.deepStrictEqual(ride(m, 2), ['Lougheed Town Centre', 'Production Way–University', 'Lake City Way']);
  const e = riding('Lougheed Town Centre', 'Burquitlam', 'millennium');
  G.setHeading(e, { to: 'Production Way–University', line: 'expo' });
  assert.deepStrictEqual(ride(e, 2), ['Lougheed Town Centre', 'Production Way–University', 'Lougheed Town Centre']);
});

test('direction: the chosen way is where the first stop goes, and it must be a real way out', () => {
  const s = G.newGame(settings({ start: 'Waterfront' }));
  assert.throws(() => G.setHeading(s, { to: 'Gateway', line: 'expo' }));
  assert.throws(() => G.setHeading(s, { to: 'Vancouver City Centre', line: 'expo' }));   // wrong line for that stretch
  G.setHeading(s, { to: 'Vancouver City Centre', line: 'canada' });
  assert.ok(!G.needsDirection(s));
  assert.deepStrictEqual(ride(s, 3), ['Waterfront', 'Vancouver City Centre', 'Yaletown–Roundhouse', 'Olympic Village']);
  assert.strictEqual(s.heading, null);
  assert.strictEqual(s.line, 'canada');
});

test('coin: heads is the first way, tails the second', () => {
  const s = G.newGame(settings({ start: 'Waterfront' }));
  const opts = G.startOptions(s);
  assert.deepStrictEqual(G.flipCoin(s, false).picked, opts[1]);
  const t = G.newGame(settings({ start: 'Waterfront' }));
  G.flipCoin(t, true); assert.deepStrictEqual(t.heading, opts[0]);
});

test('coin: refuses to settle three or four ways', () => {
  const s = riding('Commercial–Broadway', 'Nanaimo', 'expo');
  assert.strictEqual(G.startOptions(s).length, 4);
  assert.throws(() => G.flipCoin(s, true));
});

test('wheel: one spin settles three or four ways, each equally likely', () => {
  for (const [pos, prev, line, n] of [['Commercial–Broadway', 'Nanaimo', 'expo', 4], ['Columbia', 'Sapperton', 'expo', 3]]) {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const s = riding(pos, prev, line);
      const r = G.spinWheel(s, () => (i + 0.5) / n);
      assert.strictEqual(r.index, i); assert.deepStrictEqual(s.heading, r.picked); seen.add(r.picked.to + r.picked.line);
    }
    assert.strictEqual(seen.size, n);
  }
});

test('look ahead: shows the next few stations along a way out, and stops at a split or the end', () => {
  assert.deepStrictEqual(G.lookAhead('Waterfront', { to: 'Burrard', line: 'expo' }, 3), ['Waterfront', 'Burrard', 'Granville', 'Stadium–Chinatown']);
  assert.deepStrictEqual(G.lookAhead('Columbia', { to: 'New Westminster', line: 'expo' }, 3), ['Columbia', 'New Westminster', '22nd Street', 'Edmonds']);
  assert.deepStrictEqual(G.lookAhead('New Westminster', { to: 'Columbia', line: 'expo' }, 3), ['New Westminster', 'Columbia']);   // a split ahead
  assert.deepStrictEqual(G.lookAhead('Production Way–University', { to: 'Lougheed Town Centre', line: 'expo' }, 4), ['Production Way–University', 'Lougheed Town Centre', 'Braid', 'Sapperton', 'Columbia']);
});

test('real network: thousands of random rides never make a move the trains cannot', () => {
  let seed = 12345; const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const through = { 'Columbia': ['Sapperton', 'Scott Road'], 'Bridgeport': ['Capstan', 'Templeton'] };
  for (let game = 0; game < 300; game++) {
    const s = G.newGame(settings({ start: G.stations[Math.floor(rng() * G.stations.length)], fork: game % 2 ? 'coin' : 'choose' }), rng);
    for (let turn = 0; turn < 12; turn++) {
      if (G.needsDirection(s)) { const o = G.startOptions(s); G.setHeading(s, o[Math.floor(rng() * o.length)]); }
      G.startMove(s, 1 + Math.floor(rng() * 6), rng);
      while (s.phase === 'fork') G.chooseFork(s, s.forkOptions[Math.floor(rng() * s.forkOptions.length)]);
      const path = s.lastMove.path;
      for (let i = 1; i < path.length; i++) {
        assert.ok(G.adj[path[i - 1]].includes(path[i]), `${path[i - 1]} to ${path[i]} is a real stretch of track`);
        assert.ok(G.linesBetween(path[i - 1], path[i]).includes(s.line), `${path[i - 1]} to ${path[i]} is on the ${s.line} line`);
        if (i >= 2 && through[path[i - 1]]) {
          const pair = [path[i - 2], path[i]];
          assert.ok(!(through[path[i - 1]].includes(pair[0]) && through[path[i - 1]].includes(pair[1])), `no through running at ${path[i - 1]}: ${path.join(' > ')}`);
        }
      }
      s.phase = 'roll';
    }
  }
});

test('cards: deck reshuffles, token and turn rotation, first-to-goal wins', () => {
  const s = G.newGame(settings({ goal: 2 }));
  const seen = new Set();
  for (let i = 0; i < D.CARDS.length * 2; i++) { seen.add(G.drawCard(s).id); s.phase = 'arrived'; }
  assert.strictEqual(seen.size, D.CARDS.length);
  s.player = 0; s.phase = 'challenge';
  G.resolveChallenge(s, true);
  assert.strictEqual(s.player, 1);
  assert.strictEqual(s.phase, 'roll');
  s.player = 0; s.phase = 'challenge';
  G.resolveChallenge(s, false);
  s.player = 0; G.resolveChallenge(s, true);
  assert.strictEqual(s.phase, 'over');
  assert.deepStrictEqual(s.result.winners, ['A']);
});

test('coop: shared goal wins, skipping gives no token', () => {
  const s = G.newGame(settings({ mode: 'coop', goal: 2 }));
  G.resolveChallenge(s, true); G.resolveChallenge(s, false);
  assert.strictEqual(s.phase, 'roll'); assert.strictEqual(G.total(s), 1);
  G.resolveChallenge(s, true);
  assert.ok(s.result.won);
});

test('time limit: ends at once if idle, or after the current challenge', () => {
  const t0 = 1000;
  const a = G.newGame(settings({ goal: 0, minutes: 10 }), Math.random, t0);
  G.checkTime(a, t0 + 10 * 60000);
  assert.strictEqual(a.phase, 'over');
  const b = G.newGame(settings({ goal: 0, minutes: 10 }), Math.random, t0);
  b.phase = 'challenge';
  G.checkTime(b, t0 + 11 * 60000);
  assert.strictEqual(b.phase, 'challenge');
  G.resolveChallenge(b, true);
  assert.strictEqual(b.phase, 'over');
  assert.deepStrictEqual(b.result.winners, ['A']);
});

test('deck: shuffling keeps every card and reorders only what is left', () => {
  const s = G.newGame(settings());
  G.drawCard(s); G.drawCard(s);
  const before = s.draw.slice(), discarded = s.discard.slice();
  G.shuffleDeck(s, seq(0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  assert.deepStrictEqual(s.draw.slice().sort(), before.slice().sort());
  assert.notDeepStrictEqual(s.draw, before);
  assert.deepStrictEqual(s.discard, discarded);
});

test('deck: shuffling an empty deck brings the discards back', () => {
  const s = G.newGame(settings());
  for (let i = 0; i < D.CARDS.length; i++) G.drawCard(s);
  assert.strictEqual(s.draw.length, 0);
  G.shuffleDeck(s);
  assert.strictEqual(s.draw.length, D.CARDS.length);
  assert.strictEqual(s.discard.length, 0);
});
