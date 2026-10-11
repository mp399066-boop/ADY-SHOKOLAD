import { PageLoading } from '@/components/ui/LoadingSpinner';

// Inside the dashboard segment so the NavBar stays on screen while a page loads.
export default function DashboardLoading() {
  return <PageLoading />;
}
