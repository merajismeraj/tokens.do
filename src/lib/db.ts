import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon's Vercel integration was connected with the "tokens_" env prefix; locally it's plain DATABASE_URL.
const datasourceUrl = process.env.tokens_DATABASE_URL || process.env.DATABASE_URL;

export const db = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
