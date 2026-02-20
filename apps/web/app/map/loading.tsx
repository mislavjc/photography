export default function MapLoading() {
  return (
    <div className="fixed inset-0 bg-neutral-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-neutral-600">Loading map...</p>
      </div>
    </div>
  );
}
