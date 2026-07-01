import { AnalystLogin } from "@/components/analyst-login";
import { DashboardContent } from "@/components/dashboard-content";
import { isAnalystAuthenticated } from "@/lib/analyst-auth";

export default async function DashboardPage() {
  const authenticated = await isAnalystAuthenticated();

  if (!authenticated) {
    return <AnalystLogin />;
  }

  return <DashboardContent />;
}
