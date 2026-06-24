-- Rename legacy dashboard-oriented access table to the MCP-first access model.
ALTER TABLE "DashboardSession" RENAME TO "AccessSession";

ALTER TABLE "AccessSession" RENAME CONSTRAINT "DashboardSession_pkey" TO "AccessSession_pkey";
ALTER INDEX "DashboardSession_buyerWallet_idx" RENAME TO "AccessSession_buyerWallet_idx";

ALTER TABLE "XConnection" DROP CONSTRAINT "XConnection_sessionId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_sessionId_fkey";
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_sessionId_fkey";

ALTER TABLE "XConnection"
  ADD CONSTRAINT "XConnection_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AccessSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AccessSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AccessSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
