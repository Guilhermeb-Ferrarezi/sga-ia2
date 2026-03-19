DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'HandoffStatus'
  ) THEN
    CREATE TYPE "HandoffStatus" AS ENUM ('NONE', 'QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'MessageSource'
  ) THEN
    CREATE TYPE "MessageSource" AS ENUM ('USER', 'AI', 'AGENT', 'SYSTEM');
  END IF;
END
$$;

ALTER TABLE "Contact"
ADD COLUMN IF NOT EXISTS "handoffStatus" "HandoffStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "handoffAssignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "handoffFirstHumanReplyAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "handoffResolvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "handoffAssignedToUserId" TEXT,
ADD COLUMN IF NOT EXISTS "handoffResolvedByUserId" TEXT;

UPDATE "Contact"
SET "handoffStatus" = 'NONE'
WHERE "handoffStatus" IS NULL;

ALTER TABLE "Contact"
ALTER COLUMN "handoffStatus" SET DEFAULT 'NONE',
ALTER COLUMN "handoffStatus" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Contact_handoffStatus_idx" ON "Contact"("handoffStatus");
CREATE INDEX IF NOT EXISTS "Contact_handoffAssignedToUserId_idx" ON "Contact"("handoffAssignedToUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Contact_handoffAssignedToUserId_fkey'
  ) THEN
    ALTER TABLE "Contact"
    ADD CONSTRAINT "Contact_handoffAssignedToUserId_fkey"
    FOREIGN KEY ("handoffAssignedToUserId") REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Contact_handoffResolvedByUserId_fkey'
  ) THEN
    ALTER TABLE "Contact"
    ADD CONSTRAINT "Contact_handoffResolvedByUserId_fkey"
    FOREIGN KEY ("handoffResolvedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "Message"
ADD COLUMN IF NOT EXISTS "source" "MessageSource",
ADD COLUMN IF NOT EXISTS "sentByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Message_source_idx" ON "Message"("source");
CREATE INDEX IF NOT EXISTS "Message_sentByUserId_idx" ON "Message"("sentByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Message_sentByUserId_fkey'
  ) THEN
    ALTER TABLE "Message"
    ADD CONSTRAINT "Message_sentByUserId_fkey"
    FOREIGN KEY ("sentByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;
