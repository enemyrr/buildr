import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { HomeScreen } from "@/screens/home-screen";

export default function HomeRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <HomeScreen />
    </HostRouteBootstrapBoundary>
  );
}
