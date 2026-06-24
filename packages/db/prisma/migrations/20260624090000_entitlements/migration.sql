-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "crooOrderId" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "limits" JSONB NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_orderId_key" ON "Entitlement"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_crooOrderId_key" ON "Entitlement"("crooOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_licenseKey_key" ON "Entitlement"("licenseKey");

-- CreateIndex
CREATE INDEX "Entitlement_buyerWallet_idx" ON "Entitlement"("buyerWallet");

-- CreateIndex
CREATE INDEX "Entitlement_status_expiresAt_idx" ON "Entitlement"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
