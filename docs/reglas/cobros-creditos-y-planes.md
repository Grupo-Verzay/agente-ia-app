# Cobros, créditos de IA, planes y facturación

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## Renovación mensual: una columna que se pisa no tiene historia

Los ingresos mensuales dicen cuánto entró. Lo que no se veía es **si se está
fugando gente**: la cuenta que no paga se desactiva y al mes se elimina, y uno
se enteraba mirando cuenta por cuenta.

La medida es del último mes **cerrado**: de las cuentas cuyo vencimiento caía
en él, cuántas siguieron. El mes en curso va a medias —quien vence el 28
todavía no ha tenido ocasión— y medio mes siempre parece otra cosa de lo que
fue; es el mismo criterio con el que la vigilancia juzga ayer y no hoy.

**Y el dato histórico NO existía.** `UserBilling.dueDate` es una sola columna
que se pisa: al cobrar, `setUserBillingDueDateInternal` la mueve al mes
siguiente y la fecha vieja desaparece. Se miraron las otras fuentes posibles y
ninguna sirve:

| Dónde | Por qué no |
| --- | --- |
| `FinanceTransaction` | `createPaymentTransaction` **se salta la fila** si el cliente no tiene cuenta de finanzas por defecto. Y es el módulo de finanzas del propio cliente, no un registro de cobros de la plataforma. |
| `UserBilling.lastPaymentAt` | Una columna más que se pisa: solo recuerda el último pago. |
| `UserSubscription` | Solo se crean filas en el alta autogestionada (`user-subscription-actions`), no en las renovaciones. |

O sea que del estado de hoy se puede sacar **quién no renovó** —su vencimiento
se quedó clavado en su mes— y **no** el porcentaje, porque falta el
denominador. Y al mes hasta esa mitad se borra sola con la cuenta.

Así que hay una tabla, `renovaciones_mensuales`, de la App y con
`CREATE TABLE IF NOT EXISTS`. **Ni una columna nueva en `UserBilling`**: esa
tabla es del backend y añadirle columnas desde aquí es lo que reventó el #360.

Cuatro cosas que hay que mantener:

1. **Se anota desde el trabajo DIARIO de facturación**, no al abrir la
   pantalla. La cohorte de un mes hay que cogerla mientras sus cuentas todavía
   tienen el vencimiento dentro; si solo corriera al abrir el panel, un mes en
   que nadie entrara se perdería entero y no hay forma de recuperarlo. Y no
   puede tumbar el job —cobrar y suspender es lo que importa— pero **tampoco es
   mudo**: escribe su línea en el registro del job.
2. **Sin clave foránea, y con el nombre y el correo COPIADOS dentro.** La
   cuenta morosa se elimina al mes; si la fila se fuera con ella, el mes pasado
   perdería justo a los que se fueron, que son los que la tarjeta viene a
   enseñar. Comprobado en el banco: borrada la cuenta, la fila sigue con su
   nombre y su correo.
3. **`renovoEn` se SELLA y no se deduce al leer.** De una cuenta ya borrada no
   hay `dueDate` que mirar, así que quien renovó y luego se dio de baja por
   otra cosa contaría como fuga. Y el `ON CONFLICT` del anotado diario
   **no lo toca**: una vez sellado, sellado.
4. **Quien paga tarde cuenta igual.** El que vence el 31 y paga el 2 del
   siguiente renovó su mes, así que el sellado mira el mes en curso **y el
   anterior**. La fecha del sello no tiene que caer dentro del mes.

### Y un mes sin cohorte completa NO tiene porcentaje

Es la parte que no se puede ablandar. Un mes anterior a que empezara a
anotarse tiene a los que no renovaron —deducidos de su vencimiento clavado— y
le faltan los que sí. Dividir con eso da **0 %**, que es el peor número
posible: parece una fuga total y es un dato que no existe.

Ese mes se marca `parcial` y `porcentaje` sale **`null`**, y la tarjeta pinta
«Todavía no se puede medir» con el motivo al lado. La lista sí se enseña, que
esa es cierta. Es la regla de *un número que no se puede calcular no se
sustituye por otro*, la misma que ya costó un WhatsApp diciéndole a una
clienta «999999999 de -1 créditos».

Lo mismo con cero cuentas: no se divide entre cero, sale `null`.

**Se sabe desde cuándo se anota** mirando el `MIN("anotadoEn")` de la tabla. Sin
eso no se puede distinguir «este mes no venció nadie» de «este mes no lo
vimos», que es la distinción entera de esta tarjeta.

### Los extremos del mes, con el final EXCLUSIVO

`extremosDelMes` devuelve del día 1 a las 00:00 al día 1 del mes siguiente, y
el final no se incluye. Así da igual que el mes tenga 28, 29, 30 o 31 días y no
hay que contarlos: calculando un «último día» a mano, febrero y los meses de 31
se equivocan por un día, y ese día es el que más vence. Probado con febrero
normal y bisiesto, con 30 y 31, y con diciembre, que cruza de año —igual que
`ultimoMesCerrado`, que en enero tiene que devolver diciembre **del año
anterior**—.

## Notas de voz: se paga por MINUTO y el contador mide TOKENS

Una nota de voz se transcribe **cuando alguien pulsa su botón**, y el texto sale
**debajo del audio, sin quitarlo**: el audio es lo que mandó el cliente —con su
tono y sus pausas— y el texto es una ayuda para leerlo de un vistazo, no un
sustituto.

> **Nada se transcribe al llegar.** Durante un tiempo sí: el reloj de la
> conversación abierta transcribía de fondo toda nota que entrara, **la leyera
> alguien o no**. Con decenas de clientes por cuenta eso es plata que se va sola
> —y la paga entera la cuenta dueña de la línea, aunque la nota sea un «ok,
> gracias» de cuatro segundos—. Es el mismo trato que el chat del equipo, que
> nació bajo demanda por este mismo motivo.

Y **no hay cliente nuevo**: `actions/calls-recording-actions.ts` ya transcribía
las grabaciones de llamadas con `gpt-4o-transcribe` y respaldo en `whisper-1`.
Lo que faltaba era el **cobro**, que ese camino no hace.

### La conversión, que es la parte que hay que entender

`ia_credits.used` está en **tokens** y `total` en **créditos**. Whisper se cobra
**por minuto de audio**: no hay ningún recuento de tokens que escribir, así que
hay que fabricarlo — y eso es una **decisión de precio**, no un cálculo.

Por eso la tarifa es **un solo número escrito con su aritmética al lado**,
`CREDITOS_POR_MINUTO_DE_AUDIO` (`lib/transcripcion-de-voz.ts`, puro). Este
documento ya avisa de que la conversión de 3.085 está en tres sitios con dos
redondeos y de que es un cabo suelto; meter un cuarto con su propia cuenta lo
empeora.

La cadena es **`segundos → créditos → tokens`**, en ese orden, y el redondeo se
hace **una sola vez, al final**:

```
tokens = ceil( segundos / 60 × CREDITOS_POR_MINUTO × 3085 )
```

Tres cosas de esa línea, y las tres son fallos conocidos de esta casa:

1. **Prorrateado, no por minuto empezado.** Redondear al minuto cobraría una
   nota de 4 segundos como 60 —quince veces de más— y en una línea de notas
   cortas se come los créditos en una tarde.
2. **`ceil`, nunca `floor`, y nunca cero.** Con `floor`, una nota de 5 segundos
   costaría **cero**: se transcribiría gratis para siempre y el contador no se
   movería mientras el consumo sí ocurre. Es la familia de *un número que no se
   puede calcular no se sustituye por otro*.
3. **La comprobación de si alcanza va en CRÉDITOS, jamás en tokens.** Es la
   regla explícita de este documento: *ninguna comparación toca `used` y `total`
   en la misma expresión*. Ese fallo ya pasó en el voicebot —bastaban 4 créditos
   para agotar un cupo de 12.000—. Aquí entra `creditosDisponibles`, calculado
   como lo calcula el Perfil, y el costo también en créditos; la conversión a
   tokens ocurre **después**, solo para escribir.

**No se cobra cuando la cuenta paga su propia IA** (`pagaElClienteSuIa`, la
misma pregunta que se hace el motor). Y `null` —ilimitados— **no es cero**: son
dos respuestas distintas, y confundirlas dejaría a esas cuentas sin transcribir
nada.

**Y paga la cuenta DUEÑA DE LA LÍNEA**, que es la que recibe el mensaje. Un
asesor de una cuenta vinculada abriendo ese chat no puede cargarle el consumo a
la suya.

### Una nota muy larga no se recorta: no se transcribe, y se dice

La duración **viene dentro del propio mensaje** (`audioMessage.seconds`), así
que la decisión se toma antes de descargar un byte y antes de tocar los
créditos.

**El tope no es técnico.** Una nota en opus de diez minutos pesa poco más de un
mega, lejísimos de los 25 MB que admite la API. Es un límite de **gasto**: una
grabación de cuarenta minutos reenviada a un chat son cientos de créditos en un
solo mensaje, sin que nadie lo haya pedido, y eso reaparece como «¿por qué
bajaron mis créditos?».

**Y no se recorta. Nunca.** Transcribir los dos primeros minutos de una nota de
diez y enseñarlo como «la transcripción» es peor que no transcribir: el asesor
lo lee, actúa, y lo que importaba estaba en el minuto siete. Es *media escalada
es peor que ninguna* — una transcripción a medias no se ve como incompleta, se
ve como completa.

### El «No se pudo transcribir.» de la captura: el audio se pedía SOLO a Evolution

No era un fallo de OpenAI, y no era intermitente. El paso automático bajaba el
audio con `getBase64FromMediaMessage` —una ruta **de Evolution**— y se rendía en
su primera línea cuando no había clave:

```ts
if (!instanceName || !apiKeyData?.url || !apiKeyData?.key) return "";
```

Y una línea de **WhatsApp Mensajería (Waha) no tiene clave de Evolution**:
`resolverContexto` se la quita **a propósito**, porque preguntarle a Evolution
por una línea de Waha «devuelve correcto y vacío». Así que en esas líneas esa
condición era falsa **siempre**: ni una sola nota se transcribía nunca, todas se
marcaban `fallo`, y la marca era **definitiva** —quien llamaba excluía de la
siguiente vuelta toda fila con `transcripcionMotivo`—. Es la misma familia que
el #792: *el proveedor sale de la fila, no del parámetro.*

**La respuesta estaba delante:** la burbuja ya reproduce ese audio, y lo hace
desde `chat_messages.mediaUrl`, la copia que guarda el backend. **Si el
`<audio>` puede sonar, nosotros podemos bajar los mismos bytes.** Así que el
camino principal es `mediaUrl`, que funciona en los dos proveedores, y Evolution
queda de respaldo para las filas viejas que se guardaron sin él.

### Un fallo es de HOY: no deja marca, no cobra y se puede reintentar

Es la distinción que estaba al revés, y la que convertía un tropiezo en un daño
permanente:

| | deja marca | se reintenta |
| --- | --- | --- |
| muy larga | no hace falta: se decide por la duración, antes de bajar un byte | no — mañana seguirá siendo igual de larga |
| sin créditos | **no** | sí, en cuanto haya |
| no se pudo bajar el audio, u OpenAI no contestó | **no** | **sí, pulsando otra vez** |

Aquí la nota la pidió una persona, así que un fallo de hoy —la red, un pico de
OpenAI— se reintenta y **no se ha cobrado nada**, porque el cobro va después de
tener el texto. Marcarlo dejaría esa nota sin transcribir para siempre y sin
decir por qué, que es exactamente lo que se veía.

Y **el motivo se dice, con el detalle que decide qué hacer**. «No se pudo
transcribir.» a secas es lo peor posible: no se sabe si recargar créditos,
avisar a soporte o sencillamente volver a pulsar. Son ocho valores en
`NoSeTranscribio` con su frase cada uno —sin créditos sale **con los números
delante**— y se quedan **debajo de la nota**, no en un aviso que se va: quien ve
pasar un mensaje de un segundo no sabe después por qué no hay texto.

**Las marcas viejas se ignoran al leer, sin backfill.** `laMarcaVieja` deja
`muy_larga` como explicación —eso sí es firme— y trata `fallo` como «todavía no
se ha pedido», así que las notas que hoy dicen «No se pudo transcribir.» vuelven
a ofrecer su botón en cuanto esto despliegue, sin tocar una sola fila. Al
guardar el texto la marca se borra.

### Dónde corre, y cómo se guarda

**La App no recibe los webhooks de WhatsApp**: los recibe el backend, que es
otro repositorio. Así que la nota se transcribe cuando alguien pulsa su botón en
la conversación, en una acción de servidor y no en ningún reloj.

Cuatro cosas que hay que mantener:

1. **La transcripción va en `raw`, NO en una columna nueva.** Es la misma
   decisión que ya tomaron `sentByAi` y `notaInterna`, con su motivo escrito al
   lado: **`chat_messages` la escriben tres sitios distintos** —la App, el
   webhook del backend y el chat-store— y añadirle columnas desde aquí es lo que
   reventó el #360. Se escribe con un **merge de JSONB**: escribir el objeto
   entero se llevaría por delante la foto de Evolution, los acuses y las
   reacciones.
2. **Y los PARÉNTESIS de ese merge no son estilo.** En Postgres el `-` que quita
   una clave liga **más fuerte** que el `||` que mezcla, así que
   `raw || objeto - 'clave'` se lee como `raw || (objeto - 'clave')`: la clave se
   le quita al objeto recién construido —donde no está— y la marca vieja **se
   quedaba puesta** junto al texto bueno. Lo cazó el banco.
3. **El `WHERE` del guardado es lo que impide pagar dos veces.** Va
   `AND raw->>'transcripcion' = ''`, así que con dos asesores pulsando a la vez
   solo una llamada escribe, y **solo esa descuenta**. Comprobado lanzando las
   dos en paralelo: una fila escrita, un cobro.
4. **Se cobra DESPUÉS de tener el texto**: cobrar antes y que la llamada falle
   sería cobrar por algo que no se entregó. Y no se cobra cuando la cuenta paga
   su propia IA.

**El precio se ve ANTES de pulsar**, como en el chat del equipo: el botón dice
«Transcribir 3 créditos», con el número en tono más claro, porque la duración
**es** el precio. Una nota por
encima del tope no ofrece botón y dice por qué — un botón que al pulsarlo da
error es peor que no tenerlo.

**Se ofrece en las notas de voz de LOS DOS lados**: la del cliente y la que
manda el asesor o la IA (`fromMe = true`), para revisar qué le dice el equipo a
los clientes. Lo decide `esNotaDeVozTranscribible` y `laNotaDeVoz` no filtra
por `fromMe`; en la burbuja propia la pastilla va en tonos claros
(`enMensajePropio`). Un audio ADJUNTO (`ptt: false`) no es una nota y no se
ofrece. Lo prueba `scripts/banco-transcribir-nota-del-asesor.sh`; `MODO=roto`
contra `7c1db1f` afirma que solo se ofrecía la del cliente.

### Compartir la TARIFA no basta: hay que compartir la DURACIÓN

Una nota de 40 segundos decía **«1 crédito»** y a 6 créditos por minuto son 4.
Lo que despista es que el cálculo **ya estaba compartido**: `costoDeLaNota` la
importaban los dos lados, así que mirando la fórmula los dos «estaban bien».

Lo que no se compartía era **de dónde sale el número que entra**:

| | cómo leía la duración |
| --- | --- |
| servidor (`laNotaDeVoz`) | un `COALESCE` de SQL sobre **dos** formas de `raw` |
| pantalla (`chat-message-utils`) | `message.audioMessage.seconds`, y **solo esa** |

Cuando esa forma no estaba, el navegador sacaba **0**. Y `costoDeLaNota(0)` no
da cero: da el **mínimo**, que es 1 crédito. O sea que el fallo no salía como un
hueco ni como un error — salía como **un precio perfectamente creíble**. Es la
regla de *un número que no se puede calcular no se sustituye por otro*, rota de
la peor manera posible: el sustituto era un número que nadie iba a mirar dos
veces.

Dos cosas que hay que mantener:

1. **La duración la lee UNA función**, `segundosDeLaNota`
   (`lib/transcripcion-de-voz.ts`, pura). Entiende las formas conocidas —con
   sobre, sin sobre, `seconds` y `duration`, número o cadena— y **el `COALESCE`
   de SQL se fue**: la consulta trae `raw` y la lee esa misma función. Compartir
   la tarifa y no el lector es tener una sola fórmula con dos entradas, que es
   exactamente igual de roto y bastante más difícil de ver.
2. **Y baja del SERVIDOR, de la misma fila que cobra.**
   `persistedRowToEvolutionMessage` emite `audioSegundos` desde el mismo `raw`
   que después lee `laNotaDeVoz`. Así lo que se enseña no puede separarse de lo
   que se descuenta **por construcción**, y no porque dos sitios se acuerden de
   hacer lo mismo. El respaldo del navegador —el mensaje tal cual lo devolvió el
   proveedor— pasa por la misma función, así que tampoco puede contestar otra
   cosa.

Y cuando no hay duración en ninguna parte, **las dos puntas dicen 1**: se enseña
el mínimo y se cobra el mínimo. Eso es lo correcto — lo que no puede pasar es
que una diga 1 y la otra 4.

El banco lo prueba **encadenando las dos**: siembra la fila, la lee por el
camino del servidor y por el de la pantalla, y compara los dos precios. Probar
cada lado por su cuenta es lo que dejó pasar esto.

### Y la pastilla va en el renglón de la HORA

En un renglón propio debajo del reproductor, el botón hacía crecer la burbuja de
alto **por cada nota** —y una conversación de notas son todas— y, siendo un
texto subrayado suelto, se leía como un aviso de error. El pie de la burbuja ya
es la fila de los rótulos pequeños, donde viven «Asesor», «Agente IA»,
«Editado» y «Eliminado»: la pastilla entra ahí a la izquierda y la hora se queda
a la derecha con `ml-auto`.

Medido en Chromium sobre el CSS del build, a 1440, 1024 y 390:

| | alto de la burbuja |
| --- | --- |
| en su renglón | 86 px |
| en el de la hora | **70 px** |

La pastilla mide 127×14 y la hora sigue pegada al borde; no se solapan ni con
«Editado» al lado, y la página no desborda en ninguna de las tres.

**El texto y el motivo siguen debajo del audio**, que es donde se leen: son
frases enteras y en el renglón de la hora partirían la fila. Por eso el botón y
el texto salen de **un hook y no de dos componentes** (`useTranscribirNota`): se
pulsa arriba y el texto tiene que aparecer abajo, así que comparten un estado y
quien los llama coloca cada nodo donde le toca.

## Clientes: «activo» es cuenta habilitada Y servicio al día

La lista de Clientes decía «Total clientes 35», y de esos no todos eran
clientes: había suspendidos, morosos y cuentas a las que nunca se les configuró
el servicio. El número servía para poco.

Activo son **dos cosas a la vez**: la cuenta habilitada (`User.status`, el
muñequito de la columna Estado) **y** el servicio al día
(`UserBilling.accessStatus === ACTIVE`, el mismo estado que ya mandan Finanzas y
Analíticas). Con solo la facturación, el filtro de «Activos» enseñaba filas con
el muñequito en rojo: cuentas deshabilitadas que no entran a la App pero cuya
facturación seguía diciendo `ACTIVE`. La regla vive en `lib/clientes-activos.ts`
para que los tres sitios digan el mismo número; si hace falta en otra pantalla,
se importa de ahí y no se vuelve a escribir la condición.

Tres cosas de la pantalla:

1. **El filtro no va dentro de «Columnas».** Ese menú decide qué **datos** se
   enseñan de cada fila; el estado decide **qué filas** hay. Es un desplegable
   propio, y cuando no está en «Todos» se pinta en azul: un filtro puesto que no
   se nota es lo que hace pensar que faltan clientes.
2. **Sin fila de facturación no se da por activo.** Es una cuenta a la que nunca
   se le configuró el servicio, y contarla es justo lo que inflaba el total.
3. **Las opciones son tres palabras**: Todos, Activos, Inactivos. Nada de
   «Con servicio activo»: el desplegable ya se llama «Estado».

Y la barra de esa pantalla va **como la de Equipo**, que es la que estaba bien:
**izquierda fija** (el buscador y «+ Nuevo»), **zona central que scrollea**
cuando no cabe (`flex-1 min-w-0 overflow-x-auto`, con `ml-auto` en el primer
hijo para que se peguen a la derecha mientras sobre sitio y `shrink-0` en cada
uno) y **derecha fija** («Acciones»). Con el menú lateral desplegado, sin esa
zona central, «Columnas» y «Acciones» se salían de la pantalla y **no había
forma de llegar a ellos**.

**Partirla en filas con `flex-wrap` no vale**: se descoloca —«+ Nuevo» se va
solo a un extremo y la segunda fila queda suelta—. Lo que se hace es dejar que
el trozo del medio se desplace. Si se añade otro botón a esa barra, va dentro de
la zona central, no fuera.

Y del lado de los datos: `getEnrichedClients` trae **solo los dos estados**
(`accessStatus`, `billingStatus`), no la fila entera. El `price` es un `Decimal`
y no viaja a un componente de cliente.

## Cobros: la cartera de una cuenta NO es el cobro de la plataforma

Se parecen tanto que la tentación es fundirlos, y son cosas distintas. El de
Verzay vive en `actions/billing/**` sobre `UserBilling`, cobra licencias de la
App y sus ramas **suspenden y borran cuentas**. Cobros es la cartera de una
cuenta cliente con SUS clientes —internet, streaming, cualquier suscripción— y
lo peor que hace es mandar un WhatsApp.

Así que es **código nuevo con el mismo patrón**, no una generalización de aquel:
cuatro tablas de la App (`cobros`, `cobro_adjuntos`, `cobro_ciclos`,
`cobros_config`) con `CREATE TABLE IF NOT EXISTS` y el reintento del `42P01`
mirando `meta.code`. **`UserBilling` no se toca**, ni para leer. Fundirlos
habría hecho que confirmarle el pago a un cliente de internet moviera el
vencimiento de la licencia de la App.

Lo que sí se reutiliza, y por eso no hay envío nuevo:
`sendViaWhatsAppDispatcher` (Evolution, Waha y Meta en una llamada),
`resolveWhatsAppDispatcherLine` con **`includeAdminFallback: false`**,
`BloqueDeAdjuntos` con `taskId={null}` y el reloj de `/api/cron/billing`.

**El respaldo a la línea de Verzay se apaga a propósito.** Sin ese `false`, una
cuenta sin línea conectada mandaría los cobros desde el número oficial de la
plataforma: desde fuera, un desconocido pidiéndole dinero a un cliente que no
sabe quién es. Es preferible que no salga y que la pantalla lo diga —lo dice, en
la cabecera y en la configuración—.

### Los datos de pago son DOS: los de la cuenta y los de este cobro

`cobros_config.datosDePago` es el `{pago}` de la plantilla: uno solo para toda
la cartera. Pero lo que de verdad se teclea a diario es **distinto en cada
deuda** —«Bancolombia ahorros 123, a nombre de Marta», un enlace de pago
distinto por contacto, por producto o por servicio—, y eso no cabe en un dato
fijo de la cuenta.

Va en **`cobros.notaDePago`**, en la fila, y entra con
**`ALTER TABLE … ADD COLUMN IF NOT EXISTS`** y no reescribiendo el `CREATE`: la
tabla ya existe en producción y un `CREATE TABLE IF NOT EXISTS` no toca una que
ya está. Es el fallo que se comete solo al añadirle una columna a una tabla de
la App ya desplegada. Ni en `cobros_config` —que es de la cuenta entera— ni en
`cobro_adjuntos`, que es una tabla de archivos: una fila sin fichero es una fila
que miente. Las deudas de antes traen `null`, que significa exactamente «esta no
tiene»: sin backfill y sin dos clases de cobro.

**La nota va al final del mensaje, pegada por FUERA de la plantilla**
(`conLaNota`, puro). Y esa es la decisión, porque las dos formas que parecen
mejores fallan **en silencio**:

1. **Como `{variable}` nueva.** Cada cuenta ya tiene sus tres mensajes
   guardados y editados; una variable que no está escrita en ellos no se
   sustituye en ninguna parte. Se escribiría el número de cuenta, se guardaría
   bien, y al cliente no le llegaría — sin un solo error. Es la familia de *una
   prohibición que no viaja en el prompt no existe*.
2. **Metida dentro de `{pago}`.** Sale bien con las plantillas por defecto y
   desaparece en cuanto alguien quitó ese `{pago}` de la suya. Una rama que solo
   se equivoca con los datos que ya tienen los clientes es la que nadie prueba.

Al final y **sin ninguna condición delante** no hay plantilla que la pueda
perder. Probado con una plantilla sin `{pago}` y con otra sin ninguna variable.

Cuatro cosas más:

1. **No reemplaza a `{pago}`**: los dos salen. Son dos datos distintos, no dos
   formas del mismo.
2. **Viaja también en la vuelta diaria** (`losCobrosQuePodrianTocarHoy`), no
   solo en «Cobrar ahora». Por ahí sale la mayoría de los mensajes; si solo la
   trajera el botón, la línea saldría al mandarlo a mano y desaparecería en los
   recordatorios, que es el «a veces funciona» de siempre.
3. **Se puede editar en una deuda que ya existe**, no solo al crearla. El número
   de cuenta cambia; si solo se pudiera al crear, cambiarlo obligaría a borrar la
   deuda y rehacerla, y con ella se iría su historial de ciclos.
4. **Es LITERAL: se pega después de sustituir las variables.** Un `{monto}`
   escrito a mano en la nota sale tal cual, que es lo que se escribió.

Y el saneado —vacía o con espacios es `null`, nunca cadena vacía— está en
`comoNotaDePago` y se aplica **al escribir**, en `cobros-db`, no solo en la
acción. Con él únicamente en la acción la columna admitía `"   "` en cuanto
alguien llamara a la función de la base por otro camino, y entonces `null` y
«espacios» serían dos formas de decir lo mismo. Lo cazó el banco.

### Los adjuntos SÍ salen, y el obstáculo no era el que estaba escrito aquí

Durante meses los archivos de un cobro se guardaban, se contaban y se veían en
la App, y al cliente le llegaba **solo el texto**. Este documento decía que
mandarlos era un frente grande porque «los caminos de media de los tres
proveedores piden `currentUser()` y pausan la IA, y la vuelta diaria corre sin
sesión». **Eso era falso**, y conviene saber por qué para no volver a
descartarlo por el mismo motivo:

| | ¿pide sesión? | ¿qué hay ya? |
| --- | --- | --- |
| Evolution | **no** | `sendMediaByUrl`, HTTP con url + apikey |
| Waha | **no** | `sendWahaMedia` en `lib/waha.ts`, HTTP |
| Meta | **no** | `sendChannelTextAction` ya tiene su rama `kind: 'media'` |

Quien pide sesión es la **acción** de Chats (`sendWahaTextAction`, por
`lineaWahaAutorizada`), no la primitiva que hay debajo. Mirar la acción y
concluir que el proveedor exige sesión es la misma familia de error que ya costó
tres versiones en el id de un mensaje de grupo: **una capa no habla por la de
abajo.**

`sendViaWhatsAppDispatcher` solo mandaba texto por un motivo mucho más simple:
**nació para avisos**, que son todos de texto —facturación, prueba, vigilancia,
informe semanal, tickets—, así que su firma no tenía sitio para un archivo y
cada proveedor iba con `kind: 'text'` escrito a mano. No había ningún obstáculo
técnico: faltaba la función.

#### Y de paso destapó que el despachador estaba MUDO en toda línea Waha

El despachador llamaba a `sendWahaTextAction`, que empieza por `currentUser()`.
Desde una vuelta de cron **no hay sesión**, así que devolvía «No autorizado» y
el mensaje no salía: los recordatorios de Cobros, los avisos de facturación, el
seguimiento de prueba y el informe semanal **llevaban callados en toda línea
Waha**, sin un solo error que mirar. Desde fuera no se parece a un fallo: se
parece a que la App no le escribe a nadie.

> **Un despachador del servidor no pasa por una acción.** Es lo que Evolution ya
> cumplía —`sendingMessages` siempre fue una función suelta—; Waha entra ahora
> por sus primitivas de `lib/waha.ts`. La puerta de `sendWahaTextAction`
> (`currentUser` + `assertCanAccessTargetUser`) se queda intacta donde tiene
> sentido: en la llamada que llega del navegador.

Dos diferencias del camino nuevo, a propósito: **no pausa la IA** —un cobro
automático no es un asesor interviniendo, y Evolution nunca la pausó— y **no
antepone la firma del asesor**, que depende de `currentUser()` y debajo de un
aviso automático sería una firma falsa. Lo que sí se conserva es **la burbuja**:
el saliente se guarda igual, con el id que devolvió Waha para que el eco del
webhook no lo duplique. Por eso `snapshotDeSalienteWaha` y `etiquetaDeMediaWaha`
se mudaron a `lib/waha.ts`: con una copia en cada sitio, el día que se afine una
el otro se queda atrás.

#### Un archivo que falla no puede perder el cobro, ni perderse en silencio

Es la regla entera de esta parte, y las dos mitades hacen falta:

1. **El cobro es el TEXTO.** `mandarLosAdjuntos` no devuelve `ok`, devuelve un
   resumen. Si devolviera un fallo, la vuelta diaria no anotaría el hito y al
   cliente le llegaría el **mismo recordatorio mañana, y pasado**: un adjunto
   roto convertido en spam. Y al revés: si el texto no sale, **no sale ningún
   archivo** — una factura suelta, sin el mensaje que la explica, es peor que
   nada.
2. **Y queda constancia, archivo por archivo.** `cobro_adjuntos` recibe
   `ultimoEnvioEn`, `ultimoFalloEn` y `ultimoFallo` con
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS` —la tabla ya está en producción y un
   `CREATE TABLE IF NOT EXISTS` no toca una que ya está—. Las filas de antes
   traen `null` en las tres, que significa «de esta no se sabe» y **no** «no
   salió»: sin backfill y sin dos clases de adjunto.

**Son dos sellos y no uno, y no se pisan.** Un envío bueno no borra el motivo
del fallo anterior y un fallo no borra la fecha del último envío bueno; la
pantalla avisa comparándolos (`losQueNoSalieron`). Con una sola columna, «nunca
salió» y «salió y hoy falló» serían el mismo dato, y el aviso o no se encendería
nunca o no se apagaría nunca. Comprobado contra Postgres en los dos órdenes.

Cinco cosas más:

1. **Cada archivo va en su propio `try`.** Sin él, un proveedor que revienta se
   llevaba los archivos de detrás y el resumen entero. Medido en el banco: con
   el `try`, el archivo siguiente al que explota sí sale.
2. **En serie, no en paralelo.** Son mensajes a una persona y llegan en su
   orden; y varios envíos a la vez por la misma línea es lo que hace que
   WhatsApp la mire con lupa.
3. **Sin pie.** El mensaje de cobro salió entero un momento antes; repetirlo
   debajo de cada archivo es mandárselo al cliente tantas veces como archivos
   lleve la deuda.
4. **El `mediatype` se filtra contra la lista cerrada y lo que no encaje sale
   como `document`.** WhatsApp abre un documento siempre; un `mediatype`
   inventado le saca un 400 al proveedor y el archivo no sale. Equivocarse hacia
   `document` entrega.
5. **La vuelta diaria lee los adjuntos de TODAS las deudas en una consulta**
   (`losAdjuntosDeLosCobros`), en una segunda pasada después de decidir cuáles
   salen. Una consulta por deuda serían decenas para leer lo mismo. Medido:
   0,36 ms para 30 deudas sobre 40.000 filas, entrando por
   `cobro_adjuntos_cobro_idx`. Y si esa lectura falla, **los cobros salen sin
   sus archivos en vez de no salir**.

### La guarda de una confirmación es el VENCIMIENTO, no el estado

Es la trampa del cobro recurrente y la cazó el banco. Confirmar un pago **anota
el ciclo, salta el vencimiento y devuelve la fila a `pendiente`**, así que el
estado no distingue un ciclo del siguiente. Con `AND "estado" = 'pendiente'` a
secas, dos confirmaciones a la vez pasaban **las dos**: la segunda se quedaba
esperando en el `FOR UPDATE` y al despertar encontraba la fila otra vez en
`pendiente`. Medido: el vencimiento saltaba **60 días en vez de 30**, o sea un
mes regalado por un doble clic.

Lo que identifica un ciclo es **la fecha que se está cerrando**. Quien confirma
manda el vencimiento que vio y el `UPDATE` lleva
`AND "vence" IS NOT DISTINCT FROM ${venceQueSeVio}`; si la fila ya no lo tiene,
alguien se adelantó y esta no toca nada. Vale también para una deuda sin fecha,
que después de la primera confirmación ya tiene una. Esa fecha **solo se
compara, nunca se escribe**: una lista que llega de fuera no puede decidir a qué
día salta el ciclo.

Y las tres escrituras van en **una transacción**, porque a medias cada pareja
miente: sin el ciclo se pierde que ese cliente lleva ocho meses pagando; sin
borrar las marcas de recordatorio, el ciclo nuevo **nace mudo** porque el
anti-spam del viejo se come su primer aviso.

### Lo que no salió no se anota

Dos casos, y los dos se ven igual de mal si se hacen al revés:

1. **Sin línea conectada no se anota.** El día que la cuenta conecte la suya,
   la deuda vuelve a entrar por ese mismo hito en vez de haberlo perdido.
2. **Un envío fallido tampoco.** Anotarlo haría que el anti-spam diera por
   escrito un mensaje que no salió, y ese hito se perdería para siempre sin que
   nadie se entere.

Anotar es decir «ya se le escribió». Si no se le escribió, no se dice.

### A quién se le insiste, y los tres hitos

Los recordatorios son **tres días exactos y no un rango**: N antes, el día 0 y N
después. «Cualquier día en negativo» es lo que hacía que un cliente del cobro de
la plataforma recibiera uno el día 1, otro el 2 y otro el 3 hasta la suspensión;
aquí nace corregido.

Y **paran en «comprobante recibido» y no vuelven** hasta el ciclo siguiente. En
ese estado la pelota está en nuestra cancha —mandó el soporte y espera que
alguien lo mire—, así que seguir cobrándole es el peor mensaje posible.

### El estado se guarda; la situación se CALCULA

Como la fila vuelve a `pendiente` en cuanto se confirma, pintar el estado
guardado a secas dejaría una cartera entera de clientes al día en «Pendiente»,
que es tanto como no decir nada. `situacionDelCobro` sale de la fecha
—`comprobante`, `vencida`, `porVencer`, `alDia`, `sinFecha`— y el orden de la
tabla es ese: **arriba lo que pide algo de tu parte**, y lo que está al día al
final, porque no hace falta mirarlo.

### `Number(null)` es 0, no `NaN`

Costó un caso del banco. `comoDiasDeGracia(null)` devolvía **0** —un cero
perfectamente válido, porque en la gracia el cero SÍ es una respuesta: «al día
siguiente ya está vencida»— en vez del valor por defecto. Un `null` colado
apagaba la gracia de esa fila sin que nadie lo hubiera pedido.

**«No hay valor» y «vale cero» se separan a mano**, antes de convertir. Si se
escribe otro saneador de números donde el cero signifique algo, va igual.

### El pie de un diálogo es `DialogFooter`, no un `justify-end` a mano

Los tres diálogos de Cobros nacieron con `<div className="flex justify-end
gap-2">` y los dos botones acababan amontonados a la derecha. El pie de la casa
es `DialogFooter` (`components/ui/dialog.tsx`), que lleva **`justify-between`**:
«Cancelar» a la izquierda y la acción principal a la derecha, como en «Editar
pagos» de Instancias y en los ciento y pico sitios que ya lo usan.

Escribirlo a mano no es «lo mismo pero más corto»: es una pantalla que se lee
distinta de todas las demás, y nadie lo nota hasta que las pone lado a lado.

Y de paso, el tercero —el historial de ciclos— **era un `div` con fondo oscuro**,
no un diálogo: se cerraba solo con el clic de fuera, sin Escape, sin foco
atrapado dentro y sin que un lector de pantalla supiera que se había abierto
nada. Un diálogo se hace con `Dialog`.

#### Y `justify-between` reparte a los HIJOS DIRECTOS

Usar `DialogFooter` **no basta**, y por eso la regla se estaba perdiendo con el
pie correcto puesto. `justify-between` reparte a los hijos directos, así que
metiendo los dos botones dentro de un `<div className="flex gap-2">` el pie ve
**un solo hijo**, lo manda a un extremo y los botones salen amontonados. Es
exactamente lo que le pasaba al diálogo de crear tarea de Proyectos — que además
llevaba un `<span />` de relleno ocupando el borde izquierdo **por ellos**, o
sea la forma más difícil de ver de romper la regla: el pie parecía bien escrito.

Medido en Chromium sobre un pie de 420 px, y no mirando la pantalla, que es de
lo que no se entera nadie:

| | Cancelar | la acción |
| --- | --- | --- |
| con envoltorio | **+198 px** del borde izquierdo | −1 px del derecho |
| hijos directos | +1 px | −1 px |

Y el mismo fallo tiene una **segunda mitad, por el otro lado**: con **un solo
botón** —guardar, sin cancelar— `justify-between` lo deja a la **izquierda**.
Eran 17 diálogos con la acción colgando del borde que no le toca, y cada uno se
arreglaba escribiendo `justify-end` a mano, que es justo lo que hace que la
regla se pierda.

Las dos cosas se arreglan **en el pie compartido**, no diálogo por diálogo:

```
"flex flex-row flex-wrap items-center justify-between gap-2 [&>*:only-child]:ml-auto"
```

Tres cosas que hay que mantener:

1. **Los botones van como hijos DIRECTOS del pie.** Si hace falta un dato en
   medio —«3 de 12 asignados», «Formato: .xlsx»— va **entre los dos**, como un
   hijo más, no pegado a uno de ellos. Con tres, `justify-between` los deja
   izquierda / centro / derecha, que es donde tienen que estar.
2. **Un tercer botón destructivo va en MEDIO**, no en el borde izquierdo: ese
   borde es de cancelar. Es el caso de «Eliminar» en la tarea de Proyectos.
3. **Los tres pies dicen lo mismo**: `DialogFooter`, `AlertDialogFooter` y
   `SheetFooter`. El de `Sheet` iba con `sm:justify-end` —la regla escrita al
   revés— y hoy no lo importa nadie; precisamente por eso: el día que alguien
   monte un panel con pie, saldría distinto de los ciento y pico diálogos y
   nadie sabría de dónde salió.

Y cómo se comprueba que la clase existe en producción, que es la misma familia
que `removeConsole` y que las clases de `lib/`: se busca la **declaración** en
el build, no la clase en el código.

```
npm run build && grep -c "only-child" .next/static/css/*.css
```

### Y la ruta no está montada: la puerta va en la acción

`/cobros` entra en `navigationRoutes` —el desplegable de «Editar módulo»— y **no
se monta en ningún módulo**: se asigna a mano. Eso tiene una consecuencia que no
es obvia: el guardián del layout arma `rutasNegadas` con las rutas que **sí**
están en algún módulo y denegadas, así que una que no está en ninguno nunca
entra ahí y se alcanza escribiendo la URL.

Por eso cada acción resuelve la cuenta y pasa por `assertCanAccessTargetUser`, y
la pantalla solo pinta lo que le devuelvan. **Si se añade otra pantalla que se
vaya a asignar a mano, va igual**: la puerta en la acción, nunca en la página.

## El saldo de una cuenta lo lee UNA regla, y la App y el motor tienen que decir lo mismo

«Las llamadas salen bien y quedan con su duración, y la transcripción dice
**"No hay créditos suficientes: hacen falta 14 y quedan 0"** sobre una cuenta
que sí tiene créditos. Sin transcripción tampoco hay Resumen IA.»

La sospecha razonable —que la transcripción mira la bolsa de OTRA cuenta,
probablemente la madre— **se descartó siguiendo la cadena entera**, y conviene
tenerlo escrito para no volver a buscar ahí:

| paso | con qué cuenta |
| --- | --- |
| la llamada sale | el `sid` de `laCuentaDeLaLlamada` |
| la fila se anota | `logOutgoingCallAction`, bajo la cuenta **dueña de la línea** |
| la grabación se busca | `laCuentaDeLaFilaDeLlamada`, o sea el `userId` de esa fila |
| la transcripción cobra | `laCuentaQuePagaLaLlamada`, que **es la identidad** |

Las cuatro son la misma cuenta, y el banco lo ejerce contra Postgres (`D1`).
**La cuenta nunca fue la equivocada. Lo equivocado era la REGLA con la que se
leía su bolsa.**

> **Quién autoriza la llamada y quién autoriza su transcripción son dos
> procesos distintos** —el motor (`api-webhook`, `AiCreditsService`) y esta
> App— **y leían la misma fila con reglas distintas.** Así que una llamada
> podía salir y su transcripción decir «quedan 0» sobre la misma bolsa, en el
> mismo minuto, sin un solo error por el camino.

### Las dos filas donde discrepaban, que son exactamente las del reporte

| la fila de `ia_credits` | el MOTOR dice | la App decía |
| --- | --- | --- |
| `total: -1` (**sin tope**, puesto a mano) | **ilimitado** | `max(0, -1 − usados)` = **0** |
| **no existe** | ilimitado (`!credit` → deja pasar) | **0** |

La primera es la del reporte al pie de la letra: una cuenta marcada «sin tope»
con consumo acumulado. El motor la dejaba llamar y la App le decía que le
quedaban cero — y encima el número de la izquierda era cierto: **14 créditos
son 140 segundos a la tarifa de siempre**. Un aviso perfectamente creíble sobre
una cuenta perfectamente sana, que es la peor clase de fallo.

> **Quién contesta «cuánto le queda a esta cuenta» es `lib/saldo-de-la-cuenta.ts`,
> puro, y nadie más.** Devuelve un ESTADO —`ilimitado`, `sin_bolsa`,
> `quedan`— y no un número, porque el número no puede distinguir los tres. Lo
> preguntan las **cuatro** pantallas que transcriben (las notas de Chats, las
> del chat de equipo, una reunión y una llamada) y el Perfil.

Cinco cosas que hay que mantener:

1. **`null` no es cero, y «sin bolsa» tampoco.** Eran los tres el mismo cero, y
   los tres llevan a acciones distintas: *no se cobra*, *asígnale un cupo* y
   *recarga*. Con un `number | null` la segunda no se podía ni expresar.
2. **El banco ENCADENA la regla con la del motor**, escrita literal a su lado
   (`A5`): probar cada lado por su cuenta es exactamente lo que dejó pasar
   esto, porque los dos «estaban bien».
3. **Nunca se cae a la bolsa de la madre.** La llamada la paga la cuenta dueña
   de la conversación, así que su transcripción también. Un respaldo hacia
   arriba haría que una hija sin cupo gastara el de la casa sin que nadie lo
   pidiera. Lo dice el propio módulo, con su motivo al lado.
4. **Lo ilimitado no se cobra** (`seCobra`). Antes el camino de la llamada
   descontaba igual: `used` subía sobre una cuenta que paga su propia IA, y el
   día que volviera a una llave de la casa arrancaría con un consumo inventado.
5. **Y el aviso NOMBRA la cuenta que paga.** «Quedan 0» a secas manda a mirar
   la bolsa de la cuenta con la que uno entró —que es otra— y ahí no hay nada
   que arreglar. La marca guarda `cuenta` y la tarjeta la pinta.

### Y con el mismo barrido salieron tres asimetrías más

Ninguna se había reportado y las tres se ven igual desde fuera:

| | qué pasaba |
| --- | --- |
| **el audio que no se puede cortar** | `cuantosTrozos(bytes, tope)` contaba sobre un NÚMERO, así que prometía dos trozos para un audio que `trozosDeWav` **no sabe partir** —un webm de Meta, un WAV con el encabezado roto—. Se mandaba entero, OpenAI lo rechazaba por tamaño y el `catch` lo convertía en **«El servicio de transcripción no respondió»**, que es una respuesta falsa: el servicio contestó perfectamente y lo que pasaba es que no cabía |
| **agotar la ventana** | al rendirse tras media hora se escribía `no_bajo` —«No se pudo descargar el audio»— **encima** del `no_transcribio` que habían dejado las sesenta vueltas. El audio se bajó sesenta veces; los dos avisos mandan a mirar sitios distintos |
| **el camino de Meta** | abandonaba por créditos o por falta de clave **devolviendo `success: true`** y sin dejar marca: la tarjeta se quedaba en «Procesando…» para siempre |

> **`cuantosTrozosDeVerdad` recibe el BUFFER, no su tamaño**, y lee el MISMO
> encabezado que `trozosDeWav`: así las dos no pueden discrepar. Lo que no cabe
> y no se sabe cortar vale `Infinity`, cae por el tope de trozos como cualquier
> otro número, y **lo dice con otras palabras** —habla de MB, no de minutos—,
> porque «es muy largo» y «no cabe de una pieza y no sé partirlo» son dos
> cosas distintas.

Y `esperarYProcesarLaGrabacion` recuerda el **último motivo de verdad** y solo
cae en `no_bajo` cuando de verdad nunca llegó el audio. Los dos se reintentan
igual y los recoge el rescate: lo único que cambia es que el aviso deje de
mandar a mirar donde no es.

### El banco

`scripts/banco-saldo-de-la-cuenta.sh` —la regla, qué se decide con ella, el
corte de un audio que no se puede cortar, y un **barrido** que exige que las
cuatro pantallas pasen por `elSaldoDeLaCuenta` y que ninguna vuelva a comparar
un número contra `null`—, y `scripts/banco-grabacion-de-llamada.sh` contra
Postgres, con las secciones **J** (una cuenta `total: -1` transcribe y no se le
cobra; una sin fila deja `sin_bolsa` **con su nombre y sin `quedan`**, porque
un 0 ahí se lee como «se te acabaron») y **K** (agotar la ventana no pisa el
motivo, y una llamada cuyo audio nunca llega sí dice `no_bajo`).

Los dos en **dos modos**, con el lector y la decisión de antes escritos
literales dentro —`elSaldoDeAntes`, `cuantosTrozosDeAntes`, `laDecisionDeAntes`—
y afirmando el fallo: sobre esa misma fila, «cuesta 14 y quedan 0». Y
comprobado lo único que dice que un banco mira: **quitándole cada arreglo al
modo bueno se pone en rojo** —el `total < 0`, el `sin_bolsa` y el recuerdo del
último motivo, cada uno por sus casos—.

De paso se resucitaron tres bancos que **no arrancaban**: el de las notas de voz
se caía al importar `porQueNoHayTexto`, que dejó de existir en un renombrado, y
los de la nota del equipo y la reunión no tenían quien los compilara. Un banco
que no arranca no se lee como un fallo: se lee como que ahí no hay nada que
probar.

## Quién paga la IA se PREGUNTA, no se marca

Una cuenta consume créditos porque la llave de OpenAI que usa la paga Verzay. Si
el cliente pone la suya, la paga él, y entonces los créditos no pintan nada:
son ilimitados.

Eso **no es una columna**. No hay ninguna marca de «esta cuenta es ilimitada»
que alguien tenga que acordarse de poner y de quitar. Se compara la clave que la
cuenta está usando **ahora mismo** contra el registro de llaves de Verzay
(`verzay_api_keys`): si casa, consume; si no casa, no. Un cliente que quita su
key y vuelve a la nuestra vuelve a consumir sin que nadie toque nada.

La pregunta se hace en **dos sitios y con la misma respuesta**: la App
(`pagaElClienteSuIa`, en `lib/llaves-de-verzay.ts`) para lo que se enseña, y el
motor (`AiCreditsService.pagaElClienteSuIa`) para la puerta de verdad. Si los
dos no dicen lo mismo no hay forma de saber cuál miente: la pantalla diría
«ilimitados» y el motor seguiría descontando. Por eso los dos **eligen la clave
igual que `getUserDefaultAiConfig`** —su proveedor por defecto activo, luego
cualquiera activo, luego la primera—: decidir sobre una key distinta de la que
el agente usa es decidir sobre otra cosa.

Tres cosas que hay que mantener:

1. **Sin key no es ilimitado**, y **un fallo de lectura tampoco**. Las dos
   cosas se resuelven como «consume», que es el lado seguro: dar ilimitado por
   un error es regalar consumo que paga Verzay. El motor además **lo dice**
   cuando no puede leer el registro.
2. **Una llave desactivada sigue siendo de Verzay.** El interruptor decide si
   recibe cuentas nuevas, no quién paga el consumo de las que ya tiene.
3. **Borrar una llave sin traspasar sus cuentas está prohibido**, y no solo
   porque se queden sin servicio: al desaparecer del registro, sus cuentas
   pasarían a contar como «llave propia del cliente» y recibirían créditos
   ilimitados sobre una key muerta. El traspaso va **dentro de la misma
   transacción** que el borrado.

### El reparto es por cupo, y solo toca a las cuentas NUEVAS

Antes la llave era **una sola**, `SECRET_API_KEY`, la misma para todas y sin
ningún tope: el día que OpenAI la bloqueó se cayeron todas a la vez.

Ahora Carlos registra varias en Panel › API keys, cada una con su cupo. Una
cuenta nueva se lleva la marcada **por defecto**; cuando esa llega a su cupo, el
reparto pasa solo a la siguiente libre (`elegirLaLlave`, puro y probado). Y
**las cuentas que ya existen no se mueven nunca por esto**: se quedan con la que
tienen. Lo único que las mueve es un traspaso explícito al borrar o al cambiarle
la clave a su llave.

Dos cosas:

1. **El contador es un `COUNT`, no una columna.** Cuántas cuentas cuelgan de una
   llave sale de `COUNT(DISTINCT "userId")` sobre `user_ai_configs`, que es
   donde está la verdad. Guardado, se desincroniza en cuanto un cliente cambie
   su key —que es justo lo que la regla de arriba espera que pase— y el reparto
   decidiría sobre un número que ya no es cierto. Y `DISTINCT` porque una cuenta
   tiene una fila por proveedor: contando filas, la misma cuenta cuenta dos
   veces (el fallo de la línea de 576 chats que decía 1036).
2. **La clave no viaja al navegador.** Lo que se pinta son los últimos cuatro
   caracteres, que es lo único que hace falta para reconocerla.

### Y el recuerdo de «ya creé la tabla» se cae solo si la tabla se va

Las tablas de la App se crean con `CREATE TABLE IF NOT EXISTS` y el proceso
recuerda que ya lo hizo. Ese recuerdo es **del proceso, no de la base**: si la
tabla desaparece por debajo —una restauración, un entorno recién levantado—, el
recuerdo sigue diciendo que existe y **todas** las consultas fallan con `42P01`
hasta que alguien reinicie el contenedor.

Lo encontró el banco de pruebas: con la tabla borrada a mano, ocho
comprobaciones seguidas se caían y ninguna se recuperaba. Por eso el acceso va
por `conLaTabla(...)`, que ante un `42P01` **olvida el recuerdo, la crea y
reintenta una vez**. Una, no un bucle: si tampoco va la segunda, el problema no
era que faltara la tabla.

### Un centinela acaba impreso, y un registro vacío no es una respuesta

Las dos formas en que esto se rompió en producción el día del despliegue. Las
dos cuestan lo mismo de evitar y las dos se leen desde fuera como que la App
miente.

**1. Un valor centinela acaba en la pantalla de un cliente.** «Sin tope» se
decía con números —`total: -1`, `available: 999999999`— y nadie los traducía:
se metieron tal cual en la plantilla de un aviso de WhatsApp. Una clienta con
plan Básico recibió

> 🚨 URGENTE: solo tienes **999999999 de -1 créditos** disponibles (5%).

mientras su panel decía, correctamente, 12.000 totales y 3.636 disponibles.

Y el «5%» venía de la misma raíz. El porcentaje se calculaba
`total > 0 ? Math.floor(available / total * 100) : 0`: con un total que no sirve
**se inventaba un 0**, y un 0 % entra por debajo del umbral más pequeño, que es
el más alarmante. **El respaldo no era neutro: era el peor caso posible.**

Tres reglas:

- **Un estado se dice con un campo, no con un número imposible.**
  `getCreditsByUser` devuelve `{ ilimitado: true }` y el resto de campos ni
  existen en esa rama. Con una unión discriminada **el compilador no deja**
  leer `total` sin mirar antes `ilimitado`; un comentario pidiendo cuidado, no.
- **Un número que no se puede calcular no se sustituye por otro.** Si no hay
  porcentaje, no hay aviso — no hay «0 %». Se dice en la consola y se calla
  hacia fuera.
- **Quien decide qué aviso sale es puro y está probado**
  (`aviso-de-creditos.ts`). El banco reproduce primero **el mensaje exacto de
  la captura** con la lógica vieja, y solo después demuestra que la nueva no lo
  manda. Sin ese primer paso no se sabe si se arregló la causa o algo parecido.

**2. Una lista vacía no es «ninguno»: es «todavía no está configurado».** La
regla de quién paga la IA preguntaba solo «¿está esta clave en el registro de
Verzay?». Con el registro recién creado y vacío la respuesta era «no» para
todas, así que **la plataforma entera pasó a ilimitada de golpe** — y de ahí
que el aviso con centinelas saliera por todas partes a la vez.

La condición correcta es **`hay registro Y la clave no está en él`**, y va igual
en los dos lados (la App y el motor). Si se añade otra regla que dependa de una
tabla que alguien tiene que llenar, se pregunta lo mismo: **distinguir «vacío»
de «no aplica» antes de dejar que decida nada.**

## `ia_credits.used` está en TOKENS y `total` en CRÉDITOS, a propósito

Dos columnas de la misma fila, en dos unidades distintas. Es raro y hay que
saberlo, porque **`used > total` es lo normal, no una corrupción**.

La conversión es `1 crédito = 3.085 tokens`:

- **Se escribe en tokens.** El único sitio que suma consumo es
  `AiCreditsService.trackTokens`, con `used: { increment: tokensInt }`. Todo lo
  demás que escribe `used` escribe **cero** (crear la cuenta, renovar, cambiar
  de plan). La pantalla de admin, que deja teclear créditos consumidos, los
  convierte antes de guardar (`onCreditsToTokens`).
- **Se lee en créditos.** `Math.floor(used / 3085)`, y
  `available = max(total - eso, 0)`. Lo hacen el motor (`getCreditsByUser`), el
  Perfil (`getOwnIaCredits`) y Analíticas.

### El falso positivo que genera, y cómo se reconoce

Mirando la tabla en crudo salta esto: «de 39 cuentas, 19 tienen `used > total`,
y son **todas** las que tienen consumo; el `used` mínimo es 38.320, por encima
del plan más grande (25.000)». Parece corrupción y no lo es.

**Esa comparación —38.320 contra 25.000— es tokens contra créditos, que es
justo el error que se está investigando.** En créditos son 12, por debajo de
cualquier plan. Y el umbral se cruza enseguida: **9 créditos consumidos ya son
27.765 tokens**, así que cualquier cuenta con uso real pasa de su `total` en
crudo. Por eso son 19 de 19.

La prueba de que el dato está sano es **leerlo como tokens y ver si sale una
cifra plausible**: el máximo de producción, 37.096.399, son 12.024 créditos —
normal. Leído como créditos serían 37 millones contra planes de 25.000, que es
imposible. Y la cuenta de la que había captura cuadra al dígito: 25.802.940
tokens → 8.364 consumidos, 3.636 disponibles, los mismos que enseñaba su panel.

> **«Recalcular» `used` dividiéndolo por 3.085 sería destructivo.** Los lectores
> ya convierten, así que se aplicaría dos veces: esa cuenta pasaría de 8.364
> créditos consumidos a **2**, y su saldo de 3.636 a 11.998 salidos de la nada.
> Regalaría el consumo de todo el mes a las 19 cuentas a la vez.

### Lo que sí hay que vigilar

**Ninguna comparación toca `used` y `total` en la misma expresión.** Los bugs
reales de esta familia han sido siempre ese: comparar sin convertir.

Ya pasó en el voicebot, que hacía `credit.used >= credit.total` y por eso daba
«sin créditos» a casi todo el mundo —bastaban **4 créditos** para agotar un cupo
de 12.000—. Se arregló llamando a `getCreditsByUser`, que es la puerta del chat:
**quien necesite saber si a una cuenta le quedan créditos pregunta ahí, no lee
la fila.** Es la misma regla de los contadores de Chats: un número se calcula en
un sitio, no en cada sitio que lo necesita.

Y queda un cabo suelto conocido: la conversión está escrita en **tres sitios y
con dos redondeos** —`TOKENS_PER_CREDIT` con `floor` en el motor,
`onTokensToCredits` con `ceil` en la App, y seis `Math.floor(... / 3085)` a
mano—. Por eso el Perfil y el `CreditsWidget` pueden diferir en un crédito para
la misma cuenta. Unificarlo es un frente aparte, pendiente.

## Los créditos se reponen AL PAGAR, y el cupo se lee de Panel › Planes

Nada reponía los créditos al pagar. El motor tiene su reloj
(`renewDueCredits`, cada hora) que los repone cuando su `renewalDate` vence,
pero esa fecha iba por libre: no la movía el cobro. Así que renovaba el mes que
tocara hubiera pago o no, y el cliente que acababa de pagar seguía con el
consumo del mes anterior encima. Desde fuera: **se paga y los créditos no
vuelven.**

Ahora el cobro los repone (`lib/renovar-creditos.ts`, llamado desde
`setUserBillingDueDateInternal`): `used = 0`, `total` = el cupo del plan, y
`renewalDate` = la nueva fecha de vencimiento, para que el reloj del motor no
los reponga otra vez a mitad de ciclo.

Tres cosas:

1. **El cupo se LEE, no se escribe en código** (`lib/cupo-del-plan.ts`). Sale de
   Panel › Planes, que es donde cada plan tiene su nombre comercial (Básico,
   Esencial, Business…) y sus créditos. Detrás van, por orden, la suscripción
   viva de la cuenta, la tabla vieja «Créditos por plan» —que es la que lee el
   motor— y el respaldo escrito, **solo** para que una cuenta no se quede en
   cero porque nadie configuró su plan. `deDondeSalio` dice cuál contestó: sin
   eso, un cupo raro no se puede explicar.
2. **`personalizado` conserva su total.** Es un acuerdo puesto a mano y
   reponerle un número calculado se lo borraría en la primera renovación. El
   consumo sí se repone.
3. **Un fallo aquí no puede tumbar el cobro**, y tampoco puede ser mudo: unos
   créditos que no se reponen en silencio no se ven como un error, se ven como
   «la IA dejó de contestar».

## Un ciclo pagado es UNA escritura, y los cuatro caminos pasan por ella

Había cuatro formas de dar un ciclo por pagado y cada una hacía una parte:

| camino | vencimiento | créditos | acceso |
| --- | --- | --- | --- |
| Wompi | lo movía | los reponía | lo reactivaba |
| «Marcar pagado» de Instancias | **no lo movía** | **no** | lo reactivaba |
| la fecha de «Editar pagos» | la escribía | **no** | según la fecha |
| «Aprobar» una suscripción | **no lo tocaba** | **los pisaba** | **no** |

La fila de «Marcar pagado» era la cara: el cliente quedaba «Pagado / Activo»
con el vencimiento viejo y **al día siguiente el trabajo diario lo volvía a
suspender**. Y la suscripción pagada por Wompi nacía en `PENDING_PAYMENT`, el
aviso de la pasarela no la miraba, y la pantalla solo tenía botones para
`PENDING_APPROVAL`: pendiente para siempre.

> **La regla está en `lib/ciclo-pagado.ts` (puro) y la única escritura en
> `lib/ciclo-pagado.server.ts` (`darElCicloPorPagado`)**: vencimiento, pagado,
> activo, sin marca de suspensión, recordatorios en cero, créditos repuestos
> (`renovarLosCreditos`) y la cuenta habilitada si la cortó la suspensión. Lo
> que se avisa cuando cambia el estado —webhook, mensaje, Robot— es
> `avisarDelCambioDeCobro`, una sola versión para los caminos manuales y los de
> la pasarela. **Si se añade otro camino de pago, va por esas dos.**

Seis cosas que hay que mantener:

1. **«Marcar pagado» es pagar UN ciclo**, con la misma cuenta que Wompi
   (`elSiguienteVencimiento`): desde el vencimiento si no ha pasado —pagar antes
   no pierde días— y desde hoy si ya pasó.
2. **«Editar pagos» repone créditos solo si la fecha AVANZA** (`esUnaRenovacion`).
   Corregirla hacia atrás o borrarla no regala un mes de consumo.
3. **«Aprobar» no pisa lo pactado a mano**: el plan `personalizado` se queda
   (`elPlanQueQueda`) y con él su total; se repone el consumo. Y solo se aprueba
   lo que está pendiente: volver a aprobar una activa regalaría otro mes.
4. **Crear la fila de créditos es solo de «Aprobar»** (`crearSiFalta`). A un
   pago normal no: una cuenta sin fila la deja pasar el motor sin tope, y
   crearla le pondría un límite que nadie pidió.
5. **Wompi activa la suscripción que esperaba su pago**
   (`activarLaSuscripcionPagadaPorWompi`), ANTES de escribir el ciclo: el cupo
   que se repone sale de esa suscripción. Un fallo ahí no tumba la renovación,
   pero se dice.
6. **Las dos pendientes se ven y se aprueban**: la pestaña por defecto es
   «Pendientes» (`ESTADOS_PENDIENTES`), y el botón sale en las dos. Las fechas
   del diálogo se leen a medianoche LOCAL, como «Editar pagos».

Y un cambio de paso que se dice: el aviso de un cambio manual (marcar, suspender,
activar) sale ahora por la línea que toca a ESE cliente
(`loadBillingDispatcherForUser`): a un cliente de reseller, por la de su
reseller y nunca por la de Verzay, que es la regla que la pasarela ya cumplía.

### Y al pagar la cuenta VUELVE, sin importar por qué quedó inactiva

El pago solo volvía a habilitar la cuenta (`User.status`) si su acceso venía de
`SUSPENDED`. Una cuenta deshabilitada por otro camino —el interruptor de
Instancias, la cascada de un reseller, un «Activar» que solo tocaba el acceso—
quedaba «Pagado / Activo» con `status` en falso, y eso es **invisible en
Instancias**, **fuera de «Activos»** y **fuera del cobro diario**, que también
pide `status: true` (`dondeEntraEnElCobro`, `lib/candidatos-del-cobro.ts`): su
próximo cobro no salía nunca, sin ningún error.

> **La única escritura que devuelve la cuenta es `devolverElAcceso`**
> (`lib/devolver-el-acceso.server.ts`): habilitada siempre, **salvo
> eliminada** (`deletedAt`; pagar no la resucita). La usan
> `darElCicloPorPagado` (Marcar pagado, Aprobar, Wompi), «Activar», «Editar
> pagos» cuando la fecha avanza, el trabajo diario al reactivar y la cascada
> del reseller. **Si se añade otro camino que reactive, va por ahí.**

Esto deshace media frase de arriba —«una cuenta que un administrador
deshabilitó a mano estando al día no se habilita por pagar»—: ahora sí, porque
así se pidió. Y la otra mitad: **Instancias enseña también las SUSPENDIDAS por
impago** (`seVeEnInstancias` / `DONDE_SE_VE_EN_INSTANCIAS`,
`lib/ciclo-pagado.ts`): es la pantalla donde se cobra, y al suspenderse
desaparecían justo las que había que cobrar. Lo eliminado sigue sin salir.

Lo prueba `lib/__tests__/acceso-al-pagar-db.test.mjs` (en el mismo banco), con
su propio «antes» pinchado (`ANTES_ACCESO_REF`): los cinco caminos dejan la
cuenta habilitada, visible y dentro del próximo cobro, y una eliminada no
vuelve.

Lo prueba `scripts/banco-ciclo-pagado.sh`: la regla sin base, y las cuatro
puertas de verdad contra Postgres —las acciones y la ruta de Wompi con un
evento firmado—, incluido el trabajo diario del día siguiente. `MODO=roto`
empaqueta las mismas pruebas contra `ANTES_REF` y afirma los fallos.

## Vencimientos: un DÍA, no un instante, y quien lo juzga es uno solo

Las tarjetas de Proyectos y de Tickets llevan fecha de vencimiento, con un
distintivo de color, dos avisos en la campanita y un filtro en el tablero.

**Lo primero que hay que saber, porque cambia cómo se lee todo lo demás:** en
Proyectos la fecha **ya existía y es obligatoria** (`tasks.dueDate`, `NOT NULL`
en una tabla del BACKEND), así que ahí el distintivo sale siempre. Opcional de
verdad lo es en Tickets, donde la columna es nuestra. Hacerla opcional en
`tasks` sería una migración del backend, que es lo que reventó el #360.

### Se compara por DÍA, y eso era un fallo vivo

Lo que había en la tarjeta de Proyectos era:

```ts
const overdue = new Date(iso) < new Date();
```

O sea por **instante**. Una tarea que vencía hoy a las 18:00 salía **en rojo a
las 18:01**, y a las 09:00 ya estaba roja si la hora guardada eran las 08:00.
Un vencimiento es un **día**: mientras quede día, no se ha pasado; y lo que
venció ayer a las 23:59 está vencido a las 00:01 de hoy aunque falten segundos
de reloj.

Todo se reduce a **cuántos días naturales faltan** (`diasQueFaltan`, que aplasta
las dos fechas a medianoche **antes** de restar — restar en crudo y dividir por
86.400.000 da cero entre las 23:00 y las 01:00, que es el mismo fallo por otra
puerta).

> **Quien juzga un vencimiento es `lib/vencimiento.ts`, y es puro.** De ahí
> tiran **cuatro** sitios que tienen que decir exactamente lo mismo: las dos
> tarjetas, los dos filtros y el trabajo diario que manda los avisos. Con la
> cuenta escrita en cada uno, una tarjeta puede salir en rojo sin que haya
> salido ningún aviso — y eso no se lee como un error, se lee como que los
> avisos no funcionan.

Tres colores y un apagado: **neutro** cuando falta más de un día, **ámbar** hoy
o mañana, **rojo** pasado, y **nada** cuando la tarjeta está terminada o no
tiene fecha. Lo de terminada es el encargo entero de esa palabra: sin ello la
columna «Hecho» de un tablero con un mes de historia sale **entera en rojo**, y
el rojo deja de significar nada.

### Los dos avisos van a la campanita, y NO sacan la ventana que interrumpe

Es la decisión que más fácil se deshace sin querer. `avisosPorSaltar` traía
**todo** lo que tuviera `atendidoEn IS NULL`, así que un tipo nuevo salta la
ventana por defecto. Ahora acota por `TIPOS_QUE_INTERRUMPEN`, y `vence` no está
dentro.

Los otros cuatro tipos son cosas que **acaba de hacer una persona** —te asignó
algo, comentó, te mencionó—: interrumpir ahí es para lo que esa ventana existe.
Un vencimiento no lo hizo nadie, lo dispara el calendario, y le toca **a la vez,
el mismo día y a la misma hora, a todo el que tenga algo que vence**. Una
ventana que no se cierra sola saltándole a medio equipo cada mañana es
exactamente lo que este documento lleva media docena de reglas evitando — y el
precio no es ese aviso: es que con él se empiezan a despachar sin leer los otros
cuatro.

### Sin repetir: lo decide la BASE, y la clave lleva la FECHA dentro

`avisos_de_vencimiento` es una tabla de la App con
`CREATE TABLE IF NOT EXISTS`, sin clave foránea, y su clave primaria es
**`(qué, cuál, hito, día, destinatario)`**. Se apunta con
`ON CONFLICT DO NOTHING` y **quien decide si el aviso era nuevo es Postgres, por
las filas que dice haber tocado** — no un `SELECT` previo nuestro: dos vueltas
solapadas del cron verían las dos que no existe y mandarían las dos el mismo
aviso. Es la misma regla que `anotarUnaVezAlDia` del reparto del trabajo.

Y **la fecha va dentro de la clave** a propósito: mover el vencimiento es un
aviso nuevo, porque es una fecha nueva. Sin ella, aplazar una tarjeta ya avisada
la dejaría muda para siempre.

Cuatro cosas más:

1. **Se apunta ANTES de crear el aviso.** Al revés, dos vueltas solapadas
   crearían los dos avisos y solo después se darían cuenta. Lo que se arriesga
   con este orden es perder un aviso si la creación falla justo después; con el
   otro, mandarlo dos veces — y de los dos, ese es el que se nota.
2. **Dos hitos y ninguno más**: la víspera y el día. Lo ya vencido **no vuelve a
   avisar** —el distintivo rojo ya lo está diciendo—; insistir cada día es lo
   que ya costó una vuelta en los recordatorios de Cobros.
3. **El destinatario es el responsable; si no hay, quien la creó.** La segunda
   mitad es la que importa: sin ella una tarjeta sin asignar no avisaría a
   nadie, que es justo la que más fácil se olvida. Y es la **PERSONA**, como
   todos los avisos: los ids salen ya de columnas de persona
   (`assignedToId`, `createdById`, `responsableId`, `creadoPorId`) y **no** de
   las de alcance (`ownerId`, `clienteId`, `destinoId`). Con una de esas, el
   aviso queda a nombre de una cuenta y no le aparece a nadie.
4. **Cuelga del cron diario que ya existe** (`/api/cron/billing`), envuelto en
   su `try` como los cobros: un fallo suyo no puede tumbar el cobro de la
   plataforma, y su cuenta sale en la respuesta para que se vea si un día deja
   de mandar nada. Un cron propio es un segundo sitio que puede dejar de
   dispararse sin que nadie se entere.

### Y con un filtro puesto NO se reordena la columna

Los dos tableros guardan el orden escribiendo **la columna entera**. Con el
filtro puesto esa lista son solo las tarjetas visibles, así que las escondidas
perderían su sitio y saltarían al principio **al quitar el filtro** — que es
cuando ya nadie relaciona las dos cosas. Es el mismo fallo que la rejilla de
Proyectos evita calculando el movimiento sobre la lista completa; aquí no se
puede, porque no hay forma de saber entre qué dos escondidas cae.

Así que se rechaza, **y no en silencio**: sale «Quita el filtro de vencimiento
para reordenar la columna». Un arrastre que se rinde callado se ve como «la
tarjeta no se queda donde la dejo». Cambiar de columna sigue funcionando.

Y **«esta semana» incluye lo vencido**: lo que se pasó de fecha no deja de ser
de esta semana el lunes siguiente, y escondérselo a quien pregunta «qué me
vence» es justo el dato que iba a buscar. Lo terminado no pasa ningún filtro de
vencimiento: su distintivo está apagado, y una lista de urgencias con trabajo
hecho dentro no sirve para lo que se abre.

### Una fecha de un `<input type="date">` no se corta sobre UTC

`toISOString().slice(0, 10)` es la forma corta y está mal: pasa a UTC antes de
cortar, así que una fecha guardada el día 20 por la tarde en Colombia sale como
el **21**. El campo enseñaría un día distinto del que pinta el distintivo de al
lado, y reabrir y volver a guardar sin tocar nada le correría la fecha un día,
**cada vez**. Va con `elDiaDelInput`, que usa la zona de quien mira.

Lo mismo del lado del servidor: el runner sella el día con la zona del servidor,
igual que `diaDelCierre` en el reparto del trabajo.

### Medido en Chromium

Sobre el CSS del build, a 1440, 1024 y 390, con las columnas fijas como en el
tablero de verdad:

| | sin distintivo | con distintivo |
| --- | --- | --- |
| tarjeta de Proyectos | 89 px | **89 px** |
| tarjeta de Tickets | 89 px | **107 px** |

La de Proyectos **no crece**: el distintivo entra en la fila de metadatos que ya
estaba. La de Tickets sí, 18 px, porque esa fila ya lleva «Esperando hace…» y el
responsable y el distintivo salta de línea — es el mismo `flex-wrap` que ya
tenía con un nombre de cliente largo, así que no es un comportamiento nuevo,
pero **una columna de tickets queda con alturas mixtas** (89 los que no tienen
fecha, 107 los que sí). Si algún día molesta, lo que hay que mover es esa fila,
no el distintivo.

El distintivo mide 16 px de alto y de 48 a 102 px de ancho según lo que diga, y
no se sale de la tarjeta en ninguna de las tres anchuras.

## Chats: el SENTIMIENTO del cliente se analiza al ABRIR Chats, y lo paga la cuenta dueña

Cada mensaje entrante se clasifica en **positivo, neutro o negativo**. Tiñe el
aro que YA tiene el avatar en la lista (verde pastel, rojo suave; neutro es el
de siempre), saca una franja delgada «El cliente parece molesto» encima de la
barra de escribir, y alimenta el reporte **Sentimiento** de CRM › Analíticas
(caídas a negativo por día y por asesor).

**Cuándo: solo al abrir Chats.** Los webhooks los recibe el backend, que es
otro repositorio, así que la App analiza lo que ya está en `chat_messages`. Y lo
hace **únicamente cuando alguien abre la pantalla de Chats**: la página del
servidor lanza de fondo (`void`) `analizarElSentimientoAlAbrirChats` sobre las
cuentas y líneas de esa bandeja, y cubre **TODO lo pendiente** —página a página,
sin ventana de tiempo—: las conversaciones con un mensaje del cliente posterior
a su último análisis. Lo ya analizado sin mensajes nuevos no se reanaliza y
conserva su color. El resultado viaja en la vuelta siguiente de la lista
(`sentimientos`, `linea::jid` bajo las TRES identidades), que solo LEE.

**Ni reloj ni repaso diario, a propósito.** Antes lo lanzaba cada vuelta de
`/api/chats/lista` (cada 20 s por pestaña) y un barrido diario en
`/api/cron/billing`, sin descontar un crédito: consumo de IA que pagaba la
plataforma. **Si nadie abre Chats, no se analiza nada ni se consume nada.**

Los pendientes se buscan desde `chat_conversations` (una fila por conversación)
con un `LATERAL … LIMIT 1` al último mensaje entrante por su índice exacto: sin
ventana de tiempo, recorrer `chat_messages` de una cuenta entera en cada
apertura sería leer cientos de miles de filas. Una cuenta que se queda sin
créditos sale de las páginas siguientes (sus conversaciones siguen pendientes
para cuando recargue), y lo que falla en una apertura no se repite en bucle: se
reintenta en la próxima.

Seis cosas que hay que mantener:

1. **Se analiza el último mensaje ENTRANTE**, no el último a secas: con la IA
   activa el último es su respuesta, y mirándolo no se analizaría nada.
2. **Con la IA de la cuenta dueña de la línea** (`laIaDeLaCuenta`, la misma
   consulta que `resolveUserAiClient` sin la puerta de sesión: la cuenta sale de
   la fila, nunca del navegador). **Cada análisis descuenta sus tokens de ESA
   cuenta** —no de quien abrió Chats—, y sin créditos no se llama a la IA. Es la
   regla de *Todo uso de IA lo paga la cuenta dueña*.
3. **Dos a la vez no pagan dos**: `reclamarElAnalisis` es un `ON CONFLICT DO
   UPDATE … WHERE`; el reclamo caduca a los 2 min si quien lo tomó murió.
4. **Lo que no se entiende NO es neutro**: una respuesta rara, o una cuenta sin
   IA, conserva lo que había. Inventar un neutro borraría un negativo y la
   franja se iría sin que el cliente mejorara.
5. **La franja se cierra POR CAÍDA** (`negativoDesde` en la llave, en
   `sessionStorage`): cerrada sigue cerrada mientras siga negativo, se va sola al
   mejorar, y una caída nueva vuelve a salir.
6. **Una caída se cuenta una vez por conversación y día**
   (`sentimiento_caidas`), con el asesor de su ficha en ese momento; el reporte
   pasa por `lasCuentasQueConsultaElCrm`, la puerta del CRM.

### El aro NEUTRO es un gris que se VE, y ninguna conversación se queda sin color

Había conversaciones sin ningún aro aunque se abriera Chats. Eran tres cosas a
la vez, y las tres se ven igual desde fuera:

1. **El aro neutro era el color del FONDO** (`ring-background`): invisible en
   claro y en oscuro. Ahora es `ring-slate-400 dark:ring-slate-500`, medido en
   Chromium con más contraste que el verde y el rojo en los dos temas.
2. **El neutro no viajaba a la pantalla**: la lista solo traía positivo y
   negativo. Ahora trae los tres (`losSentimientosDeLasLineas`).
3. **La fila buscaba solo por su id**, y el sentimiento se guarda bajo las tres
   identidades: la fila y la conversación abierta buscan por TODAS
   (`identidades`, `identidadesParaPedirMensajes`).

Y lo que no se analizaba nunca: una conversación guardada bajo otra fila de la
bandeja (la persona que atiende, una vinculada). Abrir Chats analiza ahora las
cuentas de la bandeja entera (`allSessionUserIds`), y **la paga la dueña de la
LÍNEA** (`pagador`, de `Instancias`), no la fila bajo la que se guardó. Una
cuenta sin créditos se excluye de las páginas siguientes por su `pagador`.

Dos tablas de la App (`sentimiento_de_conversacion`, `sentimiento_caidas`), con
`ddl()` y sin clave foránea: ni una columna en `Session` ni en `chat_messages`.
Lo prueba `scripts/banco-sentimiento.sh`: reglas, barrido, el análisis contra
Postgres con la IA fingida y la franja en Chromium; `MODO=roto` lee `ANTES_REF`
y afirma que no había nada de esto. Y `scripts/banco-cobro-de-ia.sh` prueba el
cuándo y el cobro (ver la sección siguiente).

### La calibración: se juzga lo ÚLTIMO del cliente, y nace APAGADO

Medido en producción (2026-10-02): de las conversaciones en rojo, casi todas
eran clientes dando un dato, contestando, objetando el precio o diciendo «no
gracias». Tres causas, y las tres se arreglaron (`VERSION_DE_LA_CALIBRACION`,
2):

| causa | arreglo |
| --- | --- |
| la IA leía ocho líneas de contexto: una queja de hace días teñía el mensaje de hoy, aunque se le dijera «no lo juzgues». Aislados, esos mismos mensajes salían neutro | se juzga solo el último tramo del cliente (`losMensajesQueSeJuzgan`, hasta 5) y de contexto va UNA línea, lo último que dijo el negocio (`LINEAS_DE_CONTEXTO`) |
| la instrucción no decía qué NO es negativo | lo dice, con ejemplos: un dato, una pregunta urgente, «muy caro», «no gracias», una falla técnica sin enojo son neutro; negativo es enojo CONTRA el negocio. «Ante la duda, neutro» |
| «No es negativo, es neutro» se leía negativo (ganaba la primera palabra) | `leerElSentimiento` quita las palabras negadas |

Sobre una muestra de 50 conversaciones en rojo, la calibración nueva dejó en
rojo 24, y las que quedan son quejas de verdad («mentirosos», «nadie
contesta», «llevo un año esperando»).

**Los rojos de antes no se arrastran**: un negativo sin la versión nueva se
pinta como neutro, vuelve a entrar en los pendientes UNA vez y, si ya no es
negativo, su caída se borra del reporte (`recalibrando`). El reporte solo
cuenta caídas de la calibración nueva.

**Y la función nace APAGADA** para toda cuenta, también las que ya existían:
`sentimiento_ajustes` (tabla de la App, sin columna en `User`), y sin fila es
apagada. Lo enciende **solo el dueño de la cuenta** (`esElDuenoDeLaCuenta`,
`lib/dueno-de-la-cuenta.ts`: el súper administrador de verdad, o quien entra
con su propia fila sin colgar de nadie y sin «Ingresar») en Perfil ›
Comportamiento › «Análisis de sentimiento»; la tarjeta no se pinta a nadie más
y las dos acciones lo vuelven a preguntar. Apagada, para esa cuenta: no se
analiza ni se cobra (`losPendientes` lo mira por la dueña de la LÍNEA), el aro
vuelve al de antes y no hay franja (`lineasConSentimiento` de la lista), y el
reporte del CRM dice que está apagada.

Lo prueba `scripts/banco-sentimiento.sh`, que corre además
`sentimiento-calibracion.test.mjs` (las reglas, el interruptor y la
recalibración contra Postgres); `MODO=roto` compila `lib/sentimiento.ts` de
`2114b64` y afirma los fallos.

## Todo uso de IA lo paga la cuenta DUEÑA de lo que se analiza

**La regla, sin excepción**: todo uso de IA en la plataforma descuenta créditos
de la cuenta dueña de esa conversación (o de ese correo), **nunca de otra cuenta
ni lo asume la plataforma**. La dueña de una conversación es la de su LÍNEA: la
madre que mira una conversación de Ventas no paga lo de Ventas.

Lo decide `lib/cobro-de-ia.ts` (puro) y lo aplica `lib/cobro-de-ia.server.ts`,
con las MISMAS funciones de saldo y descuento que las transcripciones
(`elSaldoDeLaCuenta`, `descontarLaTranscripcion`):

1. **Antes**: `antesDeUsarLaIa(cuenta)`. Sin créditos o sin bolsa no se llama a
   la IA y se dice por qué, nombrando la cuenta. Una cuenta que paga su propia
   IA es `ilimitado`: no se le descuenta, pero tampoco la paga la plataforma —la
   paga ella con su llave—.
2. **Después**: `cobrarElUsoDeIa(...)`, con los tokens que dijo el proveedor
   (`AiClient.complete` los devuelve ahora); sin ellos se estiman por el largo,
   y **nunca cero**. Se cobra aunque la respuesta no se entienda: la IA se usó.

La usan el **sentimiento**, la **sugerencia de respuesta de Chats** (que ahora
recibe la línea: `instanceName` → dueña, con `laCuentaDeLaAccion`, hacia abajo y
nunca hacia arriba) y la **de Correo** (la cuenta del buzón). Transcripciones,
calidad y llamadas ya cobraban por su camino. **Si se añade otro uso de IA, va
por estas dos funciones.**

**Y ya no queda ninguno sin cobrar.** Los que faltaban —el copiloto, el
asistente de prompts (y su «analizar instrucción»), el resumen al cerrar una
conversación, la puntuación del lead, el informe semanal, el aprendizaje de
ventas y su playbook, las imágenes con IA y su copy, el simulador de chat y el
generador del agente— pasan por **`usarLaIaCobrando`**
(`lib/cobro-de-ia.server.ts`), que junta las dos mitades: mira el saldo, llama,
y cobra SOLO si la IA contestó (si la llamada lanza, no se cobra). Los que van
a OpenAI por `fetch` usan `pedirAOpenAiCobrando` (`lib/openai-cobrado.server.ts`).

Cuatro cosas que hay que mantener:

1. **Quién paga, por uso**: lo que se hace sobre una CONVERSACIÓN (resumen,
   puntuación, aprendizaje) lo paga `session.userId`; lo que se hace en una
   pantalla de la cuenta (copiloto, prompts, imágenes, simulador, generador),
   `user.effectiveId`, y la IA se resuelve con ESA misma cuenta. El informe
   semanal, la cuenta del informe.
2. **Los tokens salen del proveedor** (`losTokensDelProveedor`: `usage` de
   OpenAI, `usageMetadata` de Gemini); si no los dice, se estiman, nunca cero.
   Una imagen de `imagen-4` no dice tokens y cuesta `TOKENS_DE_UNA_IMAGEN`.
3. **Sin créditos se DICE**, con el aviso que nombra la cuenta: el copiloto y
   la puntuación lo devuelven, las imágenes lo lanzan, y lo que corre de fondo
   (resumen, informe) cae en su respaldo sin IA. Puntuar en lote se para en el
   primer «sin créditos».
4. **El barrido del banco falla si aparece otra llamada a una IA** sin pasar
   por el cobro; las que cobran por su propio camino (transcripciones,
   grabaciones, calidad) están en su lista de excepciones con su motivo.

Lo prueba `scripts/banco-cobro-de-ia.sh`, contra Postgres con el cliente de IA
fingido: 130 pendientes (más de una página, la mitad de hace horas) se analizan
todos al abrir y los paga la hija aunque abra la madre; sin nadie abriendo no se
consume nada; reabrir no repaga; sin créditos no se llama a la IA. `MODO=roto`
lee `ANTES_REF` y afirma que la lista y el cron analizaban sin cobrar.

## La página de un plan (`/planes/<plan>`) se arma EN VIVO del panel de Planes

«Ver toda la información del plan» llevaba a una página con texto que nadie
mantenía: copiaba `features` tal cual —con «Plan Intermedio» y «12.000
créditos» escritos cuando el plan ya se llamaba de otra forma y traía 8.000—,
pintaba testimonios, estadísticas, galería y secciones de marketing iguales
para todos los planes, servía planes APAGADOS, nombraba el nivel con una tabla
fija («Nivel 3») y **pedía sesión**: `/planes/` no estaba en el middleware y
quien la abría desde la landing iba al login.

Ahora son cuatro bloques, en este orden y ninguno más:

| bloque | de dónde sale |
| --- | --- |
| **hero con el video del plan** | `plan_details.videoUrl` (YouTube, Vimeo, Loom, Drive o un archivo), su título y los botones |
| **resumen de capacidad** | créditos (`SubscriptionPlan.credits`), catálogo (`elTopeDeProductos`, el MISMO número que limita Productos) y asistencia (IA 24/7 o IA + humana) |
| **funciones por categoría** | las encendidas del plan, agrupadas por las categorías del menú, cada una con su tutorial si existe |
| **preguntas frecuentes** | solo las de ese plan (`plan_details.faqs`) |

> **Nada de la página está escrito en el componente.** La arma
> `laPaginaDelPlan` (`lib/pagina-de-plan.server.ts`, `force-dynamic`) con lo
> que hay hoy en el panel, y las reglas son puras en `lib/pagina-de-plan.ts`.
> Apagar, renombrar o describir una función en el panel se ve la próxima vez
> que se abre la página.

Seis cosas que hay que mantener:

1. **`features` sigue siendo la lista de nombres encendidos**, en su orden:
   la leen la landing, el registro y media plataforma. Lo demás de cada
   función —categoría, descripción, tutorial, si está apagada— va en
   `plan_funciones`, tabla de la App (`subscriptionPlanId` como clave, JSONB,
   `ddl()`). **Ni una columna en `SubscriptionPlan`** (#360). Guardar con el
   editor rehace `features` desde la lista (`losFeaturesDeLasFunciones`).
2. **Si `features` cambia por otro camino, la página no se rompe**
   (`lasFuncionesDelPlan`): lo guardado se usa tal cual si sus encendidas son
   exactamente `features`; si no, se rehace por nombre conservando lo que se
   sabía, y una función nueva se coloca sola (`sugerirLaFuncion`: «Tareas» →
   Herramientas con su guía). Sin `plan_funciones` legible, todo se deduce.
3. **Lo guardado que ya no cuadra con el plan NO sale, y el panel lo dice**
   (`losAvisosDelTexto`): un texto que nombra otros créditos, otro tope de
   catálogo o un nombre viejo del plan. Se escribe con datos vivos —`{plan}`,
   `{creditos}`, `{catalogo}`, `{precio}`, `{asistencia}`— en vez de números.
4. **Una función de categoría «capacidad» no se lista**: es la que dice los
   créditos o la asistencia, y eso ya lo dice el resumen con el dato de hoy.
5. **Guardar el detalle a medias no borra lo demás.** `upsertPlanDetail`
   escribe solo los campos que llegan (`CAMPOS_DE_TEXTO`, `CAMPOS_DE_LISTA`):
   antes guardar el video vaciaba los testimonios y las preguntas. Los
   testimonios, la galería y las estadísticas que hubiera guardados se quedan
   en la base y no se enseñan.
6. **Un plan apagado no tiene página** (`elPlanQueSeEnsena`: cae al otro tipo
   de asistencia si está activo; sin ninguno, 404), ni un plan de reseller.
   Los enlaces de los botones y del tutorial pasan por `comoEnlaceDelBoton` y
   `comoTutorial`: ni `javascript:` ni `//otro.com`.

La tarjeta de la landing dice lo mismo que la página: el mismo nombre,
precio, créditos y botones (la ventana intermedia, `PlanDetailModal`, ya no
existe: ver la tercera vuelta).

Lo prueba `scripts/banco-pagina-de-plan.sh`: la regla y un barrido, las
acciones contra Postgres (guardar, apagar, renombrar, describir, cambiar los
créditos, apagar el plan, un cliente que intenta guardar) y la página real en
Chromium sobre el CSS del build a 1440 y 390. `MODO=roto` corre lo mismo contra
`88ade1f` y afirma el texto viejo, el plan apagado servido, los testimonios
pintados y el guardado que los borraba.

### Y la segunda vuelta: el botón al FINAL, «para quién», el plan superior, destacar y el video subido

La página tiene ahora seis bloques: **hero · para quién es este plan ·
capacidad · funciones · preguntas · comenzar**. Cinco reglas, y cada una con
su porqué:

1. **El botón de comenzar sale UNA vez, en «comenzar», después de las
   preguntas**, con el precio otra vez encima. La barra fija de arriba solo
   lleva «Volver a planes»: el botón al lado del nombre y el precio pedía
   comprar antes de leer.
2. **«Para quién es este plan» son dos textos cortos** —a quién le sirve y un
   caso típico de negocio— en `plan_para_quien`, tabla de la App (sin clave
   foránea, ni una columna en `plan_details`). Lo decide `elParaQuienQueSale`,
   **campo por campo**: lo escrito sale si no tiene avisos (con los datos
   vivos `{plan}`, `{creditos}`…); si no hay nada o ya no cuadra, sale el de
   fábrica de su nivel (`PARA_QUIEN_DE_FABRICA`, sin números escritos, así no
   envejece). Guardar solo uno de los dos no borra el otro; vaciar los dos
   borra la fila.
3. **La línea hacia el plan inmediato superior es discreta y va al final**,
   debajo del botón («Conoce el plan X»). `elPlanSuperior` toma el siguiente
   nivel ACTIVO y no de reseller, prefiere el mismo tipo de asistencia y, si
   ese está apagado, cae al otro. El plan más alto no lleva línea.
4. **«Activa en el plan» y «destacada en la tarjeta corta» son dos marcas.**
   Apagar quita la función de TODO (página, modal, `features`); destacar solo
   decide si sale en la tarjeta corta de la landing (`lasFuncionesDestacadas`:
   activa Y destacada). Una función de antes sin la marca nace destacada, así
   la tarjeta no pierde nada. La tarjeta lee `plan.destacadas ?? plan.features`
   (`conSusDestacadas`, que si no puede leer cae a todas y lo dice); el modal
   y la página siguen con todas las activas.
5. **El video se puede SUBIR como archivo** (mp4, webm, mov), en el detalle de
   cada plan y en la landing general, con el mismo patrón que la miniatura
   (`VideoUploader`). Lo recibe `/api/upload-plan-video`, que **va FUERA del
   `matcher` del middleware a propósito** —Next 14 guarda entero el cuerpo de
   toda petición por la que pasa el middleware— y por eso lleva su propia
   puerta (`quienMandaEnLaCasa`). Lee los primeros bytes para saber qué es
   (`elVideoDeLaCabecera`, nunca el nombre ni el tipo que diga el navegador),
   pasa el resto al bucket sin cargarlo en memoria, y topa en
   `TOPE_DEL_VIDEO_SUBIDO` (150 MB). Una dirección que acaba en un video se
   pinta con `<video>` (`elVideoDelPlan`, `VideoDeLaLanding`); un enlace de
   YouTube o Vimeo sigue como antes.

Lo prueba el mismo banco con un segundo fichero (`plan-al-final.test.mjs`):
las reglas, la ruta con un bucket de mentira (sin sesión, un cliente, una
imagen, 200 MB, un WebM llamado `.mp4`), las acciones contra Postgres y la
página y la tarjeta reales en Chromium. Su `MODO=roto` corre contra `fd21c8f`
y afirma los dos botones con uno fijo arriba, la falta de «para quién» y de
plan superior, la tarjeta con todas y la landing sin video subido.

### Y la tercera vuelta: el video primero, tarjetas sueltas y los bloques se reordenan

> **Esta sección manda sobre las dos de arriba en el orden y el hero.** La
> página ya no tiene bloque de cabecera ni agrupa por categoría.

1. **La página arranca con el video.** Se fue el bloque de arriba que repetía
   el tipo de asistencia, el nombre, la descripción y el precio. El nombre se
   queda en un `<h1 className="sr-only">` (lectores de pantalla y SEO) y el
   precio sale UNA vez, en «comenzar».
2. **«Ver todo lo que incluye» de la landing es un ENLACE a la página**
   (`data-ver-el-plan`, `/planes/<plan>?tipo=<asistencia>`): la ventana
   intermedia se borró. En la landing incrustada (`?embed`) abre en otra
   pestaña con `noopener` (`enOtraPestana`).
3. **«Qué incluye» son tarjetas sueltas, una por función, en una columna y en
   el orden del editor** (`lasFuncionesQueSeEnsenan`). La categoría ya no
   agrupa ni reordena: lo que se arrastra en el editor de funciones es lo que
   se ve. Siguen fuera las apagadas, las de categoría «capacidad» y las que
   tienen avisos.
4. **Los seis bloques se reordenan desde el panel** (`video · paraquien ·
   capacidad · funciones · preguntas · comenzar`), arrastrando o con subir y
   bajar. Se guarda en `plan_pagina` (tabla de la App, `lib/plan-pagina-db.ts`,
   sin clave foránea), y el orden de fábrica con los recuadros sin tocar
   **borra la fila**. `comoOrdenDeBloques` sanea: lo que no es una lista es el
   de fábrica, sin repetidos ni claves raras, y un bloque que falte entra
   detrás de su vecino de fábrica, nunca al principio.
5. **Los recuadros de catálogo y asistencia se editan desde el panel**
   (título, valor y detalle, con los datos vivos `{catalogo}`,
   `{asistencia}`…, y un interruptor para apagarlos). Un campo vacío o que
   contradice al plan (`losAvisosDelRecuadro`, p. ej. «Hasta 50» en un plan de
   25) sale con lo de fábrica, campo por campo, y el panel lo dice. Los
   créditos salen siempre, primero, y no se editan.
6. **Un plan sin catálogo NO enseña ese recuadro** (`elPlanTraeCatalogo`: el
   Lite tiene 0), ni aunque se haya escrito uno encendido. Nunca «No
   incluido». A la medida (`personalizado`) sí lo trae: «A la medida».

Lo prueba el mismo banco con un tercer fichero (`plan-en-bloques.test.mjs`):
la regla, un barrido, las acciones contra Postgres (orden y recuadros
guardados, un tope viejo que no sale, lo de fábrica que borra la fila, un
cliente que no puede) y la página y la tarjeta reales en Chromium a 1440 y
390. Su `MODO=roto` corre contra `0b7c21f` y afirma la cabecera con nombre y
precio encima del video, las funciones agrupadas, «No incluido» en el Lite y
la ventana intermedia de la landing.

### Y la cuarta vuelta: los recuadros son una LISTA, la tarjeta en su orden y la landing en mensual

> **Esta sección manda sobre el punto 5 de la tercera vuelta.** Los recuadros
> ya no son tres fijos con campos que se pisan: son una lista.

**La tarjeta de un plan en la landing** (`PlanCard`, y la del reseller y la de
`/planes` dentro de la App con la misma regla):

1. **De arriba abajo: precio, créditos, puntos clave, «Ver todo lo que
   incluye» y el botón.** «Ver todo» va destacado (borde y letra a 14 px, 600)
   y ANTES del botón, que es lo último.
2. **Los créditos van en su pastilla junto al precio** («8.000 créditos de IA
   incluidos», `losCreditosDeLaTarjeta`), y la función que los nombraba no se
   repite en los puntos (`losPuntosDeLaTarjeta`, que la reconoce con
   `esLaLineaDeCreditos`). La descripción corta va a 14 px y más clara que la
   nota de facturación.
3. **«incluidos», nunca «gratis»**, en toda la landing: `conCreditosIncluidos`
   (`lib/creditos-incluidos.ts`) lo cambia AL PINTAR. Lo guardado en el panel
   no se toca, así que una función nueva escrita con «gratis» también sale bien.
4. **Las tres landings abren en Mensual** (`elPeriodoDeEntrada`,
   `lib/tarjeta-de-plan.ts`): trimestral o anual los elige quien quiera ver el
   descuento. Si no hay mensual, el más corto que haya.
5. **El párrafo de «¿Tienes un equipo o eres una agencia?» arranca en el mismo
   píxel que el ícono**, en escritorio y en móvil: va debajo de la fila del
   ícono y el título (`BloqueDeAgencias`), no al lado del ícono.

**La página de un plan:**

1. **Los recuadros de capacidad son una LISTA por plan** (`plan_pagina.recuadros`):
   cuántos y cuáles los decide el panel —hasta `TOPE_DE_RECUADROS` (6), cada
   uno con ícono (`ICONOS_DE_RECUADRO`), título, valor y detalle, con los datos
   vivos `{creditos}`, `{catalogo}`…—, arrastrándolos o con subir y bajar. **No
   dependen de las funciones**: apagar o renombrar una función no mueve un
   recuadro. `null` es «de fábrica» (`losRecuadrosDeFabrica`: créditos, catálogo
   si lo trae y asistencia); **una lista vacía no enseña el bloque**.
2. **Un recuadro sin dato no sale, nunca «No incluido»**
   (`porQueNoSaleElRecuadro`): sin valor, «0», «ninguno», «no incluido», un
   catálogo en un plan que no lo trae o un texto con avisos. El panel lo dice al
   lado de cada uno. Una lista guardada con la forma vieja (un objeto) se migra
   al leerla (`comoListaDeRecuadros`).
3. **El de asistencia de fábrica ya no copia la función de capacidad.** Antes,
   en los planes de asistencia humana, decía el nombre de esa función
   («Asistencia IA 24/7 - Humano hrs-L/V» en producción); ahora dice «IA +
   humana» con su detalle fijo. Quien quiera el texto de antes lo escribe como
   un recuadro.
4. **El tutorial de cada función va a la DERECHA, en la línea de su nombre**
   (`data-fila-de-la-funcion`), no debajo.
5. **Los títulos de sección no repiten el nombre del plan**: «Qué incluye este
   plan» y «Preguntas frecuentes». El cierre tampoco lleva título: el nombre
   va en el botón (ver *la guía se DESPLIEGA dentro, «Qué incluye» nace plegado*).
6. **El video va en su marco** (`data-marco-del-video`): un recuadro más claro
   que el fondo, con su borde y el título encima, para que no se lea como una
   imagen ni se pierda en el fondo oscuro.

Lo prueba el mismo banco con un cuarto fichero (`plan-configurable.test.mjs`):
las reglas, un barrido de las tres landings, las acciones contra Postgres
(cuatro recuadros que salen en su orden, la lista vacía que esconde el bloque,
cambiar funciones que no mueve nada, un cliente que no puede) y la página y la
tarjeta reales en Chromium a 1440 y 390. Su `MODO=roto` corre contra `df810cd`
y afirma los tres recuadros fijos, la asistencia que copiaba la función, el
tutorial debajo, los títulos con el nombre, «gratis» en la tarjeta, la
descripción apagada y el párrafo de agencias desalineado.

### Y el FORMULARIO va en el orden de la página, con sus bloques enteros

En el diálogo «Página de detalle» (Panel › Planes) los bloques del formulario
iban en un orden FIJO —video, para quién, capacidad, preguntas, comenzar— y el
orden de la página se elegía en una lista aparte, «Orden de la página». Con un
orden distinto al de fábrica había que saltar arriba y abajo para editar la
página de arriba a abajo, y «Qué incluye» ni tenía bloque.

> **El formulario pinta sus bloques con `orden`**, el MISMO que guarda la
> página: mover un bloque del formulario es moverlo en la página y en el índice
> de arriba, y al revés. Las reglas viven en
> `lib/bloques-del-formulario-del-plan.ts` (pura): `elOrdenAlSoltar`,
> `elOrdenAlMover`, `laMarcaDeLaCaida` y `elMasCercanoEnVertical`, y las usan
> el formulario y el índice. Con dos reglas, un día una diría que el bloque cae
> delante y la otra detrás.

Seis cosas que hay que mantener:

1. **Cada bloque se mueve ENTERO**: por su asa (ratón y teclado) o con subir y
   bajar; en el borde la flecha se QUITA, no se apaga. Cada uno dice su puesto
   y, si no va a salir (sin video, sin recuadros con dato, sin funciones
   encendidas, sin preguntas), lo dice al lado.
2. **Lo que flota al arrastrar es una tarjeta corta en un portal al `<body>`**
   (`createPortal(<DragOverlay>)`): el diálogo tiene `transform`, y dentro de
   él un `fixed` se coloca contra el diálogo y sale descolocado. Una raya
   (`data-marca-de-caida`) dice dónde cae, y es la misma cuenta que al soltar.
3. **La caída se decide por la ALTURA del puntero** (`porLaAltura` con
   `elMasCercanoEnVertical`), no por el centro: los bloques miden muy distinto
   —el video unas líneas, la capacidad una pantalla— y por el centro soltar al
   principio de uno largo caía en el de al lado.
4. **Mover no hace saltar la pantalla**: el bloque movido se queda a la misma
   altura (`useLayoutEffect` + `dejarArriba`, que desplaza solo el contenedor
   del diálogo). **Nada de `scrollIntoView`**, que mueve también la página.
5. **El índice lleva a cada bloque** (`data-ir-al-bloque`) y le da el foco.
6. **«Qué incluye» es un bloque más**: enseña las funciones encendidas en su
   orden (`funcionesQueSalen`, de `lasFuncionesQueSeEnsenan`, que Panel ›
   Planes le pasa) y se editan donde siempre, en la pestaña de funciones.
   «Pestaña del navegador y redes» no es un bloque de la página: va fija al
   final.
7. **Sin textos de explicación arriba ni abajo.** El pie es una fila:
   «Ver página pública» a la izquierda (o, con el plan apagado, por qué no se
   ve) y «Guardar» a la derecha (`data-pie-del-detalle`). Lo de antes
   (testimonios, galería…) sigue guardado y no se avisa.

Lo prueba `scripts/banco-bloques-del-formulario.sh` (hace falta el build): la
regla y un barrido, y la pestaña REAL en Chromium dentro del mismo diálogo, a
1440 y 390, con un orden guardado distinto al de fábrica: el formulario sale en
ese orden, se mueve con las flechas, con el índice, arrastrando con el ratón y
con el teclado, el índice lleva al bloque y guardar manda el orden nuevo.
`MODO=roto` pinta la pestaña de `165a431` y afirma el orden fijo.

## Planes: el nombre es UNO por nivel, y la dirección lleva el NIVEL sin la modalidad

Cuatro fallos de la zona de planes, reportados juntos:

| lo que se veía | la causa |
| --- | --- |
| la landing vendía el nombre ANTERIOR de un plan | cada nivel son varias filas (IA, Humano y las de reseller) y el panel solo escribía la que se editaba; la landing enseñaba la de Humano |
| `?tipo=HUMANO` y `&a=HUMANO` a la vista en las direcciones | la modalidad viajaba en la URL |
| `/planes/basico`, `?plan=avanzado` | la dirección llevaba el nombre interno del nivel |
| «Ver todo lo que incluye» pegado a «Comenzar ahora» | `space-y-*` no separa un enlace en línea |

> **El nombre comercial es uno por nivel.** Guardar un nombre lo escribe en
> TODAS las filas del nivel (`updateMany` por `plan` en
> `upsertSubscriptionPlan`), y guardar sin mandar el nombre lo conserva. Lo que
> ya estaba escrito distinto se lee con una regla (`losNombresDeLosNiveles`,
> `lib/nombre-del-nivel.ts`): el más reciente de la plataforma; el de reseller
> solo si no hay ninguno; sin nada, «Nivel N». La usan la landing, la página
> del plan, el panel y las etiquetas de marca (`conLosNombresVigentes`).

> **La dirección lleva el nivel y nunca la modalidad.** `/planes/nivel-1` …
> `/planes/nivel-6` y `?plan=nivel-N`; los enlaces los arma
> `lib/enlaces-de-planes.ts` (`elEnlaceDeLaPaginaDelPlan`,
> `elEnlaceDeRegistro`) y nadie los escribe a mano —un barrido lo exige—. La
> modalidad va en la cookie `plan_asistencia` (7 días; dentro de un marco,
> `SameSite=None; Secure; Partitioned`).

Cinco cosas que hay que mantener:

1. **El middleware limpia las direcciones viejas** (`laDireccionLimpiaDelPlan`)
   ANTES de decidir si una ruta es pública: el nombre interno pasa a `nivel-N`,
   `a=` y `tipo=IA|HUMANO` salen y su modalidad pasa a la cookie (307 con el
   `Set-Cookie` crudo: `cookies()` de Next no sabe `Partitioned`).
   `tipo=reseller` se queda: no es una modalidad. La lista de niveles es
   literal (el edge no lee Prisma) y el banco la compara con `PLANS`.
2. **La cookie no se da por buena**: `laAsistenciaQueSeVende`
   (`lib/asistencia-del-plan.server.ts`) solo la acepta si ese nivel se vende
   así; si no, la que se venda (IA primero). Sin eso, una modalidad apagada
   salía con precio 0.
3. **Lo único que lleva la modalidad en la dirección es la landing
   INCRUSTADA** (abre en otra pestaña, donde la cookie de este sitio puede no
   llegar); el middleware la pasa a la cookie y la quita al aterrizar. Y el
   enlace al plan que va al final de una PROPUESTA, por lo mismo: quien la abre
   no tiene la cookie.
4. **Los botones de la tarjeta van en `mt-auto flex flex-col gap-3`**
   (`data-botones-de-la-tarjeta`), nunca `space-y-*`.
5. **El nombre comercial se queda en la pantalla**, nunca en la dirección.

Lo prueba `scripts/banco-enlaces-de-planes.sh`: la regla y un barrido, las
acciones contra Postgres (renombrar desde IA renombra Humano y reseller,
guardar sin nombre lo conserva, nombres divergentes, la modalidad que se vende),
las seis tarjetas reales en Chromium a 1440 y 390, y la página SERVIDA
(`probar-enlaces-de-planes.mjs`: redirecciones con su cookie, `/planes/nivel-3`
y la landing). `MODO=roto` corre lo mismo contra `a5a9371` y afirma los cuatro
fallos.

## La página de un plan: «Qué incluye» es un acordeón, y todos los bloques miden lo de la landing

Dos fallos de `/planes/<plan>`, reportados juntos:

| lo que se veía | ahora |
| --- | --- |
| cada función llevaba de enlace el NOMBRE de su guía: «Guía de Agente IA» en funciones que no tenían nada que ver entre sí | el enlace dice **«Ver tutorial»** (`TEXTO_DEL_TUTORIAL`), nunca el nombre de la guía |
| el tutorial sacaba al cliente de la página | cada función es un **acordeón** (como Preguntas frecuentes) que al abrirse enseña ahí mismo su descripción y su video |
| los bloques medían cada uno lo suyo y llevaban una raya entre ellos | todos van en **`ANCHO_DE_LA_LANDING`** (`lib/ancho-de-la-landing.ts`), el MISMO que usan las tres landings, y sin `divide-y` |

Cinco cosas que hay que mantener:

1. **Abierto, uno a la vez**, y una fila solo se abre si tiene algo dentro
   (descripción o tutorial). La marca es `button[data-cabeza-de-la-funcion]`
   con su `aria-expanded`, y el cuerpo `[data-cuerpo-de-la-funcion]`.
2. **Qué video se mete lo decide `elTutorialDeLaFuncion`** (puro, en
   `lib/pagina-de-plan.ts`): una guía publicada enseña su
   `/guia/<modulo>/demostracion.webm` con su portada; un enlace de YouTube,
   Vimeo, Loom o Drive se inserta (`REPRODUCTORES_QUE_SE_INSERTAN`, una lista
   cerrada); un archivo de video se pinta con `<video>`; lo demás no se
   inserta. Debajo va «Ver la guía paso a paso», que la DESPLIEGA ahí mismo
   (ver la sección siguiente); solo un enlace de fuera se abre en otra pestaña
   («Abrir en otra pestaña», con `noopener noreferrer`). Ninguno lleva el
   nombre de la guía.
3. **Las guías que existen se le pasan como un conjunto** (`GUIAS_QUE_SE_ENSENAN`,
   sacado de `GUIAS_PUBLICADAS`): una guía que no se publica no tiene video.
4. **El ancho se escribe UNA vez.** Cada `section[data-seccion]` lleva su
   contenido dentro de `ANCHO_DE_LA_LANDING` (`data-ancho-del-bloque`), y la
   barra de arriba también. Un bloque con su propio `max-w-*` vuelve a salir
   más angosto que el de al lado.
5. **Sin rayas entre bloques**: el aire lo pone el relleno de cada sección.

## La página de un plan: la guía se DESPLIEGA dentro, «Qué incluye» nace plegado, y la landing sin franjas

Cuatro cosas pedidas juntas, y ninguna saca al cliente de la página:

| lo que se veía | ahora |
| --- | --- |
| «Ver la guía paso a paso» abría `/guia/<modulo>` en otra pestaña | la guía se **despliega dentro del mismo acordeón** (`GuiaDesplegada`), y con ella abierta **el video no se pinta** (ver la sección siguiente) |
| «Qué incluye este plan» enseñaba todas las funciones abiertas | de entrada, **solo las destacadas**, y el resto detrás de «Ver todas las funciones» (ver la sección siguiente) |
| el cierre decía «Empieza con el plan X» encima del precio | sin título: el **precio en blanco y destacado** (`[data-precio-final]`) encima del **botón verde «Comenzar con el plan X»** (`VERDE_DEL_BOTON`) |
| la landing separaba secciones con franjas `bg-white/[0.02]` | ninguna sección lleva fondo, raya ni sombra, en las tres landings |

Cinco cosas que hay que mantener:

1. **La guía desplegada son las MISMAS piezas** que la de la landing
   (`components/guia/Guia.tsx`, con sus callbacks): el índice y una sección se
   cambian ahí mismo (`alAbrirSeccion`), con el tema de la App (ver la
   sección siguiente), sin tocar la dirección ni abrir pestañas. El
   contenido se pide al abrir con `pedirLaGuiaPublica`
   (`components/guia/pedir-la-guia-publica.ts`), la MISMA caché que usa
   `GuiaEnLaLanding`; un fallo dice «Reintentar».
2. **Un tutorial de fuera** (YouTube, un enlace suelto) **sigue abriendo otra
   pestaña**: no es una guía de la plataforma y no hay nada que desplegar. Lo
   decide `TutorialDeLaFuncion.modulo` (`null` si no es de la plataforma).
3. **El texto del botón principal es FIJO**, «Comenzar con el plan X»
   (`elTextoDelBotonDelPlan`), y en el panel se ve de solo lectura
   (`data-texto-del-boton-principal`): un texto propio repetiría lo que ya no
   dice el título. El enlace sigue siendo editable.
4. **El precio va en `text-white`**, no en el blanco del tema: la página es
   oscura siempre.
5. **Una sección de la landing no se separa pintándola**: el aire lo pone su
   relleno, como en la página del plan.

Lo prueba `scripts/banco-plan-guia-dentro.sh` (hace falta el build): un barrido
del código y, en Chromium sobre el CSS del build a 1440 y 390, la página del
plan real (el bloque plegado, la guía desplegada dentro de su función con el
video compactado, una sección que se abre sin cambiar la dirección ni abrir
otra pestaña, el enlace de fuera que sí la abre, y el cierre sin título con el
precio en blanco encima del botón verde) y la landing entera sin franjas ni
sombras. `MODO=roto` pinta lo mismo con el código de `97b6d07` y afirma los
fallos.

## La página de un plan: de entrada las DESTACADAS, la guía sin video y con el tema de la App, e «Inicio» arriba

> **Esta sección manda sobre la de arriba** en cómo abre «Qué incluye» y en
> qué pasa con el video y el tema al desplegar la guía.

| lo que se veía | ahora |
| --- | --- |
| «Qué incluye» nacía plegado bajo un encabezado, y abierto enseñaba todas | el título **centrado** (`data-titulo-del-bloque`, con «N funciones») y debajo, de entrada, **las funciones DESTACADAS**; el resto, en el orden del editor, detrás del botón centrado «Ver todas las funciones» / «Ver menos funciones» (`data-ver-todas-las-funciones`) |
| la flecha de abrir casi no se veía en oscuro | `FlechaDelDesplegable`: blanca, en un círculo `bg-white/15`, en el bloque y en cada función |
| «Ver la guía paso a paso» iba a la izquierda | la fila de la guía es como la de la función: **«Guía paso a paso»** a la izquierda (`data-titulo-de-la-guia`) y **«Ver guía» / «Ocultar guía»** a la derecha (`data-ver-la-guia`) |
| con la guía abierta el video se encogía y dejaba un hueco al lado | **el video no se pinta** mientras la guía está abierta; al cerrarla vuelve |
| la guía desplegada salía siempre en blanco | sigue el **tema de la App**: `elTemaDeLaGuiaDesplegada(resolvedTheme)` pone `data-guia-tema="oscuro"` o `"claro"` |
| la barra de arriba solo llevaba «Volver a planes» | y a la derecha **«Inicio»** (`data-ir-al-inicio`), a `/inicio` |

Cinco cosas que hay que mantener:

1. **«Destacada» es la MISMA marca que la tarjeta corta de la landing**
   (`FuncionDelPlan.destacada`, la del editor de funciones). No hay un campo
   nuevo: lo reparte `elRepartoDeLasFunciones` (`lib/pagina-de-plan.ts`, pura),
   y lo de antes sin marca nace destacado (`comoFunciones`). Si todas son
   destacadas no hay botón; si no hay ninguna, el botón las despliega todas.
2. **El resto se queda montado y escondido** (`hidden`): lo que se abrió dentro
   sigue abierto al volver a desplegarlo. Al recoger con el botón, el botón se
   deja a la vista (solo entonces: nunca al cargar la página).
3. **Solo el tema de la App decide**: el layout público lleva un `.dark` fijo,
   así que la guía desplegada pone su propio `data-guia-tema` y
   `[data-guia-tema="oscuro"]` va en `globals.css` junto a `.dark`. Sin tema
   guardado (`system` sin resolver) es oscura, como la página.
4. **La guía de la landing SIGUE clara** (`GuiaEnLaLanding`, `data-guia-tema="claro"`):
   esto es solo la de la página de un plan.
5. **«Inicio» es un enlace a `/inicio`**, en la misma barra que «Volver a
   planes» (`data-ancho-de-la-barra`), los dos en la misma línea.

Lo prueba `scripts/banco-plan-destacadas-y-guia.sh` (hace falta el build): las
reglas sin navegador y un barrido, y la página REAL en Chromium sobre el CSS
del build, bajo el `ThemeProvider` de la App, a 1440 y 390: las destacadas de
entrada y el resto en su orden, la flecha que se distingue, la fila de la guía,
el video que desaparece, la guía oscura en oscuro y clara en claro, e «Inicio»
a la derecha. `MODO=roto` pinta la misma página con el código de `15568a8` y
afirma los fallos.

## La página de un plan: «Ver todas» en el orden del editor, y abrir la guía no mueve la página

> **Esta sección manda sobre las dos de arriba** en el orden de «Ver todas» y en
> qué pasa con el video al abrir la guía: el video ya NO se esconde.

| lo que se veía | la causa | ahora |
| --- | --- | --- |
| «Ver todas las funciones» pegaba las no destacadas DETRÁS de las destacadas | eran dos listas: las destacadas y un bloque `data-resto-de-funciones` debajo | UNA lista en el orden del editor; cada función decide si se ve con `seVeLaFuncion(funcion, todas)` y lo que no se ve va en SU sitio con `hidden` |
| al abrir la guía la página saltaba y el video y el principio de la guía quedaban fuera de vista | se escondía el video (`reproductor && !guiaAbierta`): lo de arriba se encogía de golpe y el navegador recolocaba la página | el video se queda; la guía sale justo debajo y la página no se mueve. Solo si la guía cae por debajo de la vista se baja lo justo (`cuantoBajarParaVerLaGuia`), sin que el video se vaya por arriba |

Cuatro cosas que hay que mantener:

1. **La lista es una** (`<ul data-lista-de-funciones>`, un solo `QueIncluye`) y
   el botón la controla con `aria-controls`. Dos listas vuelven a ordenar las
   destacadas primero. Lo abierto dentro sigue abierto al recoger y volver a
   desplegar.
2. **Lo que se desplaza es el CONTENEDOR de la página pública**
   (`PANTALLA_PUBLICA_QUE_SE_DESPLAZA`), no la ventana: el `<body>` va con
   `overflow-hidden`. `quienSeDesplaza` lo busca subiendo desde el tutorial, y
   ningún `window.scrollBy`/`scrollTo` en esta pantalla.
3. **Bajar es lo justo y nunca por encima del video**: `cuantoBajarParaVerLaGuia`
   (pura, `lib/pagina-de-plan.ts`) quiere ver `LO_QUE_SE_VE_DE_LA_GUIA` (160 px)
   de la guía a `MARGEN_CONTRA_EL_BORDE` (16) del borde de abajo, y topa en lo
   que sube el video hasta debajo de la barra fija (`scroll-mt-20`). Si ya se
   ve, 0: la página se queda donde estaba.
4. **«Ir al vídeo» desde la guía sube al video y deja la guía abierta**: ya no
   hay que recogerla para que el video exista.

Lo prueba `scripts/banco-plan-orden-y-guia-sin-saltos.sh` (hace falta el build):
las dos reglas, un barrido, y la página REAL en Chromium dentro de su contenedor
de página pública, a 1440 y 390: el orden después de «Ver todas» (también sin
ninguna destacada), y abrir la guía con la fila a media pantalla, con el video
cortado arriba y con la fila abajo del todo, midiendo el desplazamiento y dónde
quedan el video y la guía antes y después, con la guía tardando en cargar.
`MODO=roto` pinta la misma página con el código de `0764700` y afirma los dos
fallos: el orden con las destacadas primero y el video que desaparece. Los
bancos de las dos secciones de arriba se ajustaron a esto.

## Planes: UNA plantilla maestra de funciones por audiencia, y cada plan solo enciende y destaca

Cada plan tenía su propia lista de funciones, y una función nueva había que
crearla seis veces. Ahora hay una plantilla por audiencia (`cliente` y
`reseller`) en `plan_funciones_maestras` (tabla de la App, sin columnas en
`subscription_plans`), y cada plan guarda solo **si la tiene encendida, si la
destaca y el orden de las encendidas** (`plan_funciones`). Lo decide
`lib/plantilla-de-funciones.ts` (puro) y lo escribe `sincronizarLaAudiencia`
(`lib/plantilla-de-funciones-db.ts`), en una transacción con candado por
audiencia.

1. **La primera vez se arma con el inventario de hoy**, sin duplicar por
   nombre (`laLlaveDelNombre`), y cada plan queda exactamente como estaba: sus
   encendidas, su orden y sus destacadas; lo que no tenía, apagado.
2. **Crear o editar en la plantilla llega a los seis planes**; en los que no la
   tenían, apagada. Lo que se edita en el editor de UN plan (nombre,
   descripción, categoría, tutorial) también es de la plantilla.
3. **Una función nueva creada desde un plan conserva su id**: el plan que se
   guarda no completa la plantilla por su fila.
4. **Versión**: guardar con una plantilla vieja contesta `LA_PLANTILLA_CAMBIO`.
5. **Un plan apagado no se reescribe por tildes** sin un cambio pedido.

Lo prueba `scripts/banco-plantilla-de-funciones.sh` contra Postgres con los
planes de producción saneados; `MODO=roto` afirma que antes no había plantilla.
`banco-configuracion-de-la-casa.sh` sale 128 también en `main`: es previo.

## Créditos: una cuenta sin pagar NO recibe créditos, y editar a mano no adelanta la renovación

Dos fallos que se veían como «la plataforma regala créditos»:

| lo que pasaba | la causa | ahora |
| --- | --- | --- |
| cuentas con la facturación vencida amanecían con el cupo entero del plan (35.000) | el reloj del motor (`renewDueCredits`, cada hora, en `api-webhook`) reponía toda fila con `renewalDate` pasada sin mirar si la cuenta había pagado | con la facturación vencida (suspendida, o `dueDate` + días de gracia pasado) los créditos se AGOTAN y la fecha no se mueve; vuelven al confirmar el pago (`renovarLosCreditos`). Regla pura: `renovacion-con-pago.ts` del motor |
| dejar una cuenta en cero a mano no duraba | las pantallas de Clientes y Créditos mandan `new Date()` como renovación; guardada tal cual, el motor la renovaba en la hora siguiente | `laFechaAlEditar` (`lib/renovacion-al-editar.ts`): una fecha futura pedida se respeta; si no, se conserva la guardada si es futura; si no, dentro de un mes. La usan `rechargeIaCredit` y `createIaCreditForUser` |

Lo prueban `scripts/banco-creditos-al-editar.sh` aquí y
`scripts/banco-creditos-sin-pago.sh` en `api-webhook`, contra Postgres y con
`MODO=roto` pinchado al commit de antes.

## Perfil › «Plan y facturación»: la prueba se decide como en el panel, y los planes van en «Cambiar plan»

Un cliente al que el administrador le puso el plan a mano (Instancias › «Editar
pagos») seguía viendo «Prueba · N días» y, debajo, las tarjetas de otros planes.
La tarjeta deducía «prueba» de `!lastPaymentAt`, y ese camino no escribe esa
columna. Ahora:

1. **En prueba lo decide `estaEnPrueba` (`lib/plan-del-perfil.ts`, puro), con
   la regla del panel**: la cuenta es demo (`User.isDemo`, que
   `getOwnBillingAction` devuelve como `esDemo`) y no se ha cobrado (ni `PAID`
   ni un pago registrado).
2. **Las tarjetas de planes (`ChoosePlanToPay`) ya no se pintan ahí**: cambiar
   de plan va por el botón «Cambiar plan» del Perfil. «Pagar y renovar» sale si
   no está en prueba y hay precio (`seOfrecePagar`).

Lo prueba `scripts/banco-plan-del-perfil.sh`; `MODO=roto` lee `7c1db1f` y
afirma el plan puesto a mano visto como prueba y las tarjetas de planes.

## Transcribir con la clave PROPIA del cliente: siempre la de OpenAI, y su error se dice

Un cliente con su propia clave en Ajustes no podía transcribir: salía «el
servicio de transcripción no respondió». Eran tres cosas:

| lo que pasaba | ahora |
| --- | --- |
| la clave se elegía como la del agente (el proveedor por defecto): con Google por defecto, a Whisper le llegaba la clave de Gemini y OpenAI contestaba 401 | `laClaveDeOpenAi` (`lib/creditos-de-transcripcion.ts`) toma SOLO la configuración de OpenAI, la activa primero |
| el rechazo de OpenAI se tragaba y salía «no respondió», que manda a reintentar algo que no se arregla reintentando | `transcribirConOpenAi` clasifica (`elFalloDeOpenAi`): con clave PROPIA dice `clave_invalida` o `clave_sin_saldo` y manda a Ajustes › Conexión › API key; con la de la casa sigue `no_transcribio` (el cliente no la puede arreglar). Un rechazo de la clave no prueba el otro modelo |
| se guardaban claves enmascaradas, direcciones o números | `validateProviderApiKey` rechaza lo que no tiene forma de clave, y `noTieneFormaDeClave` no la manda a OpenAI |

Y **el cobro se juzga sobre la clave que DE VERDAD se usa** (`laClaveYElSaldo`):
si la de OpenAI es del cliente, no se descuenta; si es de la casa, sí. Las tres
pantallas que transcriben (Chats, chat de equipo y reuniones) pasan por ahí.

Lo prueba `scripts/banco-clave-propia-transcripcion.sh` con OpenAI fingido;
`MODO=roto` empaqueta `7c1db1f` y afirma que se elegía la clave de Google y se
tragaba el error.

## La página de un plan: «Todo incluido, sin sorpresas» va a la vista, entre las preguntas y el precio

Cada plan tiene, aparte de «Qué incluye este plan» (las FUNCIONES), un bloque
con lo que trae **sin costo adicional**: un título (de fábrica «Todo incluido,
sin sorpresas») y un texto libre, escritos por plan en Planes › Página de
detalle. Reglas:

- **Sale entero y a la vista**: ni acordeón ni «Ver más». El texto conserva sus
  saltos de línea (`comoTodoIncluido`). Sin texto no sale; el título solo no
  dice nada.
- **Su sitio es después de «Preguntas frecuentes» y antes de «Comenzar»**
  (`ORDEN_DE_FABRICA`). Un orden guardado de antes lo recibe ahí solo
  (`comoOrdenDeBloques` mete lo que falta detrás de su vecino de fábrica).
- **Vive en `plan_todo_incluido`**, tabla de la App sin clave foránea (como
  `plan_para_quien`): nunca una columna en `plan_details`, que es del backend.
  Vaciar los dos campos borra la fila.
- **Lo que contradice al plan no sale**, como las preguntas: un texto con
  otros créditos o un nombre viejo no se enseña y el panel dice por qué; un
  título que nombra otro plan sale como el de fábrica.
- **Una propuesta que carga el plan lo hereda**: va al final del alcance de la
  fila (`elAlcanceDelPlan`, con su sitio apartado para que una lista larga de
  funciones no lo deje fuera) y la página pública de la propuesta lo pinta en
  vivo con el MISMO componente (`BloqueTodoIncluido`).

Lo prueba `scripts/banco-plan-todo-incluido.sh` (regla, Postgres y Chromium);
`MODO=roto` lee `8302e3e` y afirma que no existía.
