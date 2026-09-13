type ResourceLoadErrorScreenProps = {
  eyebrow?: string;
  title: string;
  message: string;
  resourceType: string;
  statusCode: number | null;
  resourceUrl?: string | null;
  onRetry: () => void;
  onContinueWithSimpleMap?: () => void;
};

export function ResourceLoadErrorScreen({
  eyebrow = 'RESOURCE LOAD ERROR',
  title,
  message,
  resourceType,
  statusCode,
  resourceUrl,
  onRetry,
  onContinueWithSimpleMap,
}: ResourceLoadErrorScreenProps) {
  return (
    <main className="resource-error-screen">
      <section className="resource-error-card" role="alert" aria-labelledby="resource-error-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="resource-error-title">{title}</h1>
        <p className="provider-lead">{message}</p>
        <dl className="resource-error-details">
          <div>
            <dt>실패한 리소스</dt>
            <dd>{resourceType}</dd>
          </div>
          <div>
            <dt>상태 코드</dt>
            <dd>{statusCode ?? '응답 없음'}</dd>
          </div>
          {resourceUrl ? (
            <div>
              <dt>요청 주소</dt>
              <dd><code>{resourceUrl}</code></dd>
            </div>
          ) : null}
        </dl>
        <p className="resource-error-hint">
          네트워크 또는 공급자 응답이 일시적으로 실패했을 수 있습니다. 연결을 확인한 뒤 다시 시도하세요.
        </p>
        <button className="button primary" type="button" onClick={onRetry}>
          다시 시도
        </button>
        {onContinueWithSimpleMap && <button className="button secondary" type="button" onClick={onContinueWithSimpleMap}>
          간단 지도로 계속하기
        </button>}
      </section>
    </main>
  );
}
