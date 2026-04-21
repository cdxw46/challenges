import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __smurfxPrisma: PrismaClient | undefined;
}

export const db =
  global.__smurfxPrisma ??
  new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL || ""),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__smurfxPrisma = db;
}

