-- Phase 5: FAQ restructure + Phase 6: Lead scoring

-- Add new columns to Faq
ALTER TABLE "Faq" ADD COLUMN "subject" TEXT DEFAULT 'geral';
ALTER TABLE "Faq" ADD COLUMN "edition" TEXT;
ALTER TABLE "Faq" ADD COLUMN "faqType" TEXT NOT NULL DEFAULT 'qa';
ALTER TABLE "Faq" ADD COLUMN "content" TEXT;

-- Add indexes for new FAQ fields
CREATE INDEX "Faq_subject_idx" ON "Faq"("subject");
CREATE INDEX "Faq_faqType_idx" ON "Faq"("faqType");

-- Add lead scoring to Contact
ALTER TABLE "Contact" ADD COLUMN "leadScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contact" ADD COLUMN "qualificationData" JSONB;
