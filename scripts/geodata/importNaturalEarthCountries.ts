import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Position = [number, number];
type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] };
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };
type CountryGeometry = PolygonGeometry | MultiPolygonGeometry;

type NaturalEarthFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: CountryGeometry;
};

type NaturalEarthCollection = {
  type: 'FeatureCollection';
  features: NaturalEarthFeature[];
};

const SOURCE_VERSION = '5.1.1';
const ARCHIVE_SHA256 = 'ce1ac7036499a0edd641fbc093cd209a98f96a49d2eca8480aaacad35138a7f6';
const GENERATED_AT = '2026-07-19T00:00:00.000Z';

const continentDefinitions = {
  Asia: { code: 'asia', nameKo: '아시아', nameEn: 'Asia' },
  Europe: { code: 'europe', nameKo: '유럽', nameEn: 'Europe' },
  Africa: { code: 'africa', nameKo: '아프리카', nameEn: 'Africa' },
  'North America': {
    code: 'north-america',
    nameKo: '북아메리카',
    nameEn: 'North America',
  },
  'South America': {
    code: 'south-america',
    nameKo: '남아메리카',
    nameEn: 'South America',
  },
  Oceania: { code: 'oceania', nameKo: '오세아니아', nameEn: 'Oceania' },
  Antarctica: { code: 'antarctica', nameKo: '남극', nameEn: 'Antarctica' },
} as const;

type ContinentName = keyof typeof continentDefinitions;

function sourceString(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key];
  if (typeof value !== 'string') return null;
  const normalized = value.trim().normalize('NFC');
  return normalized && normalized !== '-99' ? normalized : null;
}

function sourceNumber(properties: Record<string, unknown>, key: string): number | null {
  const value = properties[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requireSourceString(properties: Record<string, unknown>, key: string): string {
  const value = sourceString(properties, key);
  if (!value) throw new Error(`Natural Earth feature is missing ${key}.`);
  return value;
}

function validAlpha2(value: string | null): value is string {
  return value !== null && /^[A-Z]{2}$/.test(value);
}

function validAlpha3(value: string | null): value is string {
  return value !== null && /^[A-Z]{3}$/.test(value);
}

function continentName(properties: Record<string, unknown>): ContinentName {
  const raw = requireSourceString(properties, 'CONTINENT');
  if (raw !== 'Seven seas (open ocean)') {
    if (raw in continentDefinitions) return raw as ContinentName;
    throw new Error(`Unsupported Natural Earth continent: ${raw}`);
  }

  // Clipperton Island is the only Admin-0 country feature assigned to the
  // open-ocean bucket in v5.1.1. Natural Earth's own UN/subregion fields place
  // it in Central America, so the game navigation groups it in North America.
  const subregion = sourceString(properties, 'SUBREGION');
  if (subregion === 'Central America' || subregion === 'Caribbean') {
    return 'North America';
  }
  const region = sourceString(properties, 'REGION_UN');
  if (region === 'Africa') return 'Africa';
  if (region === 'Asia') return 'Asia';
  if (region === 'Americas') return 'South America';
  throw new Error(`Cannot assign open-ocean feature to a continent (${subregion ?? 'unknown'}).`);
}

function positions(geometry: CountryGeometry): Position[] {
  return geometry.type === 'Polygon'
    ? geometry.coordinates.flat()
    : geometry.coordinates.flat(2);
}

function boundingBox(geometry: CountryGeometry): [number, number, number, number] {
  const allPositions = positions(geometry);
  const first = allPositions[0];
  if (!first) throw new Error('Natural Earth country has empty geometry.');
  let [west, south] = first;
  let [east, north] = first;
  for (const [longitude, latitude] of allPositions.slice(1)) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }
  return [west, south, east, north];
}

function fallbackCentroid(bbox: [number, number, number, number]): Position {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function bboxContains(
  bbox: [number, number, number, number],
  [longitude, latitude]: Position,
): boolean {
  return (
    longitude >= bbox[0] &&
    longitude <= bbox[2] &&
    latitude >= bbox[1] &&
    latitude <= bbox[3]
  );
}

function uniqueText(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = value.normalize('NFC');
    const key = normalized.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

function parseInputPath(): string {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--input='));
  if (!argument) {
    throw new Error(
      'Pass the official Natural Earth GeoJSON path as --input=/path/ne_10m_admin_0_countries.geojson.',
    );
  }
  return resolve(argument.slice('--input='.length));
}

async function run(): Promise<void> {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDirectory, '../..');
  const outputDirectory = resolve(projectRoot, 'public/geodata/world');
  const sourcePayload = await readFile(parseInputPath(), 'utf8');
  const source = JSON.parse(sourcePayload) as NaturalEarthCollection;
  if (source.type !== 'FeatureCollection' || source.features.length !== 258) {
    throw new Error(
      `Expected Natural Earth Admin-0 Countries v${SOURCE_VERSION} with 258 features.`,
    );
  }

  const countries = source.features.map((sourceFeature) => {
    if (!['Polygon', 'MultiPolygon'].includes(sourceFeature.geometry.type)) {
      throw new Error('Every Natural Earth country must have Polygon or MultiPolygon geometry.');
    }
    const properties = sourceFeature.properties;
    const naturalEarthCode = requireSourceString(properties, 'ADM0_A3');
    if (!validAlpha3(naturalEarthCode)) {
      throw new Error('Natural Earth ADM0_A3 must be a three-letter uppercase code.');
    }

    const directAlpha2 = sourceString(properties, 'ISO_A2');
    const directAlpha3 = sourceString(properties, 'ISO_A3');
    const evenHandedAlpha2 = sourceString(properties, 'ISO_A2_EH');
    const evenHandedAlpha3 = sourceString(properties, 'ISO_A3_EH');
    const matchingEvenHandedAlpha3 =
      validAlpha3(evenHandedAlpha3) && evenHandedAlpha3 === naturalEarthCode
        ? evenHandedAlpha3
        : null;
    const isoAlpha3 = validAlpha3(directAlpha3)
      ? directAlpha3
      : matchingEvenHandedAlpha3;
    const isoAlpha2 = validAlpha2(directAlpha2)
      ? directAlpha2
      : isoAlpha3 && validAlpha2(evenHandedAlpha2)
        ? evenHandedAlpha2
        : null;

    const nameEn =
      sourceString(properties, 'NAME_EN') ?? requireSourceString(properties, 'NAME');
    const nameKo = sourceString(properties, 'NAME_KO');
    const nameLocal = nameEn;
    const continent = continentDefinitions[continentName(properties)];
    const bbox = boundingBox(sourceFeature.geometry);
    const labelLongitude = sourceNumber(properties, 'LABEL_X');
    const labelLatitude = sourceNumber(properties, 'LABEL_Y');
    const naturalEarthLabelPoint: Position | null =
      labelLongitude !== null && labelLatitude !== null
        ? [labelLongitude, labelLatitude]
        : null;
    const centroid: Position =
      naturalEarthLabelPoint && bboxContains(bbox, naturalEarthLabelPoint)
        ? naturalEarthLabelPoint
        : fallbackCentroid(bbox);
    const id = `natural-earth:country:${naturalEarthCode}`;
    const continentId = `natural-earth:continent:${continent.code}`;
    const aliases = uniqueText([
      nameKo,
      nameEn,
      sourceString(properties, 'NAME'),
      sourceString(properties, 'NAME_LONG'),
      sourceString(properties, 'NAME_SORT'),
      sourceString(properties, 'NAME_ALT'),
      sourceString(properties, 'ABBREV'),
      sourceString(properties, 'FORMAL_EN'),
      isoAlpha2,
      isoAlpha3,
      naturalEarthCode,
    ]);

    return {
      type: 'Feature' as const,
      id,
      bbox,
      properties: {
        id,
        source: 'natural-earth' as const,
        sourceVersion: SOURCE_VERSION,
        featureType: 'country' as const,
        naturalEarthCode,
        isoAlpha2,
        isoAlpha3,
        name: nameKo ?? nameEn,
        nameKo,
        nameEn,
        nameLocal,
        aliases,
        continentId,
        continentCode: continent.code,
        continentNameKo: continent.nameKo,
        continentNameEn: continent.nameEn,
        centroid,
        population: Math.max(0, Math.trunc(sourceNumber(properties, 'POP_EST') ?? 0)),
      },
      geometry: sourceFeature.geometry,
    };
  });

  const ids = countries.map((country) => country.id);
  if (new Set(ids).size !== countries.length) {
    throw new Error('Natural Earth ADM0_A3 country identifiers are not unique.');
  }

  const collection = { type: 'FeatureCollection' as const, features: countries };
  const countriesPayload = `${JSON.stringify(collection)}\n`;
  const countryEntries = countries.map(({ id, bbox, properties }) => ({
    id,
    naturalEarthCode: properties.naturalEarthCode,
    isoAlpha2: properties.isoAlpha2,
    isoAlpha3: properties.isoAlpha3,
    name: properties.name,
    nameKo: properties.nameKo,
    nameEn: properties.nameEn,
    nameLocal: properties.nameLocal,
    aliases: properties.aliases,
    continentId: properties.continentId,
    continentCode: properties.continentCode,
    centroid: properties.centroid,
    bbox,
  }));

  const continents = Object.values(continentDefinitions).map((continent) => {
    const members = countryEntries.filter((country) => country.continentCode === continent.code);
    const memberBboxes = members.map((country) => country.bbox);
    const bbox: [number, number, number, number] = [
      Math.min(...memberBboxes.map((value) => value[0])),
      Math.min(...memberBboxes.map((value) => value[1])),
      Math.max(...memberBboxes.map((value) => value[2])),
      Math.max(...memberBboxes.map((value) => value[3])),
    ];
    const centroid: Position = [
      members.reduce((sum, country) => sum + country.centroid[0], 0) / members.length,
      members.reduce((sum, country) => sum + country.centroid[1], 0) / members.length,
    ];
    return {
      id: `natural-earth:continent:${continent.code}`,
      code: continent.code,
      nameKo: continent.nameKo,
      nameEn: continent.nameEn,
      countryCount: members.length,
      countryIds: members.map((country) => country.id),
      centroid,
      bbox,
    };
  });

  const index = {
    schemaVersion: 1,
    catalogVersion: `natural-earth-admin0-countries-${SOURCE_VERSION}`,
    generatedAt: GENERATED_AT,
    source: {
      name: 'Natural Earth Admin 0 – Countries',
      version: SOURCE_VERSION,
      scale: '1:10m',
      sourcePageUrl:
        'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/',
      downloadUrl:
        'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip',
      license: 'Public domain',
      archiveSha256: ARCHIVE_SHA256,
      countriesGeoJsonSha256: sha256(countriesPayload),
      countriesGeoJsonByteSize: Buffer.byteLength(countriesPayload),
    },
    countryCount: countryEntries.length,
    isoCodeCounts: {
      alpha2: countryEntries.filter((country) => country.isoAlpha2 !== null).length,
      alpha3: countryEntries.filter((country) => country.isoAlpha3 !== null).length,
      withoutIso: countryEntries.filter(
        (country) => country.isoAlpha2 === null || country.isoAlpha3 === null,
      ).length,
    },
    continentCount: continents.length,
    continents,
    countries: countryEntries,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, 'countries.geojson'), countriesPayload, 'utf8');
  await writeFile(
    resolve(outputDirectory, 'countries-index.json'),
    `${JSON.stringify(index, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `Imported ${countries.length} Natural Earth countries across ${continents.length} continents.`,
  );
  console.log(
    `ISO coverage: alpha-2 ${index.isoCodeCounts.alpha2}, alpha-3 ${index.isoCodeCounts.alpha3}, missing either ${index.isoCodeCounts.withoutIso}.`,
  );
}

await run();
