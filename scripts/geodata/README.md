# Geodata pipeline building blocks

These scripts intentionally ship with an offline custom development fixture.
They do not query public geocoders at game runtime and do not claim complete
coverage.

- `sync.ts`: deterministically generates the fixture shards and checksum manifest.
- `validate.ts`: checks schemas, byte sizes, checksums, geometry, bbox, centroids,
  duplicate ids, parent references, cycles, and descriptor metadata.
- `stats.ts`: prints catalog scope, source versions, totals, and type/country counts.
- `importNaturalEarthPopulatedPlaces.ts`: imports the official Natural Earth
  1:10m Populated Places v5.1.2 shapefile into the production city/town point
  layer. Set `NE_POPULATED_SOURCE_DIR` to the extracted source directory.
- `validateWorldPopulatedPlaces.ts`: checks production city/town point schema,
  country parents, source metadata, names, and generated index counts.

The project-level npm aliases can point to these entry files through `tsx`. The
sync command accepts `--scope=world` and `--countries=KR` for compatibility, but
rejects unsupported countries instead of pretending they were synchronized.
