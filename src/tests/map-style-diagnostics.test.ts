import { describe, expect, it } from 'vitest';

import { inspectMapStyle } from '../map/styleDiagnostics';

describe('map style diagnostics', () => {
  it('discovers the actual OpenFreeMap building extrusion and no DEM support', () => {
    const diagnostics = inspectMapStyle({
      sources: {
        ne2_shaded: { type: 'raster' },
        openmaptiles: { type: 'vector' },
      },
      layers: [
        {
          id: 'building',
          type: 'fill',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
        },
        {
          id: 'building-3d',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-height': ['get', 'render_height'],
            'fill-extrusion-base': ['get', 'render_min_height'],
          },
        },
      ],
    });

    expect(diagnostics.sourceIds).toEqual(['ne2_shaded', 'openmaptiles']);
    expect(diagnostics.terrainSupported).toBe(false);
    expect(diagnostics.building).toEqual({
      layerId: 'building-3d',
      sourceId: 'openmaptiles',
      sourceLayer: 'building',
      minZoom: 14,
      heightProperty: 'render_height',
      baseProperty: 'render_min_height',
    });
  });

  it('does not call a constant or height-less extrusion a data-backed building layer', () => {
    expect(inspectMapStyle({
      sources: { basemap: { type: 'vector' } },
      layers: [{
        id: 'fake-buildings',
        type: 'fill-extrusion',
        source: 'basemap',
        'source-layer': 'structures',
        paint: { 'fill-extrusion-height': 3 },
      }],
    }).building).toBeNull();
  });

  it('reports raster-dem support only from a real DEM source', () => {
    const diagnostics = inspectMapStyle({
      sources: {
        shadedRelief: { type: 'raster' },
        elevation: { type: 'raster-dem' },
      },
    });

    expect(diagnostics.terrainSupported).toBe(true);
    expect(diagnostics.terrainSourceIds).toEqual(['elevation']);
  });
});
