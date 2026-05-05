import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const ACCESS_TTL = 60 * 60; // 1h
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30d

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export type SessionPayload = { uid: string; role: string };

export function signAccess(payload: SessionPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}
export function signRefresh(payload: SessionPayload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}
export function verifyAccess(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
export function verifyRefresh(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function createUserSession(userId: string, role: string) {
  const access = signAccess({ uid: userId, role });
  const refresh = signRefresh({ uid: userId, role });
  await prisma.session.create({
    data: {
      userId,
      token: access,
      refreshToken: refresh,
      expiresAt: new Date(Date.now() + REFRESH_TTL * 1000)
    }
  });
  const c = cookies();
  c.set("smurfx_session", access, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_TTL,
    path: "/"
  });
  c.set("smurfx_refresh", refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TTL,
    path: "/"
  });
  return { access, refresh };
}

export async function destroySession() {
  const c = cookies();
  const tok = c.get("smurfx_session")?.value;
  if (tok) {
    try {
      await prisma.session.deleteMany({ where: { token: tok } });
    } catch {}
  }
  c.delete("smurfx_session");
  c.delete("smurfx_refresh");
}

export async function getCurrentUser() {
  const c = cookies();
  const token = c.get("smurfx_session")?.value;
  if (!token) return null;
  const payload = verifyAccess(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      membersPoints: true,
      membersLevel: true,
      emailVerified: true,
      twoFactorEnabled: true,
      savedSize: true
    }
  });
  return user;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Response("Unauthorized", { status: 401 });
  return u;
}
export async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !["admin", "superadmin", "editor", "order_manager", "analytics"].includes(u.role)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return u;
}

export function clientIp() {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export function getOrCreateGuestId() {
  const c = cookies();
  let id = c.get("smurfx_guest")?.value;
  if (!id) {
    id = `guest_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    c.set("smurfx_guest", id, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/"
    });
  }
  return id;
}
