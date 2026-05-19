'use client';

// Layout wrapper. Defines the responsive grid for the main work area + the
// intelligence rail. Separated so page.tsx stays focused on data + state and
// doesn't have layout decisions inlined.
// Side column widened from 3→4 (of 12) to accommodate inventory alerts +
// employee tasks panels without crowding.

export function DashboardShell({
  main, side,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
      <div className="xl:col-span-8 min-w-0">{main}</div>
      <div className="xl:col-span-4 min-w-0">{side}</div>
    </div>
  );
}
