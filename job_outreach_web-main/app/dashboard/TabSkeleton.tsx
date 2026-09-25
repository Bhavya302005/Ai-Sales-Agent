'use client';

export default function TabSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-8 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container/50 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-outline-variant/20 shimmer" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-48 rounded-lg bg-outline-variant/20 shimmer" />
            <div className="h-3 w-96 rounded-lg bg-outline-variant/15 shimmer" />
          </div>
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-outline-variant/30 bg-surface-container/50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded bg-outline-variant/20 shimmer" />
              <div className="w-8 h-8 rounded-lg bg-outline-variant/15 shimmer" />
            </div>
            <div className="h-8 w-16 rounded bg-outline-variant/25 shimmer" />
            <div className="h-2 w-full rounded-full bg-outline-variant/10 shimmer" />
          </div>
        ))}
      </div>

      {/* Content block skeleton */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container/50 p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-outline-variant/20 shimmer" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-outline-variant/15 shimmer shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-outline-variant/15 shimmer" />
                <div className="h-3 w-1/2 rounded bg-outline-variant/10 shimmer" />
              </div>
              <div className="h-6 w-16 rounded-full bg-outline-variant/15 shimmer" />
            </div>
          ))}
        </div>
      </div>

      {/* Shimmer animation via inline style */}
      <style jsx>{`
        .shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.04) 50%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
