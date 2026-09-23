-- Bundle builder (/sestavi-paket): data only. The module reads one Setting
-- row; the offers are quantities of the base product's own variant, so there
-- is no SKU, product or bundle to create here. Inserted only when the key is
-- missing — an operator's edited row is never touched (the seed writes the
-- same row for fresh databases).
--
-- `couponCode` is EMPTY here, where the seed carries PAKET20: that coupon is
-- demo data a deployed database does not have, and a Setting naming a missing
-- code would price the module with no discount at best. An operator names an
-- existing active code in the admin; until then the module shows plain prices
-- rather than a discount the cart could not apply.
-- tests/unit/bundle-builder-seed.test.ts keeps this row and the seed in step.
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('bundle.builder', '{"enabled":true,"offerUnits":[1,2,3],"addOnSlugs":[],"couponCode":"","subscriptionRow":true}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
