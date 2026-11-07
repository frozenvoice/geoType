export type ReadinessSnapshot = {
  mapIdle: boolean;
  mapMoving: boolean;
  sourceLoaded: boolean;
  targetRendered: boolean;
  requiredLayerIds: string[];
  availableLayerIds: string[];
  /**
   * The wait for this question ran out. A game must never lock its input on a
   * map signal that may not arrive, so this waives idle, source and render
   * checks. The camera still has to stop and the layers still have to exist.
   */
  deadlineExpired?: boolean;
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
    ready: layersReady && (
      snapshot.deadlineExpired === true
        ? !snapshot.mapMoving
        : mapIdle && snapshot.sourceLoaded && snapshot.targetRendered
    ),
    mapIdle,
    sourceReady: snapshot.sourceLoaded,
    layersReady,
    targetRendered: snapshot.targetRendered,
  };
}
