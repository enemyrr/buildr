import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { AnalyticsScreen } from "@/screens/analytics-screen";

export default function AnalyticsRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <AnalyticsScreen />
    </HostRouteBootstrapBoundary>
  );
}
