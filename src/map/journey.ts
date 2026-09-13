import type { GeoFeature, GeoPosition } from '../geodata/types';
import type { GeoJsonFeatureCollection } from './types';
import type { MapLayerSpecification } from './layers';

export type JourneyStop = { feature: GeoFeature; result: 'correct' | 'miss' };
export const JOURNEY_SOURCE_ID = 'geotype-journey';

/** Split at the date line so an eastward flight never draws across the whole map. */
export function connectJourneyPoints(from: GeoPosition, to: GeoPosition): GeoPosition[][] {
  const delta = ((to[0] - from[0] + 540) % 360) - 180;
  const end = from[0] + delta;
  if (end >= -180 && end <= 180) return [[from, to]];
  const boundary = end > 180 ? 180 : -180;
  const latitude = from[1] + (to[1] - from[1]) * ((boundary - from[0]) / delta);
  return [[from, [boundary, latitude]], [[-boundary, latitude], to]];
}

export function createJourneyCollection(stops: readonly JourneyStop[]): GeoJsonFeatureCollection {
  const points: GeoJsonFeatureCollection['features'] = stops.map(({ feature, result }, index) => ({
    type: 'Feature', id: `stop:${feature.id}`, properties: { id: `stop:${feature.id}`, result, order: index + 1 },
    geometry: { type: 'Point', coordinates: feature.centroid },
  }));
  const paths = stops.slice(1).flatMap((stop, index) =>
    connectJourneyPoints(stops[index]!.feature.centroid, stop.feature.centroid));
  return {
    type: 'FeatureCollection',
    features: paths.length ? [{
      type: 'Feature', id: 'route', properties: { id: 'route' },
      geometry: { type: 'MultiLineString', coordinates: paths },
    }, ...points] : points,
  };
}

export function createJourneyLayers(): MapLayerSpecification[] {
  return [{
    id: 'geotype-journey-route', type: 'line', source: JOURNEY_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#17617a', 'line-width': 2, 'line-opacity': 0.65, 'line-dasharray': [2, 2] },
  }, {
    id: 'geotype-journey-stops', type: 'circle', source: JOURNEY_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5,
      'circle-color': ['match', ['get', 'result'], 'correct', '#20b99b', '#e86c65'],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
    },
  }];
}
