(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkytrainData = factory();
})(this, function () {
  const LINES = {
    expo: { name: 'Expo Line', color: '#0b5fa5' },
    millennium: { name: 'Millennium Line', color: '#e0b400' },
    canada: { name: 'Canada Line', color: '#00a3b4' },
  };

  // Each segment is a run of stations in order. Stations that appear in more
  // than one segment (Waterfront, Commercial–Broadway, ...) are the transfers.
  const SEGMENTS = [
    { line: 'expo', stops: ['Waterfront', 'Burrard', 'Granville', 'Stadium–Chinatown', 'Main Street–Science World',
      'Commercial–Broadway', 'Nanaimo', '29th Avenue', 'Joyce–Collingwood', 'Patterson', 'Metrotown', 'Royal Oak',
      'Edmonds', '22nd Street', 'New Westminster', 'Columbia', 'Scott Road', 'Gateway', 'Surrey Central', 'King George'] },
    { line: 'expo', stops: ['Columbia', 'Sapperton', 'Braid', 'Lougheed Town Centre', 'Production Way–University'] },
    { line: 'millennium', stops: ['VCC–Clark', 'Commercial–Broadway', 'Renfrew', 'Rupert', 'Gilmore', 'Brentwood Town Centre',
      'Holdom', 'Sperling–Burnaby Lake', 'Lake City Way', 'Production Way–University', 'Lougheed Town Centre', 'Burquitlam',
      'Moody Centre', 'Inlet Centre', 'Coquitlam Central', 'Lincoln', 'Lafarge Lake–Douglas'] },
    { line: 'canada', stops: ['Waterfront', 'Vancouver City Centre', 'Yaletown–Roundhouse', 'Olympic Village', 'Broadway–City Hall',
      'King Edward', 'Oakridge–41st Avenue', 'Langara–49th Avenue', 'Marine Drive', 'Bridgeport', 'Capstan', 'Aberdeen',
      'Lansdowne', 'Richmond–Brighouse'] },
    { line: 'canada', stops: ['Bridgeport', 'Templeton', 'Sea Island Centre', 'YVR–Airport'] },
  ];

  // STUB challenges: swap in real ones later. minutes: null means no timer.
  const CARDS = [
    { id: 'flag', title: 'Find a Canada flag', text: 'Find a Canadian flag and take a photo with it.', minutes: 15 },
    { id: 'snack', title: 'Never-eaten snack', text: 'Go into a store you have never been in and buy something you have never eaten. Everyone tries a bite!', minutes: 20 },
    { id: 'dogs', title: 'Dog spotting', text: 'Spot 5 different dogs (from a polite distance).', minutes: 15 },
    { id: 'art', title: 'Public art', text: 'Find a mural, statue or other public art and strike the same pose.', minutes: 10 },
    { id: 'sign', title: 'Sign selfie', text: 'Take a silly group photo in front of the station sign.', minutes: 5 },
    { id: 'colours', title: 'Rainbow hunt', text: 'Find something red, something yellow and something blue. Photograph all three.', minutes: 10 },
    { id: 'jacks', title: 'Station workout', text: 'Do 10 jumping jacks together near the station entrance.', minutes: null },
    { id: 'vehicles', title: 'Vehicle bingo', text: 'Spot a bus, a bike, a truck and a boat or plane.', minutes: 15 },
    { id: 'song', title: 'Sing-along', text: 'Sing a verse of a song with no words, just humming. Others guess it.', minutes: null },
    { id: 'tree', title: 'Big tree', text: 'Find the biggest tree near the station and give it a hug.', minutes: 10 },
    { id: 'old', title: 'Oldest building', text: 'Find the oldest-looking building you can see and guess its age.', minutes: 10 },
    { id: 'door', title: 'Door detective', text: 'Find 3 doors that are each a different colour.', minutes: 10 },
  ];

  return { LINES, SEGMENTS, CARDS };
});
