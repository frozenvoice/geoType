export type ReadinessSnapshot = {
  mapIdle: boolean;
  mapMoving: boolean;
  sourceLoaded: boolean;
  targetRendered: boolean;
  requiredLayerIds: string[];
  availableLayerIds: string[];
};

export type ReadinessResult = {
  ready: boolean;
  mapIdle: boolean;
  sourceReady: boolean;
  layersReady: boolean;
  targetRendered: boolean;
};

export function evaluateMapReadiness(snapshot: ReadinessSnapshot): ReadinessResult {
  const available = new Set(snapshot.availableLayerIds);
  const layersReady = snapshot.requiredLayerIds.every((id) => available.has(id));
  const mapIdle = snapshot.mapIdle && !snapshot.mapMoving;
  return {
    ready: mapIdle && snapshot.sourceLoaded && layersReady && snapshot.targetRendered,
    mapIdle,
    sourceReady: snapshot.sourceLoaded,
    layersReady,
    targetRendered: snapshot.targetRendered,
  };
}
