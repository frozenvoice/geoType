import type {
  GeoBoundingBox,
  GeoGeometry,
  GeoPosition,
} from './types';

const EPSILON = 1e-9;

function positionsForGeometry(geometry: GeoGeometry): GeoPosition[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'LineString':
      return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat(2);
  }
}

export function calculateBoundingBox(geometry: GeoGeometry): GeoBoundingBox {
  const positions = positionsForGeometry(geometry);
  const first = positions[0];

  if (!first) {
    throw new Error('Cannot calculate a bounding box for empty geometry.');
  }

  let west = first[0];
  let south = first[1];
  let east = first[0];
  let north = first[1];

  for (const [longitude, latitude] of positions.slice(1)) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  return [west, south, east, north];
}

function averagePositions(positions: GeoPosition[]): GeoPosition {
  if (positions.length === 0) {
    throw new Error('Cannot calculate a centroid for empty geometry.');
  }

  const [longitude, latitude] = positions.reduce(
    ([longitudeSum, latitudeSum], [currentLongitude, currentLatitude]) => [
      longitudeSum + currentLongitude,
      latitudeSum + currentLatitude,
    ],
    [0, 0],
  );

  return [longitude / positions.length, latitude / positions.length];
}

function lineCentroid(line: GeoPosition[]): { centroid: GeoPosition; weight: number } {
  if (line.length === 1 && line[0]) {
    return { centroid: line[0], weight: 1 };
  }

  let longitudeSum = 0;
  let latitudeSum = 0;
  let totalLength = 0;

  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    if (!start || !end) continue;

    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= EPSILON) continue;

    longitudeSum += ((start[0] + end[0]) / 2) * length;
    latitudeSum += ((start[1] + end[1]) / 2) * length;
    totalLength += length;
  }

  if (totalLength <= EPSILON) {
    return { centroid: averagePositions(line), weight: 1 };
  }

  return {
    centroid: [longitudeSum / totalLength, latitudeSum / totalLength],
    weight: totalLength,
  };
}

function ringCentroid(ring: GeoPosition[]): { centroid: GeoPosition; weight: number } {
  let twiceArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;

  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    if (!start || !end) continue;

    const cross = start[0] * end[1] - end[0] * start[1];
    twiceArea += cross;
    longitudeSum += (start[0] + end[0]) * cross;
    latitudeSum += (start[1] + end[1]) * cross;
  }

  if (Math.abs(twiceArea) <= EPSILON) {
    return { centroid: averagePositions(ring), weight: 1 };
  }

  return {
    centroid: [longitudeSum / (3 * twiceArea), latitudeSum / (3 * twiceArea)],
    weight: Math.abs(twiceArea / 2),
  };
}

function polygonCentroid(polygon: GeoPosition[][]): {
  centroid: GeoPosition;
  weight: number;
} {
  const exterior = polygon[0];
  if (!exterior) {
    throw new Error('Cannot calculate a centroid for an empty polygon.');
  }

  // The exterior ring defines the label point. Holes are deliberately ignored:
  // a stored centroid is a cartographic label point and must remain inside bbox.
  return ringCentroid(exterior);
}

function weightedCentroid(
  entries: Array<{ centroid: GeoPosition; weight: number }>,
): GeoPosition {
  if (entries.length === 0) {
    throw new Error('Cannot calculate a centroid for empty geometry.');
  }

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= EPSILON) {
    return averagePositions(entries.map((entry) => entry.centroid));
  }

  return entries.reduce<GeoPosition>(
    ([longitude, latitude], entry) => [
      longitude + (entry.centroid[0] * entry.weight) / totalWeight,
      latitude + (entry.centroid[1] * entry.weight) / totalWeight,
    ],
    [0, 0],
  );
}

export function calculateCentroid(geometry: GeoGeometry): GeoPosition {
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates;
    case 'LineString':
      return lineCentroid(geometry.coordinates).centroid;
    case 'MultiLineString':
      return weightedCentroid(geometry.coordinates.map(lineCentroid));
    case 'Polygon':
      return polygonCentroid(geometry.coordinates).centroid;
    case 'MultiPolygon':
      return weightedCentroid(geometry.coordinates.map(polygonCentroid));
  }
}

export function boundingBoxesEqual(
  left: GeoBoundingBox,
  right: GeoBoundingBox,
  tolerance = 1e-6,
): boolean {
  return left.every((value, index) => Math.abs(value - (right[index] ?? Number.NaN)) <= tolerance);
}

export function boundingBoxContainsPoint(
  [west, south, east, north]: GeoBoundingBox,
  [longitude, latitude]: GeoPosition,
  tolerance = 1e-6,
): boolean {
  return (
    longitude >= west - tolerance &&
    longitude <= east + tolerance &&
    latitude >= south - tolerance &&
    latitude <= north + tolerance
  );
}

export function positionsEqual(
  left: GeoPosition,
  right: GeoPosition,
  tolerance = 1e-6,
): boolean {
  return (
    Math.abs(left[0] - right[0]) <= tolerance &&
    Math.abs(left[1] - right[1]) <= tolerance
  );
}
