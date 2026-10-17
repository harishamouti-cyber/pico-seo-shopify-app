import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var picoSchemaReady: Promise<void> | undefined;
}

// On Vercel serverless, ensure DATABASE_URL points to writable /tmp/dev.sqlite
if (
  process.env.VERCEL &&
  (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("file:/tmp/"))
) {
  process.env.DATABASE_URL = "file:/tmp/dev.sqlite";
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.sqlite";
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

async function ensureSchema() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "state" TEXT NOT NULL,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT,
        "expires" DATETIME,
        "accessToken" TEXT NOT NULL,
        "userId" BIGINT,
        "firstName" TEXT,
        "lastName" TEXT,
        "email" TEXT,
        "accountOwner" BOOLEAN NOT NULL DEFAULT false,
        "locale" TEXT,
        "collaborator" BOOLEAN DEFAULT false,
        "emailVerified" BOOLEAN DEFAULT false
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PicoSeoSettings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shop" TEXT NOT NULL UNIQUE,
        "storeDisplayName" TEXT NOT NULL DEFAULT 'Your Store',
        "subscriptionStatus" TEXT NOT NULL DEFAULT 'INACTIVE',
        "autoSyncOnProductUpdate" BOOLEAN NOT NULL DEFAULT false,
        "metaTitleTemplate" TEXT NOT NULL DEFAULT '{{product_title}} | Official {{store_name}}',
        "metaDescriptionTemplate" TEXT NOT NULL DEFAULT 'Shop {{product_title}} ({{variant_title}}) for {{price}} at {{store_name}}. Fast shipping and verified quality.',
        "imageAltTemplate" TEXT NOT NULL DEFAULT '{{product_title}} - {{variant_title}} by {{store_name}}',
        "enableJsonLdSchema" BOOLEAN NOT NULL DEFAULT true,
        "enableLcpImagePreload" BOOLEAN NOT NULL DEFAULT true,
        "enableLlmsTxtFeed" BOOLEAN NOT NULL DEFAULT true,
        "enableIndexNowPing" BOOLEAN NOT NULL DEFAULT true,
        "indexNowApiKey" TEXT,
        "totalProductsOptimized" INTEGER NOT NULL DEFAULT 0,
        "totalAltTextsFixed" INTEGER NOT NULL DEFAULT 0,
        "totalIndexNowPings" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductOptimizationLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "productTitle" TEXT NOT NULL,
        "productImageUrl" TEXT,
        "seoScoreBefore" INTEGER NOT NULL,
        "seoScoreAfter" INTEGER NOT NULL,
        "altTextsUpdatedCount" INTEGER NOT NULL DEFAULT 0,
        "metaUpdated" BOOLEAN NOT NULL DEFAULT false,
        "indexNowPinged" BOOLEAN NOT NULL DEFAULT false,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (error) {
    console.warn("[PicoSEO DB] Schema bootstrap notice:", error);
  }
}

if (!global.picoSchemaReady) {
  global.picoSchemaReady = ensureSchema();
}

export default prisma;
