export function ProductLoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  if (error)
    return (
      <div role="alert" className="container py-12">
        <p>{error}</p>
        <button className="button-secondary mt-4" onClick={retry}>
          다시 불러오기
        </button>
      </div>
    );
  if (loading)
    return (
      <div role="status" className="container py-12" aria-live="polite">
        상품 정보를 불러오는 중입니다.
      </div>
    );
  return null;
}
