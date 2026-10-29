const test = require('node:test');
const assert = require('node:assert');
const M = require('../site/map.js');
const G = require('../site/game.js');

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('map: every game station is on the map, and nothing extra', () => {
  assert.deepStrictEqual(M.names.slice().sort(), G.stations.slice().sort());
});

test('map: the track connections match the game rules exactly', () => {
  for (const s of G.stations) assert.deepStrictEqual([...M.touches[s]].sort(), G.adj[s].slice().sort(), s);
});

test('map: the lines match the game (which lines serve which station)', () => {
  for (const s of G.stations) assert.deepStrictEqual(M.linesAt[s].slice().sort(), G.lines[s].slice().sort(), s);
});

test('map: every stretch of track starts and ends at its stations, with no gaps', () => {
  for (const a of G.stations) for (const b of G.adj[a]) {
    const pts = M.edgePoints(a, b), p = M.pos(a), q = M.pos(b);
    assert.ok(dist(pts[0], [p.x, p.y]) < 0.01, `${a} to ${b} starts at ${a}`);
    assert.ok(dist(pts[pts.length - 1], [q.x, q.y]) < 0.01, `${a} to ${b} ends at ${b}`);
    for (let i = 1; i < pts.length; i++) assert.ok(dist(pts[i - 1], pts[i]) < 60, `${a} to ${b}: gap in the track`);
    assert.deepStrictEqual(M.edgePoints(b, a), pts.slice().reverse());
  }
});

test('map: stations are not on top of each other and sit inside the picture', () => {
  for (let i = 0; i < M.names.length; i++) {
    const p = M.pos(M.names[i]);
    assert.ok(p.x > 0 && p.y > 0 && p.x < M.VIEW.w && p.y < M.VIEW.h, M.names[i]);
    for (let j = i + 1; j < M.names.length; j++) {
      const q = M.pos(M.names[j]);
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 6, `${M.names[i]} / ${M.names[j]}`);
    }
  }
});

test('map: a ride through the junction at Columbia follows the track', () => {
  const pts = M.routePoints(['New Westminster', 'Columbia', 'Sapperton', 'Braid']);
  assert.deepStrictEqual(pts[0], [M.pos('New Westminster').x, M.pos('New Westminster').y]);
  assert.deepStrictEqual(pts[pts.length - 1], [M.pos('Braid').x, M.pos('Braid').y]);
  const pts2 = M.routePoints(['Columbia', 'Scott Road']);
  assert.ok(pts2.length > 2, 'Scott Road is reached by the real bends, not a straight line');
});

test('map: the artwork file is TransLink\'s map and carries its credit', () => {
  const fs = require('node:fs');
  const art = fs.readFileSync(require('node:path').join(__dirname, '../site/map-art.js'), 'utf8');
  assert.ok(art.includes('TransLink SkyTrain Network Map') && art.includes('translink.ca'));
  assert.ok(art.length > 100000);
});
