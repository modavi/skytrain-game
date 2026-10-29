(function (root, factory) {
  const data = typeof require === 'function' ? require('./map-data.js') : root.SkytrainMapData;
  if (typeof module === 'object' && module.exports) module.exports = factory(data);
  else root.SkytrainMap = factory(data);
})(this, function (data) {
  // Positions and track come from TransLink's SkyTrain Network Map (see tools/build_translink_map.py).
  const VIEW = data.view;
  const names = Object.keys(data.stations);
  const pos = (name) => ({ x: data.stations[name][0], y: data.stations[name][1] });

  const edges = {}, touches = {};
  for (const [k, pts] of Object.entries(data.edges)) {
    const [a, b] = k.split('|');
    edges[a + '|' + b] = pts;
    edges[b + '|' + a] = pts.slice().reverse();
    (touches[a] = touches[a] || new Set()).add(b);
    (touches[b] = touches[b] || new Set()).add(a);
  }

  const edgePoints = (a, b) => edges[a + '|' + b];
  // One path of points for a whole ride through a list of stations.
  const routePoints = (path) => path.slice(1).reduce((pts, s, i) => pts.concat(edgePoints(path[i], s).slice(1)), [edgePoints(path[0], path[1])[0].slice()]);

  return { VIEW, names, pos, edgePoints, routePoints, touches, linesAt: data.linesAt, INTERCHANGES: data.interchanges };
});
