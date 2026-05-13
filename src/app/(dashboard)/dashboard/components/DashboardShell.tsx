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
      className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start"
      // 3/4 + 1/4 split. The work queue takes the dominant column; the
      // attention rail is meant to sit quietly to the side.
    >
      <div className="xl:col-span-9 min-w-0">{main}</div>
      <div className="xl:col-span-3 min-w-0">{side}</div>
    </div>
  );
}
