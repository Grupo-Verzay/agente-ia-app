# Canales, líneas, proveedores (Evolution/Waha/Meta) y Correo

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## El sufijo de dispositivo: en SQL en crudo la columna es la de la BASE

El mismo cliente salía dos veces en Chats: una ficha con el número limpio y
otra con `573233246305:39@s.whatsapp.net`. Ese `:39` es el **aparato** desde el
que se escribió —el teléfono o WhatsApp Web— y no es parte del número.

Había una limpieza para eso desde el #549. **No quitó ni una ficha en su vida**,
y el motivo es de una línea:

```
Raw query failed. Code: `42703`. Message: `column mala.assignedAdvisorId does not exist`
```

En SQL en crudo **Prisma no traduce los `@map`**: el campo es
`assignedAdvisorId` y la columna es `assigned_advisor_id`. Igual `customName` /
`custom_name`. Así que la consulta se caía entera en cada vuelta, el `catch`
escribía un `console.warn` que nadie lee, y la bandeja seguía como si nada. Un
fallo que solo se ve en la consola de un servidor **no se ve**.

**Y la trampa está en el arreglo, no en el fallo:** de las tres columnas de la
condición, `leadStatus` **no lleva `@map`** y estaba bien. Escribirlas «las tres
a juego» rompe justo la que funcionaba — lo hice, y lo cazó el banco al
segundo intento.

> **Una columna en SQL en crudo no se deduce del campo de Prisma: se
> comprueba.** El banco lo hace contra `information_schema.columns`, con la
> lista de columnas que el módulo nombra. Esa comprobación encontró además
> `crm_follow_ups.ruleKey` (es `rule_key`) y `chat_conversations.profilePicUrl`,
> que existe en producción por un `ALTER TABLE` en caliente y **no** en el
> esquema de Prisma.

### La causa del duplicado: el sufijo se PEGABA al número

Quitar la ficha era limpiar el síntoma. El duplicado nacía antes, y por dos
sitios:

1. `normalizeStoredRemoteJid` devolvía el jid tal cual —termina en
   `@s.whatsapp.net`, así que lo daba por bueno—, y con él se escribían la
   conversación, los mensajes y la ficha.
2. Peor: `extractWhatsAppDigits` solo se queda con los dígitos, y el `:` no es
   uno. `573233246305:39` salía como **`57323324630539`**, y con eso
   `buildWhatsAppJidCandidates` fabricaba `57323324630539@s.whatsapp.net` y su
   `@lid`: identidades de un número que no existe. Es el mismo daño que el
   comentario de esa función describe para los `@lid`.

**La regla va en `cleanValue`**, por donde entra todo valor de
`lib/whatsapp-jid.ts`, así que una sola función decide qué es el número y no hay
dos que discrepen. Lo comprueba el banco: los dos formatos dan **las mismas**
identidades.

Y `fmtPhone` **no pasa por ahí** —hace su propio `replace`—, así que llevaba su
propia copia del fallo: la ficha del contacto enseñaba **`+57 323324630539`**.
Lleva la misma función. Si se escribe otro sitio que saque el número de un jid,
va por ella.

### Unificar es MOVER, no borrar

La versión vieja era un `DELETE`, protegido por cuatro condiciones: tiene
sufijo, existe la ficha buena en la misma línea, nadie la ha tocado —sin asesor,
sin nombre a mano, sin estado de lead— y no se ha vuelto a guardar. Esas cuatro
dicen «recién creada y sin estrenar», y **no bastan**: media docena de las
tablas que cuelgan de `Session` van en cascada, así que una nota interna, una
cita o una etiqueta puestas sobre la copia se habrían ido con ella sin decir
nada. Poner una etiqueta no toca `Session.updatedAt`.

Así que `lib/sufijo-de-dispositivo-db.ts` **mueve antes de borrar**, en una
transacción:

- **Los mensajes** de la conversación con sufijo pasan a la limpia, y los que
  chocan —mismo `messageId` y mismo `fromMe` ya guardados bajo el jid limpio—
  son el MISMO mensaje y se quitan. Los mensajes de las dos quedan en la
  conversación que sobrevive.
- **Lo que cuelga de la ficha** —etiquetas, notas, tareas, citas, seguimientos,
  participantes— pasa a la ficha buena. Donde hay llave única con la sesión
  dentro (la misma etiqueta, el mismo disparador) la fila que chocaría es una
  copia de algo que la buena ya tiene: se quita.
- **Y solo entonces** se borra la ficha con sufijo, volviendo a mirar las cuatro
  condiciones: entre el `SELECT` y el borrado alguien pudo asignársela.

Cuatro cosas más:

1. **Sin gemela limpia la conversación NO se borra**: se le quita el sufijo y se
   queda. Borrarla sería tirar el historial del único sitio donde está.
2. **Se parte de `chat_conversations`, no de `chat_messages`.** Buscar el patrón
   sobre la tabla de mensajes es recorrerla entera, y esto corre al abrir la
   bandeja; con la conversación delante, los mensajes se mueven por su llave
   exacta, que sí entra por índice.
3. **Va a trozos** (`TOPE_POR_VUELTA`). La primera vuelta de una cuenta con
   meses de duplicados no puede quedarse reescribiendo miles de filas mientras
   alguien espera a que le abra Chats.
4. **El aviso dice el código de Postgres** (`meta.code`), que es lo que separa
   «no se pudo» de «esa columna no existe». Con `String(error)` a secas, el
   42703 llevaba un año escrito en la consola sin que nadie lo leyera.

## Una línea es UNA instancia; el proveedor es un ajuste suyo

WhatsApp Mensajería (Waha) se construyó como una **segunda línea**: la tarjeta
fabricaba una instancia aparte, `NOMBRE_V2`, con su propia fila en `Instancias`.
Pero un número solo está conectado por un proveedor a la vez —o Evolution o
Waha—, y todo lo que importa (historial, leads, etiquetas, seguimientos, memoria
de la IA) está guardado por instancia, no por proveedor. Con dos filas el mismo
número quedaba partido: dos tarjetas en Conexiones, dos «Alexis» en Chats, dos
leads en el CRM, y un flujo lanzado sobre la fila vieja salía por Evolution
—apagada— y agotaba el plazo con «Timeout de solicitud».

La regla: **cambiar de proveedor cambia `instanceType` de la MISMA fila**
(`actions/proveedor-de-linea-actions.ts`), conservando `instanceName` (las
conversaciones y los mensajes) e `instanceId` (las sesiones del CRM). El
backend ya decide por `instanceType` en cada envío, así que no hay nada más que
tocar. La sesión de Waha se llama **igual que la instancia**; `_V2` no existe.
Nunca hay dos encendidos: si Evolution está conectada, el propio cambio cierra
su sesión antes de seguir.

Si en una cuenta quedaron datos bajo `NOMBRE_V2`, el cambio a Waha los adopta
(`adoptarRestosDelSufijoV2`) y lo dice en la consola: `[linea] proveedor
cambiado a WhatsApp Mensajería { mensajesMovidos, sesionesMovidas, … }`.

## El primer mensaje a un lead guardado a mano: el número va LIMPIO, y Waha confirma a quién

«Crear contacto» (Leads) guardaba el número tal cual se tecleó —`+507 6027-0754`—
pegándole `@s.whatsapp.net`, y ninguna capa lo limpiaba. El primer mensaje a ese
lead salía a Waha como `+50760270754@c.us`, y **Waha no contesta a eso**: el envío
agotaba sus 15 s, salía «el servidor no contestó a tiempo» y al cliente no le
llegaba nada (visto en producción el 2026-09-30, línea MULTIGAMA). A una
conversación que empezó el lead no le pasa: ese número lo pone WhatsApp, limpio.

Tres cosas, y hacen falta las tres:

1. **El formato se quita en `cleanValue`** (`sinFormatoDeTelefono`,
   `lib/whatsapp-jid.ts`), igual que el sufijo de dispositivo: `+`, espacios,
   guiones, paréntesis y puntos, solo en un JID de teléfono (`@s.whatsapp.net` /
   `@c.us`) o en un valor sin arroba. `canonicalToWahaJid` y
   `wahaJidToCanonical` pasan por la misma función. `buildWhatsAppJidCandidates`
   conserva además la forma LITERAL, para que una ficha vieja se siga encontrando.
2. **Las dos pantallas que crean un lead a mano** («Crear contacto» y
   `LeadCreateForm`) arman el JID con `jidDelTelefonoTecleado` y piden al menos
   8 dígitos; el servidor limpia igual (`registrarLaSesion` → `cleanValue`).
3. **Waha confirma el destinatario antes de enviar**, como ya hacía Evolution
   (`resolveWhatsAppJid`): `destinoSegunWaha` pregunta a
   `GET /api/contacts/check-exists` (0,1-0,2 s medidos), manda al número (`pn`),
   recuerda la respuesta 30 min, y va dentro de `sendWahaText`/`sendWahaMedia`,
   que es por donde sale TODO envío a Waha. `numberExists: false` se dice al
   momento («El número +X no tiene WhatsApp»); si la consulta falla o tarda, se
   envía con lo que había.

Lo prueba `scripts/banco-primer-mensaje-a-un-lead.sh`, con un Waha de mentira
que se cuelga igual que el real ante un `chatId` que no es solo dígitos.
`MODO=roto` empaqueta la misma cadena con `lib/` de `c7fbb82` y afirma el
cuelgue de 15 s.

## Un contacto sin número (`@lid`) se llama y se contesta por su `@lid` ENTERO

Hay contactos que entran a WhatsApp por su usuario y solo existen como
`96366802022553@lid`. La IA les contestaba bien —responde por el `@lid` del
aviso— y una persona no: responder desde Chats salía con **«El número
+96366802022553 no tiene WhatsApp»**, y llamar desde el CRM llamaba a ese mismo
número que no existe.

Era una cadena, y empezaba en la llamada:

1. Llamar quitaba todo lo que no fuera un dígito (`replace(/\D/g, '')`) y
   llamaba al «+96366802022553»: **los dígitos de un `@lid` son un id de
   privacidad, no un teléfono**.
2. La burbuja de esa llamada se guardaba bajo `96366802022553@s.whatsapp.net`.
3. `upsertSessionFromChatMessage` buscaba la ficha con `buildWhatsAppJidCandidates`,
   que **cruza a propósito** `D@s.whatsapp.net` con `D@lid`, encontraba la del
   `@lid` y le **reescribía el `remoteJid`** con el número fabricado.
4. Desde ahí, responder prefería ese «teléfono»; Waha preguntaba si existe
   (`destinoSegunWaha`) y contestaba que no.

> **El destino es el TELÉFONO real si el contacto lo tiene, y si no, su `@lid`
> ENTERO.** Lo decide `lib/destino-de-la-llamada.ts` (puro) y pasan por ahí los
> diez sitios que llaman o anotan una llamada: la cabecera del chat, el menú de
> llamar, la tarjeta, el anfitrión, el CRM (tabla y registros), las tres acciones
> del servidor y la respuesta a una llamada perdida. Al servidor de llamadas le
> va `+57…` o `D@lid` (`paraElServidorDeLlamadas`); a la conversación, `57…@s.whatsapp.net`
> o `D@lid` (`elJidDelDestino`).

Cinco cosas que hay que mantener:

1. **Un «teléfono» cuyos dígitos son los de un `@lid` del MISMO contacto es
   falso** (`esTelefonoFalsoDeLid`): un id de privacidad y un número real no
   coinciden dígito a dígito. Se mira contra las identidades de la FICHA, nunca
   contra los candidatos —esos llevan el puente dentro y todo parecería falso—.
2. **Ese número no reescribe la ficha** (`upsertSessionFromChatMessage`) ni se
   prefiere al guardar (`normalizeStoredRemoteJid`) ni al responder
   (`resolveSendRemoteJid` en `chats-client`, con `sinTelefonosFalsosDeLid`).
3. **Se decide con las identidades REALES, nunca con el número que se enseña**:
   a un agente se le enseña tapado, y con esos dígitos se llamaba a otro número.
   Donde iría el número de un `@lid` se lee «Sin número visible».
4. **Meta no puede llamar ni escribir a un `@lid`**: se dice, no se intenta.
5. **El backend y el servidor de llamadas dicen lo mismo.** AstraCalls recibe el
   `D@lid` y llama a esa identidad (`destinoDeLaLlamada`, en
   `cmd/server/destino-de-la-llamada.go`); el asistente de voz del backend lee el
   chat por el `@lid`, manda `enviar_whatsapp` por él (en Evolution el `number`
   es el `@lid` entero) y deja la tarea de agendar colgada de él
   (`laIdentidadDeLaLlamada`, en `src/modules/voicebot/telefono-de-la-llamada.ts`).

Lo prueban `scripts/banco-destino-de-la-llamada.sh` aquí (la regla, un barrido de
los diez sitios y las acciones contra Postgres), `scripts/banco-contacto-por-lid.sh`
en `api-webhook` (el asistente de voz contra Postgres) y
`scripts/banco-destino-de-la-llamada.sh` en `astracalls`. Los tres con `MODO=roto`
contra un commit pinchado que afirma el fallo: la llamada al número de nadie, la
ficha reescrita y el asistente sin chat ni a quién escribir.

### Y el `@lid` de PUENTE no es una identidad: se decide sin él

El arreglo de arriba destapó su reverso el 2026-10-02: un recordatorio de cita
—«tu sesión empieza…»— le llegó a «Usuario desconocido» en vez de a Reinaldo,
y salieron así 17 conversaciones fantasma (`<teléfono>@lid`, ninguna con un
solo mensaje del contacto) en cuatro cuentas. No era el recordatorio: lo mandó
la persona desde Chats, y Chats eligió `584242917888@lid`.

`buildWhatsAppJidCandidates` le pega a todo teléfono un `D@lid` **para
BUSCAR** (las filas viejas guardadas así), y de ahí salen `contact.aliases`,
`getChatIdentityCandidates` e `info.remoteJidAliases`. Con ese puente dentro,
`sinTelefonosFalsosDeLid` veía el teléfono real como «los dígitos de un
`@lid`» y lo tiraba: el mensaje y la llamada salían a `D@lid`, que no es nadie.

> **Lo que decide a quién se escribe o se llama mira las identidades
> OBSERVADAS; los candidatos pasan por `sinElPuenteDeLosCandidatos`**, que
> quita todo `@lid` cuyos dígitos sean un teléfono conocido y que nadie haya
> visto. Responder es `elJidParaResponder` (`lib/destino-de-la-llamada.ts`);
> llamar desde la cabecera y desde la ficha, `elDestinoDeLaConversacion` (#1098),
> que prueba primero con las reales. **Si se añade otro sitio que decida un destino con candidatos,
> va igual.**

Lo prueba `lib/__tests__/puente-del-lid.test.mjs`, dentro de
`scripts/banco-destino-de-la-llamada.sh`, con los `aliases` armados por la
función de verdad; `MODO=roto` corre la decisión de `a390032` y afirma el envío
a `D@lid`. Las 17 conversaciones fantasma **no se borraron**: alguna puede
tener una cita colgada de su ficha.

## Conexión: el canal se llama igual; el proveedor solo se nombra al cambiarlo

Una cosa es **cómo se llama la tarjeta** y otra **por dónde se conecta**. El
canal es siempre «Mensajería WhatsApp (QR)». Evolution y **Waha** son nombres de
servidores nuestros y **no salen en ninguna pantalla**: viven en el código y en
la consola. A quien usa la App no le cambia la vida saber cuál hay detrás; lo
único que le cambia es que al cambiar de conexión **se cierra la sesión y hay
que volver a escanear el QR**, y eso es lo que dice el diálogo de las flechas.

Antes el título cambiaba con el proveedor —«Mensajería WhatsApp (QR)» con
Evolution y «WhatsApp Mensajería (QR)» con Waha—: dos nombres parecidos para lo
mismo, y el cliente no tiene por qué saber que detrás hay dos servidores.

La línea es **una tarjeta** (`TarjetaDeLinea`), la misma en Perfil y en
Conexiones, con **cuatro mandos y ninguno más**:

| Dónde | Control | Qué hace |
| --- | --- | --- |
| Cabecera | Flechas | Cambia de proveedor. Solo el icono, sin etiqueta. |
| Cabecera | Papelera | Cierra sesión, borra en el servidor y borra la fila. |
| Cuerpo | Verde | **Cierra la sesión.** Al posar el cursor se pone rojo y lo dice. |
| Cuerpo | Rojo / azul | El **Robot**: apaga y enciende la IA de esa línea. |

Cinco cosas que hay que mantener:

1. **Cambiar de proveedor no deja deberes.** Sigue sin haber dos proveedores
   encendidos a la vez, pero cerrar el primero **no es trabajo de la persona**:
   si la sesión de Evolution está abierta, `cambiarProveedorAWaha` la cierra y
   espera a que deje de estar `open` antes de seguir. Antes el botón salía
   apagado y había que adivinar que el primer paso era pulsar el verde. La
   confirmación lo dice antes de tocar nada.
2. **Nada de texto suelto ni pie en la tarjeta.** Lo que hace cada botón se lee
   al posarse encima y se explica en su diálogo. El Robot no necesita bloque
   propio: ese botón rojo ya es él.
3. **Cerrar sesión existe en los dos proveedores.** Es la única forma de cambiar
   el número de una línea sin perder su historial. En Evolution la llamada vivía
   dentro de `deleteInstance` —desvincular obligaba a borrar la línea entera—;
   ahora es `cerrarSesionDeLaLinea`. Un fallo del servidor **se dice**: un
   «listo» con la sesión abierta hace creer que ya se puede escanear con otro
   teléfono.
4. **El Robot funciona con los dos.** El backend ya leía la misma marca para
   ambos (los mensajes de Waha pasan por el mismo `processWebhook`), pero la App
   exigía una clave de Evolution y llamaba a su webhook, así que en Waha el
   Robot estaba muerto. Con Waha **no se le pregunta nada a Evolution**.
5. **Perfil no puede tener su propia lógica.** Pinta las mismas tarjetas que
   `/connection`, en el mismo orden. Cuando no conocía el tipo `waha`, la línea
   caía en «Desconocido» y salía «Crear instancia»: pulsarlo creaba una segunda
   línea con el mismo nombre y partía el número en dos.

Y dos de rejilla y tipografía, que se ven a la primera:

- **Ni `auto-rows-fr` ni `h-full` en las tarjetas.** Con las filas iguales, cada
  tarjeta se estira hasta la altura de la más alta y le queda un hueco en blanco
  debajo de los botones. Va `items-start`: cada una mide lo que ocupa.
- **Un solo título** (`TituloDeTarjeta`, 19 px con icono de 21). Convivían dos
  escalas —24 px con iconos de 16 en las tarjetas con línea, 20 px con iconos de
  24 en las de canal por conectar— y una al lado de otra se veían disparejas.
  Si se añade otra tarjeta de canal, usa ese componente y no un tamaño a mano.

## Conexión: los canales de credenciales, un botón y una sola tarjeta

Cloud API, Telegram, Facebook e Instagram se conectan igual: **pegando unas
credenciales en un formulario**. Crear la instancia ES pegarlas; no hay paso
previo que cree nada vacío.

Por eso los cuatro se pintan con `TarjetaDeCanal` y tienen **un solo botón, en
el mismo sitio**: «Conectar <canal>» cuando no hay nada, «Editar credenciales»
cuando ya está. Los dos abren el mismo formulario. Antes había dos sitios para
una sola cosa: un botón de color abajo cuando no existía, y un pie con dos
botones cuando sí —uno que solo recargaba la página y otro con un lápiz—.

Cuatro cosas que hay que mantener:

1. **Conectado se lee como la línea de WhatsApp**: avatar, nombre y dato debajo.
   Sin sellos de «Conectado» ni campos grises apilados: la misma anatomía en
   toda la pantalla. El nombre de instancia solo se enseña **sin conectar**, que
   es cuando informa de algo.
2. **La papelera va arriba**, junto al título, y solo cuando hay algo que
   borrar.
3. **Nada de líneas de ayuda sueltas en la tarjeta** («Ver cómo crear tu bot»,
   «Ver cómo conectar tu página»). Van dentro del formulario, que es donde hacen
   falta.
4. **Los dos botones de Meta (`MetaEmbeddedSignup`) están ocultos.** Ese camino
   necesita que la cuenta sea proveedor tecnológico de Meta; sin serlo no puede
   traer el token ni el número, así que era un botón que no podía funcionar. El
   componente se queda en el repo: volver a ofrecerlo es una línea.

Y el punto de color: la burbuja del título de la línea lleva **un punto dentro**
que dice por dónde conecta —uno para cada servidor—. **No se nombra ninguno**: a
quien usa la App no le sirve saberlo, y un punto de color no le dice nada, que
es justo lo que se busca. Quien lo necesita lo lee al posar el cursor.

Y «(QR)» va en los dos canales que se escanean —«Mensajería WhatsApp (QR)» y
«Llamadas WhatsApp (QR)»— y **no** en Cloud API, que es el número oficial de
Meta y no vincula ningún teléfono. Esa palabra es lo único que distingue las dos
tarjetas de WhatsApp.

## "Escribiendo…" hay que pedirlo dos veces

Que se vea "escribiendo…", "grabando audio…" y "en línea" no es una pantalla:
la pantalla ya estaba hecha y es la misma para los dos proveedores. Lo que hace
falta es **pedirlo dos veces**, y si falta cualquiera de las dos no llega nada
y no hay error que mirar:

1. **En el webhook de la línea.** Evolution guarda la lista de eventos con la
   que se registró el webhook y no la vuelve a mirar, así que `PRESENCE_UPDATE`
   tiene que estar en `EVENTOS_DEL_WEBHOOK` (`actions/robot-actions.ts`) **y**
   `ponerAlDiaLosEventos` tiene que reescribirlo en las líneas que ya estaban.
2. **Por cada contacto.** WhatsApp solo manda la presencia de los contactos a
   los que la sesión está **suscrita**. En Waha se suscribe leyendo la presencia
   al abrir el chat; en Evolution **no hay forma de preguntarla**, solo de
   suscribirse, y ni siquiera tiene ruta propia: la hace por dentro
   `POST /chat/sendPresence` (`presenceSubscribe` antes del gesto). Se llama con
   `presence: "paused"` —"dejó de escribir"—, que suscribe sin que el contacto
   vea nada distinto. Los tres campos (`number`, `presence`, `delay`) son
   obligatorios; sin `delay` contesta 400.

Y una de vocabulario: los dos proveedores dicen lo mismo con palabras distintas
—Waha `typing` / `online` / `offline`, Baileys `composing` / `available` /
`unavailable`— y la App entiende una sola. **El traductor es uno**
(`presenciaDeWhatsapp`, en `src/utils/presencia.util.ts` del backend). Lo que no
se reconoce cae en `nada`, que apaga la burbuja: dejarla encendida para siempre
es peor que no enseñarla.

La presencia **no se guarda**: es de ahora mismo y solo vale para la
conversación abierta. Tampoco pasa por el buffer ni dispara IA.

## La salida es la línea de la CONVERSACIÓN, y se resuelve AL ENVIAR

Un cliente escribe por **Verzay | Atención**, el asesor contesta desde la
plataforma… y el mensaje sale por otra línea. Igual la llamada. Desde fuera no
hay ningún error: el mensaje se envía, el cliente lo recibe **de un número que
no conoce**, y la burbuja de la llamada aparece en otra conversación.

**El servidor nunca tuvo la culpa.** `resolverContexto` resuelve la clave de la
cuenta dueña de `context.instanceName` y `sendOutgoingPayload` y
`persistOutgoingHistory` van todos por ahí: lo que le llegue, eso respeta. El
que se equivocaba era el navegador, al decirle **por cuál**.

### Lo que decidía: un `useRef` escrito en UN SOLO camino

```ts
result = await (activeActionSetRef.current?.sendText ?? sendAnyAction)(sendJid, payload);
```

`activeActionSetRef` se escribe **solo** dentro de `handleSelectFromSidebar`. Y
`sendAnyAction` está atado en la página a `pickWhatsappOrNull(instancias)`, o
sea **la primera línea de la cuenta de quien mira**. Así que cualquier forma de
abrir una conversación que no sea pulsarla en la bandeja dejaba el ref en `null`
y la respuesta salía por la línea equivocada:

| cómo se abre | qué pasaba |
| --- | --- |
| enlace `?jid=` —el que escribe *Chats → equipo*, y el aterrizaje de un aviso— | el estado se siembra directo y el efecto que llamaría a `handleSelectFromSidebar` sale por `if (selectedJid)`: **nadie escribe la línea** |
| un contacto que no entró en la página cargada de la bandeja (tope de 300) | `selectedContact` es `undefined` y `effectiveInstanceName` cae en la línea de la página, que además se escribe en `info` |
| el reloj reabriendo el chat (`selectFromSidebarRef.current?.(jid)`) | iba **sin línea**, así que buscaba el contacto solo por número y podía quedarse con el de la otra línea |

Y esa `info.instanceName` equivocada **se propagaba**: la cabecera la usa para
el botón de llamar y el caché de mensajes se escribe con ella.

> **La línea de salida es la de la CONVERSACIÓN, y se resuelve AL ENVIAR, no al
> seleccionar.** Lo decide `lib/linea-de-la-conversacion.ts`, que es puro:
> `laLineaDeLaConversacion` mira, por ese orden, **el contacto abierto, la línea
> seleccionada y `info`** —tres formas de la misma cosa, y con tres el día que
> una se quede sin escribir las otras contestan—, y `porDondeSaleLaRespuesta`
> busca su juego de acciones. Los tres envíos y la plantilla de Meta pasan por
> ahí.

Y lo que no se puede ablandar:

> **Cuando la línea se conoce y no hay con qué enviar por ella, NO se envía: se
> dice.** Mandarlo por otra es escribirle al cliente desde un número que no es
> el suyo, y eso no produce ningún error en ninguna capa. Solo el caso de
> verdad desconocido —`sin-linea`— cae en el respaldo de siempre, y entonces
> sale un `console.warn`.

### Y el estado nace sembrado, que es la causa raíz

Resolver al enviar arregla el envío; lo que arregla **todo lo demás que cuelga
de la línea** —leer el historial, la presencia, el caché, el botón de llamar de
la cabecera— es que `selectedInstanceName`, `info.instanceName` y el propio
`activeActionSetRef` **nazcan con la línea de `initialSelectedChat`** en vez de
en `null` y con la línea de la página. Y que el reloj reabra el chat **con su
línea**.

### Las llamadas: tres agujeros, y ninguno era `sidParaLlamar`

`sidParaLlamar` ya estaba bien desde *se llama con el número de la línea, no con
el de quien mira*. Lo que fallaba estaba antes y después:

1. **`CallDialog` resolvía la línea y después la tiraba.** Calculaba `effName`
   —de la prop, o de la cuenta gestionada cuando quien llama no la pasa— y
   luego hacía `startAstraCall(\`+${phone}\`, instanceName)`, **con la prop en
   crudo**. Desde una burbuja o desde el CRM eso es `undefined`, así que se
   llamaba con el número propio. Va `effName`.
2. **«Devolver llamada» de una burbuja no pasaba línea ninguna.** Baja por
   **contexto** (`useConversacionDeLaNota`, el mismo que ya le lleva la
   conversación al botón de transcribir una nota) y no por props: `MessageBubble`
   está al fondo de tres componentes memoizados, y atravesarlos sería tocar la
   firma de cada fila — lo que prohíbe *la lista es grande, no rehacerla por
   gusto*. El contexto gana un campo, `instanceType`.
3. **`logOutgoingCallAction` no recibía la línea.** Escribía la burbuja con
   `userId = getCallAccountUserId()` y la línea por QR **de esa** cuenta, así
   que llamando desde una conversación de otra línea el registro caía en **otra
   conversación**: se escribía perfectamente y en la que se tenía delante no
   aparecía nada. Ahora recibe la línea, resuelve su dueña y comprueba el
   permiso con `assertCanAccessTargetUser` —la misma puerta que `sidParaLlamar`—;
   sin permiso, o sin línea, se cae a lo de antes. **Perder el registro sería
   peor que escribirlo donde ya se escribía.**

### El banco, en dos modos

`scripts/banco-linea-de-la-conversacion.sh`, y son **tres mitades** porque el
fallo vive en tres capas:

- **La decisión**, pura y sin base, con el resolvedor viejo escrito al lado: un
  ref que solo se escribe al pulsar en la lista, y que abriendo por enlace
  devuelve la línea de la cuenta.
- **El código de verdad**, leído del fichero: que los tres envíos ya no
  consultan `activeActionSetRef`, que el estado nace sembrado, que `CallDialog`
  llama con `effName` y registra con su línea, y que la burbuja pasa la suya.
  En `MODO=roto` **los mismos ficheros se leen de `origin/main`** —no de
  `HEAD`, que en cuanto esto se comitee sería ya la versión nueva— y se afirma
  que el fallo está ahí.
- **Las acciones contra Postgres**, con la malla de `linked_accounts` dentro y
  el `fetch` apuntado para poder afirmar **a qué sesión de llamadas se habló**:
  con la línea ajena se llama con el número de su cuenta y la burbuja se anota
  bajo ella; sin línea, con el propio y bajo la propia.

Lo que **no** se puede ejercer aquí, y se dice: `sendManualChatPayloadAction`
necesita hablar con Evolution o con Waha, así que el envío de verdad no se
prueba contra un proveedor. Lo que sí se prueba es lo único que estaba mal —qué
contexto se elige— y que el servidor respeta el que le llegue ya estaba cubierto
por la forma de `resolverContexto`.

## El proveedor sale de la FILA, no del parámetro

Este documento llevaba escrito un cabo suelto: «el borrado de la cuenta a los 30
días sigue llamando solo a Evolution, así que la sesión de una línea de Waha se
queda viva en su servidor cuando la cuenta desaparece». Al ir a cerrarlo resultó
no ser un caso suelto sino **un patrón repetido en nueve sitios**, el mismo que
ya mordió dos veces al escribir la sección de arriba.

La forma es siempre esta:

```ts
const fila = await checkActiveInstance(userId, instanceType); // SÍ busca en los dos
if (isWhatsappLike(instanceType)) { …Evolution… }             // pregunta por el PEDIDO
const otra = await db.instancia.findFirst({ where: { instanceName, instanceType } });
```

`checkActiveInstance` busca a propósito en `['Whatsapp', 'waha']`, así que
**encuentra** la fila de Waha. Lo que decide después es el parámetro, que por
defecto vale `'Whatsapp'`. De ahí salen dos daños, y el segundo es el caro:

- **Se habla con el servidor equivocado**, y eso **no falla de forma visible**:
  un `logout` de Evolution contra el nombre de una sesión de Waha contesta «no
  existe» y el código sigue como si hubiera cerrado.
- **Y la fila se va sin la sesión.** `Instancias` es `onDelete: Cascade`, así que
  al borrar la cuenta sus filas desaparecen con sesión liberada o sin ella. Lo
  que queda al otro lado **no lo reclama nadie nunca**, porque ya no existe la
  fila que decía de quién era.

> **Cerrar, borrar y consultar una sesión viven en `lib/sesion-de-la-linea.ts`,
> se les pasa la FILA y ellas eligen el proveedor.** `proveedorDeLaFila` dice
> `evolution` (incluido el tipo nulo de las líneas antiguas), `waha` u `otro`
> —Meta, Telegram, Facebook e Instagram, que no tienen sesión de WhatsApp que
> cerrar—. Con la condición escrita en cada sitio, el séptimo se olvida, y eso
> es literalmente lo que pasó.

### Lo que hacía cada uno antes

| dónde | qué hacía con una línea de Waha |
| --- | --- |
| `deleteInstanceInternal` (borrado de la cuenta a los 30 días) | `logout`+`delete` contra Evolution, y luego `findFirst({ instanceName, instanceType })` con el tipo **pedido**: no la encontraba y salía con `success:false` **dejando la fila**. La sesión quedaba viva para siempre. |
| `deleteInstanceEvolutionAware` (cascada del reseller) | una línea de Waha normalmente no tiene clave de Evolution, así que caía en `if (!user.apiKey)` —«sin ApiKey: registro eliminado»— y **se llevaba la fila sin tocar la sesión**. La rama del `retryable` ni se ejercía. |
| `deleteInstance` (la papelera de la tarjeta) | el mismo segundo `findFirst`: contestaba «No se encontró la instancia en la base de datos» con la fila delante. |
| `forceRecreateInstance` | `deleteMany({ instanceName, instanceType })` no borraba nada y después creaba una fila **de Evolution** con el mismo nombre: **dos filas para un número**. |
| `cerrarSesionDeLaLinea` (el botón verde) | Evolution a secas: «El usuario no tiene una ApiKey de Evolution asignada», que es cierto y no explica nada. |
| `renameInstance` | renombraba la fila y no la sesión. La sesión de Waha **se llama igual que la instancia**, así que la línea se quedaba sin mensajes y sin un solo error. |
| `generateQRCode` | `isWhatsappLike('waha')` es `false` → «No se pudo generar el código QR.» Y la comprobación de la ApiKey de Evolution iba **antes**, así que una cuenta de solo Waha ni llegaba. |
| `generateWhatsappPairingCode` | no miraba el tipo: mandaba el código por número a Evolution pasara lo que pasara. |
| `checkActiveInstance` | su `IN` nunca casa con un **nulo**, así que las líneas **antiguas sin tipo** no las encontraba nadie — y `isWhatsappLike(null)` vale `true` desde siempre, o sea que la intención era incluirlas. |

Y tres que **consultaban** y solo miraban Evolution, que es la mitad muda del
mismo patrón:

| dónde | qué pasaba |
| --- | --- |
| el cron de «tu línea se cayó» | su filtro pedía tipo nulo o `Whatsapp` **y** `apiKey: { isNot: null }`. Una cuenta de solo Waha quedaba fuera por las dos: la línea se le caía y **no se enteraba nadie** — ni aviso, ni fila en el resultado del cron, ni fallo que mirar. |
| la columna «desconectado» de Panel › Clientes | excluía Waha con el motivo escrito de que «no se puede comprobar». Sí se puede: `getWahaSession` contesta `WORKING` o no. Mientras estuvo fuera, ese cliente **no salía ni en verde ni en rojo**. |
| el checklist de puesta en marcha | cogía `instanceType === "Whatsapp"` y exigía la url de Evolution: un cliente de Waha salía con las tres casillas en gris para siempre, aunque estuviera atendiendo. Y `botEnabled` leía el **webhook**, que va siempre encendido en Evolution y no existe en Waha: decía `true` siempre en una y `false` siempre en la otra. Ahora lee `bot_enabled`, que es lo que el backend mira para los dos. |

### Cuatro cosas que hay que mantener

1. **`desconocido` NO es «caída».** `estadoDeLaSesionDeLaLinea` devuelve tres
   valores y no un booleano a propósito: una línea cuyo servidor no contesta no
   se pinta en rojo ni dispara un WhatsApp. Inventar un estado es lo que llenaba
   la lista de clientes a los que escribirle sin motivo.
2. **`transitorio` decide si la fila se queda.** Un servidor caído o un `5xx` es
   de hoy y la fila se conserva como señal de borrado pendiente; un `404` o un
   `4xx` es firme y la fila se puede ir. Borrar la fila ante un fallo transitorio
   es exactamente cómo se queda una sesión huérfana.
3. **Al eliminar una cuenta se liberan TODAS sus líneas**
   (`liberarLasLineasDeLaCuenta`), no la primera. Los dos caminos de los 30 días
   pasaban por funciones que resuelven con `checkActiveInstance`, que es un
   `findFirst`: una cuenta con dos líneas dejaba la segunda viva. Y como la
   relación es en cascada, la fila se iba igual.
4. **Una operación que un proveedor no sabe hacer se DICE, no se simula.** Waha
   no sabe renombrar una sesión y no ofrece código por número; las dos contestan
   qué sí se puede hacer en su lugar. Renombrar solo la fila «funcionaba» y
   dejaba la línea muda.

El banco son **39 casos contra Postgres**, con una línea de cada proveedor y con
el `fetch` apuntado para poder afirmar **a qué servidor se habló**. Los diez
«ANTES» ejecutan la rama vieja literal sobre la misma semilla: sin ellos no se
sabe si se arregló la causa o algo parecido.

### Y la pregunta de ANTES: no «¿qué proveedor?», sino «¿la tiene?»

El mismo patrón, una capa más arriba y con un síntoma peor. El diálogo
**«Asistente de voz IA»** de Perfil → Conexión guardaba la voz y el número de
transferencia y contestaba

> No tienes una cuenta de WhatsApp vinculada.

con la línea de esa misma cuenta **ahí arriba, en la misma pantalla, diciendo
Conectado** — y con el proveedor de llamadas reportándola conectada también.
Desvincular y volver a vincular no lo arreglaba, y **no podía**: ese botón toca
la sesión de llamadas (`User.astra_calls_sid`), que no es lo que esa acción
estaba mirando.

Lo que miraba era esto:

```ts
db.instancia.findFirst({ where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp'] } } })
```

Y la línea por QR se guarda con **tres formas de la MISMA cosa**: `Whatsapp` si
nació en Evolution, `waha` si nació en WhatsApp Mensajería —**que es como nacen
hoy las nuevas**— o se pasó a ella, y `NULL` en las antiguas, de cuando la
columna no se escribía. `checkActiveInstance` ya cubría las tres, a propósito y
con su comentario al lado; a esta se le había pasado.

Medido en producción, solo lectura:

| | cuentas |
| --- | --- |
| con línea por QR | **31** |
| que ese filtro veía | 21 |
| **invisibles para el voicebot** | **10** |

Y cruzado con quien además tiene número de llamadas vinculado —que es quien
puede llegar a abrir ese diálogo— son **5 de 8**: Carlos \| Arcos,
Verzay \| Notificaciones, Verzay \| Atencion, Horeca Soluciones y
Verzay \| Ventas.

**Y una de ellas ya tenía la configuración guardada sobre su fila de `waha`.**
Verzay \| Ventas la escribió cuando esa línea era de Evolution; al cambiar de
proveedor —que cambia el `instanceType` de la MISMA fila y conserva todo lo
demás— dejó de encontrarse. Desde entonces leerla devuelve los valores por
defecto y guardarla falla. Es exactamente el reporte: funcionaba, dejó de
funcionar, y no hay forma de arreglarlo desde la pantalla.

> **Cuál es la línea por QR de una cuenta lo contesta `lib/linea-de-whatsapp.ts`
> y nadie más.**

#### Se filtra en TypeScript, no con un `in` de casings

El `in` de Prisma distingue mayúsculas, así que una lista de tipos es una lista
de **cómo se escribieron**: basta con que un camino guarde `WhatsApp` para que
se caiga sin decirlo. Se traen las instancias de la cuenta —una o dos, tres en
la que más— y las filtra `esLineaDeWhatsappQr`, que es pura. Así **la consulta y
la regla no pueden discrepar, porque son la misma**.

Y de paso sale gratis lo otro que hacía falta: con la lista delante se puede
decir **qué sí tiene** la cuenta.

#### El aviso NOMBRA lo que falta

Un «No tienes una cuenta de WhatsApp vinculada» a secas es el peor aviso posible
aquí, porque **la cuenta sí tiene WhatsApp conectado** —lo dice la tarjeta de al
lado— y manda a desvincular y volver a vincular, que es justo lo que el reporte
cuenta que se probó. `porQueNoHayLineaQr` distingue los dos casos en que el
aviso **sí** es correcto:

| lo que tiene la cuenta | qué dice |
| --- | --- |
| nada conectado | «no tiene ninguna línea de WhatsApp conectada… conéctala en Conexión → Mensajería WhatsApp (QR)» |
| solo canales que no son QR | «tiene **WhatsApp API oficial (Meta)**, pero el asistente de voz va sobre la línea por QR y esa no está conectada» |

Ese segundo caso es real y es correcto: un canal de Meta Cloud API no es un
número conectado por QR, y las llamadas van por ahí.

#### Y a las hermanas se les había pasado lo mismo

Es la familia de siempre —*a una hermana se le pasa*— y son cuatro sitios más,
los cuatro de Llamadas:

| dónde | qué se veía |
| --- | --- |
| `setCallContactNameAction` | **«No hay instancia de WhatsApp para guardar el nombre»** al nombrar un contacto en CRM → Llamadas |
| `setCallLeadStatusAction` | lo mismo al marcarle un estado al lead |
| `linkMyCallSession` (×2) | la sesión de llamadas nacía sin el nombre de la línea |
| `logOutgoingCallAction` | su lista dejaba fuera `waha`, así que caía en el respaldo «cualquier instancia» y con un canal de Meta al lado podía asociar la llamada al canal equivocado |
| `enviarRespuestaDeLlamadaPerdida` | su lista nombraba `meta` y **no** `waha`: en esas cuentas prefería el canal de Meta, y sin él acababa en la rama de Evolution pidiendo unas credenciales que una línea de Waha no tiene. Desde fuera, la respuesta no salía y decía «Sin credenciales de WhatsApp» |

El último llevaba además media función sin escribir: ahora tiene su rama de
Waha, con `sendWahaText` y su `persistChatMessage`, como el resto de la
plataforma.

#### Y el alcance se pregunta a la fila EFECTIVA, igual que la tarjeta de al lado

El voicebot resolvía la cuenta con `ownerId ?? id` y la tarjeta de llamadas de
esa misma pantalla con `effectiveId`. **Hoy dan lo mismo en las tres ramas de
`currentUser()`** —se comprobó— pero son dos formas de preguntar la misma cosa,
y dos formas es una que se afina y otra que se queda atrás. Va `effectiveId`,
que es lo que `getCallAccountUserId` ya usaba.

Y ahí al lado había uno que **no** daba lo mismo: `startBotCallAction` leía el
`astraCallsSid` de **`me.id`**, la persona. Un asesor —cuya fila no tiene ese
campo y nunca lo va a tener— recibía «No tienes un número de llamadas vinculado»
con el número de su cuenta perfectamente conectado.

#### El banco ejerce las ACCIONES, y el modo roto lleva la consulta vieja dentro

`lib/__tests__/linea-de-whatsapp.test.mjs`, 15 casos contra Postgres
(`scripts/banco-llamadas.sh`). Probar `laLineaDeWhatsappDeLaCuenta` a secas sería
probar el lado que se acaba de escribir; lo que hay que demostrar es que las
acciones pasan por ella, así que se finge **solo `currentUser()`**.

Cubre los tres puntos de vista del encargo —cuenta con sesión conectada (en los
tres tipos), cuenta sin línea, y cuenta **hija** de una familia más su
administrador entrando con su propio id— y lleva dentro la consulta vieja
literal. **Ejercido contra el código de antes se pone en rojo en 9 de los 15**;
los 6 que pasan en los dos modos son justo los que no podían cambiar: la regla
pura, la afirmación del propio modo roto y el caso de Evolution, que siempre
funcionó. Sin ese modo no se sabe si se arregló la causa o algo parecido.

#### Y el BACKEND se quedó con la mitad vieja: «Llamar con IA»

El #841 arregló el lado de la App —`lib/linea-de-whatsapp.ts`, el diálogo del
asistente de voz y sus cuatro hermanas de Llamadas— y **el backend siguió
preguntando por los dos casings**. Un arreglo aplicado en una mitad de un dato
compartido no es un arreglo: es un **desacuerdo**, y este tardó semanas en
reportarse porque el síntoma nombraba la condición contraria.

Desde fuera: en CRM → Llamadas, «Llamar con IA» contestaba

> Activa "Asistente de voz IA" en Conexión → Llamadas primero.

con el interruptor **encendido en la pantalla**, su voz y su número de
transferencia guardados y la línea diciendo Conectado. Y no era el botón: las
llamadas automáticas del flujo (`AI_CALL` al cambiar de etiqueta) tampoco
salían. Los dos caminos terminan en `POST /api/sessions/{sid}/calls/bot` →
wacalls → `VoicebotService.resolve`, así que la comprobación que fallaba era
**una sola y común a los dos** — que es justo lo que el reporte ya intuía.

Lo que había en `resolve`:

```sql
WHERE "userId" = $1 AND ("instanceType" = 'Whatsapp' OR "instanceType" = 'whatsapp')
```

Y la línea por QR se guarda con **tres formas de la misma cosa**: `Whatsapp` /
`evolution` (nació en Evolution), **`waha`** —que es como nacen hoy las nuevas,
y a lo que se pasa al cambiar de proveedor— y `NULL` en las antiguas. De ahí el
«funcionaba y dejó de funcionar»: **cambiar de proveedor no crea una línea
nueva, cambia el `instanceType` de la MISMA fila**, así que la configuración se
quedó donde estaba y este filtro dejó de verla el día del cambio, sin un solo
error en ninguna parte. Es literalmente lo que la sección de arriba mide en
producción: **10 de 31 cuentas con línea por QR** eran invisibles para ese
filtro, y de las que además tienen número de llamadas, **5 de 8**.

Y un segundo desacuerdo, más callado: con dos casings el backend podía
encontrar **otra** fila. Una cuenta con su línea en `waha` (id 5, donde la App
escribió) y un resto de Evolution (id 9) daba id 5 en la App y id 9 aquí:
configuración a un lado, lectura al otro, y el asistente «apagado» sin que
nadie lo hubiera apagado.

> **La regla es la MISMA que la de la App, y es una función pura**
> (`src/modules/voicebot/linea-del-asistente.ts` en el backend, copia exacta de
> `esLineaDeWhatsappQr`): no «¿qué proveedor tiene?», sino «¿la tiene?». Se
> traen las filas de la cuenta y manda la **primera por QR ordenada por `id`**,
> que es exactamente la que elige `laLineaDeWhatsappDeLaCuenta` del otro lado.
> Y se filtra **en TypeScript, no con una lista de casings en SQL**: una lista
> de tipos en el `WHERE` es una lista de cómo se escribieron.

El orden por `id` **no se toca**: es el que ya usaban las dos mitades, así que
las cuentas a las que hoy les funciona siguen leyendo la misma fila. Cambiarlo
movería su configuración a otra línea sin decirlo.

##### La FAMILIA se mira, y solo cuando no hay línea propia

Era la hipótesis del reporte y **no era la causa de este caso** —la cuenta que
lo sufría tiene su propia línea— pero es un hueco real de la misma familia: a
una cuenta se llega por dos caminos y solo uno deja rastro en la fila, así que
la cuenta dueña de la sesión de llamadas puede no ser la que tiene la línea. Se
cierra con la misma malla de `linked_accounts` del #812 (recursiva, en los dos
sentidos, con su tope), y el respaldo es **estrictamente aditivo**:

1. **Si la cuenta tiene alguna línea por QR, manda la suya**, encendida o
   apagada. Un «apagado» explícito **nunca** lo pisa una cuenta hermana: eso
   sería el fallo contrario y peor —el asistente llamando a clientes desde una
   cuenta donde alguien lo apagó a mano—.
2. Solo cuando **no tiene ninguna** se busca en la familia una encendida.

Así esto no puede cambiar el comportamiento de ninguna cuenta a la que hoy le
funcione: únicamente convierte en llamada lo que hoy es un aviso. Y **la
familia solo se consulta en ese caso**: el camino común no paga ni una consulta
de más.

##### El aviso era un cajón de sastre, y por eso se buscó en la pantalla equivocada

`disabled` lo decían **seis** condiciones distintas: la línea no se encontraba,
el asistente estaba apagado, el secreto no coincidía, la URL venía sin `sid`,
el backend no contestaba y la respuesta llegaba sin clave de OpenAI. Las seis
mandaban a encender un interruptor que ya estaba encendido.

- El backend distingue `no_line` de `disabled`, y contesta `bad_secret` y
  `no_sid` donde antes devolvía `{ enabled: false }` a secas —y sin `reason`
  wacalls cae en su valor por defecto, que era `disabled`—.
- wacalls **ya no inventa `disabled`**: sus dos respaldos son `sin_respuesta`
  (no se pudo preguntar) y `no_openai_key`, y escribe el motivo en su registro.
- Y la App les da a los siete sus palabras. **Un aviso que nombra una condición
  que se cumple es peor que no decir nada**: manda a tocar lo que ya estaba
  bien, que es exactamente lo que costó este.

De paso, el interruptor de la tarjeta **deja de mentir**: se pintaba al momento
y no se devolvía si el guardado fallaba, así que la tarjeta decía «activo» y la
llamada decía «actívalo». Ahora vuelve a su sitio con su aviso, igual que al
eliminar un chat.

##### El banco: `scripts/banco-voicebot.sh`, y son dos mitades

- **La decisión**, pura y sin base (`linea-del-asistente.spec.ts`, en
  `npm test`): las tres formas del tipo, la fila que gana con un resto de
  Evolution al lado, y las dos mitades del respaldo de familia.
- **Los dos caminos de verdad**, contra Postgres
  (`__banco__/llamar-con-ia.banco.ts`): `VoicebotService.resolve` y
  `StageAutomationService.doAiCall` **reales**, con `Instancias`, `User` y
  `linked_accounts` sembradas. Cubre los cuatro casos del encargo —desde la
  madre con el asistente en la hija, desde la propia hija, el disparo
  automático por cambio de etiqueta, y el aviso legítimo cuando de verdad está
  apagado o no hay línea por QR—. Del automático se afirma **a qué sesión de
  llamadas se habló**: el mismo `sid` y el mismo endpoint que el botón, que es
  lo que prueba que la puerta es una.

Los dos corren en **dos modos**, y el roto lleva **la consulta vieja escrita
dentro**: sobre esas mismas filas no encuentra nada, que es el aviso que se
reportó. Sin ese modo no se sabría si el verde del otro es que se arregló la
causa o que el caso no se llega a ejercer.

Y el banco de base **apaga las comprobaciones de tipos de ts-jest**, a
propósito y dicho en su cabecera: `npm test` tiene hoy seis suites en rojo por
errores de tipo **preexistentes** en `ai-agent.service.ts`, y `VoicebotService`
lo arrastra por la cadena de dependencias. Sin apagarlas, este banco se pondría
rojo por algo que no tiene nada que ver con lo que prueba. (`uuid` 14 es ESM
puro y jest corre en CJS: por eso el banco lo mapea a un CJS de una página —es
lo mismo que tumba esas seis suites, y aquí solo hace falta que el módulo
cargue.)

## Evolution esconde el motivo en `response.message`

«Error al crear la instancia en la API», y nada más. El servidor sí había dicho
por qué; la App no lo leía.

Un rechazo de Evolution viene así:

```json
{ "status": 403, "error": "Forbidden",
  "response": { "message": ["This name \"X\" is already in use."] } }
```

`raw.message` —lo que se miraba— **viene vacío**, así que el aviso caía siempre
en el texto por defecto. Un botón que falla y no dice por qué, que es justo lo
que este documento prohíbe en su primera mitad.

El caso real: la línea **seguía existiendo en Evolution** y no tenía ficha en la
App, así que «Crear instancia» chocaba con el nombre ocupado. Con el motivo a la
vista se resuelve en un minuto; sin él fue una llamada.

Dos cosas:

1. **Quien sabe dónde esconde Evolution el motivo es uno solo**,
   `lib/motivo-de-evolution.ts`, y es puro. Mira el anidado, luego el de arriba y
   luego `error`, porque Evolution no siempre usa el mismo. Lo usan los dos
   caminos de creación y el de envío, que tenían la misma lógica copiada.
2. **El nombre ocupado se explica en palabras que se puedan usar**: la línea
   existe en el servidor pero no tiene ficha, y no se creó ninguna. Decir
   «Forbidden» es tan poco útil como no decir nada.

## El texto roto no se arregla en la conexión: ya está en los caracteres

En la herramienta de Google Sheets se leía `hoja de cÃ¡lculo pÃºblica`. El
primer impulso es mirar la codificación de la base, el driver o las cabeceras.
**No era nada de eso**: el texto ya estaba roto **en el código fuente**. Cinco
ficheros se guardaron con sus bytes UTF-8 leídos antes como si fueran de un
juego de un byte, y de ahí se copió a todas partes.

Para la base, para la API y para el navegador, `Ã¡` son dos letras válidas y
todos las transportan perfectamente. Por eso **no hay nada que configurar**: lo
único que se puede hacer es volver a los bytes originales.

Y no era cosmético. La descripción de cada herramienta se le pasa al modelo tal
cual (`description: cfg.toolDescription`, en `ai-agent.service.ts` del backend),
así que **el agente venía leyendo eso**.

Cuatro cosas que hay que mantener:

1. **Quien decide es un viaje de ida y vuelta, no un vistazo.**
   `lib/texto-doblemente-codificado.ts` solo repara lo que, convertido otra vez
   a bytes y decodificado como UTF-8, **vuelve a ser válido y distinto**. Un
   texto sano no pasa la prueba y se queda como está. Eso importa porque esto se
   ejecuta sobre datos de clientes.
2. **Son tres juegos, no uno.** Los acentos vuelven con `latin-1`; los emojis
   solo con `cp1252` (su forma rota lleva `Å¸`, `â€œ`, que latin-1 no tiene); y
   un emoji compuesto como `🧑‍💼` lleva dentro un ZWJ cuyos bytes incluyen
   `0x8D`, **que cp1252 no tiene y latin-1 sí**. Con un solo juego esa línea no
   se puede deshacer entera.
3. **La reparación de la base busca, no adivina.**
   `/api/admin/reparar-codificacion` recorre **todas las columnas de texto** de
   todas las tablas con clave `id` y pregunta cuáles traen las señales. Una lista
   de tablas escrita a mano se queda corta el día que alguien añada una columna.
   Va en dos pasadas y la primera **no toca nada**: sin parámetros da el informe,
   y solo con `?aplicar=si` escribe.
4. **Y se limpia también al guardar**, con la misma función. Si no, vuelve a
   entrar por la puerta de al lado.

Cómo se comprueba que no queda nada, sin desplegar: buscar en el repo texto que
se pueda reparar. Si alguna línea vuelve a ser distinta al repararla, está rota.

## Una lista de líneas sale de `Instancias`, no de las credenciales de quien mira

`getAvailableInstances` —el desplegable de «Línea que lo envía» de Panel ›
Notificaciones— llamaba a `fetchInstances` con la `ApiKey` **de quien mirara**.
Con el rol de superadministrador viviendo en otra fila —otra `apiKey`, otro
servidor— el desplegable pasó de ~30 líneas a **7**, `VERZAY_NOTIFICACIONES`
salía con punto gris y sin aparecer en la lista, y la prueba de envío rebotaba
con «No tienes acceso a la instancia X» porque validaba contra esa lista corta.

Es la misma regla que ya rige en *Actividad de instancias*: **el universo sale de
`Instancias`, nunca del proveedor.** El estado de conexión se cruza **aparte**,
preguntando una vez por cada par `(url, key)` distinto, en paralelo y
best-effort. Una línea cuyo servidor no conteste **sale igual**, con `unknown`:
el punto queda gris y se puede seguir eligiendo. Perder el color es un detalle;
perder la línea era el fallo.

## Rellenar el historial de una línea: no duplicar y no partir la conversación

Lo que el dueño escribía desde su teléfono no se guardaba (lo arreglaron
api-webhook#174 y #175), pero Evolution y Waha sí lo tienen en su propia base.
`lib/relleno-de-historial.server.ts` lo trae, y se lanza sobre cualquier línea
desde `/api/admin/rellenar-historial` (solo superadministrador de verdad o la
clave interna):

```
POST { linea, jid }                  revisa UN chat, sin escribir
POST { linea, jid, escribir: true }  rellena ese chat
POST { linea, todos: true }          la línea entera, de fondo (202)
GET  ?linea=X                        cómo va
```

Lo que decide vive en `lib/relleno-de-historial.ts`, puro, y son dos reglas:

1. **Un mensaje ya está si su id de WhatsApp está en la línea bajo CUALQUIERA
   de las identidades del contacto**, comparando el id CRUDO (`idDeWhatsapp`,
   ahora en `lib/`) y `fromMe`. Waha lo serializa y Evolution lo da pelado, y
   una línea que cambió de proveedor tiene las dos formas.
2. **Lo que falta se escribe donde YA VIVE la conversación** (la identidad con
   más filas), no donde lo diga el proveedor. Un chat guardado bajo su `@lid`
   y devuelto por su número se partiría en dos: es exactamente lo que hace el
   relleno ingenuo de volver a pasar todo por `persistEvolutionMessages`, y lo
   que el `MODO=roto` del banco afirma. Y bajo un `@lid` se escribe SIN alias de
   teléfono: `persistChatMessage` se queda con el primero que vea.

Tres cosas del recorrido:

- **En serie y con pausas** (`PAUSA_ENTRE_CHATS_MS`, `PAUSA_ENTRE_PAGINAS_MS`):
  la línea sigue atendiendo y su proveedor no recibe una ráfaga.
- **El avance vive en `relleno_de_historial`**, no en la promesa: un despliegue
  se lleva el proceso, no el avance, y relanzarlo sigue por el chat siguiente
  (por jid, no por posición). Uno que dice «corriendo» sin latido en
  `SIN_LATIDO_MS` se da por interrumpido. Dos lanzamientos a la vez: gana uno,
  lo decide un `INSERT … ON CONFLICT … WHERE` en una sola sentencia.
- **Los adjuntos vienen sin archivo** —«[Imagen]» con su pie—, igual que el
  historial de Waha al abrir un chat. Y el tope por chat son 5.000 mensajes; uno
  más largo se cuenta en `chatsRecortados`.

### Un id de WhatsApp ya guardado en la línea NO se vuelve a escribir, bajo ninguna identidad

La primera pasada sobre RCA (`MULTIGAMA_SA`, 2026-09-24) escribió 11.893
mensajes y **129 salieron repetidos**. Dos causas, y las dos eran de mirar
solo las identidades que da el proveedor:

1. **El puente estaba en una sola fila.** Un chat abierto por su `@lid` tenía
   su historial viejo bajo el número, y lo único que los unía era el
   `remoteJidAlt` de una fila: se veían 24 de 324 mensajes y se reescribía el
   resto. `filasCerradas` sigue ese puente hasta cerrarlo (nunca en un grupo:
   su `senderPn` es quien escribió).
2. **Sin puente ninguno.** Waha listaba al mismo contacto dos veces —por su
   número y por su `@lid`— y devolvía el mismo mensaje en las dos, cada vez con
   su propio `from`. Nada en la base unía las dos. Así que ahora se cargan
   **una vez por línea** las llaves de todo lo que ya tiene
   (`llavesDeLaLinea`) y un id que ya está se da por guardado, venga bajo la
   identidad que venga. Un id de WhatsApp es único: no hace falta saber de
   quién es para saber que ya está.

Los dos casos están en el banco con la forma exacta de producción, y cada uno
se pone rojo si se quita su mitad del arreglo.

### Todas las líneas: en serie, y la del cliente primero a mano

`POST { todasLasLineas: true }` recorre **todas** las líneas por QR (Evolution
y Waha) con `rellenarLaLinea`, una detrás de otra y con
`PAUSA_ENTRE_LINEAS_MS` entre medias: nunca dos a la vez, que serían dos
ráfagas contra el proveedor. `GET ?todas=1` dice cómo va, y `GET ?buscar=RCA`
encuentra una línea por su nombre, el de su dueño, su empresa, su correo o su
número (con o sin indicativo) sin devolver los teléfonos.

1. **El avance vive en la misma tabla**, en la fila `RECORRIDO_DE_TODAS`
   (líneas en `chatsTotal`/`chatsHechos`, la que va en `ultimoChat`). Tras un
   despliegue, relanzarlo sigue por las que faltan.
2. **Se salta la que terminó en ESTE recorrido o hace menos de un día**
   (`lineasQueQuedan`, `RECIEN_TERMINADA_MS`): así se puede rellenar a mano la
   línea del cliente que reclama, mirar cómo quedó, y lanzar el resto sin
   repetirla.
3. **Cada chat hace latir también el recorrido de arriba** (`alLatir`): una
   línea larga tarda horas, y sin ese latido un segundo lanzamiento lo daría
   por muerto y correría en paralelo.
4. Una línea sin credenciales o ya en marcha **no corta** el recorrido: se
   cuenta en `chatsFallidos`, se dice en `ultimoError` y se sigue.

### Y lo que entra EN VIVO mientras corre también cuenta

Una línea grande tarda horas, y la foto de llaves se toma al empezar. Lo que la
IA o el cliente escriben mientras tanto no está en ella: AMERICA_PENSIONADO_ALIADO
dejó **8 repetidos** así —respuestas de la IA guardadas en vivo bajo un jid
pelado (`528711997020`, sin `@s.whatsapp.net`) que el relleno volvió a escribir
bajo el bueno—. Antes de cada chat se suma a las llaves lo que tenga
`messageTimestamp` desde el arranque menos `MARGEN_DE_LO_VIVO_MS`
(`sumarLoQueEntroEnVivo`), por el índice `(userId, instanceName,
messageTimestamp)`: no se relee la línea entera.

Lo del jid pelado es otro fallo, del backend al guardar la respuesta de la IA, y
está sin arreglar: parte la conversación en Chats.

### Y una línea que cambia de proveedor a mitad se CORTA, no se quema

El proveedor se elige al empezar la línea. AUDFONOS_IPS pasó de Evolution a
Waha a mitad del recorrido: su instancia desapareció de Evolution, cada
`findMessages` contestó `404`, y el recorrido siguió **contando 2.000 chats
como fallidos sin escribir una línea en el registro**, porque un chat que el
proveedor no devuelve no lanzaba nada. Desde fuera parecía una línea que iba
bien.

Ahora un chat sin respuesta **se dice** (`[relleno] el proveedor no devolvió el
chat`), y `TOPE_DE_FALLOS_SEGUIDOS` (25) seguidos cortan la línea como
`fallido`, con el motivo en `ultimoError` —si cambió de proveedor, lo nombra—.
El recorrido de todas sigue con la siguiente; esa línea se relanza a mano.

Lo prueba `scripts/banco-relleno-de-historial.sh` contra Postgres, con
`persistChatMessage` de verdad y solo la red fingida (el proveedor se arma con
los mismos traductores, `traidoDeEvolution` y `traidoDeWaha`).

## Correo: un canal APARTE de Chats, y de UNA persona

`/correo` lee la bandeja de entrada, abre un correo con sus adjuntos y lo
responde, por **Gmail**, **Outlook** o un **correo de dominio propio**
(IMAP + SMTP). Nada más en esta versión: ni carpetas, ni borradores, ni
enviar uno nuevo.

**Lo que había, y conviene saberlo antes de decir «como Calendario»:** Google
Calendario y Hojas de cálculo **no** se conectan con un botón: usan una
**cuenta de servicio** (`GOOGLE_SERVICE_ACCOUNT_JSON`) con la que el cliente
comparte su calendario u hoja. Para leer el correo de alguien eso no existe,
así que el botón de autorización (OAuth) se escribió de cero y **necesita dos
parejas de llaves nuevas en el stack**:

| variable | para |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | «Conectar Gmail» |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | «Conectar Outlook» |

La dirección de vuelta que hay que registrar en Google Cloud y en Azure es
`https://<dominio>/api/correo/oauth/gmail` y `…/oauth/outlook`. **Sin las
llaves el botón sale apagado y dice por qué** (`hayLlavesDe`); el dominio
propio funciona sin nada.

**Gmail está encendido en producción** (2026-09-27): las dos llaves de Google
están en el stack de Portainer (`agente-app`), y la vuelta
`https://agente.ia-app.com/api/correo/oauth/gmail` está registrada en Google.
Outlook sigue apagado hasta que se carguen las suyas. Lo comprueba
`scripts/banco-gmail-oauth.sh`, con las credenciales pasadas por el ENTORNO:
que Google acepta esa vuelta y ese secreto (un código inventado da
`invalid_grant`, que solo sale con el cliente autenticado) y que el servicio y
sus contenedores vivos llevan las dos llaves. **Cambiar el secreto en Google
obliga a cambiarlo en el stack**: si no, el botón sale encendido y la vuelta
falla con `invalid_client`.

Cinco reglas que hay que mantener:

1. **El correo NO pasa por el camino de Chats.** No se guarda ni un mensaje:
   la tabla `correo_cuentas` guarda la CONEXIÓN y los correos se leen del
   proveedor al abrir. Así es imposible que un correo cree una ficha de lead,
   entre en el reparto automático o salga en la bandeja de otro. El barrido del
   banco falla si un fichero de Correo nombra `persistChatMessage`,
   `chat_messages`, `Session`, el reparto o las acciones de Chats, y la mitad de
   Postgres cuenta las filas de esas tablas antes y después.
2. **Es de la PERSONA que lo conectó, y de nadie más** —ni el dueño de la
   cuenta, ni un administrador, ni el súper administrador—. Toda consulta de
   `correo_cuentas` lleva `"personaId" = ${personaId}` en el `WHERE` (lo exige
   el barrido), la persona sale de la sesión (`laPersonaQueActua`) y ninguna
   acción acepta un `userId`. Con el id del buzón de otro se contesta lo mismo
   que con uno inventado. Dentro de otra cuenta con «Ingresar» se ve el PROPIO.
3. **Las credenciales van selladas** (AES-256-GCM, `lib/correo-cifrado.server.ts`)
   con una llave derivada de `AUTH_SECRET`: sin variable nueva. Si
   `AUTH_SECRET` cambia, los buzones piden volver a conectar.
4. **Abrir un correo lo MARCA como leído, y eliminar lo manda a la PAPELERA,
   igual en los tres** (ver *Correo: abrir marca leído, y eliminar es a la
   papelera*, abajo). Traer el correo y marcarlo son dos pasos: bajar un
   adjunto o preparar una respuesta leen el original y no marcan nada.
5. **El HTML de un correo se pinta en un `iframe` con `sandbox` sin
   `allow-scripts`, y con su CSP dentro** (`elDocumentoDelCorreo`): dos
   cerrojos. Y a quién va una respuesta lo decide el SERVIDOR leyendo el
   original (`Reply-To` o el remitente): el navegador manda el texto y el id.

**En el menú**: la ruta entra en el desplegable de «Editar módulo», justo
detrás de `/chats`, con el icono `EnvelopeIcon`, y **no se monta en ningún
módulo**: se asigna a mano, como `/cobros`. La conexión vive en la propia
pantalla y no en Conexiones: aquella es de las líneas de la CUENTA y el correo
es de una persona.

### La vuelta de autorización que «no hace nada»: el error se QUEDA en pantalla

El 2026-09-27 se autorizó Gmail entero y la pantalla volvió a «Conecta tu
correo» sin buzón y sin error a la vista. El registro del contenedor decía:

```
[correo] no se pudo terminar la autorización gmail ErrorDeCorreo: Gmail API has
not been used in project 821244703851 before or it is disabled.
```

O sea: **la API de Gmail estaba apagada en el proyecto de Google Cloud**. Eso no
se arregla en el código —se habilita en APIs y servicios › Gmail API— pero el
fallo se veía como nada porque el motivo salía **en inglés y en un toast que se
va a los cuatro segundos**, abajo a la derecha.

> **Por qué no se conectó se traduce a qué hacer** (`elMotivoLegible`, en
> `lib/correo.ts`, puro) **y se queda puesto encima de los botones de conectar**
> hasta cerrarlo (`aviso` de `ConectarCorreo`). Con un buzón ya conectado, se
> abre «Conectar otro correo» con el MISMO aviso: los dos sitios con botones lo
> enseñan igual, con la forma de `AVISO_DEL_CORREO`. Lo que no se reconoce se
> enseña tal cual: inventar un motivo es peor.

Lo prueba `scripts/banco-correo.sh`: reglas y barrido, las acciones y las rutas
contra Postgres con Gmail y Outlook fingidos en el `fetch` e IMAP/SMTP en el
socket, y la pantalla en Chromium. `MODO=roto` afirma el diseño ingenuo: un
buzón buscado por su id a secas se lo entrega a cualquiera.

### Abrir marca leído, y eliminar es a la papelera

Al abrir un correo se quedaba «sin leer» en el buzón, y no había forma de
eliminarlo. No era un fallo de la pantalla: era la regla de la primera versión
(«leer no cambia nada»), con los permisos pedidos a juego —Gmail
`gmail.readonly`, Outlook `Mail.Read`, IMAP abierto siempre en solo lectura—.

> **Abrir marca, en los tres; eliminar manda a la papelera, en los tres.**
> Gmail quita la etiqueta `UNREAD` y usa `trash`; Outlook pone `isRead` y mueve
> a `deleteditems`; IMAP pone `\Seen` y mueve a la carpeta `\Trash`
> (`laPapeleraImap`). **Nunca un borrado definitivo** —ni `DELETE`, ni
> `mail.google.com`—, salvo un servidor IMAP sin papelera, y entonces
> `aLaPapelera: false` lo dice y la confirmación lo avisa antes.

Cinco cosas que hay que mantener:

1. **Los permisos son `gmail.modify` y `Mail.ReadWrite`**, los más estrechos
   que dejan marcar y mover a la papelera. `losPermisosAlRenovar` repite los
   mismos al renovar el token de Microsoft.
2. **Un buzón conectado con los permisos VIEJOS sigue leyendo y respondiendo.**
   El 403 por falta de permiso (`esFaltaDePermiso`) no lo deja en «volver a
   conectar»: abrir enseña el correo con `leido: false` y eliminar rebota, los
   dos con `MOTIVO_SIN_PERMISO_PARA_ORGANIZAR` y su botón de volver a conectar.
   **Quien conectó Gmail antes de esto tiene que volver a conectarlo** para
   marcar y eliminar; y el proyecto de Google Cloud tiene que tener
   `gmail.modify` en la pantalla de consentimiento.
3. **Marcar no puede tumbar la lectura**: va en su propio `try` dentro de
   `leerCorreoAction`, y no es mudo. La acción recibe `estabaSinLeer` para no
   pedir marcar uno ya leído; no decide ningún acceso.
4. **La lista se pinta al momento**: el punto de «sin leer» se quita al abrir y
   la fila se quita al eliminar, ANTES de que el proveedor conteste; si dice que
   no, el punto vuelve y el correo vuelve a SU sitio (`conLeido`, `sinElCorreo`,
   `devolverElCorreo`, puras). Es la regla de eliminar un chat.
5. **Se elimina desde la fila de la bandeja** (la papelera sale al pasar el
   ratón, como botón HERMANO del de abrir: un botón no va dentro de otro) **y
   desde el correo abierto** (que es por donde se elimina en un teléfono). Los
   dos pasan por la MISMA confirmación y el mismo `eliminar`.

Lo prueba `scripts/banco-correo.sh` en sus tres mitades; `MODO=roto` lee los
ficheros de `ANTES_REF` (dc71d09) y afirma que no se marcaba ni se eliminaba.

### La bandeja UNIFICADA: todos los buzones en una lista, y cada correo dice de cuál llegó

Con varios correos conectados había que cambiar de buzón en buzón con el
desplegable. Ahora el desplegable abre con **«Todas las bandejas»**, y es lo que
se ve por defecto en cuanto la persona tiene más de uno (con uno solo no se
ofrece: sería el mismo buzón dos veces). Lo recordado vive en `correo:vista`
—llave nueva a propósito: con la vieja, quien ya tenía varios correos se habría
quedado en su último buzón suelto sin descubrir la unificada—.

> **Es LA MISMA pantalla con otra lista dentro**: la misma fila, el mismo
> filtro, la misma lectura, la misma confirmación de eliminar y la misma barra
> de responder. Lo único propio de la unificada es la marca de buzón en cada
> fila, que es la de Chats (`InsigniaDeLinea`, con `palabra` =
> `laPalabraDelBuzon`: lo de antes de la arroba, o el dominio si dos buzones
> comparten esa parte). Con un buzón a la vista no se pinta: sería repetir su
> nombre en cada fila.

Cinco cosas que hay que mantener:

1. **Un correo se identifica por su LLAVE, con el buzón delante**
   (`laLlaveDelCorreo`). Un UID de IMAP es un número pequeño y dos buzones
   tienen los dos el «7»: por el id a secas, abrir uno marcaba el otro. Abrir,
   responder, bajar un adjunto y eliminar van **al buzón DEL correo**, no al que
   se esté mirando.
2. **`bandejaUnificadaAction` pide todos a la vez con `Promise.allSettled`** y
   dice de cada buzón si llegó o por qué no: uno que pide volver a conectar no
   vacía la bandeja de los demás, y el aviso nombra la dirección. La lista de
   buzones sale de `losBuzonesDe(persona)`, **nunca del navegador**: un cursor
   para un buzón ajeno se ignora.
3. **Lo cargado se guarda POR BUZÓN y la lista se mezcla con
   `laBandejaUnificada`**, que tiene un HORIZONTE: lo más viejo que todavía
   podría quedar por debajo de lo que otro buzón no ha traído espera oculto. Sin
   eso, «Cargar más» metería correos de anteayer por ENCIMA de los de hace un
   mes que ya se veían, y la lista cambiaría de orden debajo del dedo. Cargar
   más pide solo la página siguiente de los buzones que la tienen.
4. **El filtro es «Todos · Sin leer · Leídos»**, con las pastillas de Chats
   (ver la sección de abajo), y vale igual en la unificada y en un buzón.
   Filtra lo cargado, como el buscador.
5. **Nada de esto toca Chats ni guarda correos**: sigue siendo leer del
   proveedor al abrir.

Lo prueba `scripts/banco-correo.sh`: la mezcla, la llave y el filtro sin red;
`bandejaUnificadaAction` contra Postgres (otra persona no lee ni pidiendo por
id, un buzón revocado no tumba a los otros); y la pantalla en Chromium con dos
buzones que comparten un id de correo. `MODO=roto` lee la pantalla de un commit
pinchado (`ANTES_DE_LA_UNIFICADA`) y afirma que no había unificada, ni marca,
ni filtro de leídos.

### El selector y el filtro son LOS de Chats, no unos parecidos

El selector de bandejas era un `<select>` nativo —otro alto, otro borde y una
lista que pinta el sistema operativo— y el filtro, el grupo de botones pequeños
de Llamadas. Puesto al lado de Chats no se leía como la misma plataforma.

> **Las dos piezas se sacaron de Chats a `components/shared/` y ahora las
> pintan las dos pantallas**: `SelectorDeCanal` (el «Todos ▾» de canales,
> aquí «Todas ▾», con su panel: título, fila de «todos», raya y una fila por
> opción con su marca) y `PastillaDeFiltro` (la forma, los huecos que ceden y
> la insignia, con sus tonos: `TONO_TODOS`, `TONO_SIN_LEER`… y `TONO_LEIDOS`,
> verde, que en Chats no existe). Chats no cambió de aspecto: dejó de llevar
> su copia.

Cuatro cosas que hay que mantener:

1. **El panel nace como el de canales** (`usePanelFlotante("columnaAncha")`),
   así que Correo lleva `MARCA_DE_LA_COLUMNA` en su raíz y
   `MARCA_DE_LA_CABECERA_DE_LA_COLUMNA` en la barra: el panel sale colgado del
   botón, justo debajo de la barra y con el ancho común de los filtros.
2. **El selector va delante del buscador**, como en Chats; las pastillas, en
   **su propia fila debajo**, en TODAS las anchuras —como la fila de pastillas
   de Chats bajo la del buscador—, arrancando en el mismo filo. Estuvieron en
   el carril de la barra en computador y abajo solo en el teléfono: la misma
   pantalla con dos formas.
3. **Los números de las pastillas son de lo CARGADO** (`losNumerosDelFiltro`):
   con páginas por traer llevan un «+» —«al menos»—. En cero no hay insignia,
   como en Chats. **Las filas del selector SÍ llevan número, y es otro**: el
   total de la bandeja de entrada según el PROVEEDOR (`totalesDeLosBuzonesAction`:
   `labels/INBOX` en Gmail, `mailFolders/inbox` en Outlook, `STATUS` en IMAP),
   nunca el largo de lo cargado. Un buzón que no contesta va SIN número —nunca
   un 0—, y «Todas» es la suma solo si se saben todos (`losNumerosDeLasBandejas`).
   Archivar o eliminar le resta uno al momento.
4. **Ninguna fila ni rótulo dice el proveedor** («Gmail», «Outlook»): la
   dirección ya lo dice por su dominio. Una sola línea por bandeja.
5. **Llamadas conserva su `GrupoDeOpciones`**: esto solo toca Correo y Chats.

Lo prueba `scripts/banco-correo.sh`: el barrido y los números sin navegador, y
en Chromium la pantalla de Correo con la cabecera REAL de Chats pintada al
lado, comparando alto, radio, borde, letra y colores del selector y de las
pastillas, y que el panel se despliega hacia abajo colgado de su botón.
`MODO=roto` lee Correo de un commit pinchado (`ANTES_DE_LOS_MANDOS`) y afirma
el `<select>` y el grupo de botones.

### La barra de arriba ES la de Chats: va DENTRO de la columna

Correo pintaba su barra con `BarraDeAcciones`, de lado a lado de la pantalla:
el buscador salía estirado y el filtro («Buscar en») iba metido DENTRO del
buscador, con otro tamaño y otro glifo. Chats la lleva en la cabecera de su
COLUMNA, así que el buscador sale angosto y los iconos son cajas de 28 px.

> **La cabecera de la lista va dentro de `[data-lista-de-correos]` y se pinta
> con las MISMAS piezas que la de Chats**, todas en `lib/cabeceras-de-chats.ts`
> y `components/shared/`: `CABECERA_DE_LA_COLUMNA` (82 px, 78 en computador:
> la raya cae con la del correo abierto), `FILA_1_DE_LA_COLUMNA` (selector,
> `BuscadorDeLaColumna` y los iconos), `FILTRO_DE_LA_COLUMNA` (el embudo
> redondo, aquí «Buscar en»), `BOTON_DE_LA_COLUMNA` (actualizar y «⋯») y
> `PASTILLAS_DE_LA_COLUMNA` (repartidas de borde a borde). Chats, su puente
> (`CachedSidebar`) y Correo las importan: no hay copias que se queden atrás.

Con un solo buzón el selector es el título «Correo», como «Chats» con una sola
línea. Lo prueba `scripts/banco-barra-de-correo.sh`, en Chromium con las dos
cabeceras pintadas en la misma página y comparadas pieza por pieza a
1440/1280/1024/390; `MODO=roto` pinta la barra de `ANTES_REF` y afirma el fallo.

### Tan completo como Chats: la cabecera, anclar, destacar, archivar, reenviar y la barra de Chats

Correo pasó a tener lo que un buzón necesita a diario, con **las piezas de
Chats y no unas parecidas**, y solo los mandos que tienen sentido en un correo.

| qué | dónde vive | de quién es la marca |
| --- | --- | --- |
| marcar como **no leído** | el propio buzón (`UNREAD`, `isRead:false`, quitar `\Seen`) | del proveedor |
| **destacar** | la estrella de Gmail, la bandera de Outlook, `\Flagged` | del proveedor: se ve igual en el móvil |
| **archivar** | Gmail quita `INBOX`; Outlook mueve a `archive`; IMAP a `\Archive` (y la crea si falta) | del proveedor. **Nunca borra** |
| **anclar** arriba | `correo_anclados`, tabla de la App | de la PERSONA: ningún proveedor ancla |
| **reenviar** | `forward` en Outlook; en Gmail e IMAP se compone con los archivos del original | — |
| la **firma** | `correo_cuentas.firma` + `firmaActiva`, por buzón | de la persona, y la pone el servidor |
| la **sugerencia de la IA** | `lib/sugerencia-de-correo.server.ts`, la IA de la cuenta, como en Chats | — |

Seis cosas que hay que mantener:

1. **La lectura es `LecturaDelCorreo.tsx`, con la cabecera de los paneles de
   Chats** (`CABECERA_DEL_PANEL`, 78 px, controles de 28): remitente y asunto,
   y Responder · Reenviar · No leído · Destacar · Eliminar, con Anclar y
   Archivar en el «⋯». La fila de la bandeja lleva Archivar, Eliminar y el
   mismo «⋯» al pasar el ratón; en un teléfono todo está en la cabecera.
2. **La barra de responder es la de Chats** (`MARCO_DE_LA_BARRA`,
   `ZonaDeHerramientas`, `BotonesDeLaDerecha` con `conNota: false`,
   `useAltoDeLaCaja`, `useSpeechDictation`, `AttachmentMenu` y
   `SuggestedReplyBar`, que se mudó a `components/shared/`). **Fuera** lo que
   es de WhatsApp: emojis, formato, notas de voz, respuestas rápidas, notas
   internas y macros. En un correo Enter es un salto de línea: se manda con
   Ctrl+Enter.
3. **Anclar guarda una FOTO que sale del proveedor**, no del navegador, y la
   lista la pinta arriba aunque ese correo no esté en la página cargada
   (`conLosAncladosArriba`); si está cargado manda lo cargado. Archivar o
   eliminar lo desanclan. Toda consulta de `correo_anclados` lleva el
   `personaId` (el barrido lo exige, como en `correo_cuentas`).
4. **Reenviar es lo único donde el destinatario llega del navegador**, y se
   valida en el servidor (`comoDestinatarios`: direcciones de verdad, sin
   repetir, tope 20). Responder sigue sin aceptarlo. El original se vuelve a
   leer del proveedor, con sus archivos, y va debajo de lo escrito.
5. **Los archivos que se mandan** pasan por `comoAdjuntosParaEnviar` (base64 de
   verdad, 10 como mucho, 25 MB entre todos contando los del original). Se
   adjuntan con el clip o **pegando** en la caja.
6. **Lo que se hace sobre una fila se pinta al momento** y vuelve si el
   proveedor dice que no: destacar, no leído, archivar y eliminar, como borrar
   un chat. Y el buscador tiene **campo** —todo, remitente o asunto—, que se lee
   en el propio `placeholder` (`pasaLaBusqueda`, sin acentos).

La etiqueta de buzón en la bandeja unificada ya existía y no cambió.

Lo prueba `scripts/banco-correo.sh`: las reglas y el barrido, las acciones de
los tres proveedores contra Postgres (otra persona no marca, no destaca, no
archiva, no reenvía, no ancla ni cambia la firma de un buzón ajeno) y la
pantalla en Chromium a 1440/1280/1024/390. `MODO=roto` lee el Correo de un
commit pinchado (`ANTES_DE_LO_COMPLETO`) y afirma que nada de esto existía.

### Redactar un correo NUEVO: el tercer envío, por el mismo camino

Solo se podía responder o reenviar. Ahora se redacta desde cero: «Nuevo
correo» es la primera opción de la flecha «⌄» —igual que «Nuevo mensaje» en la
flecha de Chats— y del «⋯» de la columna. **No va como un icono más en la fila
del buscador**: con un cuarto icono el buscador sale más angosto que el de
Chats y `banco-barra-de-correo.sh` lo caza. Se abre **en el sitio del correo abierto y con su anatomía**
(`RedactarCorreo.tsx`): cabecera del panel (78 px) con «Correo nuevo» y el
buzón **desde el que sale** —elegible si hay varios; en la unificada nace en
el primero conectado—, «Para» y «Asunto» donde el abierto enseña sus
destinatarios, el cuerpo en el hueco del correo, y abajo la misma barra (firma,
clip, flecha azul; Ctrl+Enter manda). Redactar y leer no conviven: abrir uno
cierra el otro.

1. **`enviarCorreoNuevoAction` es responder y reenviar con otra forma**: el
   buzón por `elMio` (la persona en el WHERE; con el id del buzón de otro
   contesta «no está», súper administrador incluido), los destinatarios por
   `comoCorreoNuevo` → `comoDestinatarios` (la regla de reenviar), los archivos
   por `comoAdjuntosParaEnviar` y la firma la pone el servidor. Hace falta a
   quién y algo que mandar (asunto, texto o un archivo), y la flecha se
   enciende con la MISMA regla (`hayAlgoEnElCorreoNuevo`).
2. **Los tres proveedores tienen `enviar`**: Gmail un MIME sin hilo por
   `messages/send`, Outlook `sendMail` (queda en Enviados) e IMAP su SMTP.
3. **Los archivos y la firma son UNA pieza** (`PiezasDeEscribir.tsx`:
   `useAdjuntosParaEnviar`, `AdjuntosParaEnviar`, `ControlDeLaFirma`), y la
   barra de responder la usa también. Estaban escritas dentro de la lectura.

Lo prueba `scripts/banco-correo.sh`: la regla y un barrido, los tres
proveedores contra Postgres, y la pantalla en Chromium (mide la cabecera y la
barra contra las de un correo abierto a 1440/1280/1024/390). `MODO=roto` lee
`16e81b7` y afirma que no había forma de redactar.

### Y la segunda vuelta: cuatro pastillas, la fila de Chats, selección y el panel que empuja

Siete cosas de la misma pantalla, y todas salen de la misma regla: **lo que en
Chats existe, en Correo se ve igual, no parecido**.

| | cómo va |
| --- | --- |
| **pastillas** | **Destacados · Todos · Sin leer · Archivados**, y al final la flecha «⌄» de Chats (`FLECHA_DE_LA_FILA`, que ahora pintan las dos) con Leídos, Con adjuntos, Anclados y «Seleccionar todos» |
| **panel lateral** | la bandeja es `data-chat-view` sin borde propio y monta `<MedidaDeChats />`: con Notas, Copiloto o Chat de equipo abierto, la regla de `globals.css` le reserva la franja y el panel cae justo en ella |
| **barra de responder** | `conVoz: false` y `dictado={null}`: ni nota de voz ni dictado. A la derecha, UNA flecha, siempre a la vista, con `disabled:opacity-100` —apagada con la caja vacía, pero con su azul entero— |
| **cabecera del correo** | cada mando con el color de su equivalente en Chats (`lib/mandos-del-correo.ts`: responder azul, reenviar índigo, no leído naranja, destacar ámbar, eliminar rojo, «⋯» pizarra) |
| **la fila** | `FilaDeCorreo.tsx`, con la anatomía de `ChatContactItem`: círculo de iniciales con la casilla encima, la hora de Chats (`formatTimeFromEpoch`: hoy la hora, antes la fecha) y, debajo del asunto, el chip «Nuevo» y la marca del buzón en la unificada |
| **al pasar el ratón** | archivar y eliminar entran EN EL FLUJO abriendo su sitio (`w-0 → group-hover:w-7`, como la estrella de Chats) y el «⋯» es un botón fijo: la hora se corre a la izquierda y la cuenta no se mueve. Nunca `absolute` encima |
| **selección múltiple** | la `BulkActionBar` de Chats —con `sustantivo` y dos mandos nuevos, `onStar` y `onArchivar`— en la cabecera de la columna, como en Chats |

Cinco cosas que hay que mantener:

1. **«Archivados» NO filtra lo cargado: es OTRA carpeta del proveedor**
   (`laCarpetaDelFiltro`). Gmail por búsqueda (`GMAIL_ARCHIVO`: `-in:inbox
   -in:trash -in:spam…`), Outlook su carpeta `archive` (la misma a la que va
   archivar) e IMAP la carpeta `\Archive` — sin ella, vacío, nunca un error.
   Lo cargado se guarda POR CARPETA (`porCarpeta`), así que volver a «Todos» no
   pide la bandeja otra vez; archivar deja el archivo por volver a pedir.
2. **Un UID de IMAP es por carpeta**, así que lo del archivo lleva prefijo
   (`idImapDelArchivo`, `partirIdImap`): el 7 del archivo no es el 7 de la
   entrada. Marcar, destacar o eliminar desde el archivo abren EL archivo, y lo
   archivado no se vuelve a archivar («Ese correo ya está archivado.»).
3. **El lote es UNA acción con la lista** (`correosEnLoteAction`), en serie,
   cada correo en SU buzón (`elBuzonDe(persona.id, …)`, nunca uno ajeno), y
   devuelve qué salió y qué no con su motivo. La pantalla lo pinta al momento
   (`conElLote`) y devuelve SOLO lo que falló (`devolverLosDelLote`). La
   selección cuenta solo lo que se ve (`laSeleccionVisible`), y en modo
   selección pulsar una fila la marca en vez de abrirla.
4. **Los números de las pastillas son de lo cargado**, con «+» si quedan
   páginas; «Archivados» va sin número hasta que se trae —nunca un 0—.
5. **La `BulkActionBar` es la de Chats y Chats no cambió**: `sustantivo` va con
   «chat/chats» por defecto, y los dos mandos nuevos solo se pintan si se pasan.

Lo prueba `scripts/banco-correo.sh`: las reglas y un barrido, las acciones
contra Postgres (Archivados en los tres proveedores y el lote, que no toca un
buzón ajeno) y la pantalla en Chromium —las cuatro pastillas y la flecha, los
chips, que al pasar el ratón nada tapa la hora ni la cuenta, la selección con
su barra, el panel que corre la columna y la barra de responder acabando donde
acaba el panel—. `MODO=roto` lee Correo de un commit pinchado
(`ANTES_DE_COMO_CHATS`, `aecdcef`) y afirma los fallos.

## Grabar una nota de voz AHÍ MISMO: un grabador para las seis pantallas que suben audio

Macros (acción «Enviar archivo»), el paso de nota de voz de los dos editores de
flujos (`/workflow` y el legado `/flow`, acción y seguimiento), Recordatorios,
Multiagenda › Recordatorios y la biblioteca de Seguimientos del CRM solo dejaban
**subir** un audio ya grabado. Ahora las seis llevan, al lado de subir —que se
queda—, **Grabar audio → Pausar / Reanudar → Detener → escuchar → Usar
grabación** (o «Grabar otra» / «Descartar»).

> **El grabador es UNO, `components/shared/GrabadorDeAudio.tsx`**, sobre el
> micrófono de siempre (`useAudioRecording`, el de Chats y el chat del equipo,
> que ganó `pauseRecording`/`resumeRecording` y un `error` legible). Los mandos
> de cada momento los decide `lib/grabador-de-audio.ts` (puro). Y **la
> grabación entra por el MISMO camino que un archivo elegido** en cada
> pantalla (`handleFile`, `uploadFileForAction`, `usarArchivo`): subir y grabar
> no pueden acabar guardándose de dos formas.

Cuatro cosas que hay que mantener:

1. **El archivo va SIN códecs en el tipo** (`audio/webm`, no
   `audio/webm;codecs=opus`, en `comoArchivoDeAudio`). La validación de los
   flujos compara contra una lista y con los códecs dentro rechazaba la
   grabación como «tipo de archivo no válido».
2. **Pausar no cierra el micrófono ni parte el archivo**, y el tiempo se para:
   la duración no cuenta la pausa. Detener sale siempre con el micrófono
   abierto, en pausa también.
3. **Sin permiso o sin micrófono se DICE** debajo del botón, no solo en la
   consola.
4. **Nadie graba por su cuenta**: el único `new MediaRecorder` es el del hook.
   Chats y el chat del equipo ya grababan y no cambian; los adjuntos de tareas
   y tickets (`BloqueDeAdjuntos`) no son notas de voz y no llevan grabador.

### Y sus botones llenan la caja, a partes iguales, en las tres etapas

Iban en un `flex-wrap` pegado a la izquierda y dejaban la derecha de la
tarjeta vacía (el paso «Nota de voz» de los flujos, Macros). Ahora son una
**rejilla de N columnas iguales** (`repeat(N, minmax(0,1fr))` en `style`, que
N cambia con la etapa y Tailwind no genera clases compuestas), el orden no
cambia y el tiempo va en su propia línea, centrado. La caja es un contenedor
de consulta: por debajo de 24rem —la tarjeta de un paso mide 300 px— con
varios botones el icono va ENCIMA del rótulo, porque tres rótulos con su icono
al lado no caben. Se pregunta a la CAJA, no a la ventana.

Lo prueba `scripts/banco-grabador-simetrico.sh`, con el componente real a
274/360/520 px y micrófono falso; `MODO=roto` monta el de `28daebd` y afirma
el hueco de la derecha.

Lo prueba `scripts/banco-grabador-de-audio.sh`: la regla, un barrido de las
seis pantallas y el grabador real en Chromium con micrófono falso (pausa que
para el tiempo, archivo que aceptan los dos editores, y el aviso sin permiso).
`MODO=roto` lee las pantallas y el hook de `ANTES_REF` y afirma que ninguna
podía grabar ni pausar.
