import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __labiPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__labiPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") global.__labiPrisma = prisma;
