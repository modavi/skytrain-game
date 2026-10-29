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

test('moving: straight ride, no repeated back-and-forth', () => {
  const s = G.newGame(settings());
  G.startMove(s, 4, seq(0)); // Waterfront is a fork at the start: 0 picks the Expo Line
  assert.strictEqual(s.phase, 'arrived');
  assert.strictEqual(s.pos, 'Main Street–Science World');
  assert.deepStrictEqual(s.lastMove.path.slice(0, 3), ['Waterfront', 'Burrard', 'Granville']);
});

test('moving: coin flip decides a fork; choose mode stops and asks', () => {
  const s = G.newGame(settings({ start: 'New Westminster' }));
  s.prev = '22nd Street';
  G.startMove(s, 2, seq(0.9)); // Columbia is a fork: 0.9 picks the 2nd option
  assert.strictEqual(s.lastMove.forks.length, 1);
  assert.strictEqual(s.lastMove.forks[0].at, 'Columbia');
  const c = G.newGame(settings({ start: 'New Westminster', fork: 'choose' }));
  c.prev = '22nd Street';
  G.startMove(c, 3);
  assert.strictEqual(c.phase, 'fork');
  assert.deepStrictEqual(c.forkOptions.slice().sort(), ['Sapperton', 'Scott Road']);
  G.chooseFork(c, 'Sapperton');
  assert.strictEqual(c.phase, 'arrived');
  assert.strictEqual(c.pos, 'Braid');
  assert.throws(() => G.chooseFork(c, 'Braid'));
});

test('moving: end of the line turns the train around', () => {
  const s = G.newGame(settings({ start: 'King George' }));
  s.prev = 'Surrey Central';
  G.startMove(s, 2);
  assert.deepStrictEqual(s.lastMove.path, ['King George', 'Surrey Central', 'Gateway']);
});

test('landing exactly on a fork asks nothing', () => {
  const s = G.newGame(settings({ start: 'New Westminster', fork: 'choose' }));
  s.prev = '22nd Street';
  G.startMove(s, 1);
  assert.strictEqual(s.pos, 'Columbia');
  assert.strictEqual(s.phase, 'arrived');
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

test('direction: asked before the roll only where there is more than one way forward', () => {
  const a = G.newGame(settings({ start: 'Waterfront' }));
  assert.ok(G.needsDirection(a));
  const b = G.newGame(settings({ start: 'Granville' })); b.prev = 'Burrard';
  assert.ok(!G.needsDirection(b)); // carries on towards Stadium–Chinatown
  const c = G.newGame(settings({ start: 'Columbia' })); c.prev = 'New Westminster';
  assert.ok(G.needsDirection(c));
  const d = G.newGame(settings({ start: 'King George' })); d.prev = 'Surrey Central';
  assert.ok(!G.needsDirection(d)); // dead end turns around
});

test('direction: the chosen way is where the first stop goes', () => {
  const s = G.newGame(settings({ start: 'Waterfront' }));
  assert.throws(() => G.setHeading(s, 'Gateway'));
  G.setHeading(s, 'Vancouver City Centre');
  assert.ok(!G.needsDirection(s));
  G.startMove(s, 3);
  assert.deepStrictEqual(s.lastMove.path, ['Waterfront', 'Vancouver City Centre', 'Yaletown–Roundhouse', 'Olympic Village']);
  assert.strictEqual(s.heading, null);
  assert.strictEqual(s.lastMove.forks[0].picked, 'Vancouver City Centre');
});

test('coin: heads is the first way, tails the second', () => {
  const s = G.newGame(settings({ start: 'Waterfront' }));
  const opts = G.forkOptions(s);
  assert.strictEqual(G.flipCoin(s, false).picked, opts[1]);
  assert.strictEqual(s.heading, opts[1]);
  const t = G.newGame(settings({ start: 'Waterfront' }));
  G.flipCoin(t, true); assert.strictEqual(t.heading, opts[0]);
});

test('coin: refuses to settle three or four ways', () => {
  const s = G.newGame(settings()); s.pos = 'Commercial–Broadway'; s.prev = null;
  assert.strictEqual(G.forkOptions(s).length, 4);
  assert.throws(() => G.flipCoin(s, true));
});

test('wheel: one spin settles three or four ways, each equally likely', () => {
  for (const prev of [null, 'Main Street–Science World']) {
    const n = prev ? 3 : 4, seen = new Set();
    for (let i = 0; i < n; i++) {
      const s = G.newGame(settings()); s.pos = 'Commercial–Broadway'; s.prev = prev;
      const r = G.spinWheel(s, () => (i + 0.5) / n);
      assert.strictEqual(r.index, i); assert.strictEqual(s.heading, r.picked); seen.add(r.picked);
    }
    assert.strictEqual(seen.size, n);
  }
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
