CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'INSTAGRAM');

CREATE TYPE "InstagramConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

ALTER TABLE "Contact"
ADD COLUMN "channel" "ContactChannel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN "externalId" TEXT,
ADD COLUMN "externalThreadId" TEXT,
ADD COLUMN "platformHandle" TEXT,
ADD COLUMN "instagramConnectionId" TEXT;

CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "instagramUsername" TEXT,
    "pageAccessToken" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "status" "InstagramConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "webhookSubscribed" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contact_channel_externalId_key" ON "Contact"("channel", "externalId");
CREATE INDEX "Contact_channel_idx" ON "Contact"("channel");
CREATE INDEX "InstagramConnection_status_idx" ON "InstagramConnection"("status");
CREATE INDEX "InstagramConnection_instagramUsername_idx" ON "InstagramConnection"("instagramUsername");
CREATE UNIQUE INDEX "InstagramConnection_pageId_key" ON "InstagramConnection"("pageId");
CREATE UNIQUE INDEX "InstagramConnection_instagramAccountId_key" ON "InstagramConnection"("instagramAccountId");

ALTER TABLE "Contact"
ADD CONSTRAINT "Contact_instagramConnectionId_fkey"
FOREIGN KEY ("instagramConnectionId") REFERENCES "InstagramConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
