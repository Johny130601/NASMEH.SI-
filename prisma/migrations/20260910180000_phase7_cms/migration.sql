-- Phase 7 step 5 (CMS): the HELP template is retired (backlog B3), e-mail
-- template overrides and the media library get tables, and the homepage
-- section/banner settings plus the marquee switch are inserted if missing.

-- ContentTemplate loses HELP: rows first, then the enum swap.
UPDATE "ContentPage" SET "template" = 'DEFAULT' WHERE "template" = 'HELP';
CREATE TYPE "ContentTemplate_new" AS ENUM ('DEFAULT', 'LEGAL', 'CONTACT', 'LANDING');
ALTER TABLE "ContentPage" ALTER COLUMN "template" DROP DEFAULT;
ALTER TABLE "ContentPage" ALTER COLUMN "template" TYPE "ContentTemplate_new" USING ("template"::text::"ContentTemplate_new");
ALTER TYPE "ContentTemplate" RENAME TO "ContentTemplate_old";
ALTER TYPE "ContentTemplate_new" RENAME TO "ContentTemplate";
DROP TYPE "ContentTemplate_old";
ALTER TABLE "ContentPage" ALTER COLUMN "template" SET DEFAULT 'DEFAULT';

-- E-mail template overrides (subject + body with {{placeholders}}), one per key.
CREATE TABLE "EmailTemplate" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("key")
);

-- Media library (hero poster, banners): files under catalog-uploads/media/.
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_url_key" ON "MediaAsset"("url");

-- Homepage composition and the marquee switch (copy defaults; inserted only if missing).
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('home.sections', '[{"id":"hero","visible":true},{"id":"rail","visible":true},{"id":"bundleBanner","visible":true},{"id":"routineBanner","visible":true}]'::jsonb, CURRENT_TIMESTAMP),
  ('home.bundleBanner', '{"title":"Naši paketi","cta":"Nakupuj zdaj","href":"/trgovina?kolekcija=paketi"}'::jsonb, CURRENT_TIMESTAMP),
  ('home.routineBanner', '{"title":"Vaša vsakodnevna rutina beljenja — urejena.","href":"/izdelek/paket-popolna-rutina","image":"/uploads/placeholder-rutina-wide.svg","imageAlt":"Paket popolna rutina — trakci, ustna voda in serum","footnote":"*Rezultati se lahko razlikujejo od osebe do osebe. Izdelki niso nadomestilo ustne higiene pri zobozdravniku."}'::jsonb, CURRENT_TIMESTAMP),
  ('marquee.active', 'true'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
