import { z } from 'zod'

const booleanoDeCadena = z
  .union([z.boolean(), z.string()])
  .transform((valor) =>
    typeof valor === 'boolean' ? valor : valor.trim().toLowerCase() === 'true',
  )

const cadenaNoVacia = z
  .string()
  .optional()
  .transform((valor) => (valor && valor.length > 0 ? valor : undefined))

const listaDeNumeros = z
  .string()
  .optional()
  .transform((valor) =>
    (valor ?? '')
      .split(',')
      .map((numero) => numero.trim())
      .filter((numero) => numero.length > 0),
  )

const esquemaConfiguracionCuenta = z.object({
  codigo: z.string().min(1),
  nombreComercial: z.string().min(1),
  idNumeroTelefono: z.string().min(1),
  telefonoVisible: z.string().min(1),
  tokenAcceso: cadenaNoVacia,
  proveedor: z.enum(['meta', '360dialog']).default('360dialog'),
  credencialRef: cadenaNoVacia,
  webhookSecretRef: cadenaNoVacia,
  activa: z.boolean().default(true),
})

export type ConfiguracionCuenta = z.infer<typeof esquemaConfiguracionCuenta>

const esquemaCuentas = z.array(esquemaConfiguracionCuenta).min(1)

const esquemaEntorno = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    SIMULADOR_PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.string().default('info'),
    DATABASE_URL: z.string().min(1),
    PROVEEDOR_MENSAJERIA_DEFECTO: z.enum(['meta', '360dialog']).default('360dialog'),
    D360_API_BASE_URL: z.string().url().default('https://waba-v2.360dialog.io'),
    META_APP_SECRET: cadenaNoVacia,
    META_VERIFY_TOKEN: cadenaNoVacia,
    META_API_VERSION: z.string().default('v21.0'),
    WHATSAPP_DRY_RUN: booleanoDeCadena.default(true),
    WHATSAPP_VENTANA_ATENCION_ACTIVA: booleanoDeCadena.default(true),
    WHATSAPP_SEGUIMIENTOS_ACTIVOS: booleanoDeCadena.default(false),
    WHATSAPP_SEGUIMIENTOS_INTERVALO_MS: z.coerce.number().int().positive().default(30_000),
    WHATSAPP_SEGUIMIENTOS_LOTE: z.coerce.number().int().positive().default(50),
    WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA: booleanoDeCadena.default(false),
    WHATSAPP_BOT_ACTIVO: booleanoDeCadena.default(false),
    WHATSAPP_BOT_NUMEROS_PERMITIDOS: listaDeNumeros,
    API_INTERNAL_KEY: cadenaNoVacia,
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
  .superRefine((entorno, contexto) => {
    const usaMeta = entorno.WHATSAPP_ACCOUNTS.some((cuenta) => cuenta.proveedor === 'meta')
    if (!usaMeta) {
      return
    }
    if (!entorno.META_APP_SECRET) {
      contexto.addIssue({
        code: 'custom',
        path: ['META_APP_SECRET'],
        message: 'META_APP_SECRET es obligatorio cuando hay cuentas con proveedor meta',
      })
    }
    if (!entorno.META_VERIFY_TOKEN) {
      contexto.addIssue({
        code: 'custom',
        path: ['META_VERIFY_TOKEN'],
        message: 'META_VERIFY_TOKEN es obligatorio cuando hay cuentas con proveedor meta',
      })
    }
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
