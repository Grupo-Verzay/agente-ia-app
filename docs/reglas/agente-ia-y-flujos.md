# Agente IA, flujos, prompts y entrenamiento

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Agente: «Agregar caso» y «Agregar transición» escriben en el BLOQUE del paso

En el menú «Agregar acción» de un paso de Inicio, el grupo ACCIONES no cambia y
el segundo grupo (antes «TEXTO», ahora «CONVERSACIÓN») ofrece, en orden: Agregar
caso, Agregar respuesta, Agregar transición, Agregar nota interna. Caso y
transición solo en el entrenamiento (`conCasosYTransicion`), y una transición por
paso.

> **Lo que escriben lo decide `lib/casos-y-transicion-del-paso.ts` (puro), y lo
> usan los DOS constructores** (`markdownBuilder` y `buildSectionedPrompt`): los
> casos son UNA tabla `| Caso | Detección | Acción |` con letras A, B, C en el
> orden en que se agregaron y su frase de respaldo; la transición, al final del
> bloque, `➡️ TRANSICIÓN: … current_step = N …`.

Cuatro cosas que hay que mantener:

1. **Aplica el PRIMER caso que coincide**: con dos o más se escribe además
   `FRASE_DEL_ORDEN`; con uno solo la tabla sale exactamente con el formato
   pedido. Una fila con los dos campos vacíos no se escribe.
2. **La transición guarda el `id` del paso y se escribe su NÚMERO**: sin destino,
   o con uno borrado o el propio, es el siguiente (N+1); en el último paso sin
   destino no se escribe nada.
3. **Un paso sin casos ni transición sale idéntico al de antes**: la numeración
   `(k)` cuenta solo los elementos normales.
4. **El esquema Zod los conoce** (`escenario`, `respuesta`, `destino`): sin eso
   guardar el prompt falla en todas sus secciones.

### Y en Preguntas, Productos y Extras: la transición va a un paso de INICIO

Las tres pestañas ofrecen el mismo menú y las mismas tarjetas. Lo único que
cambia es la transición: `current_step` es siempre un paso del flujo de Inicio,
así que el destino se elige entre los pasos de Inicio (`pasosDelInicio`) y **no
hay «siguiente»** —una pregunta no tiene paso N+1—: sin destino, o con uno que
ya no existe, no se escribe nada. Lo resuelve `elPasoDelInicio`.

Tres cosas que hay que mantener:

1. **El prompt de verdad lo arma `composePromptFromSections`**, que le pasa a las
   tres los `training.steps`; la foto de «lo guardado» y el conflicto de
   `MainAi` hacen lo mismo, o el botón Guardar saldría verde sin cambios.
2. **En pantalla los pasos llegan EN VIVO** desde Inicio (`onPasosChange` →
   estado de `MainAi`), solo cuando cambia un id o un título.
3. **Gestión no lo lleva**: su menú solo captura datos, no tiene grupo de
   conversación.

Lo prueba `scripts/banco-casos-y-transicion.sh` (los dos constructores
empaquetados, el esquema, el orden, el menú y las tres pestañas); `MODO=roto`
corre el constructor de `83159ac` y lee las pestañas de `8958372`, y afirma que
no existían.

Y `scripts/banco-menu-del-paso.sh` lo mide en Chromium con las cuatro
pestañas REALES montadas: abre «Agregar acción» en Inicio, Preguntas,
Productos y Extras y exige el MISMO menú —grupos, opciones y orden—, que el
caso y la transición salgan con los mismos campos, una transición por paso y,
fuera de Inicio, el destino entre los pasos de Inicio. `MODO=roto` monta las
pestañas de `8958372` y afirma que solo Inicio los ofrecía.

## Agente: una prohibición que no viaja en el prompt no existe

La **nota interna** de un paso es una instrucción que el modelo lee y obedece
pero no dice: «este paso es solo para quien ya pagó», «no ofrezcas aquí el
descuento». Se agrega desde el menú del editor, en TEXTO, justo debajo de la
respuesta, con candado.

Lo delicado no es la pantalla, es que la prohibición **sea cierta**. Llamarla
«interna» en la interfaz no le dice nada al modelo: el modelo solo sabe lo que
se le escribe. Así que las tres reglas viajan **dentro del bloque**, no en un
comentario del código —no emitirla ni parafraseada, no aplicarla fuera de este
paso, y no tocar `current_step`, que lo decide el motor de flujo—.

Cuatro cosas que hay que mantener:

1. **El envoltorio lo escribe UNA función**, `envolverLaNotaInterna`
   (`lib/nota-interna-de-paso.ts`), y es pura. Los constructores de prompt son
   **dos** —`markdownBuilder` y `buildSectionedPrompt`— y tienen que escribir
   exactamente lo mismo: con el texto copiado en cada uno, el día que se afine
   la prohibición se afina en uno y la misma nota se comporta distinto según por
   qué camino se armó el prompt.
2. **Vacía no escribe nada.** El campo es opcional, así que una tarjeta recién
   puesta y en blanco no puede meterle al modelo una cabecera sin instrucción:
   solo gasta contexto y le da una regla sobre la nada.
3. **Pero cuando tiene contenido, cuenta como elemento.** `hasActions` decide si
   se escribe la sección ELEMENTOS, y sin contar la nota un paso cuyo único
   elemento fuera esa nota **la perdía entera, sin decir nada**. Es el fallo que
   se comete solo al añadir un `fn` nuevo: hay que mirar las dos listas, la del
   render y la de «¿hay algo que escribir?».
4. **Va la ÚLTIMA, detrás de todas las respuestas.** Es `kind: "function"`, así
   que caía con las acciones y el paso se leía del revés: lo primero que se veía
   era un recuadro con candado que el cliente no verá nunca, y la respuesta
   —que es de lo que trata el paso— debajo. El orden de un paso es **título,
   objetivo, acciones, respuestas, nota interna**.

   El argumento con el que entró arriba —«el modelo tiene que haberla leído
   antes de redactar»— **no se sostiene**: el prompt le llega entero de una vez,
   así que tres líneas más arriba o más abajo no cambian lo que lee; lo que sí
   cambia es cómo se lee el paso en la pantalla.

   Por eso `lib/orden-de-elementos.ts` tiene **tres niveles y no dos** —acción,
   respuesta, nota— y la nota se reconoce por su `fn` **antes** de mirar el
   `kind`. Los dos constructores escriben los elementos en el orden del array,
   así que ese módulo ordena la pantalla y el prompt a la vez: **no hay dos
   órdenes que mantener a la par.** Los bloques viejos se enderezan solos al
   abrirlos (`ordenarElementosDeLosPasos`), así que no hace falta migración.

Y el `fn` nuevo entra también en el **esquema Zod** (`PromptElementSchema`). Sin
eso, guardar un prompt con una nota dentro falla la validación de **todas** las
secciones —`patchSection` las revalida— y rompe cualquier edición sobre ese
prompt, que es un fallo mucho más ancho que la nota.

## El Robot no es el webhook

El botón **Robot** de cada línea encendía y apagaba el **webhook de Evolution**.
Robot apagado = Evolution no le manda nada al backend = no hay aviso en vivo,
no se guarda historial en nuestra base y la conversación abierta solo vive del
reloj contra Evolution. Las líneas atendidas por personas —justo las que se
apagan— eran las que peor iban en Chats, y se buscó el fallo durante horas en
el socket, en las salas y en las identidades. Se vio en los logs del backend:
en diez minutos entraban webhooks de veinte líneas de otras cuentas y **ni uno
de las de Verzay**; se encendió el robot y llegaron.

Ahora son dos cosas:

1. **El webhook va siempre encendido.** `cambiarRobot` y `leerEstadoDelRobot`
   (`actions/robot-actions.ts`) lo dejan encendido pase lo que pase. Es lo que
   trae los avisos y el historial.
2. **El Robot es la marca `bot_enabled` de la línea** (`Instancias`), que crea
   el backend con su migración. El backend la lee en cada mensaje
   (`isBotEnabled`, con caché de 10 s) y, apagado, **guarda y avisa y se para**:
   sin sesión, sin disparadores, sin IA, sin flujos.

La App lee y escribe esa columna **con SQL en crudo**, no en `schema.prisma`:
la columna la crea el backend y, si la App desplegara antes con la columna
declarada, reventaría cada consulta a `Instancias` (el #360). Sin columna, el
botón vuelve a tocar el webhook como antes y lo dice en la consola.

Y la migración en caliente: una línea con el webhook apagado en Evolution es
una que se apagó con el botón viejo. Al abrir Conexión se toma como robot
apagado, se guarda la marca y se enciende el webhook. Nadie tiene que hacer
nada a mano.

### Vencer una factura apaga el AGENTE, no la línea

La misma regla, aplicada donde más duele. Al suspender por impago se llamaba a
`deleteInstanceInternal`: `logout` y `delete` contra Evolution, y **la fila de
`Instancias` borrada**. Al pagar se creaba una instancia nueva con el mismo
nombre, así que el cliente que se retrasaba un día **tenía que reescanear el
QR**. Y el webhook se apagaba además, o sea que la línea se quedaba sin avisos
en vivo y sin historial — justo lo que la sección de arriba prohíbe.

> **Lo que se apaga es la marca del Robot, y ya.** La sesión de WhatsApp se
> queda conectada, el webhook encendido, la conversación sigue entrando y el
> asesor puede seguir escribiendo a mano. Al confirmarse el pago el agente
> vuelve solo, sin escanear nada. Vive en `lib/robot-por-facturacion.ts`.

**Y es la palanca correcta porque vale para los dos proveedores con una sola
escritura**: el backend lee la misma marca para Evolution y para Waha —los
mensajes de Waha pasan por el mismo `processWebhook`—. Con `logout` habría dos
caminos que mantener a la par, y el día que uno se afinara el otro se quedaría
atrás.

Los **seis** caminos que la tumbaban pasan ya por ahí: las tres acciones
manuales de `billing-actions`, el pago confirmado de `billing-payment-internal`,
el cron de `billing-job-actions`, la cascada del reseller y
`syncUserBillingLifecycle`, que es el más caliente de todos. **El borrado de la
cuenta a los 30 días se queda como estaba**: ahí la fila de `User` se va y la
línea se borra de verdad.

#### Con Waha eran DOS fallos distintos, y ninguno era el que parecía

Esto se escribió primero de memoria y **el banco lo desmintió dos veces**. Las
dos funciones de borrado no se comportan igual con una línea de Waha:

| | qué hacía con una línea `waha` |
| --- | --- |
| `deleteInstanceInternal` (manual) | busca la fila **una segunda vez con el tipo PEDIDO** (`Whatsapp`) en vez de con el de la fila que encontró, no la encuentra y se rinde. La fila sobrevive… **y el agente seguía contestando**: lo único que lo callaba era borrar la instancia de Evolution. Una cuenta suspendida con la IA trabajando gratis. |
| `deleteInstanceEvolutionAware` (cron) | sí borra por el id de la fila, sea del tipo que sea. Y una línea de Waha **no suele tener clave de Evolution**, así que entra por su rama «sin apiKey, limpiamos el registro» y **se lleva la fila en el acto**, dejando la sesión viva y huérfana en el servidor de Waha. |

Los dos están en el banco **ejecutados, no descritos**, y esa es la parte que
importa: las dos versiones que se escribieron antes de medir eran falsas, y
cada una habría quedado en el código como una explicación convincente de algo
que no pasaba.

#### Tres cosas que hay que mantener

1. **Se recuerda cómo estaba el Robot, no se enciende a ciegas.** Las líneas que
   atiende una persona tienen el Robot apagado **a propósito**, y son las que
   más se apagan; encenderlo al confirmar un pago le pondría la IA a contestar a
   un cliente que decidió que no la quería. El recuerdo vive en
   `robot_antes_de_suspender`, tabla de la App con `CREATE TABLE IF NOT EXISTS`
   y sin clave foránea — `Instancias` es del backend y añadirle columnas desde
   aquí es lo que reventó el #360.
2. **`ON CONFLICT DO NOTHING`, nunca `DO UPDATE`.** El cron repasa las cuentas
   suspendidas en cada vuelta y la suspensión manual puede caer encima: con
   `DO UPDATE` la segunda vez guardaría el `false` que se acaba de escribir, y
   entonces al pagar se le devolvería el agente **apagado para siempre**. El
   primer recuerdo es el bueno, y se borra al usarlo.
3. **Sin la columna `bot_enabled` no se toca nada, y se dice.** Es el lado
   seguro a propósito: sin la marca no hay forma de callar al agente sin tocar
   la sesión, y tocarla es justo lo que esto viene a quitar. Mejor un agente que
   responde de más que un cliente reescaneando un QR.

## Un saliente automático lo escribe QUIEN LO MANDA, no el eco del proveedor

El recordatorio de una cita le llegaba al cliente por WhatsApp y **en Chats no
quedaba ninguna fila**. Cuando el cliente respondía citándolo, el panel pintaba
**«Ese mensaje todavía no está cargado»** — porque el mensaje citado no existía
en `chat_messages`. En varias citas, no en una.

Y no era el envío: era que **nadie lo escribía**.

Un recordatorio de cita **no** es una fila de `Reminders`. Al agendar, la App
escribe una fila de `seguimientos` con `idNodo = appt-reminder-<id>`, y la
entrega `FollowUpRunnerService`. Ese runner pedía el emisor a pelo
—`factory.getSender(...).sendText(...)`— y eso **manda y no guarda nada**.

### Por qué solo se veía en unas líneas

Esta es la parte que hace que el fallo parezca intermitente y que despista:

| la línea | ¿hay eco del proveedor? | ¿quedaba escrito? |
| --- | --- | --- |
| **Evolution** | sí: `messages.upsert` devuelve también lo que sale por su API | **sí**, lo guardaba el eco |
| **Waha, Meta, Telegram** | el eco se **descarta a propósito** | **no**, nada |

Lo de Waha no es un olvido: `if (esPropio && msg.source !== 'app') return []`
es lo que impide que la IA oiga su propia respuesta, se tome por intervención
humana y **se pause justo después de hablar**. Ese filtro lleva escrita al lado
su premisa: *«lo que sale por la API ya lo guardamos nosotros al enviarlo»*. El
follow-up runner no cumplía su mitad del trato.

> **La regla: un saliente automático se escribe en el mismo sitio donde se
> manda, y se manda por el camino que lo escribe.** En este repositorio ese
> camino ya existía y tenía tres puertas —`sendEvolutionAiText`,
> `enviarMediaIaPorLinea` y `enviarAudioIaPorLinea`, de `WorkflowService`—, que
> es por donde ya salían los follow-ups del CRM, los nodos de flujo y la mitad
> de los recordatorios. **Nadie manda un automático con
> `factory.getSender(...)` a pelo.**

### Y no duplica, porque la fila lleva el id REAL

Es lo que permite que la regla valga también en Evolution, donde el eco SÍ
llega: se envía capturando el id de WhatsApp (`sendTextNodeReturnId` en
Evolution, `sendTextConId` en los canales) y se guarda con él, así que el eco es
**la MISMA fila** y el `ON CONFLICT` la dedupe. Guardar sin id es lo que hacía
salir el mismo mensaje dos veces en el panel —uno «Agente IA» y otro con el
nombre del asesor— habiéndole llegado UNA sola vez al cliente.

Y el id real hace la otra mitad: el acuse (`message.ack`) encuentra la fila y el
✓✓ avanza. Sin él la fila se queda con una palomita para siempre.

### Cinco cosas que hay que mantener

1. **El proveedor sale de la FILA, no del parámetro.** `resolveInstanceType`
   preguntaba con la cuenta y, sin cuenta, se caía a `'evolution'` a ciegas: el
   saliente de una línea de Waha se mandaba al servidor de Evolution —que para
   ella no existe— y no llegaba nada. Ahora la cuenta acota cuando se sabe y,
   cuando no, se pregunta por la línea a secas, que es lo que
   `WhatsAppSenderFactory.getSender` hace desde siempre.
2. **Sin ficha de conversación, la cuenta sale de la LÍNEA.**
   `canSendWithoutSession` deja salir un seguimiento sin sesión, y
   `persistMessage` necesita saber de quién es la fila: con la cuenta vacía el
   mensaje sale y no queda escrito. `Instancias` sabe de quién es la línea.
3. **Y si aun así falta, se avisa.** Un saliente que no queda escrito no se ve
   como un error: se ve como un panel al que le faltan mensajes, que es de lo
   más caro de diagnosticar.
4. **Los tres tipos van por el mismo sitio.** Si el texto se guarda y la media
   no, un recordatorio con imagen sigue desapareciendo — y eso no se lee como
   «falta un caso», se lee como «a veces funciona».
5. **Si se añade otro emisor automático, va por ahí.** Eran dos los que se
   habían quedado fuera —los seguimientos y la rama sin `serverUrl` del runner
   de recordatorios, que es **toda** línea de Waha—, y los dos se veían igual
   desde fuera.

### El banco

`scripts/banco-recordatorio-en-el-chat.sh` (en el repositorio del backend), en
dos modos y contra Postgres, con el **`ChatStoreService` de producción**
escribiendo las filas: las tablas del chat las crea él mismo con
`CREATE TABLE IF NOT EXISTS`, que es el mismo camino que en producción, en vez
de una DDL escrita a mano que podría no parecerse a la de verdad.

`MODO=roto` lleva dentro, **escritos literales**, los tres trozos de antes, y
afirma el fallo: la línea envía y `chat_messages` queda vacía. Y se comprobó lo
que de verdad hace falta comprobar de un modo roto: **quitándole esos trozos se
pone en rojo**, o sea que no estaba verde por no ejercer nada.

## Flujos: una vez por conversación, salvo que el dueño abra REPETICIONES

Lo normal sigue siendo que un flujo se dispare **una sola vez por
conversación**. En los que lo necesitan —medios de pago, ubicación— el dueño lo
abre desde el «⋯» de la tarjeta del flujo › **Repeticiones**, con dos controles:
**máximo de ejecuciones** (por defecto 1) y **tiempo de espera entre
ejecuciones** (minutos, horas o días con el mismo `TimeInput` de siempre; por
defecto vacío = sin espera).

> **El ajuste vive en `flujo_repeticiones`, tabla de la App** (`workflowId`,
> `maxEjecuciones`, `esperaMinutos`) con `CREATE TABLE IF NOT EXISTS` y sin
> clave foránea. **Ni una columna en `Workflow`**: es del backend, dueño de sus
> migraciones (#360). Un flujo **sin fila** es 1 vez y sin espera, así que los
> flujos que ya existen se comportan exactamente igual sin backfill; y volver a
> lo de siempre **borra** la fila, para que «sin fila» signifique una sola cosa.

**Quien aplica la regla es el backend**, en la misma puerta que ya decidía «una
vez»: `ChatHistoryService.reservarEjecucion` (`api-webhook`). El conteo y la
última vez salen de las filas `intention` de `n8n_chat_histories`, una por
ejecución, **por conversación (`session_id`) y por flujo (`name`)** —las que ya
existían cuentan—. Cinco cosas que hay que mantener:

1. **Contar y apuntar van en UNA transacción con `pg_advisory_xact_lock`** por
   (conversación, flujo). El `INSERT … WHERE NOT EXISTS` de antes no bastaba en
   READ COMMITTED: dos mensajes a la vez pasaban los dos. El banco lo ejerce con
   ocho reservas simultáneas y se pone rojo si se quita el candado.
2. **La regla es de las dos**: alcanzado el máximo no se dispara más; sin
   cumplir la espera no se dispara aunque queden. Pura en
   `repeticiones-de-flujo.ts` del backend; la App lleva su copia del saneado
   (`lib/repeticiones-de-flujo.ts`) con **los mismos topes** (100 ejecuciones,
   365 días). Lo que no se entiende cae en 1 vez y sin espera.
3. **Soltar una reserva fallida suelta SOLO la última** fila: las anteriores sí
   salieron y siguen contando.
4. **La bienvenida y los pasos del embudo NO la usan** (llaman sin
   `workflowId`): son de una vez por diseño, y su tarjeta no ofrece la opción.
   Lo que la respeta es lo que ya consultaba la reserva: `Ejecutar_Flujos` de la
   IA, los disparadores IA y la instrucción literal. Los flujos por **palabra
   clave** y las respuestas rápidas se disparaban ya en cada coincidencia sin
   mirar la reserva, y así siguen (solo apuntan la ejecución para que cuente).
5. **Sin la tabla (nadie abrió el ajuste) el backend no se queja**: es lo de
   siempre. Cualquier otro fallo al leerla también cae en lo de siempre, pero se
   dice.

Guardar es de quien manda (`canManageWorkspace`); un `agente` lo ve y no lo
cambia; el flujo se resuelve por su FILA y pasa por `laCuentaDeLaAccion`. Lo
prueban `scripts/banco-repeticiones-de-flujo.sh` aquí (regla, acciones contra
Postgres y la pantalla; `MODO=roto` afirma que antes no había opción) y el del
mismo nombre en `api-webhook` (la reserva contra Postgres; `MODO=roto` lleva el
candado viejo y afirma que no dejaba repetir).

## El prompt maestro: el global, o el PROPIO de la cuenta si el dueño se lo escribió

El prompt maestro son las filas `SystemMessage` (TRAINING) de la cuenta de la
plataforma, y el backend lo pone delante del entrenamiento de cada cuenta en
las dos llamadas del agente (`ai-agent.service.ts`, la respuesta normal y el
seguimiento). Una cuenta puede tener además el suyo, en Panel › Clientes ›
«⋯» › **Prompt maestro**.

> **Si el propio tiene texto, SUSTITUYE al global para esa cuenta; si está
> vacío, la cuenta recibe el global exactamente como antes.** No se concatenan:
> dos maestros juntos se contradirían y el modelo elegiría uno por su cuenta.
> Lo decide `PromptService.getPromptMaestro(cuentaId)` en el backend, con la
> regla pura en `prompt-maestro.ts`; la App lleva su copia del saneado
> (`lib/prompt-maestro-de-cuenta.ts`) con el MISMO criterio de vacío.

Cuatro cosas que hay que mantener:

1. **Solo lo edita el dueño de la plataforma** (`esSuperAdminDeVerdad`), en las
   dos acciones (`actions/prompt-maestro-actions.ts`) y no solo en el menú. Ni
   el administrador de una cuenta, ni un reseller, ni el cliente; y con
   «Ingresar» puesto tampoco, porque ahí el rol propio no cuenta.
2. **La tabla es de la App**, `prompt_maestro_de_cuenta` (`cuentaId` PK), con
   `CREATE TABLE IF NOT EXISTS` y sin clave foránea. **Ni una columna en
   `User`** (#360). Vaciar el campo **borra la fila**: «sin fila» = global.
3. **Que no se pueda leer nunca deja a la cuenta sin maestro**: sin la tabla
   (42P01) el backend cae en el global sin avisar, y con cualquier otro fallo
   cae en el global y lo dice.
4. **La cuenta es la dueña de la LÍNEA** (el `userId` con el que el agente
   responde), no quien mira. No se hereda por la familia: cada cuenta tiene el
   suyo o el global.

Lo prueban `api-webhook/scripts/banco-prompt-maestro.sh` —los dos casos del
encargo contra Postgres con el `PromptService` real: la cuenta con el campo
vacío recibe el global y la cuenta con el campo lleno recibe el suyo; su
`MODO=roto` lleva la llamada de antes y afirma que la cuenta llena recibía el
global— y `scripts/banco-prompt-maestro.sh` aquí, con las acciones de verdad y
su puerta.

## AI imágenes: el COPY sale de la RED de la vista previa, y se escribe con la misma clave

La pantalla generaba la imagen del producto y **el texto del post había que
escribirlo a mano**. Lo que faltaba no era otra pantalla: era el texto, y el
texto no es el mismo en las tres redes.

> **La red sale del FORMATO de la vista previa, no de un mando nuevo.** `1:1` es
> un post de Instagram, `9:16` una historia de WhatsApp y `16:9` un post de
> Facebook — que es lo que `AD_FORMATS` ya dice en esa pantalla. Con un segundo
> selector, la imagen se vería en un formato y el copy hablaría de otra red, y
> eso no se lee como un error: se lee como un texto que no pega con lo que hay
> encima.

Lo decide `lib/copy-del-anuncio.ts`, **puro**, y lo pide
`generarCopyDelAnuncio` en `actions/ai-image-actions.ts`, con
`getGeminiApiKey()` — **la misma clave que el diálogo de esa pantalla ya
guarda**: ni una variable de entorno, ni una segunda credencial que configurar.

### Y lo que una red no soporta se QUITA al leer, no solo se pide en el prompt

WhatsApp **no indexa hashtags**: ahí son texto muerto con una almohadilla
delante. Pedirle al modelo que no los ponga es una instrucción que a veces se
ignora, y «casi siempre» no basta — el copy de una historia sale con seis
etiquetas que no llevan a ninguna parte. Se pide **y** se comprueba
(`comoSeLeeElCopy`).

Y la condición del hashtag no es la almohadilla: es **la almohadilla con al
menos una letra detrás**. Sin ella, limpiar una historia se llevaría por delante
el «#1» de «el #1 en ventas», que no es una etiqueta — es parte de la frase.

Instagram lleva hasta 6, Facebook 2 —ahí casi nadie los usa— y **WhatsApp cero,
que es una decisión y no un olvido**. El llamado a la acción, en cambio, va en
las tres.

### El texto habla de la IMAGEN, así que la imagen viaja en la petición

La imagen ya generada va dentro de la llamada. Sin ella, dos productos distintos
con la misma plantilla darían el mismo texto.

Y **el modelo del copy NO es el del paso «Motor»**: aquellos son generadores de
imagen y no devuelven texto. `MODELO_DEL_COPY` es el de texto de la misma
familia, escrito en un solo sitio y comprobado por el banco: si alguien pone ahí
uno con `image` en el nombre, se pone rojo.

### Un fallo del texto no puede tumbar la tanda de imágenes

`generarCopyDelAnuncio` **devuelve un resultado, no lanza**. Corre detrás de la
imagen, que es lo que de verdad se vino a generar. Pero **no es mudo**: el
motivo baja al panel y se queda ahí —debajo, no en un aviso que se va— porque
quien vuelve un minuto después tiene que poder saber por qué no hay texto.

Cinco cosas más que hay que mantener:

1. **La llave de la vista se escribe en UN sitio** (`laLlaveDeLaVista`). El copy
   y su imagen comparten llave: con dos formas de construirla, el panel
   enseñaría el texto de otra vista sin dar ningún error. El banco falla si el
   hook vuelve a montarla a mano.
2. **Por qué falló Gemini lo lee UNA función** (`porQueFalloGemini`), y la usan
   el ciclo de imágenes y el del copy. Con la lista de rechazos copiada en dos
   sitios, uno de los dos acabaría diciendo «error desconocido» sobre una clave
   caducada. Al extraerla salió un fallo que ya estaba: **el `catch` del ciclo
   de imágenes se rendía en silencio** cuando el error no encajaba en ninguno de
   sus tres casos — la variante no salía y en pantalla no había nada que mirar.
   Ahora lo desconocido también se dice.
3. **El copy se pide DETRÁS de la imagen y solo si alguna salió**, y **una por
   vista, no por variante**: el texto habla del producto y de la red, y esos no
   cambian entre variantes de la misma imagen.
4. **Los copies se reindexan igual que las imágenes** al quitar un producto
   (`reindexarSinEl`, una función para los dos mapas). Si no, al quitar el
   producto 1 el texto del 2 se quedaría debajo de la imagen del 3.
5. **Lo editado a mano se guarda en SU vista.** Cambiar de red y volver lo
   conserva; sin eso, el trabajo de escribirlo se tiraría sin decir nada.

Y copiar al portapapeles va en su `try`: en un origen sin HTTPS
`navigator.clipboard` lanza, y **un botón que da error al pulsarlo es peor que
no tenerlo** — se dice qué hacer (seleccionar y Ctrl+C) en vez de fallar callado.

### Los bancos, y por qué son dos

- `scripts/banco-copy-del-anuncio.sh` — la decisión pura y un barrido, más las
  **acciones de verdad contra Postgres**: que la clave que llega a Google es la
  que esa pantalla guardó —el entorno lleva a propósito una clave que canta,
  para que caerse a ella se vea—, que la imagen viaja dentro, y que un fallo
  vuelve con su motivo en vez de lanzar.
- `scripts/banco-copy-en-la-pantalla.sh` — el `AdGeneratorStudio` de VERDAD en
  Chromium: se sube un producto, se pulsa «Generar imagen», y se comprueba que
  el texto aparece junto a la previa, que sigue al formato que se elige ahí, que
  lo editado se conserva al cambiar de red y volver, que regenerar lo cambia,
  que copiar deja el portapapeles puesto, y que la previa no se queda sin sitio
  a 1440/1280/1024/390.

La segunda tiene que ser en navegador: **«¿el texto que se ve es el de la imagen
que se ve?» depende de que las dos llaves sean la misma**, y un barrido leería
dos funciones correctas.

Los dos modos rotos van **pinchados a un commit**, nunca a `origin/main`, y
afirman el fallo: no había módulo, ni acción, ni panel. Comprobado además lo
único que dice que un banco mira — quitándole el arreglo al modo bueno se pone
en rojo: siete casos al deshacer las reglas de red, el aviso o la llamada, y los
cinco del navegador al quitar el panel.

Tres cosas del arnés de navegador que costaron su vuelta:

1. **El botón de generar solo existe en el ÚLTIMO paso**, así que el banco
   recorre el asistente como lo recorre una persona — y con «Siguiente», no por
   el rótulo del paso: los de la barra van `hidden sm:block`, o sea que a 390 no
   hay texto que pulsar.
2. **`GoogleKeyDialog` usa `useRouter`**, que fuera de Next revienta al montar:
   `window.listo` no llega nunca y lo único que se ve es un plazo agotado, que
   no se parece en nada a su causa. Va aliasado a `next-navigation-mudo`.
3. **Y la red se corta en el contexto.** Sin eso Chromium se queda esperando a
   hosts de Google que la salida de este equipo deniega.

## Flujos: el «Menú con botones» es el MISMO paso que el de texto, entregado de otra forma

«Menú de opciones» manda las opciones numeradas en texto; **«Menú con botones»**
(`menu-interactivo`) manda las mismas opciones como **lista desplegable** de
WhatsApp —o como hasta 3 botones— y el cliente elige tocando. Todo lo demás es
común: la pregunta, las opciones (una por línea, tope 10, que es también el
máximo de filas de una lista), las ramas `opt-N`, los **reintentos** (0 a 5) con
su aviso, y qué pasa al agotarlos: **seguir por la rama «No eligió»** o **pasar
a la IA**. Los dos se editan con el mismo bloque (`MenuNodeFields`).

Cinco cosas que hay que mantener:

1. **La regla es una, escrita dos veces a propósito**: `lib/workflow-menu.ts`
   aquí y `src/modules/workflow/menu-de-opciones.ts` en el backend. Rótulos,
   topes de WhatsApp (fila 24, botón 20), forma y conectores tienen que decir lo
   mismo: la vista previa es lo que le llega al cliente, y el conector que se
   dibuja es la rama que el motor sigue. El banco compila las dos y las compara.
2. **Las columnas nuevas (`menu_style`, `menu_list_button`, `menu_fallback`)
   son del BACKEND** y la App las lee y escribe en SQL crudo
   (`lib/menu-interactivo-db.ts`), tolerando que falten (#360).
3. **Solo WAHA manda la lista**, y su motor GOWS **no implementa botones**: el
   motor prueba botones, cae a lista y, si nada sale, al menú numerado en texto.
   El cliente siempre recibe algo, y el menú queda escrito en la conversación
   (antes el menú de texto por Waha no se guardaba).
4. **El cliente puede tocar o escribir**: vale el número, el id de la fila o el
   texto de la opción. Lo que no case cuenta como reintento. Pasar a la IA
   termina el paso y le deja a la IA una nota de qué se preguntó.
5. **«Pasar a la IA» no dibuja la rama «No eligió»**, y al elegirlo se borra la
   conexión que colgaba de ella. Un menú nuevo se conecta por su primer conector
   libre (`conectoresDeSalida`), no por `out`.

Lo prueba `scripts/banco-menu-interactivo.sh` aquí (regla, barrido y comparación
con el backend; `MODO=roto` afirma que antes no existía) y el del mismo nombre
en `api-webhook` (el motor contra Postgres, con su modo roto).

## Flujos: lo que cuelga de un seguimiento sale CON el seguimiento, y un menú ahí espera

Un paso de seguimiento no envía nada en el momento: agenda su mensaje. El motor
lo agendaba y **seguía de largo en ese mismo instante**, así que lo que colgaba
detrás salía ya. Con el flujo real del reporte —Texto → Seguimiento (60 días) →
Menú con botones → Imagen— el menú no salía con el seguimiento sino junto al
primer texto, desenganchado de él, y cuando el seguimiento por fin salía no
quedaba nada esperando: desde fuera, «el menú no espera y sale la imagen».

> **Un paso que NO es de seguimiento y cuelga de uno se ejecuta cuando ese
> seguimiento SALE.** El motor corta el recorrido en el seguimiento, y el
> runner de seguimientos lo reanuda desde el paso de después al enviarlo
> (`continuarTrasElSeguimiento`). De ahí en adelante es el flujo de siempre:
> un menú, un «Menú de opciones» o una intención se mandan y **esperan** su
> respuesta; solo la opción elegida lleva a su rama.

La regla vive en `api-webhook/src/modules/workflow/lo-que-sigue-al-seguimiento.ts`
(pura) y la preguntan el corte y la reanudación. Cuatro cosas que hay que
mantener:

1. **Una cadena de seguimientos seguidos NO se corta**: se agenda entera de una
   vez, cada uno con su espera contada desde ahora («a la hora, al día, a los
   tres días»), como estaban hechos ~20 flujos en producción. Lo que va después
   de la cadena espera al ÚLTIMO.
2. **Reanudar es empezar de nuevo desde ese paso**: si el flujo esperaba en
   otro menú, esa espera se olvida y el menú que se reencuentra se vuelve a
   mandar.
3. **Reanudar va después de dar el seguimiento por enviado, y en su propio
   `try`**: si falla, el seguimiento ya salió y no se repite ni se marca como
   fallido. Si el seguimiento se cancela (el cliente respondió y era de
   inactividad) o se agota, lo de detrás no sale: es lo correcto.
4. **Solo flujos del creador visual** (`isPro`). Un flujo básico va en lista y
   no se toca.

Lo prueba `api-webhook/scripts/banco-menu-tras-seguimiento.sh`, contra Postgres
con el motor y el runner de producción; `MODO=roto` corre los de `210fdd4` y
afirma que el menú salía al arrancar y nada seguía al seguimiento.

## Entrenamiento › Cotizaciones: la App DECIDE y arma el PDF, el backend lo MANDA o escala

Una pestaña más del entrenamiento (la octava, detrás de Gestión): un interruptor
—**apagado de serie**— y un cuadro libre con qué incluye una cotización y qué
condiciones aplica. Encendida, cuando el cliente pide una cotización la IA llama
a `Enviar_Cotizacion` y el cliente recibe por WhatsApp un PDF con el logo y los
datos del negocio, lo pedido con **los precios del catálogo de Productos**, el
total y esas condiciones.

> **El modelo nunca pone un precio.** Manda nombres y cantidades; la App
> (`/api/cotizacion-ia`, clave interna) empareja contra los productos ACTIVOS de
> la cuenta (`decidirLaCotizacion`, `lib/cotizacion-ia.ts`, pura) y contesta
> `lista`, `aclarar` (más de un producto casa), `escalar` o `apagada`. Lo que no
> está en el catálogo, o un descuento / precio especial / cuotas, **escala a un
> asesor por `escalarConversacion`** —el camino de siempre, con su modo
> solo-registro— y no genera ni PDF ni fila.

Seis cosas que hay que mantener:

1. **Los ajustes viven en `cotizacion_ia_ajustes`, tabla de la App**; sin fila
   o sin tabla es APAGADA, y el backend lo lee así (42P01 → apagada).
2. **La herramienta solo existe encendida**, y con ella encendida **se omite la
   vieja `crear_cotizacion`** del catálogo de herramientas: esa tomaba los
   precios que escribía el modelo. Apagada, todo sigue como estaba.
3. **La cotización se guarda en el módulo Cotizaciones** (`status: 'enviada'`,
   cada línea con su `productId`) ANTES de armar el PDF, que va al bucket en
   `cotizaciones/<cuenta>/`. El texto de condiciones viaja en `notes`.
4. **Los datos del negocio salen de Perfil** (`sections.business` del prompt
   `system-prompt-ai`) y el logo de `laMarcaDelNegocio`, la de exportar a PDF.
5. **`/api/cotizacion-ia` está entre los prefijos del middleware** con su
   propia puerta: sin él el backend se traería el login con un 200. Y el backend
   mira `resp.redirected`.
6. **Si el PDF no sale por la línea, al modelo se le dice** que no le diga al
   cliente que ya la tiene ni le dé precios.

Lo prueban `scripts/banco-cotizacion-ia.sh` aquí (la regla y el PDF leído con
pdf.js, la pestaña en Chromium a 1440/1280/1024/390 y la ruta y las acciones
contra Postgres; `MODO=roto` afirma que en `8b1bdab` no existía) y el del mismo
nombre en `api-webhook` (la herramienta contra Postgres; `MODO=roto` afirma que
la vieja usaba los precios del modelo).

## Flujos: cambiar el tipo es escribir el nuevo y QUITAR los otros dos

El tipo de un flujo (Inicio, IA, Flujo, Chatbot) no es una columna: se deduce
de `triggerOnNewSession`, de un `IntentTrigger` con su `workflowId` y de las
palabras clave en `description` (`elTipoDelFlujo`), y el motor lee esas tres
cosas en crudo. No había forma de cambiarlo, y lo que se tocaba a mano dejaba
el viejo mandando: un chatbot con disparador seguía siendo IA.

> **«Cambiar tipo» en el «⋯» de la tarjeta abre el MISMO selector que «Nuevo»**
> (`SelectorDeTipoDeActivacion`), con lo que el flujo es hoy
> (`laActivacionActual`), y guarda con `cambiarElTipoDelFlujoAction`: en una
> transacción escribe el tipo nuevo y borra los otros dos
> (`losCambiosDelTipo`, `lib/tipo-de-activacion.ts`, pura). Pasar a Inicio
> apaga la otra bienvenida de la cuenta; chatbot sin palabras o IA sin
> intención no se guardan. El motor no cambia.

Lo prueba `scripts/banco-tipo-de-flujo.sh` (regla, barrido y la acción contra
Postgres con todas las transiciones); `MODO=roto` lee `75b7e76` y afirma que
no había forma de cambiarlo.

## «Claves» por canal: a la vista, y cada clave DONDE el motor la lee

Cada canal del editor del Agente IA (`/ia/<canal>`) tiene su botón «Claves»
antes de «Guardar» (`app/(root)/ia/_components/claves/BotonDeClaves.tsx`). En
ámbar con un punto si falta alguna, en gris si están todas: la misma lógica que
«Guardar». Las secciones de cada canal y sus reglas viven en
`lib/claves-por-canal.ts` (puro) y el estado se lee en
`lib/claves-por-canal.server.ts`.

- **No hay almacén nuevo.** Cada sección guarda donde el backend ya mira:
  Mensajería en `user_ai_configs` (proveedor por defecto), Voz en `User`
  (`ttsProvider`, `elevenLabs*`), Llamadas en la clave de OpenAI de
  `user_ai_configs` (la que pide el servidor de llamadas, `no_openai_key`),
  Videollamadas en `videollamada_ajustes.propio*` (Tavus, OBLIGATORIO: no hay
  avatar de respaldo, ver `videollamadas-y-reuniones.md`) y WhatsApp API,
  Telegram, Facebook e Instagram en el token de su fila de `Instancias`. Una
  clave guardada donde el motor no lee sería un fallo mudo. Separar la IA de
  cada canal de chat exige que el backend la lea primero.
- **Ninguna clave viaja al navegador**: a lo sumo sus 4 últimos
  (`comoLaVeElNavegador`), y el campo vacío CONSERVA la guardada. Esto incluye
  la de ElevenLabs, que antes llegaba entera al panel de voz.
- Toda acción del botón pasa por `laCuentaDeLaAccion`; cambiar una línea
  comprueba en la FILA que es de la cuenta y de ese canal.
- La voz salió del «⋯»: ahora es la sección «Voz» de las claves de WhatsApp.
- Un proveedor que aún no funciona (ElevenLabs en Llamadas) se ve como
  «Próximamente» y no se puede elegir.

Lo prueba `scripts/banco-claves-por-canal.sh`; `MODO=roto` lee `1d733ad` y
afirma que no había botón, que la voz estaba en el «⋯» y que la clave de
ElevenLabs viajaba en claro.
