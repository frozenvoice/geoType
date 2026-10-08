// A local .env must not send automated checks to paid map/leaderboard services
// or silently replace production geodata with the development catalog.
export const LOCAL_BROWSER_ENVIRONMENT = {
  VITE_MAP_PROVIDER: 'hosted',
  VITE_MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty',
  VITE_MAP_ACCESS_TOKEN: '',
  VITE_MAP_ATTRIBUTION: '',
  VITE_PM_TILES_URL: '',
  VITE_MAP_TERRAIN_ENABLED: 'false',
  VITE_MAP_BUILDINGS_ENABLED: 'false',
  VITE_GEO_CATALOG_BASE_URL: '/geodata',
  VITE_GEO_FIXTURE_ENABLED: 'false',
  VITE_LEADERBOARD_MODE: 'local',
  VITE_API_BASE_URL: '',
};
