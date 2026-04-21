import { handle, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ user: await getCurrentUser() }));
