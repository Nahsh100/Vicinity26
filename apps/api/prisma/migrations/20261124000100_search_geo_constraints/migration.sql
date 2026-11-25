-- Hand-written: spatial + full-text indexes, search-vector maintenance, and integrity
-- constraints that Prisma's schema language cannot express. See DATABASE.md.

-- ───────── Spatial indexes (GiST) ─────────
CREATE INDEX "ProviderLocation_location_gist" ON "ProviderLocation" USING GIST ("location");
CREATE INDEX "ProviderLocation_publicLocation_gist" ON "ProviderLocation" USING GIST ("publicLocation");
CREATE INDEX "ServiceArea_center_gist" ON "ServiceArea" USING GIST ("center");
CREATE INDEX "Organization_location_gist" ON "Organization" USING GIST ("location");

-- ───────── Text search helpers ─────────
-- unaccent() is STABLE; an IMMUTABLE wrapper lets it be used inside index expressions.
CREATE OR REPLACE FUNCTION vicinity_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Trigram indexes for fuzzy matching ("plumbr", "nail tech").
CREATE INDEX "Listing_title_trgm" ON "Listing" USING GIN (lower(vicinity_unaccent("title")) gin_trgm_ops);
CREATE INDEX "Provider_displayName_trgm" ON "Provider" USING GIN (lower(vicinity_unaccent("displayName")) gin_trgm_ops);
CREATE INDEX "CategoryAlias_alias_trgm" ON "CategoryAlias" USING GIN (lower("alias") gin_trgm_ops);
CREATE INDEX "Category_name_trgm" ON "Category" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "Listing_searchVector_gin" ON "Listing" USING GIN ("searchVector");

-- Builds the weighted document for one listing.
--   A: title            B: keywords, category + parent category names and aliases
--   C: provider name    D: description
CREATE OR REPLACE FUNCTION vicinity_listing_document(
  p_title text, p_description text, p_keywords text[], p_category_id uuid, p_provider_id uuid
) RETURNS tsvector LANGUAGE plpgsql STABLE AS $$
DECLARE
  cat_text text;
  provider_name text;
BEGIN
  SELECT string_agg(t, ' ') INTO cat_text FROM (
    SELECT c."name" AS t FROM "Category" c WHERE c."id" = p_category_id
    UNION ALL
    SELECT p."name" FROM "Category" c JOIN "Category" p ON p."id" = c."parentId" WHERE c."id" = p_category_id
    UNION ALL
    SELECT a."alias" FROM "CategoryAlias" a WHERE a."categoryId" = p_category_id
  ) s;
  SELECT "displayName" INTO provider_name FROM "Provider" WHERE "id" = p_provider_id;

  RETURN
      setweight(to_tsvector('english', vicinity_unaccent(coalesce(p_title, ''))), 'A')
   || setweight(to_tsvector('simple',  vicinity_unaccent(coalesce(p_title, ''))), 'A')
   || setweight(to_tsvector('english', vicinity_unaccent(coalesce(array_to_string(p_keywords, ' '), '') || ' ' || coalesce(cat_text, ''))), 'B')
   || setweight(to_tsvector('simple',  vicinity_unaccent(coalesce(cat_text, ''))), 'B')
   || setweight(to_tsvector('simple',  vicinity_unaccent(coalesce(provider_name, ''))), 'C')
   || setweight(to_tsvector('english', vicinity_unaccent(coalesce(p_description, ''))), 'D');
END $$;

CREATE OR REPLACE FUNCTION vicinity_listing_search_vector_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := vicinity_listing_document(NEW."title", NEW."description", NEW."keywords", NEW."categoryId", NEW."providerId");
  RETURN NEW;
END $$;

CREATE TRIGGER listing_search_vector
  BEFORE INSERT OR UPDATE OF "title", "description", "keywords", "categoryId", "providerId", "updatedAt"
  ON "Listing" FOR EACH ROW EXECUTE FUNCTION vicinity_listing_search_vector_trg();

-- Re-index listings when their category names/aliases or provider name change.
CREATE OR REPLACE FUNCTION vicinity_refresh_listing_vectors_for_category(p_category_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE "Listing" l
     SET "searchVector" = vicinity_listing_document(l."title", l."description", l."keywords", l."categoryId", l."providerId")
   WHERE l."categoryId" = p_category_id
      OR l."categoryId" IN (SELECT "id" FROM "Category" WHERE "parentId" = p_category_id);
$$;

CREATE OR REPLACE FUNCTION vicinity_category_changed_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'CategoryAlias' THEN
    PERFORM vicinity_refresh_listing_vectors_for_category(coalesce(NEW."categoryId", OLD."categoryId"));
  ELSIF NEW."name" IS DISTINCT FROM OLD."name" THEN
    PERFORM vicinity_refresh_listing_vectors_for_category(NEW."id");
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER category_name_changed AFTER UPDATE OF "name" ON "Category"
  FOR EACH ROW EXECUTE FUNCTION vicinity_category_changed_trg();
CREATE TRIGGER category_alias_changed AFTER INSERT OR UPDATE OR DELETE ON "CategoryAlias"
  FOR EACH ROW EXECUTE FUNCTION vicinity_category_changed_trg();

CREATE OR REPLACE FUNCTION vicinity_provider_name_changed_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."displayName" IS DISTINCT FROM OLD."displayName" THEN
    UPDATE "Listing" l
       SET "searchVector" = vicinity_listing_document(l."title", l."description", l."keywords", l."categoryId", l."providerId")
     WHERE l."providerId" = NEW."id";
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER provider_name_changed AFTER UPDATE OF "displayName" ON "Provider"
  FOR EACH ROW EXECUTE FUNCTION vicinity_provider_name_changed_trg();

-- ───────── Integrity constraints ─────────
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_price_nonnegative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_price_range" CHECK ("priceMax" IS NULL OR "price" IS NULL OR "priceMax" >= "price");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_visibility_scope" CHECK (
     ("visibility" = 'PUBLIC'       AND "groupId" IS NULL)
  OR ("visibility" = 'ORGANIZATION' AND "organizationId" IS NOT NULL AND "groupId" IS NULL)
  OR ("visibility" = 'GROUP'        AND "organizationId" IS NOT NULL AND "groupId" IS NOT NULL)
);
-- A listing's group must belong to the listing's organization.
CREATE UNIQUE INDEX "Group_id_organizationId_key" ON "Group" ("id", "organizationId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_group_in_organization"
  FOREIGN KEY ("groupId", "organizationId") REFERENCES "Group" ("id", "organizationId");

ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_day_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_time_format"
  CHECK ("startTime" ~ '^\d{2}:\d{2}$' AND "endTime" ~ '^\d{2}:\d{2}$' AND "endTime" > "startTime");
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_radius_positive" CHECK ("radiusKm" > 0);
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_rating_range" CHECK ("ratingAverage" BETWEEN 0 AND 5);
ALTER TABLE "Media" ADD CONSTRAINT "Media_size_positive" CHECK ("sizeBytes" > 0);

-- At most one primary location per provider.
CREATE UNIQUE INDEX "ProviderLocation_one_primary" ON "ProviderLocation" ("providerId") WHERE "isPrimary";

-- Fast "active, published" listing scans for search.
CREATE INDEX "Listing_searchable_idx" ON "Listing" ("categoryId", "price")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
CREATE INDEX "ListingPromotion_active_idx" ON "ListingPromotion" ("listingId")
  WHERE "status" = 'ACTIVE';
