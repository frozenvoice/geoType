# GeoType development geodata fixture

This catalog is a deliberately small, generated development fixture. It is not
an authoritative map, a complete Korea dataset, or world coverage.

- Catalog: `dev-fixture-v1`
- Source: `custom / development-fixture-2026-07-19`
- Coverage: simplified Asia → Republic of Korea → Seoul/Gangwon sample
- Contents: 13 features in 6 lazy-loadable JSON shards
- Compression: none (small fixture); production adapters may emit Brotli shards

The geometry exists to exercise Polygon, MultiPolygon, LineString, Point,
hierarchy, checksum, cache, selection, and camera workflows. Replace it with a
licensed, preprocessed catalog before making geographic completeness or
boundary-accuracy claims.

Run `scripts/geodata/sync.ts` to regenerate this directory, then
`scripts/geodata/validate.ts` and `scripts/geodata/stats.ts` to verify and audit
its declared scope.

The production world provider is separate from this fixture. It reads the local
Natural Earth 1:10m country files in `world/countries.geojson` and
`world/countries-index.json`, plus the verified city/town points in
`world/populated-places.json` and their source metadata in
`world/populated-places-index.json`. The populated-place layer is a curated
selection of capitals, cities, and towns, not a complete settlement inventory.
