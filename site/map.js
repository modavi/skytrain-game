(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkytrainMap = factory();
})(this, function () {
  // Our own schematic of the SkyTrain network. Drawn from the real station order,
  // with straight lines and 45 degree bends, north at the top. Not TransLink's artwork.
  //
  // Each station is [x, y, label]. A label is a preset name or [dx, dy, anchor, rotation].
  const LABELS = {
    l: [-12, 4, 'end', 0], r: [12, 4, 'start', 0], u: [0, -13, 'middle', 0], d: [0, 20, 'middle', 0],
    ul: [-12, -10, 'end', 0], rd: [20, 0, 'start', 0], dl: [-10, 18, 'end', 0], ur: [7, -7, 'start', -45], dr: [7, 15, 'start', 45],
  };

  const STATIONS = {
    // Canada Line, straight down the left side
    'Waterfront': [190, 450, 'ul'], 'Vancouver City Centre': [190, 505, 'l'], 'Yaletown–Roundhouse': [190, 560, 'l'],
    'Olympic Village': [190, 615, 'l'], 'Broadway–City Hall': [190, 670, 'l'], 'King Edward': [190, 725, 'l'],
    'Oakridge–41st Avenue': [190, 780, 'l'], 'Langara–49th Avenue': [190, 835, 'l'], 'Marine Drive': [190, 890, 'l'],
    'Bridgeport': [190, 945, 'r'], 'Capstan': [190, 1000, 'l'], 'Aberdeen': [190, 1055, 'l'], 'Lansdowne': [190, 1110, 'l'],
    'Richmond–Brighouse': [190, 1165, 'l'],
    'Templeton': [140, 945, [0, 22, 'middle', 0]], 'Sea Island Centre': [90, 945, [0, 40, 'middle', 0]], 'YVR–Airport': [40, 945, [0, 22, 'middle', 0]],
    // Expo Line, east from Waterfront then south-east
    'Burrard': [240, 450, 'dr'], 'Granville': [290, 450, 'dr'], 'Stadium–Chinatown': [340, 450, 'dr'],
    'Main Street–Science World': [390, 450, 'dr'], 'Commercial–Broadway': [460, 450, 'dr'],
    'Nanaimo': [520, 450, 'u'], '29th Avenue': [570, 500, 'rd'], 'Joyce–Collingwood': [620, 550, 'rd'], 'Patterson': [670, 600, 'rd'],
    'Metrotown': [720, 650, 'rd'], 'Royal Oak': [770, 700, 'rd'], 'Edmonds': [820, 750, 'r'], '22nd Street': [820, 805, 'l'],
    'New Westminster': [820, 860, 'l'], 'Columbia': [820, 915, 'l'], 'Scott Road': [870, 965, 'l'], 'Gateway': [920, 1015, 'l'],
    'Surrey Central': [920, 1070, 'l'], 'King George': [920, 1125, 'l'],
    // Expo Line's Lougheed branch
    'Sapperton': [870, 865, 'r'], 'Braid': [930, 610, 'r'], 'Lougheed Town Centre': [930, 470, 'l'],
    'Production Way–University': [930, 400, [-10, 20, 'end', 0]],
    // Millennium Line
    'VCC–Clark': [410, 400, 'l'], 'Renfrew': [510, 400, 'ur'], 'Rupert': [570, 400, 'ur'], 'Gilmore': [630, 400, 'ur'],
    'Brentwood Town Centre': [690, 400, 'ur'], 'Holdom': [750, 400, 'ur'], 'Sperling–Burnaby Lake': [810, 400, 'ur'],
    'Lake City Way': [870, 400, 'ur'], 'Burquitlam': [990, 470, 'r'], 'Moody Centre': [990, 360, 'r'], 'Inlet Centre': [990, 300, 'r'],
    'Coquitlam Central': [990, 240, 'r'], 'Lincoln': [990, 180, 'r'], 'Lafarge Lake–Douglas': [990, 120, 'r'],
  };

  // A run of stations in order; [x, y] pairs are bends in the track.
  const SEGMENTS = [
    { line: 'canada', stops: ['Waterfront', 'Vancouver City Centre', 'Yaletown–Roundhouse', 'Olympic Village', 'Broadway–City Hall',
      'King Edward', 'Oakridge–41st Avenue', 'Langara–49th Avenue', 'Marine Drive', 'Bridgeport', 'Capstan', 'Aberdeen', 'Lansdowne', 'Richmond–Brighouse'] },
    { line: 'canada', stops: ['Bridgeport', 'Templeton', 'Sea Island Centre', 'YVR–Airport'] },
    { line: 'expo', stops: ['Waterfront', 'Burrard', 'Granville', 'Stadium–Chinatown', 'Main Street–Science World', 'Commercial–Broadway', 'Nanaimo',
      '29th Avenue', 'Joyce–Collingwood', 'Patterson', 'Metrotown', 'Royal Oak', 'Edmonds', '22nd Street', 'New Westminster', 'Columbia',
      'Scott Road', 'Gateway', 'Surrey Central', 'King George'] },
    { line: 'expo', stops: ['Columbia', 'Sapperton', [930, 805], 'Braid', 'Lougheed Town Centre', 'Production Way–University'] },
    { line: 'millennium', stops: ['VCC–Clark', 'Commercial–Broadway', 'Renfrew', 'Rupert', 'Gilmore', 'Brentwood Town Centre', 'Holdom',
      'Sperling–Burnaby Lake', 'Lake City Way', 'Production Way–University', 'Lougheed Town Centre', 'Burquitlam', 'Moody Centre', 'Inlet Centre',
      'Coquitlam Central', 'Lincoln', 'Lafarge Lake–Douglas'] },
  ];

  const INTERCHANGES = ['Waterfront', 'Commercial–Broadway', 'Lougheed Town Centre', 'Production Way–University'];
  const VIEW = { x: -10, y: 70, w: 1150, h: 1150 };

  const pos = (name) => ({ x: STATIONS[name][0], y: STATIONS[name][1] });
  const label = (name) => { const l = STATIONS[name][2]; return Array.isArray(l) ? l : LABELS[l]; };

  // Track geometry between neighbouring stations (including any bends), and which stations touch.
  const edges = {}, touches = {};
  const key = (a, b) => a + '|' + b;
  for (const seg of SEGMENTS) {
    let prev = null, bends = [];
    for (const s of seg.stops) {
      if (Array.isArray(s)) { bends.push(s); continue; }
      if (prev) {
        const pts = [[...Object.values(pos(prev))], ...bends, [...Object.values(pos(s))]];
        if (!edges[key(prev, s)]) {
          edges[key(prev, s)] = pts;
          edges[key(s, prev)] = pts.slice().reverse();
        }
        (touches[prev] = touches[prev] || new Set()).add(s);
        (touches[s] = touches[s] || new Set()).add(prev);
      }
      prev = s; bends = [];
    }
  }
  const edgePoints = (a, b) => edges[key(a, b)];
  // The full path of points for a ride through a list of stations.
  const routePoints = (path) => path.slice(1).reduce((pts, s, i) => pts.concat(edgePoints(path[i], s).slice(1)), [[...Object.values(pos(path[0]))]]);

  return { LABELS, STATIONS, SEGMENTS, INTERCHANGES, VIEW, pos, label, edgePoints, routePoints, touches,
    names: Object.keys(STATIONS) };
});
