import { handle, json } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const POST = handle(async () => {
  await destroySession();
  return json({ ok: true });
});
