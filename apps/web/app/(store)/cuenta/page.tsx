import { AccountPage } from "@/components/store/account-page";
import { getAccountOverview } from "@/lib/catalog";

export default async function CuentaPage() {
  const account = await getAccountOverview();
  return <AccountPage account={account} />;
}
