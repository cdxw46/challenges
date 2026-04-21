import { MembersPage } from "@/components/store/members-page";
import { getMembersOverview } from "@/lib/catalog";

export default async function MembersRoute() {
  const overview = await getMembersOverview();
  return <MembersPage tiers={overview.tiers} />;
}
