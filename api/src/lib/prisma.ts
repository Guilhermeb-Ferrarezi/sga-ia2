import type { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;
let initialized = false;

export const getPrismaClient = async (): Promise<PrismaClient | null> => {
  if (Bun.env.ENABLE_DB !== "true") return null;

  if (!initialized) {
    initialized = true;
    const { PrismaClient } = await import("@prisma/client");
    prismaClient = new PrismaClient();
  }

  return prismaClient;
};
