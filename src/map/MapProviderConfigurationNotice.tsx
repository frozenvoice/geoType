import type { MapProviderResolution } from './providers';

export type MapProviderConfigurationNoticeProps = {
  resolution: Extract<MapProviderResolution, { ok: false }>;
};

export function MapProviderConfigurationNotice({
  resolution,
}: MapProviderConfigurationNoticeProps) {
  return (
    <section className="map-provider-notice" role="alert" aria-labelledby="map-provider-title">
      <p className="map-provider-notice__eyebrow">MAP CONFIGURATION</p>
      <h2 id="map-provider-title">{resolution.title}</h2>
      <p>{resolution.message}</p>
      <dl>
        <div>
          <dt>선택된 공급자</dt>
          <dd>{resolution.providerId}</dd>
        </div>
        <div>
          <dt>필요한 환경 변수</dt>
          <dd>{resolution.missingVariables.join(', ')}</dd>
        </div>
      </dl>
      <p className="map-provider-notice__hint">{resolution.developmentHint}</p>
    </section>
  );
}
