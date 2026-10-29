const test = require('node:test');
const assert = require('node:assert');
const M = require('../site/map.js');
const G = require('../site/game.js');

test('map: every game station is on the map, and nothing extra', () => {
  assert.deepStrictEqual(M.names.slice().sort(), G.stations.slice().sort());
});

test('map: the track connections match the game rules exactly', () => {
  for (const s of G.stations) {
    assert.deepStrictEqual([...M.touches[s]].sort(), G.adj[s].slice().sort(), s);
  }
});

test('map: the lines match the game (which lines serve which station)', () => {
  const served = {};
  for (const seg of M.SEGMENTS) for (const s of seg.stops) if (!Array.isArray(s)) (served[s] = served[s] || new Set()).add(seg.line);
  for (const s of G.stations) assert.deepStrictEqual([...served[s]].sort(), G.lines[s].slice().sort(), s);
});

test('map: track only runs straight or at 45 degrees', () => {
  for (const k of Object.keys(M.SEGMENTS.length ? {} : {})) void k;
  for (const seg of M.SEGMENTS) {
    const pts = []; let last = null;
    for (const s of seg.stops) pts.push(Array.isArray(s) ? s : Object.values(M.pos(s)));
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i][0] - pts[i - 1][0]), dy = Math.abs(pts[i][1] - pts[i - 1][1]);
      assert.ok(dx === 0 || dy === 0 || dx === dy, `${seg.line}: ${JSON.stringify(pts[i - 1])} to ${JSON.stringify(pts[i])}`);
    }
  }
});

test('map: stations are not on top of each other', () => {
  for (let i = 0; i < M.names.length; i++) for (let j = i + 1; j < M.names.length; j++) {
    const a = M.pos(M.names[i]), b = M.pos(M.names[j]);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 45, `${M.names[i]} / ${M.names[j]}`);
  }
});

test('map: a ride through the junction at Columbia follows the track', () => {
  const pts = M.routePoints(['New Westminster', 'Columbia', 'Sapperton', 'Braid']);
  assert.deepStrictEqual(pts[0], [820, 860]);
  assert.deepStrictEqual(pts[pts.length - 1], [930, 610]);
  assert.ok(pts.some((p) => p[0] === 930 && p[1] === 805), 'passes the bend');
});
