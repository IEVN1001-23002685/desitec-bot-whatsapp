CREATE TYPE "public"."estado_lead" AS ENUM('capturando', 'listo_pipedrive', 'en_asesor', 'seguimiento');--> statement-breakpoint
CREATE TYPE "public"."paso_lead" AS ENUM('nombre', 'correo', 'modelos', 'cantidad', 'ciudad');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_conversacion" uuid NOT NULL,
	"nombre" text,
	"correo" text,
	"modelos" text,
	"cantidad" integer,
	"ciudad" text,
	"paso_actual" "paso_lead" DEFAULT 'nombre' NOT NULL,
	"estado" "estado_lead" DEFAULT 'capturando' NOT NULL,
	"completado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_id_conversacion_unique" UNIQUE("id_conversacion")
);
--> statement-breakpoint
CREATE TABLE "guion_flujo_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" text NOT NULL,
	"orden" integer NOT NULL,
	"texto" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guion_flujo_lead_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_id_conversacion_conversaciones_id_fk" FOREIGN KEY ("id_conversacion") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_estado_idx" ON "leads" USING btree ("estado");