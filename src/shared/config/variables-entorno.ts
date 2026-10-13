import { z } from 'zod'

const booleanoDeCadena = z
  .union([z.boolean(), z.string()])
  .transform((valor) =>
    typeof valor === 'boolean' ? valor : valor.trim().toLowerCase() === 'true',
  )

const esquemaConfiguracionCuenta = z.object({
  codigo: z.string().min(1),
  nombreComercial: z.string().min(1),
  idNumeroTelefono: z.string().min(1),
  telefonoVisible: z.string().min(1),
  activa: z.boolean().default(true),
})

export type ConfiguracionCuenta = z.infer<typeof esquemaConfiguracionCuenta>

const esquemaCuentas = z.array(esquemaConfiguracionCuenta).min(1)

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_VERIFY_TOKEN: z.string().min(1),
  META_ACCESS_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_DRY_RUN: booleanoDeCadena.default(true),
  WEBHOOK_BODY_LIMIT: z.coerce.number().int().positive().default(1_048_576),
  WHATSAPP_ACCOUNTS: z
    .string()
    .default('[]')
    .transform((valor, contexto) => {
      try {
        return esquemaCuentas.parse(JSON.parse(valor))
      } catch {
        contexto.addIssue({
          code: 'custom',
          message: 'WHATSAPP_ACCOUNTS debe ser un arreglo JSON no vacío de cuentas',
        })
        return z.NEVER
      }
    }),
})

export type VariablesEntorno = z.infer<typeof esquemaEntorno>

export function cargarVariablesEntorno(fuente: NodeJS.ProcessEnv = process.env): VariablesEntorno {
  const resultado = esquemaEntorno.safeParse(fuente)
  if (!resultado.success) {
    throw new Error(
      `Configuración de entorno inválida: ${JSON.stringify(resultado.error.flatten().fieldErrors)}`,
    )
  }
  return resultado.data
}
