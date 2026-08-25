-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "zarinpalMerchantId" TEXT,
    "smsApiKey" TEXT,
    "kavenegarOtpTemplate" TEXT,
    "anthropicApiKey" TEXT,
    "anthropicModel" TEXT,
    "openaiApiKey" TEXT,
    "siteUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
