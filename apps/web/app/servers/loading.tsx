export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 h-8 w-48 animate-pulse rounded bg-white/5" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-16 animate-pulse rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
