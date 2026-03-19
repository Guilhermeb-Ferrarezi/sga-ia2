ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOM';

CREATE TABLE IF NOT EXISTS "CustomRole" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomRole_name_key" ON "CustomRole"("name");

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "customRoleId" TEXT;

CREATE INDEX IF NOT EXISTS "User_customRoleId_idx" ON "User"("customRoleId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_customRoleId_fkey'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;
