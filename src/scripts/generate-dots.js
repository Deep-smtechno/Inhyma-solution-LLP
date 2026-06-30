const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../../public/data/world_simplified.json');
const outputPath = path.join(__dirname, '../../public/data/world_dots.json');

console.log('Reading world_simplified.json...');
const geoData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Target countries
const targets = new Set(['IN', 'CN', 'HK', 'AE', 'KE', 'UG', 'RW']);

function isPointInPolygon(point, vs) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getCountryForPoint(point, features) {
  for (const f of features) {
    if (!f.geometry) continue;
    
    if (f.geometry.type === 'Polygon') {
      if (isPointInPolygon(point, f.geometry.coordinates[0])) {
        return f.properties;
      }
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        if (poly[0] && isPointInPolygon(point, poly[0])) {
          return f.properties;
        }
      }
    }
  }
  return null;
}

console.log('Generating grid of dots in 2D projected Mercator space...');
const stepX = 1.0; // Horizontal spacing of dots (decreased from 1.8 for denser map)
const stepY = 1.15; // Vertical spacing of dots (decreased from 2.0 for denser map)


const dots = [];
const mapWidth = 360;
const mapHeight = 205.69;
const maxMercY = 2.436;

let rowIndex = 0;
for (let y = 0; y <= mapHeight; y += stepY) {
  const isOdd = (rowIndex % 2 === 1);
  const xOffset = isOdd ? stepX / 2 : 0;
  
  for (let x = 0; x <= mapWidth; x += stepX) {
    const virtualX = x + xOffset;
    if (virtualX > mapWidth) continue;
    
    // Convert virtual (x, y) back to geographic (lng, lat)
    const lng = virtualX - 180;
    
    const mercY = maxMercY - (y * (2 * Math.PI) / 360);
    const latRad = 2 * Math.atan(Math.exp(mercY)) - Math.PI / 2;
    const lat = latRad * 180 / Math.PI;
    
    const point = [lng, lat];
    
    // Check if point falls inside any country
    const country = getCountryForPoint(point, geoData.features);
    if (country) {
      const code = (country.iso_a2 || '').toUpperCase().trim();
      const isTarget = country.is_target === 1 || targets.has(code);
      
      dots.push({
        x: Math.round(virtualX * 100) / 100,
        y: Math.round(y * 100) / 100,
        lng: Math.round(lng * 100) / 100,
        lat: Math.round(lat * 100) / 100,
        code: code,
        name: country.name,
        isTarget: isTarget ? 1 : 0
      });
    }
  }
  rowIndex++;
}

console.log(`Generated ${dots.length} uniform Mercator dots.`);
console.log('Writing dots to:', outputPath);
fs.writeFileSync(outputPath, JSON.stringify(dots), 'utf8');

const outputSize = fs.statSync(outputPath).size / 1024;
console.log(`Done! Created world_dots.json (${outputSize.toFixed(1)} KB)`);
