-- Hand-edit over generated output: drizzle-kit quotes the customType name
-- ("geography(Point,4326)"), which Postgres reads as a literal type name.
-- The stores.location line below unquotes it; re-apply if regenerating.
CREATE TYPE "public"."attribute_category" AS ENUM('department', 'service', 'amenity', 'parking');--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attributes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"category" "attribute_category" NOT NULL,
	CONSTRAINT "attributes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_attributes" (
	"store_id" integer NOT NULL,
	"attribute_id" integer NOT NULL,
	CONSTRAINT "store_attributes_store_id_attribute_id_pk" PRIMARY KEY("store_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "store_hours" (
	"store_id" integer NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "store_hours_store_id_day_of_week_pk" PRIMARY KEY("store_id","day_of_week"),
	CONSTRAINT "store_hours_day_of_week_range" CHECK (day_of_week BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"street_address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"phone" text NOT NULL,
	"timezone" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location" geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "store_attributes" ADD CONSTRAINT "store_attributes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_attributes" ADD CONSTRAINT "store_attributes_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_attributes_attribute_idx" ON "store_attributes" USING btree ("attribute_id");--> statement-breakpoint
CREATE INDEX "stores_location_gix" ON "stores" USING gist ("location");