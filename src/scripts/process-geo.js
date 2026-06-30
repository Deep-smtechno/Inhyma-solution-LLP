const fs = require('fs');
const path = require('path');

const inputPath = '/Users/tirthnakrani/Downloads/SM/00 Code/Inhyma Website/World_geo.json';
const outputPath = path.join(__dirname, '../../public/data/world_simplified.json');

console.log('Reading World_geo.json...');
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const targets = new Set(['IN', 'CN', 'HK', 'AE', 'KE', 'UG', 'RW']);

console.log('Simplifying features with smart targeting...');
const simplifiedFeatures = data.features.map(f => {
  const code = (f.properties.iso_a2 || f.properties.ISO_A2 || f.properties.postal || '').toUpperCase().trim();
  const isTarget = targets.has(code) || targets.has(f.properties.name);
  
  const props = {
    name: f.properties.name,
    iso_a2: code,
    is_target: isTarget ? 1 : 0
  };

  const simplifyRing = (ring, isTargetCountry) => {
    const simplified = [];
    let lastX = null;
    let lastY = null;
    
    // Target countries get more detail; other countries are heavily simplified
    const step = isTargetCountry ? 1 : 8;
    const decimals = isTargetCountry ? 1000 : 100; // 3 decimals for targets, 2 decimals for others
    
    for (let i = 0; i < ring.length; i++) {
      if (i > 0 && i < ring.length - 1 && i % step !== 0) {
        continue;
      }
      const pt = ring[i];
      const x = Math.round(pt[0] * decimals) / decimals;
      const y = Math.round(pt[1] * decimals) / decimals;
      
      if (x !== lastX || y !== lastY) {
        simplified.push([x, y]);
        lastX = x;
        lastY = y;
      }
    }
    
    // Ensure the polygon ring is closed
    if (simplified.length > 0) {
      const first = simplified[0];
      const last = simplified[simplified.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        simplified.push([first[0], first[1]]);
      }
    }
    
    return simplified.length >= 4 ? simplified : null;
  };

  let geom = null;
  if (f.geometry) {
    if (f.geometry.type === 'Polygon') {
      const coords = f.geometry.coordinates.map(ring => simplifyRing(ring, isTarget)).filter(Boolean);
      if (coords.length > 0) {
        geom = {
          type: 'Polygon',
          coordinates: coords
        };
      }
    } else if (f.geometry.type === 'MultiPolygon') {
      const coords = f.geometry.coordinates.map(poly => {
        return poly.map(ring => simplifyRing(ring, isTarget)).filter(Boolean);
      }).filter(poly => poly.length > 0);
      
      if (coords.length > 0) {
        geom = {
          type: 'MultiPolygon',
          coordinates: coords
        };
      }
    }
  }

  if (!geom) return null;

  return {
    type: 'Feature',
    properties: props,
    geometry: geom
  };
}).filter(Boolean);

const outputData = {
  type: 'FeatureCollection',
  features: simplifiedFeatures
};

// Ensure dir exists
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log('Writing simplified map to:', outputPath);
fs.writeFileSync(outputPath, JSON.stringify(outputData), 'utf8');

const inputSize = fs.statSync(inputPath).size / (1024 * 1024);
const outputSize = fs.statSync(outputPath).size / (1024 * 1024);
console.log(`Done! Size reduced from ${inputSize.toFixed(2)} MB to ${outputSize.toFixed(2)} MB.`);
