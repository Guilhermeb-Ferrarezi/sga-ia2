import { SignJWT, jwtVerify } from "jose";
import type { Prisma, PrismaClient, UserRole } from "@prisma/client";
import {
  ROLE_LABELS,
  getRolePermissions,
  normalizePermissionList,
  type Permission,
} from "./rbac";

export interface AuthServiceConfig {
  jwtSecret: string;
  jwtTtlSeconds: number;
  adminEmail?: string;
  adminPassword?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  roleLabel: string;
  customRole: PublicCustomRole | null;
  permissions: Permission[];
  createdAt: string;
}

export interface PublicCustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
}

type UserWithCustomRole = Prisma.UserGetPayload<{
  include: { customRole: true };
}>;

const toPublicCustomRole = (
  role: UserWithCustomRole["customRole"],
): PublicCustomRole | null => {
  if (!role) return null;

  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: normalizePermissionList(role.permissions),
  };
};

const resolveUserPermissions = (user: UserWithCustomRole): Permission[] =>
  user.role === "CUSTOM"
    ? toPublicCustomRole(user.customRole)?.permissions ?? []
    : getRolePermissions(user.role);

export const toPublicUser = (user: UserWithCustomRole): PublicUser => {
  const customRole = toPublicCustomRole(user.customRole);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    roleLabel: customRole?.name ?? ROLE_LABELS[user.role],
    customRole,
    permissions: resolveUserPermissions(user),
    createdAt: user.createdAt.toISOString(),
  };
};

export class AuthService {
  private readonly secretKey: Uint8Array;

  constructor(private readonly config: AuthServiceConfig) {
    this.secretKey = new TextEncoder().encode(config.jwtSecret);
  }

  async ensureAdminUser(prisma: PrismaClient): Promise<void> {
    const adminEmail = this.config.adminEmail?.trim().toLowerCase();
    const adminPassword = this.config.adminPassword?.trim();

    if (!adminEmail || !adminPassword) {
      return;
    }

    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });
    if (existingAdmin) return;

    const passwordHash = await Bun.password.hash(adminPassword);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
        name: "Administrador",
      },
    });
  }

  async login(
    prisma: PrismaClient,
    email: string,
    password: string,
  ): Promise<{ token: string; user: PublicUser } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { customRole: true },
    });
    if (!user) {
      return null;
    }

    const isValid = await Bun.password.verify(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    const token = await this.signToken(user);
    return { token, user: toPublicUser(user) };
  }

  async getUserFromToken(
    prisma: PrismaClient,
    token: string,
  ): Promise<PublicUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        algorithms: ["HS256"],
      });
      const subject = payload.sub;
      if (!subject) return null;

      const user = await prisma.user.findUnique({
        where: { id: subject },
        include: { customRole: true },
      });
      if (!user) return null;

      return toPublicUser(user);
    } catch {
      return null;
    }
  }

  private async signToken(user: UserWithCustomRole): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.config.jwtTtlSeconds;

    return new SignJWT({
      email: user.email,
      role: user.role,
      name: user.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.secretKey);
  }
}
