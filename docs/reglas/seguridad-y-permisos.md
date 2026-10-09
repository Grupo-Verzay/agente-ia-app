# Seguridad, permisos y alcance entre cuentas

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Toda acción y toda ruta comprueban de quién es el dato

Había funciones que un usuario con sesión podía llamar con el id de **otra
cuenta** y contestaban sin preguntar: el CRM entero
(`getSessionsByUserIdToCRM`), las tareas de una conversación ajena
(`getTasksBySessionAction`) y el prompt del agente de otro cliente
(`patchBusinessAndFirma`, que no comprobaba **ni sesión**). Y cinco rutas de
subida a S3 que no pedían nada: cualquiera, con o sin sesión, podía llenar el
bucket o dejar archivos en la carpeta de otra cuenta. Es el H02 de la auditoría
del 2026-09-06.

La regla ya existía, `assertCanAccessTargetUser`, y es la que respeta a todos
los que tienen que pasar: uno mismo, el asesor sobre su dueño, cuentas
vinculadas, admin y super admin sobre todo, el reseller sobre sus clientes. Lo
que faltaba era **aplicarla donde no estaba**.

Tres cosas:

1. **Ninguna acción de servidor que reciba un `userId`, un `sessionId` o un id
   de recurso lo usa sin pasar antes por `assertCanAccessTargetUser` con el
   dueño de ese recurso.** Si el recurso no trae el dueño (una conversación, un
   prompt), se resuelve primero con una consulta pequeña y luego se comprueba.
2. **Ninguna ruta `/api` confía solo en el middleware.** El middleware se pudo
   saltar (ver la regla de Next) y volverá a poder en la próxima CVE. Las rutas
   que son para el navegador comprueban `currentUser()`; las que son para el
   backend llevan su clave (`CRM_FOLLOW_UP_RUNNER_KEY`); las públicas de verdad
   (`/api/health`, formularios públicos, avatar) lo son a propósito y lo dicen
   en un comentario.
3. Cuando un legítimo reciba «No autorizado», **se arregla la pantalla que
   manda el id equivocado, no la regla.** El caso típico: pasar el id del asesor
   donde la regla espera el de su dueño.

### Y nueve ficheros no tenían NI UNA llamada a `currentUser()`

La regla de arriba estaba escrita y aplicada en 26 sitios. Lo que faltaba era
barrer: **Cotizaciones, las cuatro de Finanzas, Datos externos, la base de
conocimiento y Productos** recibían el `userId` del navegador y lo metían
directo en el `where`.

```ts
export async function deleteFinanceContact(id: string, userId: string) {
  await db.financeContact.updateMany({ where: { id, userId }, … });
}
```

**Una acción de servidor ES un endpoint.** No hace falta estar dentro de la
pantalla ni tener ningún permiso: con la sesión de cualquier cuenta y otro id,
se borran, se crean y se editan los datos de otra. Son **66 acciones** con el
hueco, y no solo de borrar — crear y editar estaban igual.

> **El id que llega del navegador no decide nada: se comprueba.** Va por
> `laCuentaDeLaAccion` / `exigirLaCuentaDeLaAccion` (`lib/cuenta-de-la-accion.ts`),
> que resuelve `currentUser()` y pasa el id pedido por `assertCanAccessTargetUser`.
> **Si se añade otra acción que reciba un `userId`, va por ahí.**

Seis cosas que hay que mantener:

1. **Es un ALCANCE, así que sin id pedido se cae a la fila EFECTIVA**
   (`ownerId ?? id`), nunca a la persona. Resolver la persona aquí es
   exactamente lo que rompió la cartera de clientes en el #783: un
   administrador que llega a su cuenta por `linked_accounts` no tiene
   `advisorRole` en su propia fila. Firmar es otra pregunta y va con la persona.
2. **Dos formas, y hacen falta las dos.** Unas acciones devuelven
   `{ success, message }` y otras el dato pelado. Con una sola, la otra mitad
   tendría que envolver todo en un `try`, y un `catch` que se olvida es un «No
   autorizado» que se ve como una pantalla vacía.
3. **El rechazo NO es mudo.** El caso típico no es un ataque: es una pantalla
   que manda el id equivocado. Sin el `console.warn` no hay forma de saber cuál.
4. **Lo público lo es a propósito y lo dice.** `getPublicCatalog` es la única
   que se queda sin guarda: la abren `/catalogo/[userId]` y `/c/[slug]`, dos
   páginas sin sesión, así que comprobar algo las tumbaría enteras. Solo salen
   productos `isActive`. **Se comprueba ANTES de guardar en bloque quién llama a
   cada acción**: un cron, el despachador o una página pública se caen con una
   guarda que espera cookies.
5. **Y se mira también lo que NO recibe ningún id.**
   `applyDefaultToolConfigsAllUsers` escribía en **todas** las cuentas de la
   plataforma y solo pedía tener sesión; no entraba en el barrido justamente
   por no recibir nada. Pide superadministrador de verdad, como
   `bulkSyncActiveClientSessions`.
6. **Un `where` sin dueño es el mismo hueco sin el id delante.**
   `updateProduct` iba con `where: { id }` a secas y descartaba el `userId` del
   formulario a propósito —correcto— pero entonces no quedaba nadie a quien
   preguntarle de quién era la fila. **El dueño sale de la fila, no del
   navegador**: se lee con un `findUnique` pequeño y se comprueba.

Y cómo se barre, porque buscar `userId` en la firma **no basta**: no lo ve
cuando llega dentro de un tipo con nombre (`input: FinanceContactInput`), ni
cuando los parámetros empiezan en la línea siguiente, ni cuando sale de un
`parse` (`const { userId } = listParams.parse(raw)`). Los tres casos aparecieron
en este barrido y los tres estaban abiertos. Se busca **por el cuerpo**
—`\.userId\b` entrando a un `where` o a un `data`— y no por la firma.

### Y el segundo lote: veinticuatro ficheros más, y el CUBO que nadie nombró

El barrido anterior cerró ocho ficheros. Quedaban **veinticuatro** con el mismo
patrón: `evo-url`, `tools`, `tag`, `rr`, `prompt`, `reminders`, `appointments`,
`bookings`, `intent-trigger`, `userAvailability`, `seguimientos`,
`user-nav-preference`, `n8n-chat-historial`, `crm-follow-up-media`, `manual`,
`service`, `catalog-config`, `contact-fields`, `google-calendar`,
`booking-form`, `booking-questions`, `finance-contact-fields`,
`ai-suggested-reply` y `userAiconfig`. **129 acciones** pasan ya por
`lib/cuenta-de-la-accion.ts`.

Los cuatro que más duelen, para que se vea qué clase de agujero era:

| dónde | qué se abría con solo cambiar un id |
| --- | --- |
| `getReminderFormDeps` | devolvía **la clave de Evolution** de la cuenta nombrada, su servidor y sus leads. No es leer de más: es entregar unas credenciales. |
| `userAiconfig-actions` | su `ensureUser` **solo comprobaba que la fila existiera**. Nueve acciones leyendo, cambiando y borrando **claves de API** de otra cuenta. |
| `clearAllHistory` | un `deleteMany` sobre la **memoria entera del agente** de la cuenta que se nombrara. |
| `deleteAgentPromptsByUserId` | lo mismo con **todos** sus prompts y revisiones. |

#### El tercer cubo: lo que abre una página SIN sesión

La consigna de este lote era «todo lo que no llame un cron, un webhook ni el
despachador». Barriendo aparece **una clase más que esa frase no nombra**: las
acciones que abre una página o una ruta pública. Ponerles la guarda no las
protege — **las apaga**, porque ahí no hay nadie a quien preguntarle.

> **Antes de guardar una acción se mira si la abre algo sin sesión.** Lo dice
> `middleware.ts`: `/schedule/`, `/r/`, `/plan/`, `/p/`, `/reunion/`, `/t/` y
> los prefijos de `/api` que pasan de largo. Es lo que este documento ya decía
> de `getPublicCatalog`, y son **siete** más: `createAppointment`,
> `getRemindersByUserId`, `getPublicTeamData`, `getAvailableBookingSlots`,
> `createBookingAppointment`, `sendBookingNotifications` y las dos de preguntas
> activas del formulario de reservas.

`getRemindersByUserId` es el caso que no se puede ablandar: **lo llama la UI y
lo llama la página pública** (`/schedule/[userId]`, de donde salen los
recordatorios `isSchedule` del formulario). Guardarla cierra la pantalla que le
da de comer a la función. Se queda fuera y **se dice**, que es lo contrario de
que se quede fuera sin que nadie lo sepa.

#### Y un barrido automático se equivoca por los DOS lados

Esto costó una vuelta y conviene no repetirlo. El detector que busca «acciones
sin guarda» falla en las dos direcciones, y las dos veces en silencio:

- **De más.** Marcó abiertas a `registro-action` (usa `assertUserCanUseApp`,
  que por dentro **es** `assertCanAccessTargetUser` más el candado de pago), a
  Cobros (`laCuenta()`), a los follow-ups del CRM (`ensureAuthorizedUser`), a
  `actions-ia-credits` (`puedeVerLosCreditos`), a Contactos de operador y a
  Notificaciones (`assertCanManage`), y a `toggleWebhook`. **Siete ficheros que
  llevaban años cerrados.**
- **De menos.** No vio `updateTagAction` ni `getSessionTagsAction` —dos huecos
  reales al lado de seis hermanas guardadas—, ni `getCatalogConfig`, ni
  `deleteUserAiConfig`, ni las cuatro de `service-action`.

**Así que se lee cuerpo por cuerpo.** El barrido sirve para ordenar la cola, no
para decidir.

#### El banco mira que la guarda ESTÉ, no lo que hace

`lib/__tests__/guardas-de-las-acciones.test.mjs`. Lo que la guarda hace ya lo
prueba el banco de `cuenta-de-la-accion`; el fallo de esta familia es otro:
**a una hermana se le pasa**. Ha pasado así media docena de veces en este
repositorio —`updateTagAction`, `getCatalogConfig`, `assignSessionToAdvisor`,
los tres hermanos del estado del lead, «anclar» y «archivar»—.

El banco recorre los veinticuatro ficheros y exige que cada acción exportada
llame a una puerta conocida **o esté en la lista de exclusiones con su motivo
escrito al lado** — y falla si el motivo está vacío, para que una exclusión no
se pueda colar sin explicación. Encontró **treinta** acciones que este mismo
lote se había dejado: las dos del orden de etiquetas, `deleteUserAiConfig`, las
cuatro de servicios, tres de respuestas de formulario y cinco de seguimientos.

Dos cosas que hay que mantener:

1. **El trozo de cada acción va de su `export` al `export` siguiente**, y no
   contando llaves. Contar llaves parece lo correcto y aquí falla: el `{` que
   viene detrás de los parámetros suele ser el de la anotación de retorno
   —`Promise<{ success: boolean; … }>`—, así que el «cuerpo» salía siendo el
   tipo. El banco marcó treinta acciones que tenían la guarda dos líneas más
   abajo: **un número que no puede ser señala el sitio.**
2. **`assertUserCanUseApp` cuenta como puerta.** Dejarla fuera de la lista es
   lo que produjo el primer falso positivo, y en un banco un falso positivo se
   arregla ablandando la comprobación — que es como se pierde.

#### Y un seguimiento no tiene `userId`: cuelga de su LÍNEA

`seguimiento` no guarda cuenta, guarda `instancia`. Así que de quién es se
resuelve con `resolveInstanceOwner` y se comprueba como cualquier otra.

De ahí sale el fallo que estaba debajo: las tres acciones que van por
`remoteJid` no acotaban por línea, y **el mismo número está en dos cuentas**
—le escribe a Ventas y a Atención, que es lo normal—. Así que se leían y se
**borraban** los seguimientos de la otra. No se rechaza la petición entera: se
**filtra**, que es lo que le devuelve lo suyo a quien pregunta.

### Y la propia `assertCanAccessTargetUser` preguntaba por la PERSONA

La regla existía y estaba puesta en 26 sitios, y aun así tenía dentro el fallo
que este documento describe tres veces: **su última comprobación era el rol de
la PERSONA**, `isAdminOrReseller(actor.role)`.

Desde fuera: Yair —administrador de «Verzay | Atencion»— llenaba el formulario
de un ticket a nombre de un cliente de la casa, pulsaba Enviar y le salía
**«No autorizado»**; desde la cuenta madre, cuya fila sí tiene rol de admin, el
mismo formulario funcionaba. Menú abierto, puerta cerrada: la pantalla que le
ofrecía las cuentas ya preguntaba por la cuenta (`rolQueManda`) y la puerta de
detrás seguía preguntando por él.

Y el equipo **se crea con rol `user` y no cambia nunca**, así que ningún
administrador pasaba jamás por ahí.

Ahora pregunta por **`cuentaQueManda(actor)`**, igual que las acciones del
panel. Tres cosas que hay que mantener:

1. **El orden de las puertas no cambia.** Primero uno mismo, luego su dueño,
   luego las cuentas vinculadas y **al final** el rol. Eso mantiene baratos los
   caminos cortos —`cuentaQueManda` solo corre para lo que antes se rechazaba— y
   explica por qué el fallo se veía intermitente: a nombre de la cuenta madre sí
   funcionaba, porque `linked_accounts` lo salvaba **antes** de llegar al rol.
   Buscar «por qué a veces sí» sin ver esa rama es perder la tarde.
2. **Donde se compara un id, se compara contra `cuenta.id`.** La rama del
   reseller buscaba `resellerid: actor.id`, así que al administrador de un
   reseller se le caía el permiso sobre sus propios clientes. Es el mismo fallo
   dormido en la misma puerta, sin reportar todavía.
3. **Un `agente` no pasa, y eso se prueba.** `cuentaQueManda` le devuelve su
   propio id y su propio rol: participa, no manda. Y el administrador de una
   cuenta **cliente** tampoco gana nada — lo que se hereda es el **alcance de su
   cuenta**, no un permiso suelto.

El banco corre en **dos modos**, con la puerta vieja y con la nueva. La única
comprobación que cambia entre ellos es el fallo; todo el bloque de «esto no se
puede haber aflojado» pasa **igual en los dos**, y eso es lo que prueba que no
se abrió nada de paso. Sin el modo roto no se sabe si se arregló la causa o
algo parecido.

### Y si se recuerda para no repetirla, la llave son los DATOS que deciden

Una pantalla son decenas de peticiones y cada una resuelve desde cero quién eres
y a qué llegas. `currentUser()` son 2 a 4 consultas; `getAssociatedAccountIds`
es un `UNION` en crudo. Cincuenta veces lo mismo para la misma respuesta.

Se puede recordar unos segundos (`lib/cache-de-sesion.ts`), y lo único delicado
es **con qué llave**. La regla: **la llave son las cosas que deciden la
respuesta, todas, y nada más.**

De ahí salen dos llaves distintas, y la diferencia importa:

- **Quién eres** se decide con las **credenciales**: las cookies de sesión, el
  `impersonate_user_id` y el `active_account_id`. Que la llave sea la credencial
  es lo que hace que dos personas no puedan compartir entrada —la cookie es un
  JWT firmado y distinto por persona— y que **el conmutador de cuentas se
  invalide solo**: entrar escribe una cookie, salir la borra, y la petición
  siguiente calcula otra llave. No hay una lista de sitios que haya que
  acordarse de invalidar.
- **A qué llegas** se decide con los **ids**, no con la sesión.
  `getAssociatedAccountIds` solo mira `ownerId ?? id`, `sessionUserId` y el
  propio, así que la llave son esos tres. Con los ids dentro no puede haber
  cruce, y además se puede seguir llamando desde acciones donde no hay cookies
  que leer.

Tres cosas que hay que mantener:

1. **Se guarda la PROMESA, no el valor.** Dos peticiones que entran a la vez
   comparten una sola resolución en vez de lanzar dos. Es la mitad de la ganancia
   cuando la pantalla arranca de golpe.
2. **Un resultado recortado por un fallo NO se cachea.** Cuando la consulta de
   vinculadas falla se sigue con la cuenta activa, que es el lado seguro; pero
   guardarlo cinco segundos sería **propagar esa pérdida de acceso** a las
   peticiones de al lado, y eso se ve como un «No autorizado» suelto e
   irreproducible. La siguiente vuelve a preguntar. Lo mismo con un `null`: nunca
   se recuerda que alguien no ha entrado.
3. **El plazo es de segundos, y se sabe lo que cuesta.** Un cambio de rol o una
   cuenta deshabilitada tardan eso en notarse. Se acepta a sabiendas **porque lo
   que se recuerda es barato de equivocarse**; si algún día se cachea algo cuyo
   error sea caro, el plazo no es la respuesta.

### Y un RUNNER de sistema no puede ser una acción: la guarda no lo cierra, lo APAGA

El barrido de arriba dejó un lote fuera a propósito: las funciones que llama un
**cron**, un **webhook** o el **despachador de avisos**. Ese lote no se cierra
en bloque, y el motivo es que **ponerle la guarda de siempre las rompe**: desde
un cron no hay sesión, `currentUser()` devuelve vacío, y lo que sale de ahí no
es un «No autorizado» en pantalla — es que el aviso deja de salir y nadie se
entera. Es exactamente lo que dejó los **avisos de Waha callados durante días**.

Y aun así había que cerrarlas, porque la premisa no cambia:

> **Una acción ES un endpoint.** Todo `export async function` de un fichero
> `'use server'` es un POST al que se llega desde el navegador con los
> parámetros que uno quiera, **lo llame quien lo llame por dentro**. Que una
> función solo tenga sentido desde un cron no la hace alcanzable solo desde un
> cron.

Lo que estaba publicado con eso, y no es poco: `runResellerBillingForAll`
—recorre la cartera de cada reseller, suspende cuentas y **borra** las que
llevan 30 días vencidas—, `runBillingDailyJobSystem` —el cobro de la plataforma
entera, con su `requireAuth: false` puesto a propósito—, `confirmPaymentInternal`
y `setUserBillingDueDateInternal` —o sea **darse por pagado**—, las diez del
despachador —«manda este texto, a este número, por la línea de esta cuenta»—,
`generateWeeklyReportForUser(userId)` y `processCallRecordingForUser` —que
gastan los **créditos de IA de otra cuenta**— y `sendQrDisconnectedNotification`,
que manda un WhatsApp a cualquier número por la línea de la casa.

**La salida no es una guarda, son dos formas de dejar de ser un endpoint**, y
cuál toca lo decide una sola pregunta: *¿lo importa algún componente de cliente?*

| | qué se hace |
| --- | --- |
| el fichero **no** lo importa ningún componente de cliente | el fichero entero deja de ser de acciones: `'use server'` → **`import "server-only"`** |
| el fichero **sí** tiene pantalla detrás | el fichero se queda como está y **el runner se va a `lib/*.server.ts`** |

`server-only` no es una etiqueta más floja: conserva lo único que `'use server'`
aportaba de verdad —que eso no se empaquete nunca hacia el navegador, y que el
build **se caiga en el sitio** si alguien lo importa desde un componente de
cliente— y quita el endpoint. Y la segunda fila no inventa nada: es lo que ya
hacían `lib/cobros-runner.ts` y `lib/avisos-de-vencimiento-runner.ts`, o sea la
regla que este documento ya tenía escrita —**un despachador del servidor no pasa
por una acción**— aplicada a los seis sitios donde faltaba.

Cinco cosas que hay que mantener:

1. **Se mira el FICHERO, no la función.** `'use server'` publica todo lo que el
   fichero exporte, así que dejar una sola función de sistema dentro publica esa
   función. Por eso `runResellerBillingForAll` se fue entera en vez de quedarse
   con un `if`: el `requireAuth: false` de `billing-job-actions` **era** el
   agujero, no el arreglo.
2. **Lo que se mueve conserva sus dos llamadores.** El cron sigue llamándolo, y
   el llamador interno que ya tenía sesión también: `generateQRCode` sigue
   avisando de la desconexión, y `generateMyWeeklyReport` sigue generando el
   informe de quien lo pide. Lo que cambia es que ese id ya no llega del
   navegador — lo pone quien acaba de comprobar quién llama.
3. **Lo que se queda abierto se dice EN EL FICHERO, no en una lista aparte.**
   Son tres, y las tres lo son porque la página que las abre no tiene sesión:
   `getAvailableSlots`, `sendMessageWithHistoryAction` y `sendBookingNotifications`.
   Las dos últimas llevan escrito además **lo que sí abren** —mandar un WhatsApp
   por la línea de cualquier cuenta— y **qué las cerraría de verdad**: que la
   confirmación de la reserva se arme en el servidor a partir del id de la cita,
   en vez de recibirla hecha. Eso toca las dos pantallas públicas de reservas,
   así que va aparte; lo que no puede pasar es que se dé por revisado.
4. **Un filtro que vive un paso después del servidor no es un filtro.**
   `/schedule/[userId]` pedía `getRemindersByUserId` —la biblioteca entera de la
   cuenta, con el texto de cada recordatorio— y filtraba `isSchedule` **al
   pintar**, así que lo que viajaba era la lista completa. Ahora hay
   `getScheduleRemindersByUserId`, que filtra en la consulta, y su hermana
   lleva la guarda. Es una función aparte y no un parámetro **porque el filtro
   es la puerta**.
5. **Y lo comprueba un banco que mira por dónde entra el sistema**, no función
   por función: `lib/__tests__/acciones-de-sistema.test.mjs` lee del propio
   `middleware.ts` los prefijos que pasan sin sesión, recorre esas rutas y falla
   si alguna importa un fichero `'use server'`. Corre en **dos modos**: con la
   forma vieja de `billing-job-actions` puesta se pone en rojo por los dos
   sitios, y con la nueva pasa. Sin el modo roto no se sabe si se arregló la
   causa o algo parecido.

### Y lo que llega es el id de la COSA: el dueño sale de la fila

`lib/cuenta-de-la-accion.ts` cerró las acciones que reciben un `userId`.
Quedaban las que reciben el id de una **cosa** y no preguntaban de quién era, y
eran muchas: las notas internas y los participantes de una conversación,
asignar o **tomar** un chat ajeno (y a quién se le asigna), el historial de
asignación, los registros de un lead, crear y etiquetar leads, el entrenamiento
maestro (`SystemMessage`), el editor del agente —guardar cada sección, publicar,
listar y **restaurar** versiones, aplicar una plantilla— y los pasos de un flujo
—editar, reordenar, leer, mover, borrar—. Y lo peor de todos: **borrar un flujo
entero borraba sus archivos y sus pasos ANTES de comprobar de quién era**; la
comprobación estaba en el último paso, con el flujo ya vacío.

> **El dueño sale de la FILA y se pregunta con la puerta de siempre.**
> `lib/dueno-del-dato.server.ts`: `laCuentaDeLaConversacion`,
> `laCuentaDelFlujo`, `laCuentaDelNodo`, `laCuentaDelEntrenamiento` y
> `esGenteQueAlcanzo` (para el asesor al que se asigna o transfiere). Las cinco
> acaban en `laCuentaDeLaAccion` → `assertCanAccessTargetUser`, así que dicen
> exactamente lo mismo que las 129 acciones de la casa: ni una sexta regla.

Cinco cosas que hay que mantener:

1. **Una puerta por familia, no una por acción.** Los pasos de un flujo tenían
   tres variantes (`ownerId ?? id`, `user.id` y nada); ahora todas pasan por
   `laCuentaDelNodo`/`laCuentaDelFlujo`, que es igual o más amplio que lo de
   antes (el asesor sigue llegando a los flujos de su dueño).
2. **La puerta va ANTES de tocar nada**, y eso incluye el bucket:
   `deleteFileNode` comprueba el paso —y que el archivo sea el SUYO— antes de
   `removeObject`; `deleteEntireWorkflow` antes de sus archivos y sus pasos.
3. **«No existe» y «no es tuyo» se contestan igual**, con la forma que cada
   acción ya devolvía cuando no encontraba la fila.
4. **Lo que se llama sin sesión no pasa por la acción: se muda a `lib/*.server.ts`.**
   El editor del agente vive en `lib/entrenamiento-del-agente.server.ts` (lo usa
   el modo dueño por WhatsApp); crear y etiquetar un lead, en
   `lib/leads-sin-puerta.server.ts` (lo usan la reserva pública, por dentro de
   `createAppointment`, y el modo dueño). **La página pública de reservas ya no
   llama a `registerSession`**: su lead lo crea `createAppointment`. Una
   pantalla nunca importa de esos dos ficheros.
5. **Un `Partial<Fila>` del navegador no toca la identidad**: `updateWorkflow`
   quita `id`, `userId` y `createdAt` antes de escribir, o se movía un flujo a
   otra cuenta cambiando su `userId`.

Lo prueba `scripts/banco-dueno-del-dato.sh`: un barrido de que cada acción de
esos nueve ficheros pasa por una puerta (o dice por qué no), y las acciones de
verdad contra Postgres con tres cuentas —la dueña, su hija y una ajena—. En
`MODO=roto` las mismas pruebas corren contra un commit pinchado y **afirman la
fuga**: la ajena lee las notas, toma el chat, reescribe el entrenamiento y deja
el flujo sin un solo paso.

## La configuración de la PLATAFORMA es de la casa, y lo dice UNA puerta

Precios y créditos de los planes, su ficha de venta, las cuentas bancarias y
métodos de pago, y los resellers —su lista, sus licencias, su perfil y qué
clientes cuelgan de cada uno—. Nada de eso es de una cuenta: lo que se toca ahí
lo ven y lo pagan todos los clientes.

Las pantallas del panel lo preguntaban y **las acciones de detrás no**:
`upsertSubscriptionPlan`, `savePaymentMethodConfig`, `upsertPlanDetail`,
`getAllPaymentMethodConfigs` y `getResellersWithPools` contestaban a cualquiera
con sesión, así que un cliente cambiaba el precio de un plan o el número de
cuenta al que pagan todos, y leía la lista de resellers con nombres, correos y
licencias. Y las que sí preguntaban lo hacían cada una a su manera (`user.role`,
`rolQueManda` o nada).

> **Quién manda en la casa lo dice `mandaEnLaCasaDeVerdad`
> (`lib/mando-de-la-casa.ts`)**: la cuenta por la que se actúa es `admin` o
> `super_admin`, o es el súper administrador de verdad. Es la MISMA fórmula que
> Analítica (`puedeVerLaAnaliticaDeLaCasa` delega ahí). Las acciones entran por
> `quienMandaEnLaCasa` (`lib/puerta-de-la-casa.ts`), que avisa al rechazar, y
> las páginas preguntan con la misma función. **Si se añade otra acción de
> configuración de la plataforma, va por ahí.**

Cinco cosas que hay que mantener:

1. **Lo que se queda abierto lo es a propósito y lo dice**: los planes y
   métodos de pago ACTIVOS (la landing y /planes), la ficha de venta, y la marca
   pública de un reseller. La lista está en el barrido del banco, con su motivo.
2. **El precio MAYORISTA no viaja fuera de la casa.** `leerLosPlanes`
   (`lib/planes-de-suscripcion.server.ts`, sin endpoint) lo quita salvo para la
   casa; la landing pública de un reseller lee de ahí y no de la acción.
3. **Al navegador de Resellers llega la ficha corta** (`CAMPOS_DE_LA_FICHA`:
   id, nombre, correo, empresa). Iba la fila entera de `User`, con la contraseña
   cifrada y las claves, en la lista de resellers y en la de clientes.
4. **Un cliente cuelga de UN reseller o de ninguno**, por los dos caminos
   (`reseller` y `demoResellerId`): lo decide `puedeAsignarseAlReseller`
   (`lib/asignacion-de-reseller.ts`), dentro de una transacción con candado por
   cliente para que dos pestañas no lo asignen a dos a la vez. «Sin asignar»
   sale de la misma regla: ni equipo de otra cuenta, ni eliminados.
5. **El selector de clientes de Datos externos toma el alcance de la SESIÓN**,
   nunca del filtro que llega (`lib/selector-de-clientes.ts`): la casa, las
   cuentas cliente de la plataforma; un reseller, su cartera; nadie más, nada.
   Sin filtro devolvía todos los usuarios de la plataforma.

Lo prueba `scripts/banco-configuracion-de-la-casa.sh`: lo puro y un barrido de
que cada acción de la casa pasa por la puerta, y las acciones de verdad contra
Postgres con un cliente, un agente, un reseller y un súper admin dentro de un
cliente por «Ingresar». `MODO=roto` empaqueta las mismas pruebas contra
`ANTES_REF` y afirma los fallos.

## Las notas son de la PERSONA, no de la cuenta

Un administrador comparte unas notas con su equipo. Todo bien en `/notas`. Pero
esa misma gente abría **cualquier chat**, iba a la pestaña Notas y veía **todas**
las notas del administrador, también las que no había compartido.

La pestaña de un chat pintaba `<NotesClient userId={effectiveOwnerId} />` —el id
de la **cuenta**— mientras `/notas` pinta `user.id`, el de **quien mira**. Y del
otro lado nada lo corregía: `getNotes(userId)` usaba el id que llegaba del
navegador tal cual.

Dos cosas:

1. **Las pantallas piden las notas de quien mira.** En Chats se pasa
   `viewerUserId`, no el id de la cuenta.
2. **`notes-actions.ts` no comprueba el id que llega: lo ignora.**
   `elDuenoDeLasNotas(pedido)` resuelve `currentUser()` y devuelve **su** id;
   si el pedido era otro, lo dice en la consola. Aquí
   `assertCanAccessTargetUser` **no vale**: deja pasar al asesor hacia su
   dueño, que es justo el caso que hay que cerrar. Compartir es lo único que
   hace que otro vea una nota, y eso vive en `note_shares` —lo comprueban
   `getNote` y `updateNote`, cada una por su lado—.

Si se añade otra acción de notas que reciba un `userId`, va por esa función.

### Pero «de quién son» y «a quién le LLEGA» son dos preguntas

La regla de arriba cerró un agujero y abrió, sin querer, la duda contraria.
Compartir se hace **con una CUENTA** —el selector ofrece cuentas y
`note_shares.userId` guarda el id de una cuenta—, y la búsqueda se hacía con el
id de la **persona**. Así que:

- El **dueño** de la cuenta destino las veía: su id ES el de la fila.
- Su **administrador** entraba con el suyo, `note_shares` no lo conocía, y la
  lista le salía **vacía**. Ni error, ni aviso: simplemente no estaban.

Es el caso de Yair en «Verzay | Atencion». Y no se arregla ablandando
`elDuenoDeLasNotas`: si esa devolviera la cuenta, un `agente` abriría `/notas` y
vería **todas las notas privadas** de su dueño, que es justo el incidente de
arriba. Son dos preguntas y van en dos funciones:

| Pregunta | Quién la contesta | Con qué |
| --- | --- | --- |
| ¿De quién SON estas notas? | `elDuenoDeLasNotas` | siempre la **persona** |
| ¿A quién le LLEGA un compartido? | `identidadesQueRecibenCompartidos` (`lib/notas-compartidas.ts`, puro) | la persona **y** su cuenta si es su `administrador` |

Un **`agente` no hereda**, a propósito: participa en lo que le asignen, y una
nota compartida con la cuenta no se le asignó a él. Es el mismo reparto de
`cuentaQueManda` y de `canManageWorkspace`.

Y es puro, no `cuentaQueManda`, porque aquí solo hace falta el **id** de la
cuenta —que ya viaja en la sesión— y no su rol, que costaría una consulta. Es el
mismo motivo por el que `rolQueAbrePuertas` se escribió puro al lado del suyo.

Cuatro cosas que hay que mantener:

1. **Los cinco lectores de `note_shares` van por ahí**: la lista, abrir, editar,
   fijar y ordenar. Con uno fuera, la nota sale en la lista y al pulsarla dice
   «No autorizado», que es peor que no verla.
2. **Entre dos filas para la misma nota gana la que MÁS deja hacer.** Puede
   haber una compartida con la persona y otra con su cuenta; quitarle la edición
   por tener además una de lectura sería un permiso que cambia según por dónde
   se mire.
3. **Y sale UNA vez.** El `DISTINCT ON (n.id)` de `getSharedNotes` es por eso, y
   obliga a que el orden de la lista —fijadas arriba, luego el orden propio— vaya
   en la consulta de fuera.
4. **Lo que ya es suyo no entra en «compartidas conmigo».** Con la cuenta
   dentro, quien comparte una nota propia con su propia cuenta la vería en las
   dos listas. Antes no podía pasar, porque compartir con uno mismo está
   prohibido.

**Fijar y ordenar pasan a ser de la CUENTA** cuando la nota llegó por ella: se
escriben sobre su fila, así que el dueño y sus administradores ven el mismo
orden. Es coherente con que el compartido sea de la cuenta, y es lo que ya
pasaba entre dos pestañas del dueño.

**Proyectos NO tiene este fallo**, y conviene saber por qué para no «arreglarlo»:
`project_shares` también guarda la cuenta, pero `getAuth()` de
`project-actions` resuelve `user.ownerId ?? user.id`, o sea **ya la cuenta**.
Comprobado en banco con las acciones reales: el administrador ve el proyecto
recibido, y el agente también lo ve sin poder trabajarlo — que es lo que la
sección de Proyectos compartidos ya decía.

## El equipo entra por su cartera, no por su rol

Un asesor del equipo con la pestaña concedida abría Panel › **Instancias** y
Panel › **Analíticas** y le salía **«Acceso Denegado»**. Las dos pantallas
pedían rol —`isAdminOrReseller` una, `isAdminLike` la otra— y ese asesor no lo
tiene ni lo va a tener: lo que tiene son **clientes asignados**.

La cartera ya existía y ya decidía qué ve en Clientes: `advisor_clients`. Lo
que faltaba era usarla en las demás. Ahora es **una sola función**,
`clientesDelAsesor(persona)` (`lib/clientes-del-asesor.ts`):

- `null` = sin límite propio (admin, super admin, reseller: cada uno se acota
  por su regla de siempre).
- `[]` = no le asignaron ninguno → «No autorizado».
- una lista = **esos y solo esos**.

La usan Clientes, Instancias (`getClientsWithBilling` y `assertBillingScope`,
que es la llave de todos los cambios de facturación) y Analíticas. **Si se
añade otra pantalla por cliente, va por ahí**, y no volviendo a pedir rol: eso
es lo que dejó a esta gente fuera.

Tres cosas que hay que mantener:

1. **Quien decide es la consulta, no la pantalla.** `/panel/client-billing` ya
   no comprueba el rol: pinta lo que la consulta le devuelve y enseña
   «Acceso Denegado» solo si esta dice «No autorizado». Así la pantalla no
   puede abrir de más que la consulta.
2. **Analítica va con Clientes**: quien no es admin ve las métricas de **su**
   cartera (`getAnalyticsDeMiCartera`, la misma tarjeta que ya usaba el
   reseller), no las de la plataforma. El cálculo se separó de la consulta
   (`metricasDeLaCartera`) justo para eso: cambian los clientes, no las cuentas.
3. Lo que es **de la casa** sigue siendo de la casa. Al abrir esta pantalla a
   más gente, `bulkSyncActiveClientSessions` —que toca las conversaciones de
   TODOS los clientes activos y solo pedía sesión— pasó a exigir admin. Cuando
   una pantalla se abre, se repasa qué acciones quedan a su alcance.

Y en **Proyectos**, el mismo reparto: un agente ve los que tienen que ver con
él —los que creó, los que lleva y aquellos en los que está
(`filtroDeProyectosVisibles`)—, no el trabajo entero de su dueño. Vale para la
lista y para abrir un tablero por su id. Diagramas ya lo hacía por su cuenta
con `visibility` (privado / lectura / edición).

## El administrador de una cuenta actúa POR la cuenta

Dentro de un equipo hay dos papeles: el `agente`, que atiende lo que le asignan,
y el `administrador`, que es la mano derecha del dueño. El segundo tenía el
nombre y nada más.

La causa es siempre la misma: **cada pantalla preguntaba por la persona**. Y la
persona se crea con rol `user` y sin nada a su nombre, así que:

- En **Clientes** le salía «No autorizado» hasta que alguien le asignaba los 61
  clientes uno a uno; y aun asignados, en el menú de la fila solo le quedaba
  «Ingresar» —Editar, Módulos, Asignar a y Eliminar piden rol de admin o
  reseller, y él no lo tiene ni lo va a tener—.
- En **Equipo** la consulta buscaba `owner_id = <su id>` y le devolvía el equipo
  vacío: el equipo cuelga de la cuenta, no de él. Por eso «Asignar a» contestaba
  «Cliente no encontrado».
- En **Analíticas** caía en la cartera personal, que está vacía, y le salía
  «Acceso Denegado».
- En el **Perfil** y la barra lateral le salía «Plan Básico» dentro de una
  cuenta Enterprise: el plan lo paga la cuenta, y su fila conserva el de por
  defecto para siempre.

La pregunta se hace **una sola vez y en un solo sitio**: `cuentaQueManda`
(`lib/cuenta-que-manda.ts`) dice por qué cuenta actúa alguien —él mismo, o su
cuenta si es su `administrador`—, y con eso se decide el alcance. `requireOwner`
de Equipo devuelve ya el id y el rol de la CUENTA, que es de quien cuelga todo
lo de esa pantalla.

Cuatro cosas que hay que mantener:

1. **El rol NO se hereda.** `user.role` sigue siendo el suyo en todo lo demás.
   Escribirlo en `currentUser()` habría convertido a cada administrador en super
   admin de la plataforma entera. Lo que se hereda es **el alcance**, y solo
   donde se pregunta por la cuenta. El plan sí viaja con las credenciales del
   dueño, porque es de la cuenta.
2. **Enseñar el botón no es abrir la puerta.** `currentUserRol` decide qué se
   pinta; quien decide de verdad es `lib/gestion-de-clientes.ts`, y lo comprueban
   Editar, Módulos, Eliminar y Asignar cada una por su lado. Si se añade otra
   acción sobre un cliente, va por ahí y no volviendo a pedir rol.
3. **Y se pregunta por el cliente, no solo por quién llama.** Antes bastaba con
   ser administrador de cualquier cuenta para repartirle módulos a cualquier
   cliente de la plataforma, y un reseller podía editar la ficha de uno que no
   era suyo. Es el H02 de la auditoría otra vez.
4. **Un `agente` no pasa.** Es el mismo reparto de `canManageWorkspace`:
   participa, pero no manda. A él se le pasa una cuenta para que entre a
   arreglarla, no para que la administre.
5. **Ninguna pantalla del panel vuelve a pedir rol.** Quién ve cada pestaña ya
   lo decide `apartadosDelPanel`, con los permisos que le dio su cuenta en
   Equipo. Las veinte páginas de `/panel` lo preguntaban otra vez por su cuenta
   —`isAdminLike(user.role)`— así que el menú le enseñaba «Pagos» y
   «Resellers» y la página le contestaba «Acceso Denegado»: menú abierto,
   puerta cerrada. Todas preguntan ya por `cuentaQueManda`. **Si se añade otra
   pestaña al panel, va igual.**

### Y la ACCIÓN de detrás, también

Arreglar las páginas no bastó: la puerta se había movido una capa más abajo. La
página de Suscripciones abría —pregunta por la cuenta— y
`getAllSubscriptionsAdmin` contestaba con la lista vacía, porque seguía
preguntando `isAdminLike(user.role)`, o sea por la **persona**. Igual en
Reseller, Conexión, Enlaces de registro, Evo y el reparto de licencias. Desde
fuera es peor que un «Acceso Denegado»: la pantalla se pinta entera y sale
vacía, y parece que no hay datos.

Se pregunta con **`rolQueManda(persona)`**, que es
`(await cuentaQueManda(persona)).role` en una línea. Sin él eran dos líneas por
sitio, y por eso a veintitantas acciones se les quedó el `user.role` de antes.
**Ninguna acción del panel pregunta por `user.role`.**

Y donde además se compara un id —«¿es este reseller el que pregunta?»— se
compara contra **`cuenta.id`**, no contra `me.id`: al administrador de un
reseller se le caía el permiso sobre sus propios clientes.

### El caso que lo destapó: Rendimiento de Chats

Dos pantallas iguales lado a lado y en una faltaba un recuadro. Yair —
administrador de la cuenta de la casa— abría Analíticas y veía la plataforma
entera, pero no el bloque de vigilancia: `leerLaVigilancia` preguntaba
`isSuperAdmin(user.role)`, por la persona, y el equipo se crea con rol `user`.

Ahora pregunta por `cuentaQueManda`. Eso **no** abre el bloque a cualquier
administrador —el de una cuenta de cliente actúa por una cuenta que no es
`super_admin`, así que sigue sin ver nada— y el WhatsApp de la vigilancia sigue
saliendo solo hacia la cuenta de superadministrador, que se decide aparte en
`elSuperAdministrador`.

**«Superadministrador» en una consulta es la CUENTA, no la persona.** Es la
misma regla de arriba: el rol no se hereda, el alcance sí.

Y de paso: **de un reseller sale su cuenta principal, no su cartera**. Sus
clientes los administra y los factura él; que aparecieran en la lista de la
plataforma llenaba la pantalla de cuentas ajenas y dejaba repartir lo que no se
debe. `clientesDeLaCuenta` usa el mismo criterio que ya usaba `/panel/clientes`
(`excludeResellerClients`), por los **dos** caminos con los que se vincula un
cliente a un reseller: `demoResellerId` y la tabla `reseller`. Que las dos
listas digan lo mismo es la gracia: no se puede repartir lo que no se ve.

## Mis datos se lee y se guarda con la CUENTA ACTIVA

La página le pasaba `user.id` a sus pestañas (importar de Google Sheets,
gestión, base de conocimiento). Para una persona del equipo esa es SU fila, así
que un asesor no veía los datos de su cuenta y lo que importaba quedaba bajo él:
el agente de la cuenta no lo leía y la base de conocimiento ni siquiera sacaba
embeddings (la clave de OpenAI es de la cuenta). Ahora pasa
`laCuentaActiva(user)` (`lib/cuenta-activa.ts`: `effectiveId`, la misma que el
entrenamiento del agente y Perfil). Con «Ingresar» o el conmutador ya era la
cuenta elegida y no cambia. Lo guardado antes bajo la fila de un asesor no se
movió.

Lo prueba `scripts/banco-mis-datos.sh`, con las acciones de verdad contra
Postgres: un asesor y el administrador del equipo leen lo de su cuenta, importan
y guardan en ella, el conmutador lee la hija y la puerta no se afloja.
`MODO=roto` les da el id de antes y afirma el fallo.

## Diagramas: si no se puede guardar, no se puede tocar

Un diagrama compartido con otra cuenta era **siempre de solo lectura** —no
existía compartir como editor— pero **el lienzo se dejaba tocar entero**: se
arrastraban nodos, se escribía dentro de ellos, se borraban. Nada de eso se
guardaba (`FlowEditorClient.guardar` salía con un `return` mudo si
`!puedeEditar`) y **tampoco salía ningún aviso**. La persona trabajaba un rato,
recargaba, y el diagrama estaba como al principio. **Trabajo perdido sin un solo
error**, que es la misma familia de fallo que todas las reglas de Chats de
arriba.

Y el despiste que lo provocó: la tarjeta del diagrama tiene una visibilidad
—Privado / Solo lectura / **Editable**— que reparte **dentro del equipo de una
misma cuenta**. Compartir con la cuenta de un cliente es otra cosa, y ponerlo
"Editable" no le daba nada al cliente. Dos ideas distintas con la misma palabra.

Tres cosas que hay que mantener:

1. **El bloqueo es del lienzo, no del guardado.** `FlowCanvas` recibe
   `soloLectura` y con él apaga arrastrar, conectar, seleccionar, la tecla
   Supr, el soltar nodos, el botón "Ordenar" y el "+" de los conectores;
   `FlowNode` no abre su diálogo de edición ni enseña duplicar/borrar. El
   `return` mudo de `guardar` solo es aceptable **porque** ya no se puede llegar
   a él con cambios encima. Si alguna vez se vuelve a dejar tocar el lienzo sin
   permiso, ese `return` tiene que avisar.
2. **El permiso vive en `flow_shares.permiso`** (`lectura` | `edicion`), por
   cuenta, no en `flows.visibility`. Las filas antiguas se quedan en `lectura`,
   que es como se comportaban.
3. **Editar un diagrama recibido escribe sobre el original**, no sobre una
   copia: `saveFlowGraphAction` actualiza por `id` cuando el flujo no es de la
   cuenta pero el permiso es `edicion`. Es lo que se espera de "compartido como
   editor"; quien quiera su propia versión tiene el botón de duplicar.

## «Súper administrador» es la PERSONA, y pasa por encima de todo

`currentUser()` devuelve la fila de la cuenta **efectiva**. Con el conmutador de
cuentas vinculadas, o con la cookie de «Ingresar», esa fila es la de la cuenta
en la que se está metido, así que **`user.role` deja de ser el tuyo**: un
superadministrador dentro de una cuenta `admin` era, para las 48 puertas que
preguntan por la cuenta, un `admin`; dentro de la de un cliente, un `user`.

Y veinte ficheros más cierran por `advisorRole !== "administrador"`. De esos
veinte, **ninguno eximía al superadministrador**. Desde fuera: la cuenta que
administra la plataforma entera abría Panel › Notificaciones de una cuenta suya
y le salía «Sección no habilitada», con los 42 permisos puestos.

> **La regla, y es la que manda sobre las demás:** quien es superadministrador
> de plataforma lo es **esté en la cuenta que esté**. Se pregunta con
> `esSuperAdminDeVerdad(persona)` (`lib/super-admin-de-verdad.ts`), y va como
> **salida temprana**, antes de cualquier condición de `advisorRole` o de
> cuenta — detrás no sirve de nada, que es justo lo que pasaba.

Está puesta en `workspace-roles`, `cuenta-que-configura`, `panel-acceso`,
`mando-en-chats`, el `esAgente` del layout y las acciones de tickets.

**No cuesta ni una consulta, y esa es la parte de diseño.** La primera forma de
escribirla era la de `esAdminDeVerdad` —que vivía en dos rutas de `/api`— y ante
un rol efectivo insuficiente iba a la base a leer el rol de `sessionUserId`. No
hace falta ir: `resolverElUsuario` **ya lee la fila de la persona real** —la
necesita para los permisos— y lo único que hacía era tirar su `role`. Ahora lo
propaga en `rolDeLaPersona`, y con eso la regla es **pura y síncrona**.

Que sea síncrona no es un detalle: `canManageWorkspace` y `puedeBorrarEnChats`
**no son `async`** y tienen decenas de llamadores. Con una regla asíncrona había
que volverlos `async` y arrastrar el cambio por medio repo.

Tres cosas que hay que mantener:

1. **Esto NO hereda el rol.** `user.role` sigue siendo el de la fila efectiva
   para todo lo demás y `cuentaQueManda` sigue decidiendo el alcance por cuenta.
   Lo único que dice esta regla es que quien manda en la plataforma sigue
   mandando.
2. **Se miran los DOS lados**, `role` y `rolDeLaPersona`. Una cuenta de
   superadministrador a la que entra otro tiene su rol en `role`; un super admin
   que entra en otra cuenta, solo en `rolDeLaPersona`. Preguntar por uno solo
   deja fuera la mitad de los casos.
3. **Y la excepción: «Ingresar» NO es el conmutador.** Esta regla se escribió
   para el **conmutador de cuentas vinculadas** —cambiar a una cuenta del
   propio equipo y seguir administrándola—, y ahí sigue igual. Entrar en la
   cuenta de un **cliente** con «Ingresar» es lo contrario: **se entra para ver
   lo que ve él**. Con el rol propio colándose dentro, Analíticas le enseñaba
   la plataforma entera donde el cliente ve su cartera, y el menú, los
   apartados del panel y los botones de Chats le salían abiertos de más.

   Lo distingue `porImpersonacion`, que `currentUser()` ya sabía (la cookie
   `impersonate_user_id`, frente a `active_account_id`), y lo aplica
   **`elRolPropioQueCuenta`**: dentro de una cuenta ajena por «Ingresar», el
   rol propio no cuenta. Va ahí y no en los diez sitios que preguntan —los
   diez pasan por `esSuperAdminDeVerdad`, `esAdminDeVerdad` o
   `rolQueAbrePuertas`, y los tres lo usan—.

   Lo que decide dentro es **el rol de la fila en la que se está**: entrar en
   una cuenta de la casa sigue enseñando lo de la casa, porque es lo que esa
   cuenta ve. Y salir nunca queda cerrado: es borrar la cookie
   (`/api/logout`), que no pregunta ningún rol.

## Lo que se LEE por persona se ESCRIBE por persona

`currentUser()` devuelve la fila **efectiva** —la cuenta en la que se está
metido—, y medio repo usaba `user.id` como si fuera la persona. Lo es **salvo
dentro de otra cuenta** («Ingresar» o el conmutador de vinculadas), y por eso
esta familia de fallo no se ve en ninguna prueba manual: en el caso normal los
dos ids son el mismo.

> **Un dato que se lee con `sessionUserId ?? id` se escribe con
> `sessionUserId ?? id`.** Lo contesta una sola función,
> `laPersonaQueActua(user)` (`lib/chat-de-equipo.ts`), que es `quienFirma` con
> el `null` resuelto — la misma con la que firma el chat de equipo y con la que
> cuenta la Actividad del equipo.

Y `elDestinatarioDeLosAvisos` **delega en ella**. Antes eran dos funciones
contestando la misma pregunta por separado, que es como se arregló este fallo
**la primera vez y solo a medias**: se corrigió el lado de leer y la tabla se
quedó con las dos identidades dentro.

### Lo que rompía, y no daba ningún error

| dónde | se escribía | se lee | el síntoma |
| --- | --- | --- | --- |
| `task_alerts.destinatarioId` (vía `tasks.createdById` y el autor de un comentario) | efectiva | persona | el aviso queda a nombre del cliente: **ni ventana, ni campanita, nunca** |
| `task_alerts.vistoEn` / `atendidoEn` | efectiva | persona | el `UPDATE` toca **0 filas**: el punto del tablero no se quita jamás |
| el punto del tablero (`tareasConAlgoSinVer`) | — | efectiva | preguntaba por un id que nunca tiene avisos: **siempre 0**, o sea «todo leído» |
| `task_comments.autorId` y `autorNombre` | efectiva | persona | el comentario sale firmado por el cliente y el «Tú» del hilo no acierta |
| el `actorId` de un aviso | efectiva | persona | `crearLosAvisos` descuenta con `destinatarioId === actorId`: **uno se avisa a sí mismo** |
| `task_work.cerradaPorId` | efectiva | persona (Actividad) | el Reparto del trabajo y la Actividad del equipo cuentan el mismo rato a dos ids distintos |
| `Session.assigned_advisor_id` (`takeSession`) | efectiva | persona (el desplegable de asesores) | «Asignarme» deja el chat tomado y **«Mías» sale vacía** |

Medido contra Postgres: marcar visto con la efectiva devuelve `UPDATE 0` y con
la persona `UPDATE 1`. Y el `0` de arriba es la trampa entera — el contador del
punto también daba `0`, así que **las dos mitades del fallo se tapaban entre
ellas** y desde fuera parecía que no había nada que ver.

### Tres cosas que hay que mantener

1. **El asesor de un chat es la PERSONA en los dos lados.** `takeSession`
   escribe `laPersonaQueActua(user).id` y `releaseSession` compara con lo mismo;
   `assignSessionToAdvisor` ya recibía ids del desplegable, que son personas.
   Cambiar solo el filtro habría dejado «Asignarme» escribiendo una cosa y
   «Mías» buscando otra — peor que el fallo original.
2. **`clientesDelAsesor` NO entra aquí**: es alcance, no firma, y va por la fila
   efectiva. Entró en esta lista por error y costó una regresión; el porqué está
   en la sección de abajo.
3. **Los latentes ya entraron**: `audit_logs.actor_id`,
   `tickets_de_soporte.creadoPorId`, `cobros.creadoPorId` y los dos
   `confirmadaPorId` firman con la persona. Y los tres que quedaban marcados
   como candidatos —`AssignmentLog.assignedBy`, el `actorId` de
   `generateConversationIntelligence` y el de `collab_notifications`— están
   cerrados en la sección de abajo: los tres eran firma.

### Y de lo ya escrito, qué se puede recuperar: NADA, y por qué

Es la parte incómoda y conviene que esté escrita. El valor guardado es **el id
de la cuenta**, y una cuenta tiene muchas personas detrás; peor aún, quien
actuaba venía normalmente de **otra cuenta distinta**, así que su rastro no está
en la fila por ningún lado:

- `autorNombre` y `cerradaPorNombre` **también** se copiaron de la fila efectiva,
  así que el nombre tampoco la identifica.
- `AssignmentLog.assignedBy` y `audit_logs.actor_id` guardaban el mismo id
  efectivo, así que no sirven de contraprueba.

Deducir la persona sería **inventar un autor**, y eso es peor que un autor
equivocado: quedaría indistinguible de un dato bueno. Así que no hay backfill.

**Lo que sí se arregla solo**, sin tocar ninguna fila:

- el **punto del tablero** y los avisos sin ver: esas filas no están mal, están
  **sin leer**. Abrir la tarea ahora las marca y el punto se apaga.
- **«Mías»** y el **«Tú»** del hilo: no guardan nada, se calculan al pintar.
  Quedan bien desde el despliegue.

**Lo que queda mal para siempre** son las filas escritas desde dentro de otra
cuenta: el autor de esos comentarios, quién cerró esas tareas y quién creó esas
tareas. Cuánto es se mide así —**no se ejecutó**, esta sesión no tiene acceso a
producción—:

```sql
SELECT 'task_comments.autorId' AS donde, count(*) AS filas
FROM "task_comments" c JOIN "User" u ON u.id = c."autorId" WHERE u."owner_id" IS NULL
UNION ALL SELECT 'task_work.cerradaPorId', count(*)
FROM "task_work" w JOIN "User" u ON u.id = w."cerradaPorId" WHERE u."owner_id" IS NULL
UNION ALL SELECT 'tasks.createdById', count(*)
FROM "tasks" t JOIN "User" u ON u.id = t."createdById" WHERE u."owner_id" IS NULL;
```

Es un **techo, no la cifra**: un dueño sin `owner_id` que trabaja en su propia
cuenta cuenta ahí y está perfectamente bien. Lo que de verdad importa del número
es si es cero.

### Pero FIRMAR y ALCANZAR son dos preguntas, y el alcance va por la efectiva

Aplicar la regla de arriba a `clientesDelAsesor` fue un error, y costó una
regresión en producción: Yair, administrador de una cuenta, recibía **«No
autorizado para gestionar este cliente»** al guardar en Editar pagos sobre
clientes que lleva todos los días.

La regla que manda es la del principio de este documento —**el administrador de
una cuenta actúa POR la cuenta**: alcanza sin limitación todo lo que ella
alcanza, clientes, instancias y analíticas, para listar y para guardar, y solo
en las cuentas donde se le nombró administrador—. Y el dato que dice con qué
cuenta se está actuando es **la fila efectiva**, que es justo lo que resolver la
persona tira.

> **Un dato que se FIRMA va con la persona; un alcance se pregunta a la fila
> EFECTIVA.** La primera contesta «quién hizo esto» y tiene que sobrevivir a que
> se cambie de cuenta; la segunda contesta «hasta dónde llego ahora mismo», y
> eso lo decide la cuenta con la que se entró.

Las dos puntas se rompen a la vez al confundirlas, y las dos se vieron:

- **Se queda corto.** Un administrador llega a su cuenta por **dos caminos**, y
  solo uno deja rastro en su fila: `owner_id` y **`linked_accounts`**. Por el
  segundo su propia fila no cuelga de nadie y no tiene `advisorRole`, así que
  `cuentaQueManda` sobre ELLA devuelve su id con rol `user` y la cartera sale
  `[]`. Es la misma asimetría que ya partió el General del chat de equipo en
  dos: **`ownerId ?? id` no sube a la madre.**
- **Y se pasa.** Dentro de un cliente con «Ingresar» se entra para ver lo que ve
  él —la excepción escrita en *«Súper administrador» es la PERSONA*— y ahí el
  rol propio no cuenta. Con la persona resuelta, el alcance de quien entró se
  colaba dentro.

Y la parte que hace la regla fácil de aplicar: **cuando los dos ids difieren
—el conmutador y «Ingresar», los únicos dos casos— la fila efectiva YA es la
respuesta correcta.** No hay ningún caso en que resolver la persona mejore el
alcance, así que la consulta que se quitó no dejó nada sin contestar.

Medido contra Postgres con las filas del caso, corriendo el código de verdad
—`clientesDelAsesor`, `cuentaQueManda` y `assertBillingScope`—:

| quién | antes | ahora |
| --- | --- | --- |
| administrador con su propio usuario (`owner_id`) | sin límite | sin límite |
| administrador **por cuenta vinculada** | **«No autorizado»** | sin límite |
| agente con un cliente asignado | ese y solo ese | igual |
| súper administrador dentro de un cliente por «Ingresar» | **la plataforma** | lo que ve el cliente |

Y por qué no se vio en las pruebas: el administrador que llega por `owner_id`
—que es el caso que se probó— **pasa igual por los dos caminos**, porque su
propia fila sí lleva la herencia dentro. Solo falla el que llega por
`linked_accounts`. Probar un administrador no basta: **hay que probar los dos
caminos por los que alguien llega a una cuenta.**

### Y las cinco firmas que quedaban: `audit_logs`, tickets y cobros

Eran los tres «latentes» del inventario: columnas que **se escriben y todavía no
se leen contra la persona en ninguna pantalla**, así que no rompían nada hoy —y
precisamente por eso se arreglan ahora, antes de que algo empiece a leerlas y el
fallo aparezca con años de historial mal firmado detrás.

| columna | qué guarda |
| --- | --- |
| `audit_logs.actor_id` | quién tocó el dato auditado |
| `tickets_de_soporte.creadoPorId` | quién tecleó el ticket |
| `cobros.creadoPorId` | quién creó la deuda |
| `cobros.confirmadaPorId` | quién confirmó el pago |
| `cobro_ciclos.confirmadaPorId` | lo mismo, en la fila del ciclo |

Las dos últimas salen **del mismo valor**: `confirmarElPago` lo escribe en las
dos tablas, así que firmarlo una vez en la acción las arregla a la vez.

Tres cosas que hay que mantener:

1. **`getAuditActorId` es quien decide, y por eso se arregló ahí.** Dieciséis de
   los veinticuatro sitios que escriben `actor_id` la llaman en vez de calcular
   el id a mano; los ocho de Proyectos y Tareas que lo tenían escrito pasan por
   `laPersonaQueActua`. Si se añade otro sitio que audite, va por esa función.
2. **Lo que NO se tocó, y no es un olvido**: los `writeAuditLog` del **modo
   dueño** por WhatsApp (`lib/owner-commands.ts`, `lib/owner-training.ts`) pasan
   `actorId: ownerId` porque **ahí no hay sesión ninguna** — el dueño ES la
   persona que escribió. Meterles `laPersonaQueActua` sería inventarse una
   sesión que no existe.
3. **Sin backfill, y a propósito.** Es la misma razón que ya está escrita arriba:
   el valor viejo es el id de una cuenta, y de él no se puede deducir quién
   estaba sentado delante. Deducirlo sería inventar un autor, que es peor que
   uno equivocado porque no se distingue de un dato bueno.

Medido contra Postgres con el esquema real, corriendo las **acciones** de verdad
—`crearCobroAction`, `confirmarPagoAction`, `abrirTicketAction`— y leyendo
después la columna. Cinco comprobaciones; con el código anterior fallaban
**cuatro**:

| cómo se llega a la cuenta | antes | ahora |
| --- | --- | --- |
| `owner_id` (Yair, del equipo) | la persona | la persona |
| `linked_accounts` (el conmutador) | **la cuenta** | la persona |
| «Ingresar» | **la cuenta** | la persona |

Y la mitad que de verdad protege: el banco comprueba **en la misma fila** que la
columna de alcance de al lado no se movió —`audit_logs.user_id`,
`cobros.ownerId`, `cobro_ciclos.ownerId`, `tickets.clienteId` y `destinoId`
siguen siendo la CUENTA—. Sin esa mitad, «arreglar la firma» puede estar
moviendo el alcance sin que nadie se entere, que es exactamente la regresión de
la sección de arriba.

Y el mismo patrón otra vez: el camino de `owner_id` **pasaba ya con el código
viejo**, porque ahí la fila efectiva y la persona son la misma. Probar solo ese
camino habría dado un banco verde sobre un fallo intacto.

### Y los tres candidatos que quedaban: los tres eran FIRMA

Se miraron los tres antes de tocar ninguno, que es lo que esta sección pide:
**¿alimenta esto una pantalla o un filtro por alcance?** Los tres contestan que
no —ninguno acota nada— y los tres guardan quién hizo algo. Van con la persona.

| | qué se hace con la columna | qué pasaba |
| --- | --- | --- |
| `AssignmentLog.assignedBy` | **nada la lee**: `getAssignmentHistory` la trae y la pantalla pinta el asesor y la acción | en el mismo `INSERT` de `takeSession` convivían las dos identidades: la persona en `advisorId` y la cuenta en `assignedBy` |
| `actorId` de `generateConversationIntelligence` | se escribe en `internal_notes.authorId` —cuyo nombre pinta el panel de Notas— y en `collab_notifications.actorId` | cerrar una conversación dentro de la cuenta de un cliente dejaba el resumen **firmado por el cliente** |
| `collab_notifications.actorId` | solo resolver el nombre del «X te mencionó» | igual: la campanita decía que te había mencionado la cuenta |

**Y de la tercera salió la mitad que no se había reportado.** En esa misma tabla
`recipientId` **se escribe con personas** —los ids salen del desplegable de
asesores, del `targetAdvisorId` de una transferencia y de la lista de
mencionados— y **se leía con la fila efectiva** en sus cuatro lectores. Es
literalmente el fallo de `task_alerts.destinatarioId`, en otra tabla: dentro de
otra cuenta esas notificaciones **no aparecían** y no se podían marcar como
leídas. Arreglar solo el `actorId` habría dejado media tabla.

Tres cosas que hay que mantener:

1. **Las dos puntas se mueven juntas.** `deleteInternalNoteAction` compara
   `authorId` con quien llama: eso es **identidad, no alcance**, así que se
   compara con la persona. Cambiando solo el lado de escribir, el autor no
   podría borrar su propia nota — que es el fallo del #783 por la otra cara. Lo
   mismo con el «no mencionarse a sí mismo» y con el «no avisarse a sí mismo» de
   los participantes: los ids que llegan son personas.
2. **Lo que NO se movió, y es la mitad que protege el banco.**
   `lasNotasDeLaBandejaAction` filtra por `session.userId`,
   `getTeamMemberIds` por `ownerId ?? id`, y `requireOwnerOrAdmin` devuelve
   ahora **las dos cosas por separado** (`personaId` firma, `ownerId` alcanza).
   El banco comprueba **en la misma fila** que la columna de alcance de al lado
   no se movió.
3. **Sin backfill**, por lo de siempre: del id de una cuenta no se deduce quién
   estaba sentado delante. Y aquí no se esconde nada al mover la lectura de
   `recipientId`, porque lo ya escrito **ya eran personas**.

Y de paso salieron **dos sitios que el #785 se había dejado** en
`assigned_advisor_id`, la columna que aquella vuelta declaró «persona en los dos
lados»: `transferSession` y `puedeCerrarOReabrir` seguían comparando con la fila
efectiva. O sea que un chat tomado dentro de otra cuenta se podía tomar y no se
podía transferir ni resolver — «Solo puedes transferir tus propias
conversaciones» sobre una que sí era suya. **Cuando se declara que una columna
es de la persona, se cuentan TODOS sus comparadores**, no los dos que se
tocaron ese día.

El banco son 13 casos contra Postgres con las acciones reales, en **dos modos**.
Con el código viejo fallan **7**; los seis que pasan en los dos son justo los
que no podían cambiar: el camino de `owner_id` —donde la fila efectiva y la
persona son la misma— y las tres guardas de alcance.

## Mudar a una persona de cuenta: su id NO cambia, y por eso se mueve poquísimo

Alguien del equipo pasa de una cuenta a otra de la misma familia. La forma de
hacerlo que se escribe sola —arrastrarle los datos— es la equivocada, y saber
por qué es lo que hace que esto sea de cuatro escrituras y no de cuarenta:

> **Lo que se firma se guarda con el id de la PERSONA, y su id no cambia.** Sus
> notas, sus chats tomados, sus comentarios, su historial de actividad, sus
> permisos de documentos, sus menciones, sus suscripciones de aviso y todo lo
> que ella escribió **ya cuelgan de ella** y la siguen sin que nadie los toque.
> Lo que cambia al mudarla es el **ALCANCE**, porque las pantallas acotan por
> `ownerId ?? id`.

Barridos los 130 modelos de Prisma y las 47 tablas de la App, **lo único que es
suyo y está guardado bajo la cuenta son dos cosas**, y las dos se mueven:

| qué | por qué no puede quedarse |
| --- | --- |
| `advisor_clients.owner_user_id` | `clientesDelAsesor` busca por `advisor_user_id`, así que su cartera seguiría funcionando… y Equipo asigna y quita con `where: { advisorUserId, ownerUserId: owner.id }`. Se quedaría con alcance sobre clientes que **desde ninguna pantalla se le puede revocar**. |
| sus filas de `_UserModules` | El armazón, **cuando la persona tiene filas propias, NO las cruza con las de su cuenta**: `if (userModuleRecords.length > 0) modules = allModules.filter(...)`. Sin recortarlas le queda abierto un módulo que la cuenta nueva no tiene. |

Y **lo que no se mueve es lo de la cuenta que deja**: leads, mensajes, tareas,
proyectos, espacios de Documentación, cobros, tickets y canales de área. Mover
una tarea la sacaría del tablero de su equipo y de su proyecto —*un proyecto, un
juego de tareas*—; eso no es suyo, es de allí.

### El informe no es una cortesía: es la forma de la herramienta

`informeDeLaMudanzaAction` cuenta contra la base y **no tiene dentro ni una
sentencia que escriba**; `mudarALaPersonaAction` es el único que escribe. Son
dos funciones y no una con `simular: boolean`, porque un parámetro que decide si
se escribe es un parámetro que alguien pasa mal una vez.

Del lado de la pantalla, lo mismo: **mientras no se haya pedido el informe no
hay botón que pulsar**, y cambiar la cuenta o el rol lo tira —decía lo que iba a
pasar con otros datos—. Sin eso, «primero el informe» sería una costumbre, y una
costumbre se salta el día que hay prisa.

### El recorte de módulos: vaciar la lista le quita el TOPE, no los módulos

Es la trampa de todo esto. Lo obvio es recortar al cruce, y cuando la cuenta
nueva no tiene **ninguno** de los suyos el cruce es vacío… y cero filas en
`_UserModules` es justo lo que el armazón lee como **«sin restricción»**. O sea
que el recorte ingenuo no la deja sin módulos: la deja viendo todo lo que su
plan permita, **más que antes de mudarse**.

Y el cruce se queda en nada por **dos caminos que no son el mismo**. El primero
lo cazó el banco; el segundo hizo falta una mudanza de verdad para verlo, y por
eso está escrito aquí:

1. **La cuenta nueva TIENE lista y no comparte ninguno.** Se le dan los de
   ella: es un tope, y nunca más que su cuenta.
2. **La cuenta nueva NO tiene lista** —una cuenta de administrador, o de plan
   personalizado, que es de lo más normal—. Darle «los de la cuenta» aquí es
   vaciarla, y eso **la ensancha**. Pasó con María Alejandra: tres módulos
   (Chats, Herramientas, Panel) y una cuenta destino sin lista, así que el
   recorte la habría dejado viendo los **catorce** que permitía su plan. Se
   **conservan los suyos**, que siguen sin ser más que su cuenta —su cuenta no
   tiene tope— y no la mueven de donde estaba.

> **El recorte solo puede QUITAR, nunca ensanchar.**

Quien no tenía ninguna no gana ninguna — ya estaba sin tope, igual que su
cuenta.

Y de ahí una lección que vale para cualquier cosa parecida: **una regla que
elige entre dos listas tiene un tercer caso, la lista vacía, y casi nunca
significa lo mismo que las otras dos.** Aquí «vacía» no era «ninguno»: era «sin
tope», o sea lo contrario.

### Lo que deja de alcanzar depende del ROL, y hay que decirlo antes

`laSuerteDeCadaArea` es pura y contesta área por área, con su motivo. Las dos
que importan:

- **Chats.** La bandeja suma las líneas de las cuentas vinculadas, un nivel y en
  los dos sentidos… **salvo a un agente**: `esAgenteDeLaCuenta` corta la lista a
  las líneas propias. Así que una agente pierde sus chats tomados en las líneas
  de la cuenta que deja y una administradora no.
- **Tareas y Proyectos.** No miran vinculadas **en absoluto**: van con
  `where: { id, ownerId: user.ownerId ?? user.id }`. Se pierden con los dos
  roles, y después del cambio no puede ni abrirlas. Por eso el informe las
  cuenta: para reasignarlas antes, no para enterarse después.

Y un canal de **área** se encuentra por la cuenta del canal, así que también se
pierde; un **directo** no, porque se encuentra por pertenencia. El **General** es
de la familia y no cambia.

### Cuatro cosas más que hay que mantener

1. **El destino tiene que ser una CUENTA** (`owner_id` nulo). Colgar a alguien
   de otra persona deja una cadena de dos niveles que ninguna regla de esta casa
   contempla: `cuentaQueManda` lee `persona.ownerId` y da por hecho que esa fila
   ya es la cuenta.
2. **Quien muda manda en las DOS cuentas**, y eso es la puerta de siempre
   (`laCuentaQueConfigura`) más la regla de los canales que cruzan y de las
   Finanzas de la familia: **solo la cuenta MADRE reparte entre las suyas**. El
   superadministrador de verdad pasa esté donde esté.
3. **El `UPDATE` va condicionado al origen que se vio.** Entre el informe y el
   botón alguien pudo moverla ya; así esta llamada no toca nada en vez de
   arrastrarla desde donde no estaba, y se dice con esas palabras.
4. **`actividad_*.cuentaId` no se toca.** Dice contra qué cuenta se gastó aquel
   rato: es historia, y nadie la lee para agrupar —`laJornadaDe` filtra solo por
   `personaId`—. Reescribirla «por consistencia» sería falsear el pasado.

### Y un contador que no puede contar devuelve `null`, no cero

Las tablas de la App las crea su propio módulo la primera vez que alguien las
usa, así que una cuenta que nunca abrió el chat del equipo no tiene
`team_channel_members`. Eso **no es «cero canales»**, y aquí el cero es caro:
esto es justo lo que alguien lee para decidir si le reasigna el trabajo a una
persona antes de moverla. El informe dice «sin contar».

### El banco, en dos modos

`scripts/banco-mudanza.sh`. La decisión va sin base ninguna; lo que solo se ve
contra Postgres es el invariante: **de lo que ella firmó no cambia ni una fila y
no queda nada apuntando a la cuenta que deja**. Se siembran las dos clases de
fila y se compara antes y después, una por una.

El modo roto mueve **solo la fila de la persona** —la forma que se escribe
sola— y afirma los dos restos: la cartera atascada bajo la cuenta de antes y el
módulo de más. Y **los dos ficheros corren en ese modo**: el caso roto del de
Postgres se salta solo en la vuelta normal, así que dejándolo fuera del modo
roto saldría en verde sin haberse ejecutado nunca, que es peor que no tenerlo.

## Usuarios: un cliente vincula SUS cuentas con la contraseña de la cuenta a vincular

«Vincular existente» (Usuarios › «⋯», y «Agregar cuenta» del conmutador) solo
salía a la casa y a un reseller: pedía rol (`isAdminOrReseller`) y la acción
solo aceptaba cuentas que ya se alcanzaban. Un cliente con varias cuentas
propias no tenía cómo juntarlas.

> **Sale a quien administra la cuenta** (`ofreceVincularCuentas`, con
> `canManageWorkspace`; un `agente` no). **Para el cliente, la prueba de que la
> cuenta es suya es su CONTRASEÑA** (`pideContrasenaParaVincular`): la puerta es
> `puertaParaVincular` (`lib/vincular-cuentas.server.ts`), y la usan las DOS
> acciones que escriben la fila (`linkExistingAdvisor`, `addLinkedAccount`).

Cinco cosas que hay que mantener:

1. **Lo que ya se alcanza pasa como siempre**, sin contraseña: la casa y el
   reseller no cambian.
2. **Con contraseña, solo una cuenta de CLIENTE** (`porQueNoSeVinculaConContrasena`,
   pura): rol `user`, sin `ownerId` (una persona de un equipo no es una
   cuenta), no eliminada, no la propia y **no por encima de la propia**
   (`lasCuentasPorEncimaDe`): vincular a la madre la dejaría colgando de su hija.
3. **El error no dice si la cuenta existe**: correo inexistente y contraseña
   mala contestan lo mismo, y se compara siempre con bcrypt (contra un hash de
   relleno si no hay cuenta), para no delatarlo por el tiempo.
4. **10 intentos fallidos en 15 minutos por cuenta y se para** (en memoria).
5. **La contraseña no se escribe en ningún sitio**: ni en la consola ni en la
   base.

Lo prueba `scripts/banco-vincular-propias.sh`, contra Postgres y con
`currentUser()` de verdad; `MODO=roto` corre las acciones de `9c0e76d` y afirma
que un cliente no podía vincular sus cuentas ni con su contraseña.

## Clientes: «¿gestionas a este?» y «¿qué rol le pones?» son dos preguntas

En Panel › Clientes el desplegable de rol listaba **los cinco** roles a
cualquiera que abriera la pantalla (`Object.values(Role)`), y `updateClientData`
copiaba el `role` del formulario **tal cual** a `db.user.update`. La única
puerta que había —`exigirGestionDelCliente`— contesta «¿gestionas a este
cliente?» y nada más. La segunda pregunta, **qué rol le estás poniendo**, no la
hacía nadie.

Así que un `admin` podía hacerse a sí mismo o a un compañero «Super
administrador». Y desde Verzay | Atencion —cuenta vinculada, rol `admin`— el
listado devolvía **a su propia madre**, Grupo Verzay, porque `getEnrichedClients`
trae a todo el que no tenga `ownerId`: con la fila delante se le podía abrir la
ficha y degradarla.

La regla, y las dos mitades que hay que mantener juntas:

> **Nadie otorga un rol igual o superior al suyo.** Un `admin` llega hasta
> `reseller`; «Administrador» y «Super administrador» **solo los reparte un
> súper administrador de verdad** —el de la PERSONA (`esSuperAdminDeVerdad`), no
> el de la cuenta en la que esté metida—. El súper administrador es la única
> excepción, y tiene que serlo: con «ni igual ni superior» aplicado a él no
> quedaría nadie capaz de crear otro.

Y la mitad que se olvida: **se miran las DOS puntas, el rol nuevo y el que ya
tenía**. Sin eso, un `admin` no puede ascender a nadie a `super_admin` pero sí
puede **degradar** al súper administrador a `user` —que es «otorgar un rol
inferior», permitido por la letra— y quedarse mandando él. Es la misma escalada
por el otro lado.

Quien lo decide es `lib/roles-que-puede-otorgar.ts`, **puro y sin imports**, y
lo usan los dos lados:

1. **El servidor manda.** `elRolQueSePuedeGuardar` en `updateClientData`,
   `elRolConElQueNace` en `createUserWithPausar`. **Esconder la opción no cierra
   la petición directa**: el desplegable es la fachada de esa puerta, no la
   puerta. Y el veredicto se devuelve como dato, no con un `throw`: el `catch`
   de estas acciones convierte cualquier excepción en «Error interno al
   actualizar los datos», que es tanto como no decir por qué.
2. **El desplegable sale de la MISMA función**, con `rolQueReparte` calculado en
   el servidor (`rolConElQueReparte`) y bajado como prop. Con dos listas, el día
   que se afine una el otro lado se queda atrás y aparece un «No autorizado»
   sobre una opción que la pantalla ofrecía.

Tres cosas más:

- **La puerta de un solo campo existe y es la que se olvida.**
  `updateClientDataByField` escribe `{ [field]: valor }` con el nombre que le
  manden, y su portero solo mira si quien llama tiene rol de admin o reseller.
  Era una segunda puerta al `role`. Ahora `role`, `password` y los campos de
  identidad se rechazan en seco por ahí: el rol se cambia en Clientes, que es
  donde pasa por la regla.
- **`id`, `ownerId` y `tokenVersion` no se copian de un formulario.**
  `assignNonBooleanFields` copia lo que venga, así que la identidad de la fila
  —quién es y de quién cuelga— se escribía igual que el teléfono.
- **Una cuenta vinculada no manda sobre la cuenta de la que cuelga.**
  `cuentasDeLasQueCuelga` las resuelve por los dos caminos de siempre
  (`linked_accounts` y `owner_id`), y se aplica en los dos sitios: se filtran
  del listado y se rechazan en `puedeGestionarAlCliente`, que es la llave de
  Editar, Módulos, Asignar y Eliminar. **La dirección importa**: la madre manda
  sobre la hija, no al revés. Y va **antes** del `isAdminLike`, porque la cuenta
  vinculada de este caso tiene rol `admin` y esa línea la dejaba pasar.

El súper administrador de plataforma no se filtra por ninguna de las dos cosas:
su regla sigue siendo ver y administrar todo, en cualquier cuenta.

## Clientes de reseller: el nivel lo da SU LICENCIA, no un campo suelto

Las cuentas de Daniel Peralta consumían licencias de **Nivel 6** y una —«Asesor
DAYRA»— estaba en **Nivel 5**, sin poder crear usuarios (Usuarios solo existe en
el Nivel 6). La licencia la seguía contando como suya y nada lo decía.

Un cliente de reseller guarda dos datos sueltos: a qué licencia pertenece
(`resellerSubscriptionPlanId`) y su nivel (`plan`, el que abre o cierra
módulos). Nada los ataba, y había **cinco** sitios por donde se separaban:

| dónde | qué hacía |
| --- | --- |
| «Editar cliente» (`updateClientData`) | guardaba el nivel del formulario. Así quedó DAYRA: la editaron desde la cuenta de Daniel y se guardó Nivel 5 |
| crear un cliente (`createUserWithPausar`) | el campo de nivel está oculto para el reseller y llegaba con su valor por defecto (Nivel 2): el cliente nacía en otro nivel que su licencia |
| `createClientAccount` | tomaba `data.plan` de la pantalla |
| elegir plan para pagar (Perfil) | dejaba al cliente escoger otro nivel |
| aprobar una suscripción | le ponía el nivel de la suscripción |

> **La regla, y es una frase: si el cliente consume una licencia de un reseller
> que EXISTE, su nivel es el de esa licencia.** Lo decide
> `lib/nivel-de-la-licencia.ts` (puro) y lo lee `lib/nivel-de-la-licencia.server.ts`.
> Los cinco sitios pasan por ahí. **Si se añade otro sitio que guarde el nivel
> de una cuenta, va por esa función.** Para cambiarle el nivel a un cliente de
> reseller se le cambia la LICENCIA, no el campo.

Cinco cosas que hay que mantener:

1. **Editar la ficha escribe el nivel de la licencia SIEMPRE**, también cuando
   el formulario no manda el campo: guardar la ficha endereza a uno que se
   hubiera quedado en otro nivel. Si se pidió otro, el aviso lo dice («El nivel
   se quedó en Nivel 6: es el de su licencia») y la consola también.
2. **El formulario enseña el nivel de la licencia y no deja cambiarlo**
   (`nivelDeLaLicencia` en cada cliente de `getEnrichedClients`, una consulta
   para toda la lista), con «Lo da su licencia de reseller.» debajo.
3. **El editor de un solo campo no toca el nivel** (`updateClientDataByField`
   rechaza `plan`, como `role` y `password`).
4. **Sin licencia que EXISTA no hay nivel que heredar**: una demo, un cliente
   sin reseller o uno con un plan que su reseller ya no tiene se editan libres.
5. **El script de los datos solo SUBE** (`scripts/subir-clientes-a-su-licencia.mjs`;
   sin `--aplicar` solo dice qué haría). Uno por encima no se baja —le cerraría
   módulos que usa—: se dice, y se endereza al guardar su ficha. El 2026-10-01
   subió a «Asesor DAYRA» de Nivel 5 a Nivel 6; Daniel tiene 8 cuentas sobre 10
   licencias, todas en Nivel 6.

Lo prueba `scripts/banco-nivel-de-la-licencia.sh`: la regla y un barrido de las
puertas, y las acciones de verdad contra Postgres (editar pidiendo otro nivel y
sin mandarlo, crear por las dos formas, elegir plan, aprobar y el script).
`MODO=roto` lee y empaqueta `c902542` y afirma los fallos.

## Analíticas: una cuenta administradora es de la CASA, no un cliente

`/panel/analytics` abría para una cuenta administradora —la página pregunta
`isAdminLike` de la cuenta que manda— y salía **a trozos**: las tres tarjetas
marcadas «interno» —Renovación mensual, Actividad de instancias y Rendimiento
de Chats— llevaban **su propia** condición, `isSuperAdmin(cuenta.role)`,
escrita tres veces en tres acciones.

Ni «Acceso Denegado» ni error: la pantalla se pintaba entera y con tres huecos.
Es el mismo síntoma que ya costó una sesión con el bloque de vigilancia —«dos
pantallas iguales lado a lado y en una falta un recuadro»—, y por el mismo
motivo: **dos fórmulas para la misma pantalla.**

> **Quién ve la Analítica de la casa se pregunta UNA vez**,
> `puedeVerLaAnaliticaDeLaCasa` (`lib/analitica-de-la-casa.ts`), y lo preguntan
> **la página y las cuatro acciones** que la alimentan. Pasan las cuentas de la
> casa —`admin` y `super_admin`— y el súper administrador de verdad esté donde
> esté. `user`, `affiliate` y `reseller` siguen fuera: esos ven **su cartera**,
> que es otra pantalla (`getAnalyticsDeMiCartera` / `getResellerAnalytics`).

Lo que separa a la casa de un cliente es **el rol de la CUENTA por la que se
actúa**, no la palabra «interno» de cada tarjeta. Esa palabra es solo el
subtítulo del recuadro —no es ninguna marca compartida, no la lee nadie y no
aparece en ninguna otra pantalla—, así que abrir las tarjetas no tiene efecto
en ningún otro sitio.

Tres cosas que hay que mantener:

0. **Con «Ingresar» puesto manda la cuenta en la que se está**, no quien entró
   (ver la excepción de *«Súper administrador» es la PERSONA*). Un
   superadministrador dentro de la cuenta de un cliente ve **su cartera**, que
   es la pantalla del cliente; dentro de una cuenta de la casa, la de la casa.
1. **Si se añade otra tarjeta interna a Analíticas, va por esa función**, y no
   volviendo a escribir la condición. Era exactamente lo que había: tres copias
   y una cuarta distinta en la página.
2. **La puerta sigue en la consulta, no en la pantalla.** Las tres devuelven
   `null` a quien no pueda verlas y entonces el bloque ni se pinta. Esconder la
   tarjeta nunca fue la puerta.
3. **A quién se le AVISA es otra pregunta.** El WhatsApp de la vigilancia sigue
   saliendo solo hacia la cuenta de superadministrador (`elSuperAdministrador`),
   y no se toca: mirar un dato interno y recibir un aviso a las tres de la
   mañana no son lo mismo.

Y de paso, «Recargar» de las alertas de créditos: el botón **tiraba la
respuesta** de `rechargeIaCredit`, así que un «No autorizado» o un fallo contra
la base cerraban el diálogo igual, sin decir nada. Desde fuera eso no se ve como
un error, se ve como un botón que no hace nada — la misma familia que el
«Guardando…» colgado de Carpetas. Ahora la mira y lo dice, y lo que reviente cae
en un `catch` con su aviso.

## Enseñar un panel y dejar pasar a su ruta son dos preguntas

La misma pregunta —«¿cuál panel es el tuyo?»— estaba escrita **cuatro veces**,
con **tres** orígenes de rol y **dos** listas de rutas: el layout (`suPanelId`),
`panelDeLaCuenta` de Equipo, `getVisibleSidebarModules` y `apartadosDelPanel`.
Discrepaban justo cuando el módulo panel se caía por un filtro, y entonces el
diálogo de Permisos decía «activo» y el guard del layout cerraba la ruta.

Ahora la regla es **una**, `elPanelQueLeToca` (`lib/sidebar-modules.ts`): recorre
las rutas candidatas en orden de preferencia y devuelve la primera que exista en
la lista que se le pase. Lo único que cambia entre los cuatro es esa lista —unos
miran los módulos ya filtrados, otros las filas de `Module`—, y eso sí es
legítimo: son preguntas distintas sobre el mismo criterio.

Y la otra mitad, que es la que cerraba la puerta:

> **Un panel ajeno se esconde del MENÚ, pero no cierra una ruta que los permisos
> conceden.** En `rutasNegadas` había un `esPanelAjeno(m) ? false : …` que
> cortaba **antes** de mirar `concedidos`/`negados`. `esPanelAjeno` sigue
> filtrando `modules` —el menú—, que es para lo que sirve.

### Y el menú NO vuelve a decidir: se queda con el que la puerta dejó

Quitar el corte de `esPanelAjeno` abrió la **ruta**, y el menú siguió
escondiendo la **opción**. Yair —administrador del equipo en una cuenta
`admin`— entraba a `/panel` escribiendo la URL y no veía «Panel» en el menú
lateral.

La causa es la segunda mitad de la misma enfermedad: **dos formulaciones con
dos roles distintos**. La puerta elegía con el rol de la CUENTA
(`/panel-admin`) y sacaba `/panel` de `modules`; el menú volvía a elegir con
`user.role` —el de la PERSONA, que en el equipo es `user`— y su lista de
candidatas **no incluye `/panel-admin`**. Buscaba `/panel`, que la puerta acababa
de quitar, no encontraba nada y escondía la entrada.

Reproducido en el banco con las funciones reales:

```
puerta      -> /panel-admin
menu ANTES  -> NADA          <- la opcion no se pintaba
menu AHORA  -> /panel-admin
```

Dos reglas, y la segunda es la que lo cierra de verdad:

1. **El rol con el que se abren puertas es `rolQueAbrePuertas(persona)`**
   (`lib/sidebar-modules.ts`, puro). Superadministrador manda siempre;
   un **administrador** de equipo abre lo que abre su cuenta (`rolDeLaCuenta`,
   que ahora viaja en `currentUser()` sin costar una consulta); un **agente** no
   hereda nada. Es `cuentaQueManda` escrito en versión pura, para que lo pueda
   usar también el menú, que corre en el navegador.
2. **El menú no elige: recoge.** `soloElPanelQueLeToca` devuelve *el elegido* y
   *la lista sin los ajenos* de una sola pasada; después solo queda uno, y el
   menú se queda con ese (`modules.find(esVarianteDePanel)`). **No puede haber
   discrepancia porque ya no hay dos fórmulas.**

Y `rolDeLaCuenta` **no se derrama sobre `role`**: en `currentUser()` se
desestructura fuera del spread de las credenciales del dueño. Derramarlo sería
heredar el rol, que es lo que este documento prohíbe desde el principio.

### Y la barra de pestañas la pinta UNO, no dos

El layout montaba **dos** `PanelAwareTabNav`: una con `panelTabs` —el panel que
le tocó— y otra con `getClientPanelTabs(modules)`. Y la segunda siempre sobró,
porque `soloElPanelQueLeToca` deja **un solo** panel entre las variantes: esa
búsqueda encuentra `/client-panel` únicamente cuando es el elegido, y entonces
la primera ya lo estaba pintando con los mismos apartados.

Desde fuera, en una cuenta cliente: **la barra repetida**, dos filas idénticas
—Informes, Proyectos, Diagramas, Finanzas…— en **todos** sus apartados. Es fácil
culpar a la pantalla que se acaba de montar; no era ninguna pantalla, era el
layout. Comprobado en banco con las funciones reales, rol por rol: la segunda
barra o sale vacía o sale copiada, nunca aporta nada.

**Las pestañas las pone el panel que le tocó, y solo él.** Si hiciera falta otra
barra, que no salga de un módulo que ya pinta esta.

Un nivel más abajo pasaba lo mismo y va por el mismo sitio: las **pestañas del
panel** (`panelModule`) se buscaban a mano con `/panel-admin ?? /panel ?? /admin`
—sin contemplar el del reseller ni el del cliente—, y `apartadosDelPanel` y la
**portada** (`MainHome`) preguntaban por `persona.role`. Los tres usan ya
`rolQueAbrePuertas`. **Si se añade otro sitio que decida qué panel o qué
apartado se ve, va por ahí**: no se vuelve a preguntar por `user.role`.

## El CRM de la familia: la URL limpia significa TODAS

La cuenta madre tenía que entrar cuenta por cuenta para ver los leads de sus
hijas: Llamadas, Registros, Kanban y Reportes acotaban cada uno por la cuenta
con la que se abría la pantalla. Con cinco cuentas eso es cinco sesiones
abiertas para mirar un mismo embudo.

**No se estrenó ningún mecanismo.** `laFamiliaDeLaCuenta` —la malla de
`linked_accounts` del #812, en los dos sentidos y con ciclos—, `esLaCuentaMadre`
y `comoListaDeCuentas` son las de siempre, y el selector y la columna de cuenta
son los mismos componentes que ya usa Finanzas de la familia
(`SelectorDeCuentas`, `ColumnaDeCuenta`). Lo que decide vive en
`lib/crm-de-la-familia.ts`, **puro**, y quien lo resuelve contra la base en
`lib/cuentas-del-crm.ts`.

### La diferencia con Finanzas, que es la que decide todo lo demás

Es una sola cosa y de ella cuelga el resto, así que conviene tenerla delante
antes de tocar nada:

| | sin `?cuentas=` en la URL |
| --- | --- |
| **Finanzas** | **solo la cuenta propia** — el selector sirve para JUNTAR a mano |
| **CRM** | **TODAS las de la familia** — unificado es el punto de partida |

En Finanzas consolidar es una elección porque en la cuenta madre conviven las
finanzas de la casa con las personales y sumarlas casi nunca es lo que se
quiere. En el CRM no: los leads, los registros, las llamadas y el tablero de una
familia son **el mismo embudo repartido entre varias líneas**, y mirarlos de uno
en uno es justo el trabajo que esto viene a quitar.

> De ahí la asimetría: **aquí el parámetro se escribe para REDUCIR**, no para
> ampliar. Y `laSeleccionDelCrm` **nunca devuelve una lista vacía**: un
> `?cuentas=` rancio de un enlace guardado dejaría la pantalla en blanco sin
> decir por qué, y el caso común de llegar ahí no es un ataque.

> **Corregido después**: esto decía que bastaba con exigir ser la **raíz** de
> la familia para que una hija no viera a su madre. **No bastaba**: la raíz sale
> de un recuento de votos que una cuenta intermedia puede ganar, y entonces veía
> hacia arriba. El alcance es ahora `lasCuentasQueCuelganDe` —lo propio y lo de
> abajo, nunca la madre ni las hermanas—; está contado entero en *El alcance del
> CRM va HACIA ABAJO*.

### La puerta va en la acción, y el camino común SÍ paga la familia

La lista viaja en la URL y en los parámetros de cada acción, así que **una
acción de servidor ES un endpoint**: `getRegistrosByUserId(propia, …, ids)` se
llama a mano con los ids que uno quiera. Las cinco pestañas la re-resuelven con
`lasCuentasQueConsultaElCrm`, que es la misma puerta que pinta el filtro.

Y aquí está la consecuencia de coste que Finanzas no tiene: allí, sin
parámetro, no se consulta nada —la respuesta es «la propia»—; **aquí hay que
resolver la familia para saber cuál es el «todas»**. Por eso el alcance se
recuerda unos segundos con `recordarPorSesion`, con dos cosas que hay que
mantener:

1. **La llave son los ids que deciden y nada más** (`crm-de-la-familia|<propia>`):
   la familia de una cuenta solo depende de esa cuenta. Lo que decide la
   **persona** —`canManageWorkspace`, que un `agente` no pasa— se resuelve
   **antes** y sin tocar la base, así que ni llega a la llave.
2. **Un alcance recortado por un fallo NO se cachea** (`sirveParaCachear`). Es
   la regla de siempre: guardar cinco segundos una pérdida de vista la propaga
   a las peticiones de al lado, y eso se ve como una pantalla que a veces trae
   menos filas.

### Lo que se puede TOCAR y lo que solo se MIRA no es igual en las cinco

Es el hallazgo de esta vuelta y no se ve leyendo una pantalla: **las acciones de
escritura del CRM no acotan todas igual**, así que el gate de «fila ajena» hace
falta en unas y sobraría en otras.

| | de dónde saca el dueño una escritura | ¿fila ajena de solo lectura? |
| --- | --- | --- |
| Registros | de la FILA (`assertUserCanUseApp(registro.session.userId)`) | **no hace falta**: la madre sí está autorizada |
| Kanban | de la FILA (`updateSessionLeadStatus` resuelve la sesión) | **no hace falta** |
| Llamadas | de la cuenta de quien LLAMA | **sí** — sus cuatro escrituras |
| Reportes | de la cuenta de quien llama | **sí**, y «Eliminar todos» se esconde unificado |

Poner el candado donde no hace falta es peor que no ponerlo: se pinta un «—»
sobre una fila perfectamente editable y nadie sabe por qué. Y no ponerlo donde
hace falta es el «menú abierto, puerta cerrada» de siempre. Por eso
`esDeOtraCuentaDelCrm` está escrita una vez y **sin dueño no es ajena**.

De ahí salió además un rastro muerto que el barrido del diff cazó: una prop
`cuentaPropia` declarada, pasada y **nunca leída** en la tabla de Registros —la
mitad de un gate que al final no hacía falta—. Una prop obligatoria que nadie
usa es la que la próxima pantalla copia creyendo que decide algo.

### El TOPE de una lista crece con las cuentas elegidas

Es la misma trampa que Finanzas ya midió, y aquí vale para las cinco:
`elTopeDelCrm(porCuenta, cuantas)`. Dejando el tope de una cuenta al unificar
cinco, las cinco se reparten las mismas filas —van ordenadas por fecha, así que
se intercalan— y **cada una enseña menos de lo que enseñaba sola**: unificar se
vería como perder filas. Con techo (`TECHO_DE_CUENTAS_EN_UN_TOPE`, 5), porque
esta lista viaja entera al navegador.

El del informe de lo que la IA no supo se llamaba `TOPE_DEL_INFORME` y era un
número fijo; se renombró a `TOPE_POR_CUENTA` **para que el nombre diga la
unidad**, que es lo único que impide volver a dejarlo fijo.

### Y el `grupoId` de dos cuentas distintas NO es el mismo grupo

`lo-que-la-ia-no-supo` agrupaba por `grupoId`, que lo calcula el backend con un
embedding **dentro de una cuenta**. Al unificar, el mismo hueco del
entrenamiento en dos líneas distintas colapsaba en **una sola fila**, con la
cuenta de la primera que apareciera: un número que no se puede explicar
señalando la pantalla.

La clave de agrupación es **compuesta**, `cuenta::grupo`, y el `grupoId` que sale
es esa clave. El banco lo ejerce a propósito sembrando el MISMO `grupoId` en las
tres cuentas: sin la cuenta dentro, tres grupos se leerían como uno.

### El Kanban sin parámetro sigue siendo el de SU cuenta

`getKanbanSessionsAction` lo pintan **tres** pantallas —el CRM, `/tags` y
`/asesores`— y **solo la del CRM unifica**. Llamar a
`lasCuentasQueConsultaElCrm` a secas devuelve todas las de la familia, así que
pondría de golpe las tarjetas de las hijas en dos tableros que nadie tocó, sin
un solo error. **Sin parámetro se contesta con la cuenta propia**, que es
exactamente lo que esas dos enseñaban antes.

Y `KanbanCard.cuentaId` baja **siempre**, unificado o no: la insignia se decide
al pintar y el gate necesita el dueño — con un campo opcional, «sin dueño no es
ajena» dejaría el arrastre abierto sobre tarjetas que la acción luego rechaza.

### Una cosa que se midió y no se tocó: los créditos

`getAnalyticsDataByUserId` consolida sus sesiones, sus mensajes y sus tareas, y
**`ia_credits` no**: esa fila es de la cuenta y sumar los saldos de cinco
cuentas daría un número perfectamente creíble que no corresponde a ninguna
bolsa. Es la familia del «999999999 de -1 créditos»: lo que no se puede sumar no
se suma.

### El banco: la decisión aparte, y las ACCIONES contra Postgres

`scripts/banco-crm-de-la-familia.sh`, dos mitades. Probar `laSeleccionDelCrm` a
solas sería probar el lado que **no tiene puerta**; lo que hay que demostrar es
que las cinco pestañas pasan por ella y que el alcance sale de FILAS —con
`linked_accounts` sembrada— y no de un parámetro. Se finge **solo**
`currentUser()`, `revalidatePath` y el `cache()` de React.

Los cuatro casos del encargo están, y uno más que se añadió al ver el riesgo:
la madre ve las llamadas de sus dos hijas y ninguna de una cuenta ajena; una
hija no ve nada de su madre ni de su hermana **ni escribiendo el parámetro a
mano**; el filtro reduce a una sola cuenta en las cinco pestañas; los totales de
Reportes cuadran con el filtro puesto —y la lista de abajo da el mismo número,
que es lo que evita dos cifras que se contradicen—; y el Kanban sin parámetro
sigue siendo el de su cuenta.

`MODO=roto` lleva **la consulta vieja escrita dentro, literal** —cada acción
acotada a `userId = la propia`— y **afirma el fallo**: la madre ve solo lo suyo.
Sin ese modo, lo verde del otro no diría si se arregló la causa o si el caso no
se llega a ejercer.

Tres cosas del propio banco, que costaron su vuelta:

1. **`weekly_reports` e `ia_sin_respuesta` no están en `schema.prisma`** —las
   crea el backend— así que el banco las escribe con su propia DDL. `Session`,
   `Registro` y `chat_messages` sí están, y las crea `db push`.
2. **`Registro.userId` lo rellena un disparador en producción**, y con
   `db push` no hay disparador: se pone a mano o la siembra entera cae en la
   cuenta equivocada sin decir nada.
3. **La base se reutiliza entre ejecuciones**, así que los ids llevan el sello
   de la vuelta. Y los conteos de cada cuenta son **distintos a propósito**: con
   todas iguales, un total equivocado seguiría cuadrando.

## El alcance del CRM va HACIA ABAJO: la familia no es un alcance

Yair —administrador de Verzay | Atencion, que cuelga de Carlos Arcos y tiene
a Verzay Ventas debajo— veía desde su sesión las llamadas de Carlos. Fuga entre
cuentas, **hacia arriba**.

La causa estaba en cómo se decía «qué alcanza» el CRM (ver *El CRM de la familia*):
**la RAÍZ del componente de `linked_accounts` veía el componente entero**, y la
raíz sale de un recuento de votos (`laRaizQueManda`: quien más vinculó bajo la
suya, y a igualdad el id menor). Esa tabla es una malla con enlaces de vuelta,
así que el recuento lo gana una cuenta INTERMEDIA en cuanto vincula a tantas
como su madre —o a su propia madre de vuelta—. Y el id de Atencion empieza por
dígito: gana los empates. Con eso Atencion era «la madre» y su administrador
veía hacia arriba y hacia los lados.

> **La familia (`laFamiliaDeLaCuenta`) es un componente SIN dirección.** Sirve
> para que un chat del equipo no se parta; **no es un alcance de datos**.

La regla, en `lasCuentasQueCuelganDe` (`lib/crm-de-la-familia.ts`, pura):

1. Se ve lo propio y lo que se alcanza **bajando** por `master → linked`.
2. **Nunca se pasa por una cuenta que también alcanza a esta**: esa está por
   encima. Sin esa condición, un enlace de vuelta (hija → madre) lleva a la
   madre, y de ella a las hermanas.
3. Una pareja recíproca (`A ↔ B`) se anula: ninguna ve a la otra. Es el lado
   seguro a propósito —un enlace de ida y vuelta no dice quién manda—; si hace
   falta, se borra el enlace que sobra y queda escrito el sentido.
4. **El superadministrador de verdad ve la familia entera** (`esSuperAdminDeVerdad`),
   porque todas cuelgan de él. Y eso entra en la llave del recuerdo de 5 s:
   con la misma llave, el administrador heredaría el alcance del super.

Un `agente` sigue viendo solo su cuenta. El alcance ya no depende de quién gane
ningún recuento: `laRaizQueManda` sigue decidiendo quién reparte canales del
chat del equipo, **y nada más**.

Lo prueba `scripts/banco-crm-de-la-familia.sh` (con
`lib/__tests__/crm-alcance-hacia-abajo-db.test.mjs`): el caso de producción con
sus nombres, contra Postgres y por `getCallsCrmData` de verdad. `MODO=roto`
afirma que con la regla vieja Yair alcanzaba a Carlos; y con el código anterior
puesto, el banco normal se pone rojo por los tres sitios.

Y desde el #948 esa regla no vive en el CRM: la contesta
`lasCuentasQueAlcanzaHaciaAbajo` (`lib/cuentas-hacia-abajo.server.ts`), que
comparte con el tablero de **Embudos** —la consulta, el orden y hasta la entrada
del caché—. Embudos tenía su propia copia y le había añadido la cartera de
clientes, así que su selector ofrecía cuentas sin ningún vínculo: **dos formas
de contestar «qué cuentas alcanza esta pantalla» son una que se afina y otra que
se queda atrás.**

**Vale para las cinco pestañas del CRM**, porque las cinco pasan por la misma
puerta. Las demás pantallas que cruzan cuentas (Chats, Leads, Finanzas,
Reuniones, Documentos…) **no se han tocado aquí**: están auditadas en el PR.

## Ninguna puerta sube: «Ingresar», el conmutador y `assertCanAccessTargetUser`

La regla del CRM —*el alcance va HACIA ABAJO*— se aplicó después a las tres
puertas que dejan actuar sobre otra cuenta, porque las tres dejaban subir y dos
de ellas dejaban hacerse pasar por el superadministrador:

| puerta | qué dejaba |
| --- | --- |
| «Ingresar» (`impersonateUser`, y la cookie que `currentUser()` lee) | cualquier cuenta con rol `admin` entraba como **cualquier** usuario, Carlos Arcos incluido, y dentro tenía sus poderes |
| el conmutador de cuentas (`active_account_id`) | una hija se cambiaba a la cuenta de su madre y actuaba como ella |
| `assertCanAccessTargetUser` | el vínculo valía en los dos sentidos, y el rol `admin` abría cualquier cuenta |

Y aparte, cinco consultas de Leads (`getSessionsByUserId`,
`getSessionsCountByUserId`, `searchSessionsByUserId`, `getLeadsPorLinea` y
`deleteSession`) **no preguntaban nada**: con sesión y el id de otra cuenta se
leían —y se borraban— sus leads. Ahora pasan por `assertCanAccessTargetUser`,
y `getSessionByRemoteJid` filtra sus cuentas igual que `getSesionesDeLaCuenta`.

> **Quién puede llegar a qué lo decide `puedeLlegarA`
> (`lib/alcance-entre-cuentas.ts`, puro), y lo aplica `juzgarElAlcance`
> (`.server.ts`) en las tres puertas.** Nunca a una cuenta de
> superadministrador, nunca a una por encima de la propia, nunca a una cuenta de
> la casa (`admin`) que no cuelgue de ella. El superadministrador de verdad
> llega a todo. **Solo quita**: lo que queda —los clientes— sigue con las reglas
> de rol de cada puerta.

Cinco cosas que hay que mantener:

1. **El objetivo se juzga por su CUENTA** (`ownerId ?? id`). Entrar como una
   persona del equipo de Carlos es actuar con el alcance de Carlos: su fila dice
   `user`, su cuenta es la de arriba.
2. **La cookie se vuelve a juzgar en CADA petición**, no solo al pulsar
   «Ingresar». Vive treinta días: una puesta antes de esta regla no puede seguir
   abriendo lo que ya no se abre. Si no alcanza, se ignora y se sigue en la
   cuenta propia, con aviso.
3. **El conmutador solo BAJA** (`master = yo, linked = ella`). La rama
   «membership» —cambiarse a quien te vinculó— se quitó entera de `lib/auth.ts`,
   de `switchToAccount` y del menú (`getMyLinkedAccounts`). En producción eso
   dejó sin ese cambio a: Atencion, Ventas, Notificaciones y Pruebas → Carlos;
   Ventas → Atencion; Asesor → Daniel Peralta; y Carlos Padilla, Genesis Crespo
   y Genesis Velez → Roberto Crespo. Todas son cuentas con su propia línea, no
   personas del equipo: el equipo entra por `owner_id`, que no se toca.
4. **Leer los enlaces LANZA** (`losEnlacesDeLaCuenta`), a diferencia de
   `laFamiliaDeLaCuenta`. Sin enlaces «¿está por encima?» contesta que no y la
   puerta se abriría hacia arriba; así que un fallo es un «no», dicho.
5. **Una fila `master = yo, linked = ella` sigue abriendo**, en el conmutador y
   en `assertCanAccessTargetUser`, aunque haya otra de vuelta: es un vínculo que
   uno mismo declaró. Por eso las dos cuentas de Edgar Pérez —vinculadas en los
   dos sentidos— siguen llegando la una a la otra. Lo que una pareja recíproca
   NO da es «Ingresar» como cuenta de la casa: ahí cada una está por encima de
   la otra, igual que en el CRM.

**Lo que esto dejó a medias** —la bandeja de Chats seguía enseñando las líneas
de la madre y sus acciones contestaban «No autorizado»— está cerrado en la
sección siguiente.

Lo prueba `scripts/banco-alcance-entre-cuentas.sh`, contra Postgres y con
`currentUser()` DE VERDAD —solo se finge la petición: la sesión y las cookies—.
`MODO=roto` empaqueta **las mismas pruebas** contra el código de un commit
pinchado (`ANTES_REF`) sacado a un `git worktree`, y afirma la fuga: Yair entra
como Carlos, Atencion se cambia a Carlos, y un cliente lee y borra los leads de
otra cuenta.

## La bandeja de Chats también va HACIA ABAJO: líneas, rutas, otra línea, notas y tiempo real

Es el punto 5 de la auditoría del 2026-09-22. Después de #898 las acciones solo
bajaban, pero **la bandeja seguía juntando las cuentas vinculadas en los dos
sentidos**: la hija veía las líneas de su madre y todo lo que hacía sobre ellas
contestaba «No autorizado». Botones rotos, y además una fuga: el token de tiempo
real la unía a la sala de la madre, así que recibía en vivo sus avisos.

> **Qué cuentas alcanza la bandeja lo decide `lasCuentasDeLaBandeja`
> (`lib/alcance-de-la-bandeja.ts`, puro)**: la cuenta por la que se actúa, la
> fila de la persona, y las que cuelgan de esa cuenta HACIA ABAJO
> (`lasCuentasQueCuelganDe`, la regla del CRM). Nunca la madre ni las
> hermanas. El superadministrador de verdad, la familia entera. Un `agente`,
> solo lo suyo.

La aplican, y **tienen que decir lo mismo**:

| dónde | por qué función |
| --- | --- |
| la página de Chats (qué líneas se pintan) | `lasCuentasQueVeLaBandeja` + `lasLineasDeLasCuentas` |
| las rutas `/api/chats/{lista,conversacion,precarga}` y las acciones de una línea o conversación | `getAssociatedAccountIds` |
| el token de tiempo real (a qué salas se une) | `lasCuentasQueVeLaBandeja` |
| «Enviar por otra línea» de las macros | `getAssociatedAccountIds` |
| con quién se comparte una nota (`getTeamIds`) | `lasCuentasQueCuelganDe` / la familia del superadmin |

`getAssociatedAccountIds` es la de las puertas y **no** recorta al agente —era
así antes y el agente no ve esas líneas de todas formas—; `lasCuentasQueVeLaBandeja`
es la de lo que se ENSEÑA y sí. Una sala de tiempo real de más no es un aviso de
más: es una conversación ajena llegando al navegador.

Seis cosas que hay que mantener:

1. **`getLinkedAccountsInstances` y `getMasterAccountInstances` se fueron.**
   Vivían en un fichero `'use server'`, o sea eran dos endpoints que devolvían
   las líneas de la cuenta que se les nombrara sin preguntar nada, y la
   segunda era justo la que traía las de la madre. Su sustituto,
   `lib/lineas-de-las-cuentas.server.ts`, no decide a quién: la lista la pone
   quien llama.
2. **Una pareja recíproca (`A ↔ B`) se anula**, como en el CRM: ninguna ve las
   líneas de la otra en la bandeja, aunque `assertCanAccessTargetUser` las
   deje actuar. Eso no rompe ningún botón —la bandeja enseña MENOS de lo que
   la puerta deja hacer, nunca más—; si hace falta que una vea a la otra, se
   borra el enlace que sobra.
3. **Un enlace directo `A → N` hace de N una hija de A**, aunque N cuelgue
   también de la madre de A. «Hermana» es la que solo comparte madre.
4. **Las notas: el equipo es la cuenta, su dueña y sus asesores, más lo que
   cuelga hacia abajo.** Antes sumaba las cuentas que la vincularon a una (la
   madre), con su nombre y su correo en el selector.
5. **`getAuthorizedAccountUserIds` de `chat-manual-actions` sigue subiendo, a
   propósito**: es para RECURSOS —las respuestas rápidas y los flujos de la
   cuenta madre—, no para líneas. Lo que decide sobre una línea (la firma,
   borrar un mensaje) va ya con `getAssociatedAccountIds`. Cerrar también los
   recursos es otra decisión, y está pendiente.
6. **El informe de mudanza lo dice**: `origenCuelgaDelDestino`. Pasar de la
   cuenta madre a una hija pierde los chats de la madre, aunque sea
   administradora y estén en la misma familia.

Lo prueba `scripts/banco-bandeja-hacia-abajo.sh`, contra Postgres y con
`currentUser()` de verdad, por las cinco puertas. `MODO=roto` empaqueta las
mismas pruebas contra `22dd27b` y afirma la fuga: la hija ve, ofrece, comparte
y escucha lo de su madre.

## Enviar por un canal (Meta, Telegram) pide que la línea sea tuya o de abajo

`sendChannelTextAction` —texto y archivos por Meta y Telegram— **no comprobaba
de quién era la línea**. Con sesión y el nombre de cualquiera, se le escribía a
un cliente por un canal ajeno. Quedó anotado en el #899; las hermanas del mismo
fichero tenían el mismo hueco: `sendMetaTemplate`, `listMetaTemplates`,
`sendChannelQuickReplyAction` (que solo miraba el atajo, no la línea),
`fetchChannelChats` y `warmChannelMessages`.

> **La puerta es `laLineaDelCanalAlcanza` (`lib/linea-del-canal.server.ts`,
> con la decisión pura en `lib/linea-del-canal.ts`)**: la cuenta dueña de la
> línea tiene que estar en `getAssociatedAccountIds` —la propia y las que
> cuelgan HACIA ABAJO, el mismo alcance con el que la bandeja la enseña—.
> Nunca la madre, nunca una hermana.

Tres cosas que hay que mantener:

1. **Va ANTES de todo**: antes de pausar la IA y antes del `fetch` al backend.
   Un rechazo no escribe nada ni llega al proveedor, y dice
   «No tienes acceso a la línea X: es de otra cuenta.». Tampoco es mudo:
   `[canales] envío rechazado`.
2. **El cuerpo sin puerta vive en `lib/envio-por-canal.server.ts`**
   (`server-only`), y solo lo importan los caminos del servidor SIN sesión que
   eligen la línea ellos: el despachador de avisos, las notificaciones de
   facturación, el aviso de desconexión y `sendMessageWithHistoryAction` (que
   ya está abierta a propósito por la página pública). Ponerles la guarda los
   APAGARÍA —la regla de *un runner de sistema no puede ser una acción*—.
   **Una pantalla nunca importa de ahí**: va por la acción.
3. Lo que llama con sesión (macros, respuesta a llamada perdida) sigue por la
   acción guardada: su línea es propia y pasa.

Lo prueba `scripts/banco-linea-del-canal.sh`, contra Postgres, con
`currentUser()` de verdad y el `fetch` al backend contado. `MODO=roto`
empaqueta las mismas pruebas contra `f48dbe5` y afirma la fuga: la hija escribe
por la línea de su madre y el backend lo recibe.

## Una clave de IA no viaja al navegador: ni la del cliente, ni la de la casa

Perfil › API key recibía la fila entera de `user_ai_configs` —`apiKey` en
claro— y la metía en el formulario. El `type="password"` solo la tapaba en
pantalla: la clave iba en la respuesta de la acción y quedaba en el estado de
React. Y esa clave **casi nunca es del cliente**: las cuentas nuevas nacen con
una llave de la casa (Panel › API keys; antes `SECRET_API_KEY`) y los clientes
de un reseller heredan la suya. O sea que cualquier cuenta leía la clave de
OpenAI de Verzay desde su propio Perfil. Estuvo así desde `2e35653c`.

> **Al navegador solo le llega SI hay clave y sus cuatro últimos caracteres.**
> Lo decide `lib/clave-de-ia-para-el-navegador.ts` (puro): toda acción que
> devuelva una configuración pasa por `sinLaClave`, y guardar con el campo
> **vacío conserva la guardada** (`laClaveQueSeGuarda`), que es lo que permite
> no devolverla nunca.

Tres cosas que hay que mantener:

1. **El lector que sí devuelve la clave vive en `lib/cliente-de-ia.server.ts`,
   con `server-only`**, no en un fichero `'use server'`. Exportada desde
   `userAiconfig-actions.ts`, `resolveUserAiClient` era un endpoint que daba la
   clave a quien la pidiera con su sesión. Lo que devuelve **no se reenvía**.
2. **El ojito y el «copiar» de quien administra se fueron**, a propósito: un
   reseller que ve la clave de la casa es la misma fuga. Para saber cuál llave
   es, está el final y el aviso de origen (`getAiKeyOriginInfo`).
3. **Panel › Clientes** (`getEnrichedClients`) también mandaba `aiConfigs` con
   la clave; va con `sinLaClave`. Si se añade otra lista que incluya
   `aiConfigs`, va igual.

Lo comprueba `scripts/banco-clave-de-ia.sh`: la decisión, un barrido del código
y las acciones de verdad contra Postgres, y en `MODO=roto` el código de
`ANTES_REF` afirma la clave en claro en la respuesta.

## La clave del servidor de WhatsApp no viaja al navegador, nunca

`ApiKey.key` es la clave **GLOBAL** de un servidor de Evolution: la comparten
todas las cuentas que viven en él (`User.apiKeyId`). Filtrarla a una sola
cuenta —o a quien abre la página pública de agendar— es entregar el WhatsApp de
todas las demás. Y se filtraba por todas partes:

| dónde | qué pasaba |
| --- | --- |
| la sesión (`currentUser`) | traía `apiKey.key`, así que llegaba a toda pantalla que recibiera el usuario |
| la página pública de agendar | recibía la fila entera de `User` —clave y token de cada línea— y mandaba los mensajes DESDE el navegador de quien reservaba |
| Recordatorios, Campañas, Mensajes | la clave viajaba en las filas, en campos ocultos del formulario y en los props |
| la conversación de Chats | el contexto de cada línea (`.bind`) llevaba `{ url, key }`, y el servidor además **se fiaba** de la clave que le mandara el navegador |
| Conexión | `obtenerApiKeys`, `getApiKeyById`, crear, editar y borrar servidores: **sin ninguna puerta** |
| `chat-actions`, `sending-messages-actions` | ficheros `'use server'`: «manda esto a este servidor con esta clave» como POST abierto |
| `createSeguimiento`, las funciones internas que crean y borran líneas, las copias de seguridad | sin comprobar de quién era la línea o la cuenta |

> **La clave la pone el SERVIDOR, a partir de la línea o de la cuenta, después
> de comprobar que quien pide la alcanza.** Lo que llegue del navegador en
> `apikey`, `serverUrl` o `apiKeyData` se ignora. Al navegador solo le llega
> que hay servidor (`elServidorSinClave`, `CLAVE_EN_EL_SERVIDOR`), nunca cuál es
> la clave. Lo puro vive en `lib/clave-del-servidor.ts` y lo que lee la base en
> `lib/clave-del-servidor.server.ts`.

Seis cosas que hay que mantener:

1. **Administrar servidores es de la casa** (`administraLosServidores`, la
   misma puerta que Panel › Conexión). `getApiKeyById` ya no existe; quien solo
   elige un servidor usa `losServidoresSinClave`.
2. **Una línea se resuelve por su FILA** y pasa por `assertCanAccessTargetUser`
   con su dueña (hacia abajo, nunca hacia arriba). `resolverContexto` de Chats
   lo comprueba **antes** de mirar su caché.
3. **La página pública de agendar solo manda el ID de la cita**
   (`confirmarLaCitaPublicaAction`): recordatorios, aviso al dueño y
   confirmación se arman en el servidor (`lib/cita-publica.server.ts`), **una
   vez** y solo con una cita **recién creada**.
4. **Lo que envía con url+clave sin sesión es `server-only`**, no una acción:
   `chat-actions`, `sending-messages-actions` y `enviarConHistorial`. La acción
   `sendMessageWithHistoryAction` que queda pide sesión y pone ella la clave.
5. **Las funciones internas que crean o borran líneas comprueban el dueño**
   (`puedeTocarLasLineasDe`) antes de hablar con Evolution.
6. **Una copia de seguridad no lleva la clave** y al restaurar la cuenta
   conserva SU servidor: crear uno con lo que traiga el fichero sería dejar que
   quien la sube elija contra qué servidor habla la plataforma.

Lo prueba `scripts/banco-clave-del-servidor.sh`: las reglas y un barrido del
código, y las acciones de verdad contra Postgres con `currentUser()` real.
`MODO=roto` empaqueta lo mismo contra `ANTES_REF` (7575f8a) y afirma cada fuga.

Y una que no se arregla con código: **había una clave escrita a mano** en
`app/schedule/helpers/testAPISendMessages.ts`. El fichero se fue, pero sigue en
el historial de git: esa clave hay que **rotarla** en el servidor.

## Copiloto: `?u=` no puede ser código, y los dos botones se miden contra el COPILOTO

Documentar `/copiloto` destapó tres fallos, y ninguno se ve probando a mano con
una pantalla grande.

### 1. `?u=` pasa por la regla de Integrar URLs

`/copiloto?u=javascript:alert(document.domain)` **ejecutaba ese código en la
plataforma**: `?u=` —con el que un módulo cambia el copiloto, el de un
reseller— iba tal cual al `src` del `<iframe>`, y un `src` con `javascript:`
corre en el origen de quien lo pinta, con su sesión. Bastaba con que alguien
pulsara un enlace.

> **No hay una regla nueva: es la de Integrar URLs** (`lib/integraciones.ts`,
> ver *La séptima guía*), que se escribió a la vez en otra rama. `laUrlDelCopiloto`
> pasa `?u=` por `laUrlQueSeAbre` —una dirección sin `https://` se completa, y
> lo que no es una web cae en el copiloto de la plataforma y se dice en la
> consola—, y el `<iframe>` común tiene su red de abajo, `sePuedeIncrustar`.
> Dos reglas para «qué dirección se abre» serían una que se afina y otra que
> se queda atrás.

Y esa regla admite **`localhost`**, que es la única dirección de verdad sin
punto. No afloja nada —`http://127.0.0.1:3080`, la misma máquina, ya pasaba por
tener puntos— y sin ella la guía de Copiloto no se podía volver a generar: sus
capturas abren `?u=http://localhost:3080`, el copiloto local, y caían en el de
la plataforma. Lo afirman `integraciones.test.mjs` y `copiloto.test.mjs`.

Dos cosas más del marco, que son de aquí: `IframeRenderer` lleva `title` (el
copiloto se anuncia «Copiloto de IA»; una pestaña de Chats, con su nombre) en
vez del «Tool 2» de siempre, y «Fijar en Chats» reconoce la pestaña con
`laLlaveDelNombre` —sin mayúsculas ni tildes, como la compara Integrar URLs al
guardar—: con una «copiloto» ya puesta a mano, fijar chocaba con «ya tienes
una app llamada Copiloto» en vez de ofrecer quitarla.

### 2. Los dos botones dependen del ANCHO del copiloto, no de la ventana

«Fijar en Chats» y «Pantalla completa» flotaban siempre a 52 px del borde, y
la cabecera del copiloto no es nuestra y cambia con su ancho: con el menú de la
plataforma abierto, una tableta o un teléfono, **tapaban su selector de modelo
y sus botones** —medido a 390 px: los cuatro—. Ahora son tres tamaños, con una
consulta de CONTENEDOR sobre la caja del copiloto (`CAJA_DEL_COPILOTO`,
`[container-type:inline-size]`):

| el copiloto mide | los botones |
| --- | --- |
| 860 px o más | flotan, con el rótulo |
| de 560 a 860 | flotan, solo con el icono |
| menos de 560 | en su propia fila, encima del copiloto |

Los cortes salen de medir la cabecera de la v0.8.7 y viven en `lib/copiloto.ts`
en px y en las clases en rem; el banco comprueba que digan lo mismo. **Si el
copiloto se actualiza, esto se vuelve a medir**: es lo único de la pantalla
que depende de una cabecera ajena.

### 3. Pantalla completa solo donde el navegador la deja

En un iPhone un `<div>` no tiene `requestFullscreen`, y el botón salía y no
hacía nada. `hayPantallaCompleta` decide si se ofrece, y un «no» del navegador
se dice en vez de quedarse en una promesa muda.

Lo prueba `scripts/banco-copiloto.sh`: las reglas y un barrido, y la pantalla
REAL en Chromium con el
copiloto local dentro, midiendo si los botones tapan alguno de sus botones a
1280/900/800/640/500/390 **con su menú abierto y cerrado** —estrechando la
ventana desde una ancha, el copiloto lo deja abierto encima de su cabecera—.
`MODO=roto` monta la pantalla de `ab6b110` y afirma los fallos: el
`javascript:` corriendo en la plataforma y los botones tapando. (Guardar una
integración lo prueba `scripts/banco-integraciones.sh`.)
