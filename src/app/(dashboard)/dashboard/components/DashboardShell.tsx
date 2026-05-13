'use client';

// Layout wrapper. Defines the responsive grid for the main work area + the
// intelligence rail. Separated so page.tsx stays focused on data + state and
// doesn't have layout decisions inlined.

export function DashboardShell({
  main, side,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-4 gap-5"
      // 3/4 + 1/4 split. The work queue takes the dominant column; the
      // attention rail is meant to sit quietly to the side.
    >
      <div className="lg:col-span-3 min-w-0">{main}</div>
      <div className="lg:col-span-1 min-w-0">{side}</div>
    </div>
  );
}
