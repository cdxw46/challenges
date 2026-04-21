import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";

const encoder = new TextEncoder();
const ACCESS_COOKIE = "smurfx_access";
const REFRESH_COOKIE = "smurfx_refresh";

function getJwtSecret() {
  return encoder.encode(process.env.JWT_SECRET || "change-me-in-production-secret");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function signAccessToken(payload: { userId: string; role: string; email: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getJwtSecret());
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as { userId: string; role: string; email: string };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string, userAgent?: string | null, ipAddress?: string | null) {
  const rawAccess = await signAccessToken({
    userId,
    role: "USER",
    email: "",
  });
  const rawRefresh = randomBytes(48).toString("hex");
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(rawAccess),
      refreshTokenHash: sha256(rawRefresh),
      userAgent: userAgent || undefined,
      ipAddress: ipAddress || undefined,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  return { accessToken: rawAccess, refreshToken: rawRefresh };
}

export async function getCurrentUser() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifyAccessToken(token);
    return db.user.findUnique({
      where: { id: payload.userId },
      include: {
        addresses: true,
        orders: { orderBy: { createdAt: "desc" }, take: 5, include: { items: true } },
        wishlists: { include: { product: { include: { images: true, variants: true } } } },
        memberTransactions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
  } catch {
    return null;
  }
}

export async function setSessionCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
  store.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function registerWithEmail(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
}) {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error("Email already registered");
  }

  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
    },
  });

  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = randomBytes(48).toString("hex");
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(accessToken),
      refreshTokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  await setSessionCookies(accessToken, refreshToken);
  return user;
}

export async function loginWithEmail(email: string, password: string, userAgent?: string | null, ipAddress?: string | null) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = randomBytes(48).toString("hex");
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(accessToken),
      refreshTokenHash: sha256(refreshToken),
      userAgent: userAgent || undefined,
      ipAddress: ipAddress || undefined,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  await setSessionCookies(accessToken, refreshToken);
  return user;
}

export async function logoutCurrentSession() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await db.session.deleteMany({ where: { refreshTokenHash: sha256(refreshToken) } });
  }
  await clearSessionCookies();
}

export async function createVerificationToken(userId: string, type = "email_verification") {
  const rawToken = randomBytes(32).toString("hex");
  await db.verificationToken.create({
    data: {
      userId,
      tokenHash: sha256(rawToken),
      type,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  return rawToken;
}

export async function createPasswordResetToken(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    },
  });
  return rawToken;
}

export async function consumePasswordResetToken(token: string) {
  const record = await db.passwordResetToken.findFirst({
    where: {
      tokenHash: sha256(token),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!record) return null;
  await db.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return record;
}
