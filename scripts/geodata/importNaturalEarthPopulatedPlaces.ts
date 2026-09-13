import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorldCountryIndexSchema } from '../../src/geodata/countries';
import {
  NATURAL_EARTH_POPULATED_PLACES_CATALOG_VERSION,
  NATURAL_EARTH_POPULATED_PLACES_SOURCE,
  NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION,
} from '../../src/geodata/populatedPlaces';
import type { GeoFeature, GeoFeatureType, GeoPosition } from '../../src/geodata/types';
import { inferIso15924Script } from '../../src/language/migration';

type DbValue = string | number;
type DbRecord = Record<string, DbValue>;

type ShapefilePoint = {
  coordinates: GeoPosition;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');
const sourceDirectory = resolve(
  process.env.NE_POPULATED_SOURCE_DIR ?? resolve(projectRoot, '.tmp-ne-pop'),
);
const outputDirectory = resolve(projectRoot, 'public/geodata/world');

function sha256(payload: string | Uint8Array): string {
  return createHash('sha256').update(payload).digest('hex');
}

function readDbfRecords(payload: Uint8Array): DbRecord[] {
  const buffer = Buffer.from(payload);
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields: Array<{ name: string; offset: number; size: number; type: string }> = [];
  let offset = 0;

  for (let descriptorOffset = 32; descriptorOffset < headerLength - 1; descriptorOffset += 32) {
    const name = buffer
      .toString('ascii', descriptorOffset, descriptorOffset + 11)
      .split(String.fromCharCode(0))[0]
      ?.trim();
    if (!name) break;
    fields.push({
      name,
      offset,
      size: buffer.readUInt8(descriptorOffset + 16),
      type: buffer.toString('ascii', descriptorOffset + 11, descriptorOffset + 12),
    });
    offset += fields.at(-1)?.size ?? 0;
  }

  const records: DbRecord[] = [];
  for (let row = 0; row < recordCount; row += 1) {
    const recordOffset = headerLength + row * recordLength;
    if (buffer[recordOffset] === 0x2a) continue;
    const record: DbRecord = {};
    for (const field of fields) {
      const value = buffer
        .toString('utf8', recordOffset + 1 + field.offset, recordOffset + 1 + field.offset + field.size)
        .trim();
      record[field.name] = field.type === 'N' && value.length > 0 ? Number(value) : value;
    }
    records.push(record);
  }
  return records;
}

function readPointShapefile(payload: Uint8Array): ShapefilePoint[] {
  const buffer = Buffer.from(payload);
  const points: ShapefilePoint[] = [];
  let offset = 100;
  while (offset + 8 <= buffer.byteLength) {
    const contentLengthWords = buffer.readInt32BE(offset + 4);
    const recordLength = 8 + contentLengthWords * 2;
    if (recordLength < 28 || offset + recordLength > buffer.byteLength) {
      throw new Error(`Invalid point shapefile record at byte ${offset}.`);
    }
    const shapeType = buffer.readInt32LE(offset + 8);
    if (shapeType !== 1) {
      throw new Error(`Expected point geometry, found shapefile type ${shapeType}.`);
    }
    points.push({
      coordinates: [
        buffer.readDoubleLE(offset + 12),
        buffer.readDoubleLE(offset + 20),
      ],
    });
    offset += recordLength;
  }
  return points;
}

function text(record: DbRecord, field: string): string | undefined {
  const value = record[field];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().normalize('NFC');
  return normalized.length > 0 && normalized !== '-99' ? normalized : undefined;
}

function number(record: DbRecord, field: string): number | undefined {
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function flag(record: DbRecord, field: string): boolean {
  return number(record, field) === 1;
}

function unique(values: readonly (string | undefined)[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const key = value.normalize('NFC').toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value.normalize('NFC'));
  }
  return result;
}

function addName(
  names: PlaceNameInput[],
  value: string | undefined,
  locale: string,
  kind: PlaceNameInput['kind'],
  isPreferred: boolean,
): void {
  if (!value) return;
  const script = inferIso15924Script(value);
  if (names.some((candidate) => candidate.locale === locale && candidate.kind === kind && candidate.value === value)) {
    return;
  }
  names.push({
    locale,
    ...(script ? { script } : {}),
    value,
    kind,
    isPreferred,
  });
}

type PlaceNameInput = NonNullable<GeoFeature['names']>[number];

const nativeFields: Readonly<Record<string, { locale: string; field: string }>> = {
  DE: { locale: 'de', field: 'NAME_DE' },
  EG: { locale: 'ar', field: 'NAME_AR' },
  FR: { locale: 'fr', field: 'NAME_FR' },
  JP: { locale: 'ja', field: 'NAME_JA' },
  KR: { locale: 'ko', field: 'NAME_KO' },
  RU: { locale: 'ru', field: 'NAME_RU' },
  US: { locale: 'en', field: 'NAME_EN' },
};

function classifyFeature(record: DbRecord): { featureType: Extract<GeoFeatureType, 'city' | 'town'>; capital: boolean } {
  const featureClass = text(record, 'FEATURECLA')?.toLocaleLowerCase() ?? '';
  const isAdminCapital = featureClass.includes('capital');
  const isCity =
    isAdminCapital ||
    flag(record, 'WORLDCITY') ||
    flag(record, 'MEGACITY') ||
    (number(record, 'POP_MAX') ?? 0) >= 100_000;
  return {
    featureType: isCity ? 'city' : 'town',
    capital: isAdminCapital && (flag(record, 'ADM0CAP') || flag(record, 'CAPALT')),
  };
}

function toFeature(
  record: DbRecord,
  point: ShapefilePoint,
  country: { id: string; continentId: string; isoAlpha2: string | null; isoAlpha3: string | null },
): GeoFeature {
  const nameEn = text(record, 'NAME_EN') ?? text(record, 'NAMEASCII') ?? text(record, 'NAME');
  const nameKo = text(record, 'NAME_KO');
  const nameAscii = text(record, 'NAMEASCII');
  if (!nameEn || !nameKo || !nameAscii) {
    throw new Error(`Place ${String(record.NE_ID)} is missing a required explicit name field.`);
  }

  const names: PlaceNameInput[] = [];
  addName(names, nameKo, 'ko', 'localized', true);
  addName(names, nameEn, 'en', 'localized', true);
  addName(names, nameAscii, 'en', 'romanized', true);

  const countryCode = country.isoAlpha2 ?? undefined;
  const nativeField = countryCode ? nativeFields[countryCode] : undefined;
  if (nativeField) addName(names, text(record, nativeField.field), nativeField.locale, 'localized', true);

  const { featureType, capital } = classifyFeature(record);
  const [longitude, latitude] = point.coordinates;
  const id = `natural-earth:place:${String(record.NE_ID)}`;
  const sourceName = text(record, 'NAME');
  const aliases = unique([nameKo, nameEn, nameAscii, sourceName, text(record, 'NAMEALT'), text(record, 'NAMEPAR')]);
  const feature: GeoFeature = {
    id,
    source: 'natural-earth',
    sourceVersion: NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION,
    featureType,
    name: nameKo,
    localizedNames: { ko: nameKo, en: nameEn },
    aliases,
    names,
    geometry: { type: 'Point', coordinates: point.coordinates },
    centroid: point.coordinates,
    bbox: [longitude, latitude, longitude, latitude],
    parentIds: [country.id],
    ...(country.isoAlpha2 ? { countryCode: country.isoAlpha2 } : {}),
    ...(country.isoAlpha3 ? { countryCodeAlpha3: country.isoAlpha3 } : {}),
    continentId: country.continentId,
    ...(number(record, 'POP_MAX') !== undefined
      ? { population: Math.max(0, Math.trunc(number(record, 'POP_MAX') ?? 0)) }
      : {}),
    ...(capital ? { capital: true } : {}),
    recommendedMinZoom: Math.max(0, Math.min(24, number(record, 'MIN_ZOOM') ?? (featureType === 'city' ? 6 : 8))),
    recommendedMaxZoom: 18,
  };
  return feature;
}

const dbfPayload = await readFile(resolve(sourceDirectory, 'ne_10m_populated_places.dbf'));
const shpPayload = await readFile(resolve(sourceDirectory, 'ne_10m_populated_places.shp'));
const [records, points] = [readDbfRecords(dbfPayload), readPointShapefile(shpPayload)];
if (records.length !== points.length) {
  throw new Error(`DBF/SHP record counts differ: ${records.length} vs ${points.length}.`);
}

const countryIndexPayload = JSON.parse(
  await readFile(resolve(projectRoot, 'public/geodata/world/countries-index.json'), 'utf8'),
) as unknown;
const countryIndex = WorldCountryIndexSchema.parse(countryIndexPayload);
const countryByCode = new Map<string, (typeof countryIndex.countries)[number]>();
for (const country of countryIndex.countries) {
  countryByCode.set(country.naturalEarthCode, country);
  if (country.isoAlpha3) countryByCode.set(country.isoAlpha3, country);
}

const allowedFeatureClasses = new Set([
  'Populated place',
  'Populated Place',
  'Admin-0 capital',
  'Admin-0 capital alt',
  'Admin-0 region capital',
  'Admin-1 capital',
  'Admin-1 region capital',
]);
const features: GeoFeature[] = [];
const skipped: Record<string, number> = {};
for (let index = 0; index < records.length; index += 1) {
  const record = records[index];
  const point = points[index];
  if (!record || !point) continue;
  const featureClass = text(record, 'FEATURECLA') ?? '';
  if (!allowedFeatureClasses.has(featureClass)) {
    skipped[featureClass] = (skipped[featureClass] ?? 0) + 1;
    continue;
  }
  const country = countryByCode.get(text(record, 'ADM0_A3') ?? '');
  if (!country) {
    skipped[`unmatched-country:${text(record, 'ADM0_A3') ?? 'unknown'}`] =
      (skipped[`unmatched-country:${text(record, 'ADM0_A3') ?? 'unknown'}`] ?? 0) + 1;
    continue;
  }
  features.push(toFeature(record, point, country));
}

const ids = new Set(features.map((feature) => feature.id));
if (ids.size !== features.length) throw new Error('Populated place ids are not unique.');
const collection = { type: 'FeatureCollection' as const, features };
const collectionPayload = `${JSON.stringify(collection)}\n`;
const featureTypeCounts: { city: number; town: number } = { city: 0, town: 0 };
for (const feature of features) {
  if (feature.featureType === 'city') featureTypeCounts.city += 1;
  else if (feature.featureType === 'town') featureTypeCounts.town += 1;
}
const countryCodes = new Set(features.map((feature) => feature.countryCode).filter(Boolean));
const capitalCount = features.filter((feature) => feature.capital === true).length;
const index = {
  schemaVersion: 1,
  catalogVersion: NATURAL_EARTH_POPULATED_PLACES_CATALOG_VERSION,
  generatedAt: '2026-09-13T00:00:00.000Z',
  source: {
    ...NATURAL_EARTH_POPULATED_PLACES_SOURCE,
    sourceDbfSha256: sha256(dbfPayload),
  },
  featureCount: features.length,
  countryCount: countryCodes.size,
  capitalCount,
  featureTypeCounts,
  languageFieldCounts: {
    ko: features.filter((feature) => feature.names?.some((name) => name.locale === 'ko')).length,
    en: features.filter((feature) => feature.names?.some((name) => name.locale === 'en' && name.kind === 'localized')).length,
    romanized: features.filter((feature) => feature.names?.some((name) => name.kind === 'romanized')).length,
    nativeProfile: features.filter((feature) => feature.names?.some((name) => ['de', 'ar', 'fr', 'ja', 'ru'].includes(name.locale))).length,
  },
  sourceFeatureCount: records.length,
  skipped,
  geoJsonSha256: sha256(collectionPayload),
  geoJsonByteSize: Buffer.byteLength(collectionPayload),
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'populated-places.json'), collectionPayload, 'utf8');
await writeFile(resolve(outputDirectory, 'populated-places-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      source: NATURAL_EARTH_POPULATED_PLACES_SOURCE,
      records: records.length,
      generated: features.length,
      countryCount: countryCodes.size,
      featureTypeCounts,
      capitalCount,
      skipped,
      geoJsonByteSize: Buffer.byteLength(collectionPayload),
    },
    null,
    2,
  ),
);
