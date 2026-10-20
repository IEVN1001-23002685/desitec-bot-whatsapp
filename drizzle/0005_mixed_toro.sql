CREATE TYPE "public"."proveedor_mensajeria" AS ENUM('meta', '360dialog');--> statement-breakpoint
ALTER TABLE "cuentas_whatsapp" ADD COLUMN "proveedor" "proveedor_mensajeria" DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE "cuentas_whatsapp" ADD COLUMN "credencial_ref" text;--> statement-breakpoint
ALTER TABLE "cuentas_whatsapp" ADD COLUMN "webhook_secret_ref" text;