import { useEffect, useMemo } from 'react';
import type { GeoFeature, GeoGeometry, GeoPosition } from '../geodata/types';
import type { MapMode, MapReadiness } from './types';
import type { JourneyStop } from './journey';
import './simple-map.css';

type Props = {
  features: readonly GeoFeature[];
  target: GeoFeature | null;
  targetName?: string;
  mode: MapMode;
  visited: readonly JourneyStop[];
  questionKey: string;
  onSelect: (feature: GeoFeature) => void;
  onReady: (readiness: MapReadiness) => void;
  onRetry: () => void;
};

const xy = ([longitude, latitude]: GeoPosition) => `${longitude + 180},${90 - latitude}`;

function geometryPath(geometry: GeoGeometry): string {
  if (geometry.type === 'Point') return '';
  const rings = geometry.type === 'Polygon' ? geometry.coordinates
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat()
      : geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const closed = geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
  return rings.map((ring) => `M${ring.map(xy).join('L')}${closed ? 'Z' : ''}`).join('');
}

export function SimpleMapRenderer({ features, target, targetName, mode, visited, questionKey, onSelect, onReady, onRetry }: Props) {
  const countries = useMemo(() => features.filter((feature) => feature.featureType === 'country')
    .map((feature) => ({ feature, path: geometryPath(feature.geometry) })), [features]);
  const bounds = target?.bbox ?? [-180, -80, 180, 85];
  const width = Math.max(bounds[2] - bounds[0], target?.featureType === 'city' ? 8 : 1);
  const height = Math.max(bounds[3] - bounds[1], target?.featureType === 'city' ? 5 : 1);
  const cx = target?.centroid[0] ?? 0;
  const cy = target?.centroid[1] ?? 5;
  const viewWidth = Math.min(380, Math.max(width * 1.35, height * 2));
  const viewHeight = Math.max(height * 1.35, viewWidth / 2);
  const viewBox = `${cx + 180 - viewWidth / 2} ${90 - cy - viewHeight / 2} ${viewWidth} ${viewHeight}`;

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => onReady({
        transitionId: 0, questionKey, mode, featureId: target?.id ?? null,
        mapIdle: true, sourceReady: true, layersReady: true, targetRendered: true,
      }));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [mode, onReady, questionKey, target?.id]);

  return (
    <section className={`simple-map simple-map-${mode}`} data-map-mode={mode} data-map-provider="simple" data-visited-count={visited.length} aria-label="간단 지도">
      <div className="simple-map-notice"><span>간단 지도 · 3D·도로 미지원</span><button type="button" onClick={onRetry}>3D 지도 다시 연결</button></div>
      <div className="simple-map-viewport">
        <svg viewBox={viewBox} aria-label={mode === 'question' ? '표시된 목표 위치' : '국가와 방문 위치 지도'}>
          <rect x="-1000" y="-1000" width="3000" height="3000" fill="#152e40" />
          {countries.map(({ feature, path }) => <path key={feature.id} d={path}
            className={feature.id === target?.id ? 'simple-country is-target' : 'simple-country'}
            vectorEffect="non-scaling-stroke"
            onClick={mode === 'browse' ? () => onSelect(feature) : undefined}>
            {mode !== 'question' && <title>{feature.localizedNames.ko ?? feature.name}</title>}
          </path>)}
          {visited.map(({ feature, result }) => <circle key={feature.id} cx={feature.centroid[0] + 180} cy={90 - feature.centroid[1]} r={viewWidth * 0.006} fill={result === 'correct' ? '#52dfbd' : '#fa8585'} />)}
          {target?.geometry.type === 'Point' && <g>
            <circle cx={cx + 180} cy={90 - cy} r={viewWidth * 0.023} fill="#f9ce7044" />
            <circle cx={cx + 180} cy={90 - cy} r={viewWidth * 0.009} fill="#f9ce70" />
          </g>}
          {target && mode === 'reveal' && <text x={cx + 180} y={90 - cy - viewHeight * 0.08} textAnchor="middle" fill="white" fontSize={viewWidth * 0.035} stroke="#102132" strokeWidth={viewWidth * 0.005} paintOrder="stroke">{targetName ?? target.localizedNames.ko ?? target.name}</text>}
        </svg>
      </div>
      <small className="simple-map-attribution">국가 경계: Natural Earth · Public domain</small>
    </section>
  );
}
