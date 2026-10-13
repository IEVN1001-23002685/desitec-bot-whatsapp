import 'dotenv/config'
import { cargarVariablesEntorno } from './shared/config/variables-entorno.js'
import { crearRegistrador } from './shared/logging/registrador.js'

function principal(): void {
  const entorno = cargarVariablesEntorno()
  const registrador = crearRegistrador(entorno.LOG_LEVEL)

  registrador.info(
    { dryRun: entorno.WHATSAPP_DRY_RUN },
    'worker de seguimientos iniciado (planificador aún no implementado)',
  )
}

principal()