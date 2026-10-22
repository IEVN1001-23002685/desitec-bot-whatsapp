import { z } from 'zod'
import { esquemaMetadataMeta } from './payload-webhook.js'

export const esquemaSync360Dialog = z.looseObject({
  id: z.string().optional(),
  event: z.string().min(1),
  data: z.looseObject({
    metadata: esquemaMetadataMeta,
    state_sync: z.array(z.unknown()).optional(),
    history: z.array(z.unknown()).optional(),
  }),
})

export type Sync360Dialog = z.infer<typeof esquemaSync360Dialog>
