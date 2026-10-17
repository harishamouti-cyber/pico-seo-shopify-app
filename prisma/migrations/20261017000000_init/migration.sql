-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIAL', 'INACTIVE');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PicoSeoSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "storeDisplayName" TEXT NOT NULL DEFAULT 'Your Store',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PicoSeoSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptimizationLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImageUrl" TEXT,
    "seoScoreBefore" INTEGER NOT NULL,
    "seoScoreAfter" INTEGER NOT NULL,
    "altTextsUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "metaUpdated" BOOLEAN NOT NULL DEFAULT false,
    "indexNowPinged" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOptimizationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PicoSeoSettings_shop_key" ON "PicoSeoSettings"("shop");

-- CreateIndex
CREATE INDEX "ProductOptimizationLog_shop_updatedAt_idx" ON "ProductOptimizationLog"("shop", "updatedAt");

-- CreateIndex
CREATE INDEX "ProductOptimizationLog_shop_productId_idx" ON "ProductOptimizationLog"("shop", "productId");
