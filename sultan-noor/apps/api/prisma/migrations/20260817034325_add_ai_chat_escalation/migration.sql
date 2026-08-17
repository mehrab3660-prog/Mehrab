-- AlterEnum
ALTER TYPE "AiMessageRole" ADD VALUE 'STAFF';

-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AiConversation_escalatedAt_idx" ON "AiConversation"("escalatedAt");
