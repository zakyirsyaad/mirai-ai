import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * Singleton Prisma client. Reused across hot-reloads in dev to avoid exhausting
 * the Postgres connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
