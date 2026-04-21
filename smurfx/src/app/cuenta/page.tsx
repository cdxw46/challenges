import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AccountDashboard } from "@/components/account/dashboard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/cuenta/login?next=/cuenta");
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5
  });
  return <AccountDashboard user={user} orders={orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() }))} />;
}
