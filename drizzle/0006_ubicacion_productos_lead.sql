ALTER TYPE "public"."estado_lead" ADD VALUE 'fuera_de_cobertura';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "nombre_rechazado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cantidad_aproximada" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_tipo" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_nombre" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_pais" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_entidad" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_municipio" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_localidad" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_cvegeo" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ubicacion_completa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "productos_catalogo" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "solicitud_producto_texto" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "aclaracion_pendiente" text;--> statement-breakpoint
CREATE INDEX "leads_ubicacion_entidad_idx" ON "leads" USING btree ("ubicacion_entidad");--> statement-breakpoint
CREATE INDEX "leads_ubicacion_municipio_idx" ON "leads" USING btree ("ubicacion_municipio");
