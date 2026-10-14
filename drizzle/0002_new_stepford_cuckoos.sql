CREATE TYPE "public"."estado_seguimiento" AS ENUM('pendiente', 'en_proceso', 'enviado', 'cancelado', 'fallido');--> statement-breakpoint
CREATE TABLE "plantillas_whatsapp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre_meta" text NOT NULL,
	"idioma" text DEFAULT 'es' NOT NULL,
	"categoria" text,
	"componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantillas_whatsapp_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "reglas_seguimiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"id_cuenta_whatsapp" uuid NOT NULL,
	"demora_horas" integer NOT NULL,
	"id_plantilla" uuid,
	"cuerpo" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reglas_seguimiento_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "seguimientos_programados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_conversacion" uuid NOT NULL,
	"id_regla_seguimiento" uuid NOT NULL,
	"programado_para" timestamp with time zone NOT NULL,
	"estado" "estado_seguimiento" DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"id_mensaje_meta" text,
	"error" text,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reglas_seguimiento" ADD CONSTRAINT "reglas_seguimiento_id_cuenta_whatsapp_cuentas_whatsapp_id_fk" FOREIGN KEY ("id_cuenta_whatsapp") REFERENCES "public"."cuentas_whatsapp"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_seguimiento" ADD CONSTRAINT "reglas_seguimiento_id_plantilla_plantillas_whatsapp_id_fk" FOREIGN KEY ("id_plantilla") REFERENCES "public"."plantillas_whatsapp"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos_programados" ADD CONSTRAINT "seguimientos_programados_id_conversacion_conversaciones_id_fk" FOREIGN KEY ("id_conversacion") REFERENCES "public"."conversaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos_programados" ADD CONSTRAINT "seguimientos_programados_id_regla_seguimiento_reglas_seguimiento_id_fk" FOREIGN KEY ("id_regla_seguimiento") REFERENCES "public"."reglas_seguimiento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plantillas_whatsapp_activas_idx" ON "plantillas_whatsapp" USING btree ("activa");--> statement-breakpoint
CREATE INDEX "reglas_seguimiento_cuenta_idx" ON "reglas_seguimiento" USING btree ("id_cuenta_whatsapp");--> statement-breakpoint
CREATE INDEX "reglas_seguimiento_activas_idx" ON "reglas_seguimiento" USING btree ("activa");--> statement-breakpoint
CREATE INDEX "seguimientos_programados_estado_programado_idx" ON "seguimientos_programados" USING btree ("estado","programado_para");--> statement-breakpoint
CREATE INDEX "seguimientos_programados_conversacion_estado_idx" ON "seguimientos_programados" USING btree ("id_conversacion","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "seguimientos_programados_conv_regla_unico" ON "seguimientos_programados" USING btree ("id_conversacion","id_regla_seguimiento");