CREATE TYPE "public"."direccion_mensaje" AS ENUM('entrante', 'saliente');--> statement-breakpoint
CREATE TYPE "public"."estado_conversacion" AS ENUM('abierta', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_evento_webhook" AS ENUM('recibido', 'procesado', 'ignorado', 'fallido');--> statement-breakpoint
CREATE TABLE "cuentas_whatsapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre_comercial" text NOT NULL,
	"id_numero_telefono" text NOT NULL,
	"telefono_visible" text NOT NULL,
	"esta_activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuentas_whatsapp_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "cuentas_whatsapp_id_numero_telefono_unique" UNIQUE("id_numero_telefono")
);
--> statement-breakpoint
CREATE TABLE "contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_wa" text NOT NULL,
	"nombre_perfil" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contactos_id_wa_unique" UNIQUE("id_wa")
);
--> statement-breakpoint
CREATE TABLE "conversaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_cuenta_whatsapp" uuid NOT NULL,
	"id_contacto" uuid NOT NULL,
	"estado" "estado_conversacion" DEFAULT 'abierta' NOT NULL,
	"ultimo_mensaje_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_conversacion" uuid NOT NULL,
	"id_cuenta_whatsapp" uuid NOT NULL,
	"direccion" "direccion_mensaje" NOT NULL,
	"id_mensaje_meta" text,
	"tipo" text NOT NULL,
	"cuerpo" text,
	"carga_util" jsonb,
	"estado" text,
	"marca_tiempo_meta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensajes_id_mensaje_meta_unique" UNIQUE("id_mensaje_meta")
);
--> statement-breakpoint
CREATE TABLE "eventos_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave_evento" text NOT NULL,
	"fuente" text DEFAULT 'whatsapp' NOT NULL,
	"tipo_objeto" text,
	"estado" "estado_evento_webhook" DEFAULT 'recibido' NOT NULL,
	"error" text,
	"carga_util_original" jsonb NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_en" timestamp with time zone,
	CONSTRAINT "eventos_webhook_clave_evento_unique" UNIQUE("clave_evento")
);
--> statement-breakpoint
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_id_cuenta_whatsapp_cuentas_whatsapp_id_fk" FOREIGN KEY ("id_cuenta_whatsapp") REFERENCES "public"."cuentas_whatsapp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_id_contacto_contactos_id_fk" FOREIGN KEY ("id_contacto") REFERENCES "public"."contactos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_id_conversacion_conversaciones_id_fk" FOREIGN KEY ("id_conversacion") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_id_cuenta_whatsapp_cuentas_whatsapp_id_fk" FOREIGN KEY ("id_cuenta_whatsapp") REFERENCES "public"."cuentas_whatsapp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuentas_whatsapp_activas_idx" ON "cuentas_whatsapp" USING btree ("esta_activa");--> statement-breakpoint
CREATE UNIQUE INDEX "conversaciones_cuenta_contacto_uk" ON "conversaciones" USING btree ("id_cuenta_whatsapp","id_contacto");--> statement-breakpoint
CREATE INDEX "conversaciones_contacto_idx" ON "conversaciones" USING btree ("id_contacto");--> statement-breakpoint
CREATE INDEX "mensajes_conversacion_idx" ON "mensajes" USING btree ("id_conversacion");--> statement-breakpoint
CREATE INDEX "mensajes_cuenta_idx" ON "mensajes" USING btree ("id_cuenta_whatsapp");--> statement-breakpoint
CREATE INDEX "mensajes_creados_idx" ON "mensajes" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "eventos_webhook_estado_idx" ON "eventos_webhook" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "eventos_webhook_recibidos_idx" ON "eventos_webhook" USING btree ("recibido_en");