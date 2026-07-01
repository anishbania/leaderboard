import { LeaderboardDashboard } from "@/components/leaderboard-dashboard";
import { getDashboard } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboard();
  return <LeaderboardDashboard initialData={data} />;
}
