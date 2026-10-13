import { z } from 'zod'

export const esquemaContactoMeta = z.looseObject({
  profile: z.looseObject({ name: z.string().optional() }).optional(),
  wa_id: z.string(),
})

export const esquemaTextoMeta = z.looseObject({ body: z.string() })

export const esquemaMensajeMeta = z.looseObject({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
  text: esquemaTextoMeta.optional(),
})

export const esquemaEstadoMeta = z.looseObject({
  id: z.string(),
  status: z.string(),
  timestamp: z.string().optional(),
  recipient_id: z.string().optional(),
})

export const esquemaMetadataMeta = z.looseObject({
  display_phone_number: z.string().optional(),
  phone_number_id: z.string(),
})

export const esquemaValorMeta = z.looseObject({
  messaging_product: z.string().optional(),
  metadata: esquemaMetadataMeta,
  contacts: z.array(esquemaContactoMeta).optional(),
  messages: z.array(esquemaMensajeMeta).optional(),
  statuses: z.array(esquemaEstadoMeta).optional(),
})

export const esquemaCambioMeta = z.looseObject({
  field: z.string(),
  value: esquemaValorMeta,
})

export const esquemaEntradaMeta = z.looseObject({
  id: z.string().optional(),
  changes: z.array(esquemaCambioMeta),
})

export const esquemaPayloadWebhookMeta = z.looseObject({
  object: z.string(),
  entry: z.array(esquemaEntradaMeta),
})

export type PayloadWebhookMeta = z.infer<typeof esquemaPayloadWebhookMeta>
export type MensajeMeta = z.infer<typeof esquemaMensajeMeta>
export type EstadoMeta = z.infer<typeof esquemaEstadoMeta>
export type ValorMeta = z.infer<typeof esquemaValorMeta>
