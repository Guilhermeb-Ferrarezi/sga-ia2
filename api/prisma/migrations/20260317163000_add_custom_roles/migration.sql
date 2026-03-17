ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOM';

CREATE TABLE "CustomRole" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");

ALTER TABLE "User"
ADD COLUMN "customRoleId" TEXT;

CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");

ALTER TABLE "User"
ADD CONSTRAINT "User_customRoleId_fkey"
FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
