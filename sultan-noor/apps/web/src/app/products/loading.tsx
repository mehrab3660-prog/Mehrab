export default function ProductsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="skeleton mb-6 h-8 w-40 rounded" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl surface-card">
            <div className="skeleton aspect-square w-full" />
            <div className="space-y-2 p-4">
              <div className="skeleton h-3 w-1/3 rounded" />
              <div className="skeleton h-4 w-4/5 rounded" />
              <div className="skeleton h-5 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
