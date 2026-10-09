# Infraestructura, build y despliegue

> Documentación de referencia. Antes vivía en el `CLAUDE.md` de la raíz; se
> separó por temas el 2026-10-09 (copia íntegra en `docs/_respaldo/CLAUDE_completo.md`).
> Para añadir un aprendizaje nuevo: una sección `## ...` en este archivo (o en el
> tema que corresponda de `docs/reglas/`). **Nunca en un `CLAUDE.md`.**

## El build borraba los avisos: `removeConsole`

Antes de buscar por que "la consola no dice nada", mirar `next.config.js`.

Estaba asi:

```js
compiler: { removeConsole: { exclude: ["error"] } }
```

En produccion Next **borra todas las llamadas a `console` menos las excluidas**.
Con solo `error` en la lista, cada `console.warn` y cada `console.info` del
proyecto **desaparecia del codigo que corre**. No es que no se vieran: es que no
existian.

Eso costo dos dias. Se anadieron avisos en el detector de la lista, en el
tiempo real, en la pausa de la IA y en el borrado de chats; se pidieron capturas
de la consola una y otra vez; y todas volvian vacias. La conclusion que se
sacaba —"no salta ningun aviso, luego el codigo no llega ahi"— era falsa: el
codigo llegaba, pero el aviso no estaba compilado.

Ahora la lista es `["error", "warn", "info"]`. **No quitar `warn` ni `info`**:
este documento tiene una regla entera sobre que un fallo nunca puede ser mudo, y
sin ellos esa regla no se sostiene. `log` y `debug` siguen fuera, que eso si es
ruido de desarrollo.

Como comprobar que un aviso sobrevive, sin desplegar:

```
npm run build && grep -rl "el texto del aviso" .next/static/chunks/
```

Si no aparece, en produccion no existe.

## Muchas peticiones pequeñas son turno, no trabajo

Cuando la misma pantalla pide lo mismo decenas de veces —una por fila, una por
chat, una por lo que sea—, llega un punto en que bajar lo que cuesta cada una
**deja de servir de nada**: el navegador abre **seis conexiones a la vez**, así
que a partir de ahí lo que se mide es la cola.

La señal de que se ha llegado a ese punto: la consulta medida contra la base
tarda milisegundos y la petición tarda cientos, y **todas tardan parecido**. Ese
número de más no está en ningún sitio del servidor porque no es trabajo; es
esperar turno. Buscarlo en el servidor es perder la tarde.

Lo que se hace entonces es **agrupar, y agrupar por las tandas que ya existen**.
La precarga de Chats son dos —los primeros chats al entrar y el precalentado
unos segundos después—, así que son **dos paquetes**, no uno gigante ni cinco
inventados. Si se parte en más de las que hay, se está eligiendo un número al
azar.

Y lo que se agrupa se elige: **lo que llega de golpe va en paquete, lo que llega
goteando va suelto.** La precarga por fila visible sigue de a una a propósito;
meterla en un paquete sería esperar a que el paquete se llene, que es justo lo
contrario de lo que se busca.

### Un paquete que se pierde entero no puede verse como un error

Un paquete tiene una avería que no tenían las peticiones sueltas: si revienta,
se lleva a todos sus chats. Se acepta **solo** donde lo que se pierde es una
mejora y no un dato: la precarga es best-effort, y si no llega, el chat se abre
al pulsarlo como se abría antes. **Nada que la persona vaya a echar en falta se
mete en un paquete que pueda perderse entero.**

### Y las tres cosas que un paquete tiene que traer

1. **`Promise.allSettled`, nunca `Promise.all`.** Con `all` un solo rechazo tira
   las respuestas buenas que ya estaban resueltas. Cada cosa en su casilla, y la
   casilla dice **de quién es**: sin eso, quien recibe el paquete no sabe a qué
   fila pertenece cada resultado.
2. **Su propio plazo, por debajo del de quien consulta por dentro.** Escalonados,
   como el resto de plazos de Chats. Si se igualan, uno lento se come el paquete
   entero y tarda más que las peticiones sueltas que vino a sustituir.
3. **Tres estados, y `pendiente` NO es un fallo.** Lo que no llegó a tiempo
   **sigue corriendo detrás** y se persiste, así que la vuelta siguiente lo
   recoge ya de nuestra base — la regla de siempre, *agotar la espera no es
   tirar la respuesta*, aplicada a un paquete. Por eso quien lo recibe **no lo
   marca como intentado**: eso sería renunciar a él para toda la sesión. Un
   `rechazado`, en cambio, sí es firme y dice por qué.

## Dentro del servidor son turnos, no tandas

Cuando una petición atiende muchas cosas a la vez hay que acotar cuántas corren
en paralelo —el pool de Prisma es de **10 por proceso** y el proceso es uno, así
que cincuenta consultas simultáneas se comen los turnos de la lista y del chat
abierto, que son **mensajes**—.

El cómo acotar no es indiferente, y esta es la trampa:

```ts
// MAL: lotes que se esperan unos a otros
for (let i = 0; i < cosas.length; i += 5) {
  await Promise.allSettled(cosas.slice(i, i + 5).map(hacer));
}
```

Con lotes, **uno colgado retiene su lote entero** hasta el plazo, y los lotes de
detrás no llegan ni a empezar. Medido en el banco de pruebas: 12 chats con 2
colgados devolvía **4 listos y 8 pendientes**, cuando lo correcto son 10 y 2.

O sea: es el mismo mal que se acaba de quitar fuera —esperar turno en vez de
trabajar— reaparecido dentro. **Son N obreros tirando de una cola común**, no
lotes de N: el que se queda pillado retiene su sitio y los demás siguen
vaciando la cola. Y el resultado se guarda **por posición**, para que la
respuesta salga en el orden en que se pidió aunque terminen desordenadas.

La regla, corta: **si se acota la concurrencia, se acota con una cola, nunca con
lotes.**

## Una recarga tiene que decir por qué

"La App se refresca sola cada cierto rato" es de lo más difícil de diagnosticar:
cuando pasa, **la recarga se lleva la consola por delante** y no queda ni rastro.
No hay captura que pedir.

Por eso `hardReload(motivo)` **anota el motivo antes de recargar** —en
`sessionStorage`, con la ruta y cuánto llevaba abierta la pestaña— y
`reportarRecargaPrevia()` lo cuenta al arrancar, desde `ChunkRecovery`:

```
[app] esta pagina se recargo sola. Motivo: promesa rechazada: ChunkLoadError
  { donde: "/notas", hace: "2s", laPestanaLlevabaAbierta: "412s" }
```

Dos cosas:

1. **Ningún `hardReload()` sin motivo.** Hay tres sitios que recargan
   —`ChunkRecovery`, el error boundary y la pantalla de error—; los tres pasan
   el suyo.
2. **Su ausencia también informa**: si la página se recarga y esto no sale, la
   recarga **no viene de nuestro código** (el contenedor, el navegador, la red).
   Eso descarta media investigación de un vistazo.

Sale como `console.warn` a propósito: `log` y `debug` los borra el build (ver la
regla de `removeConsole`).

## "Salir" es un viaje, no tres, y se ve que está saliendo

"Le doy a Salir, le doy, le doy, y no sale." El botón encadenaba **tres viajes**
al servidor antes de moverse —una acción de servidor para borrar las cookies de
impersonación, el GET del token CSRF de next-auth y el POST de `signOut`— y
**no enseñaba nada mientras tanto**. Con el contenedor ocupado cada viaje
tardaba segundos, la persona volvía a pulsar y cada pulsación lanzaba la
cadena entera otra vez.

Ahora `handleLogout` **navega** a `/api/logout` y nada más. La pestaña enseña
su indicador de carga al instante, hay un viaje, la ruta no toca la base —la
sesión es JWT: borrar la cookie **es** cerrar la sesión— y contesta con la
redirección al login. El botón pasa a «Saliendo…» y la segunda pulsación no
hace nada.

Dos reglas para cualquier botón que hable con el servidor:

1. **Que se vea que se pulsó**, antes de que el servidor conteste. Un botón que
   no cambia hasta que vuelve la respuesta es un botón que se pulsa cinco veces.
2. **Un viaje.** Si una acción necesita tres, se junta en una ruta o acción que
   haga las tres.

Y para "cambiar de pestaña tarda", hay medida: `NavegacionLenta` anota el
clic en cualquier enlace interno y avisa `[app] cambiar de pagina tardo`
con `desde`, `hacia` y `tardoMs` cuando pasa de 1,5 s. Se pide ese aviso
antes de tocar nada.

## Una línea muerta no tiene filas: se cuenta desde `Instancias`

Conexiones dice si el QR está enlazado y si el Robot está encendido. Las dos
cosas pueden estar en verde y la línea no contestar nada —el webhook no llega,
la sesión de Waha está colgada, el número está baneado—, y eso desde fuera se
ve como «la IA dejó de responder». **Actividad de instancias** (Analíticas,
solo superadministrador) lo dice de un vistazo con lo único que no se puede
fingir: si pasaron mensajes.

Rojo = no entró nada. Amarillo = entran y la IA no contestó ninguno. Verde =
entran y contesta. **Las verdes no se listan**: una tabla con las cincuenta
sanas dentro esconde las tres que fallan.

Y la regla que sostiene la tarjeta entera:

> **El universo sale de `Instancias`, nunca de los mensajes.** Agrupando
> `chat_messages` por línea, una línea sin un solo mensaje **no tiene ninguna
> fila** y no aparece en el resultado: las rojas —lo único que esto existe para
> encontrar— desaparecerían justo del conteo que las cuenta. Se parte de las
> líneas y los mensajes se pegan con un `LEFT JOIN`; sin mensajes, ceros, y el
> cero **es** el dato.

Es la misma familia que *un contador es un `COUNT`, no un `length`*: el número
no puede salir de la lista de lo que se pudo cargar.

Tres cosas más:

1. **El orden de las dos preguntas no es intercambiable.** Primero «¿entró
   algo?» y después «¿contestó la IA?». Al revés, una línea muerta —que tiene
   cero respuestas igual que una amarilla— saldría amarilla, «recibió y no
   contestó», que es lo contrario de lo que pasa.
2. **Los grupos entran**, y no contradice la regla del CRM: esto no cuenta
   leads, cuenta si pasan mensajes. Un mensaje de grupo prueba que la línea
   vive igual que cualquier otro, y filtrarlo pintaría de rojo una línea sana.
3. **Seguimientos, recordatorios y campañas NO llevan `sentByAi`** —
   comprobado en el motor: ni `follow-up-runner` ni `reminders-runner` la
   escriben—. Así que suman en «escribieron personas» aunque no las escribiera
   nadie. No cambia el color, sí la columna, y la tarjeta lo dice en su pie. El
   día que el motor marque esos envíos, la columna mejora sola.

### Y para barrer por FECHA sin cuenta, un BRIN

Los cinco índices de `chat_messages` empiezan **todos** por `userId`, así que
una consulta de plataforma —«qué pasó en los últimos 7 días en todas las
cuentas»— no puede entrar por ninguno y acaba barriendo la tabla entera.

Lo primero que se probó fue lo que parecía obvio —guiar la consulta desde
`Instancias` con un `LATERAL`, para que cada línea usara
`chat_messages_user_instance_ts_idx`— y **salió peor**: 355 ms contra 435 ms
del barrido, y `Heap Blocks: exact=303191` para 293.000 filas, o sea **un
bloque por fila**. La tabla está ordenada por TIEMPO, no por línea, así que las
filas de una línea concreta están desperdigadas de a una por página. Un índice
que encuentra las filas no sirve de nada si hay que ir a buscarlas a 300.000
sitios distintos.

Lo que sí sirve es lo contrario: aprovechar ese orden. `messageTimestamp` va
pegado al orden físico —los mensajes se anexan según llegan; la correlación
medida es **1.0**— y eso es justo lo que un **BRIN** explota.

Medido en banco con 4M filas (720 MB de tabla, más de lo que hoy pesa la base
entera):

| | tarda | bloques leídos |
| --- | --- | --- |
| barrido, sin índice de fecha | 435 ms | 91.460 |
| guiada por `Instancias` (`LATERAL`) | 355 ms | 303.191 |
| barrido + **BRIN** | **103 ms** | **7.214** |

El BRIN ocupa **40 kB** —un btree de los que ya hay ocupa 325 MB— y se
construye en 0,8 s, así que no es de los que hay que justificar en espacio.

Dos cosas que hay que mantener:

1. **El parámetro va moldeado**: `make_interval(days => $1::int)`. Prisma manda
   el parámetro sin tipo y `make_interval` solo acepta `int`; sin el molde la
   consulta puede caer con «no existe la función». Comprobado además que con el
   parámetro sin tipo **sigue entrando por el BRIN**, también en la quinta
   ejecución, que es donde Postgres puede caerse a plan genérico.
2. **Si vuelve a hacer falta barrer por fecha, se mira este índice antes de
   inventar otro.** Y si algún día los mensajes dejaran de insertarse por orden
   de llegada, la correlación se rompe y el BRIN deja de servir: entonces hay
   que volver aquí, no añadir un btree encima.

Y una advertencia de sintaxis que costó dos errores de compilación: **dentro de
un `$queryRaw` no puede haber acentos graves**, ni siquiera en un comentario
SQL. Cierran el template literal y el fichero deja de parsear.

## Salud del envío: un envío automático que falla deja rastro, o no ha fallado

Los recordatorios de Cobros y los avisos de desconexión llevaban **días sin
salir por Waha** y nadie se enteró hasta que se miró a mano. No es que no
hubiera error: es que el error se lo quedaba quien llamaba, en su `return`, y
ahí se acababa. Desde fuera eso no se parece a un fallo — se parece a que la
plataforma no le escribe a nadie, que es el síntoma más caro de diagnosticar de
todo este documento.

`/panel/salud-envios` (súper administrador) lista lo que la plataforma manda
sola —cobros, desconexiones, facturación, prueba de 7 días, informe semanal y
el aviso de ticket resuelto— con fecha, cuenta, proveedor, destinatario, si
salió y **el motivo del fallo**. Arriba, el resumen por proveedor y los avisos.

La tabla es de la App, `envios_automaticos`, con `CREATE TABLE IF NOT EXISTS` y
sin clave foránea: la cuenta se puede eliminar y el registro de lo que se le
mandó tiene que sobrevivirla — el nombre sale de un **`LEFT JOIN`**, no de un
`JOIN`, o esas filas desaparecerían justo cuando hacen falta.

**La regla, y es la que sostiene que esto no se quede a medias:**

> **Lo anota el DESPACHADOR, no cada llamador.** Los seis caminos automáticos
> pasan todos por `sendViaWhatsAppDispatcher`, así que ahí hay un solo sitio que
> sabe qué proveedor se usó, qué línea, a quién y cómo fue. Con la anotación
> escrita en cada llamador, el séptimo se olvida — y un camino que no anota se
> ve exactamente igual que uno que funciona.

Y por eso el despachador se partió en dos: `mandarElTexto` es el cuerpo de
siempre, intacto, y `sendViaWhatsAppDispatcher` lo envuelve y anota. **Lo que
decide si se anota es el parámetro `registro`**, no una heurística: un envío sin
él —el asesor escribiendo a mano desde Chats— no entra. Esto es lo que sale
solo.

Seis cosas que hay que mantener:

1. **Anotar NUNCA tumba el envío.** `anotarElEnvio` lleva todo dentro de un
   `try` y avisa por consola; no lanza. Se prueba tirando la tabla por debajo a
   mitad de vuelo: el mensaje sigue contando como bueno y el registro se
   recupera solo, porque el recuerdo de «ya la creé» es del proceso y `conLaTabla`
   lo olvida ante un `42P01`.
2. **Los dos caminos que NO pasan por el despachador se anotan en su sitio**, y
   son justo los dos fallos más silenciosos: no hay ninguna línea conectada
   (`anotarQueNoHabiaLinea`, proveedor **`ninguno`**) y la rama de plantilla de
   Meta que se devuelve antes. **`ninguno` es un proveedor más**: sin esa
   casilla, «a esta cuenta no le llega nada porque se quedó sin línea» no
   tendría ni una fila, y confundirlo con un fallo de Waha manda a mirar el
   servidor equivocado.
3. **Un proveedor que nadie usa NO está roto.** Los dos avisos exigen
   `total > 0`. Una plataforma sin ninguna línea Meta vería «Meta no ha
   conseguido enviar nada» todos los días de su vida, y un aviso que sale
   siempre se aprende a despachar sin leer — con lo que el día que Waha se caiga
   de verdad, ese también se ignora.
4. **Un proveedor muerto da UN aviso, no dos.** Con cero aciertos la tasa es del
   100 %, así que `sin_acierto` corta y no se emite además `tasa_de_fallo`: dos
   avisos para un solo problema es ruido. Y la tasa **no se juzga por debajo de
   `MINIMO_PARA_JUZGAR`** (5): un envío y un fallo son el 100 % y eso no dice
   nada.
5. **Sin intentos la tasa es `null`, nunca `0`.** Es la regla de *un número que
   no se puede calcular no se sustituye por otro*: un «0 % de fallo» sobre cero
   envíos diría que todo va perfecto, que es el peor número posible en una
   pantalla que existe para cazar que no salga nada.
6. **El resumen y los avisos se calculan SIN los filtros de cuenta y estado.**
   Filtrando por «Fallaron» la tasa saldría del 100 % siempre, y el aviso
   destacado pasaría a ser una consecuencia de lo que se acaba de pulsar en vez
   de un dato. Los días sí acotan, que es la ventana de la pregunta.

La lista va topada (`TOPE_DE_LA_LISTA`, 500) y **lo que se recorta se dice**; se
guardan 30 días, podados con un `DELETE` que corre **una de cada cien vueltas**
y en su propio `try` — un barrido que se cuelga no puede retener el envío que lo
disparó.

### Y los anchos de la tabla están medidos, con las dos puntas

Siete columnas, y la que importa es la última: el **motivo**. Costó dos
correcciones, una por cada extremo, y las dos se ven midiendo y no mirando.

- Con el reparto automático, `573001112233@s.whatsapp.net` es **un token sin
  espacios**: su ancho mínimo manda sobre el `w-*` declarado, `truncate` no
  llega a recortar nada y la tabla se salía de su caja —1233 px dentro de
  1216—. Va `table-fixed`.
- Pero fijado el reparto, en una ventana estrecha lo que se encoge es la
  **última** columna, o sea el motivo: medido a 1024 px se quedaba en **94 px**,
  que para leer por qué rebotó un mensaje es lo mismo que no enseñarlo. Es el
  mismo defecto de antes reaparecido por el otro lado. Va `min-w-[60rem]` —las
  seis fijas (44rem) más las 16rem del motivo— con `overflow-x-auto` en el
  padre: por debajo de ahí la tabla se **desplaza**, que es preferible a
  recortar justo lo que se viene a leer.

Medido en Chromium sobre el hueco real del panel, no sobre la ventana:

| ventana | caja | tabla | motivo | la tabla se desplaza |
| --- | --- | --- | --- | --- |
| 1440 | 1216 | 1214 | **510** | no |
| 1280 | 1056 | 1054 | **350** | no |
| 1024 | 800 | 960 | **256** | sí |

La página no desborda en ninguna, el resumen se queda en cuatro tarjetas por
fila y la cuenta recorta con puntos suspensivos, con el nombre entero en su
`title`.

## Next: no bajar de 14.2.25, y cómo comprobarlo

La App estuvo en Next `14.2.4` con la CVE-2025-29927: una cabecera
`x-middleware-subrequest` **se salta el middleware**, que es lo único que
protege varias rutas `/api` (subidas, `finance/overview`). Las páginas tienen
segunda barrera (`requireAuth` en el layout); esas rutas no.

**Se demostró antes de arreglarlo**, sobre el build de `14.2.4` arrancado en
local con `AUTH_TRUST_HOST=true` y variables de relleno:

```
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  -H "x-middleware-subrequest: middleware:middleware:middleware:middleware:middleware" \
  http://127.0.0.1:3996/api/finance/overview
```

Sin la cabecera: `307 -> /login`. Con la cabecera en `14.2.4`: **`500`** —el
middleware se saltó y la petición llegó a la ruta, que aquí solo falló por no
tener base—. En producción habría entrado. Con `14.2.35`: `307 -> /login` en
los dos casos.

Dos cosas:

1. **Next a `14.2.25` o superior, siempre**, y `eslint-config-next` a la misma.
   Están fijadas sin `^` a propósito.
2. La línea 14 **ya no recibe parches**: `npm audit` lista una veintena de
   avisos (DoS, cache poisoning) que solo se cierran en 15.5.x. Subir a 15 es
   un proyecto aparte —React 19, `cookies()`/`headers()` asíncronos— y no se
   mezcla con un arreglo. Mientras tanto, las rutas `/api` que hoy solo
   confían en el middleware deberían comprobar sesión por sí mismas (ver H02 de
   la auditoría del 2026-09-06).

El Dockerfile va en `node:22`: la 20 dejó de tener soporte, y el backend ya
estaba en 22.

## Una consulta que devuelve una página tiene que poder PARARSE

Una consulta que junta varias fuentes, las deduplica y al final se queda con 26
filas, **lee las tres fuentes enteras** si ninguna lleva su propio `LIMIT`. Los
índices no arreglan eso: el índice deja encontrar las filas, pero sin un tope
dentro no hay dónde parar, así que se traen todas, se ordenan y se tiran casi
todas. El coste crece con el tamaño del dato, no con el de la página.

Duele donde menos se ve: las conversaciones más largas son justo las de arriba
de la lista, las primeras que se precargan. Medido: **36 ms para devolver 26
mensajes de un chat de 16.000; con el tope dentro, 1 ms.**

Así que **el `ORDER BY ... LIMIT` va DENTRO de cada rama**, entre paréntesis, no
solo en la consulta de fuera.

### El tope cubre el FINAL de la página, no su tamaño

Es el error que se comete solo, y no se nota hasta la décima pulsada de «Cargar
mensajes anteriores».

Si la consulta pagina con `OFFSET`, la página 10 es `OFFSET 234 LIMIT 26`: hacen
falta **260 filas** para llegar a la primera de esa página. Acotando por el
tamaño (26) el recorte de dentro se queda corto y la página sale con huecos o
directamente **vacía**, sin ningún error. Comprobado con datos:

| página | tope sobre el tamaño | tope sobre el final |
| --- | --- | --- |
| 1 | 26 filas | 26 filas |
| 3 | 26 filas | 26 filas |
| 10 | **0 filas** | 26 filas |

El tope se calcula sobre **`salta + pide`**.

### Y con holgura, porque lo de dentro aún no está deduplicado

Lo que se recorta en cada rama todavía tiene duplicados: el mismo mensaje puede
estar guardado bajo dos formas de id —Waha lo serializa, Evolution lo entrega
pelado— y el `DISTINCT ON` los junta **después**. Sin holgura, un chat con
muchas parejas así devolvería menos filas de las pedidas. Va **por cuatro**:
harían falta cuatro copias del mismo mensaje para agotarla, y las formas
conocidas son dos.

Lo que hace que esto sea seguro es que **las dos copias caen del mismo lado del
corte**: las dos llevan la hora que trae el propio mensaje de WhatsApp, no la de
guardarlo (`horaDelMensaje`), y cuando una llega sin hora el `ON CONFLICT`
conserva a propósito la que ya estaba. Si algún día se cambia eso —si una copia
pudiera sellarse con la hora de guardarla—, **esta holgura deja de bastar** y
hay que volver aquí.

### Y el filtro común se escribe una vez

Tres ramas con el mismo `WHERE` copiado tres veces es una que se toca y dos que
no. Se arma una vez y se inyecta en las tres: si no, una rama devuelve filas que
las otras descartan y la deduplicación decide por azar.

## Un abandono sin motivo es «Procesando…» para siempre

Las llamadas que hace una persona quedaban completas —grabación, transcripción,
resumen y resultado— y las que hace la IA se quedaban **solo con la grabación**:
la tarjeta decía «Procesando…» sin cambiar nunca, sin error y sin resultado.

Los dos caminos comparten `processCallRecordingForUser`, con la MISMA cuenta
(`laCuentaDeLaFilaDeLlamada`). Así que la asimetría no estaba en el procesado:
estaba en **quién lo dispara y qué pasa cuando abandona**.

| | la humana | la de la IA |
| --- | --- | --- |
| lo dispara | **el navegador**, 1,5 s tras colgar, con 3 reintentos | el aviso de fin, una promesa suelta y el barrido |
| si abandona | hay alguien delante: elige el resultado a mano y vuelve a llamar | **no se entera nadie, nunca** |

### La causa: una transcripción vacía contaba como ÉXITO

```ts
const transcript = conElNombreDeLaMarca(await transcribe(audio, cfg));
if (!transcript) { console.warn(...); }        // ← y seguía
...
return { success: true };                       // ← SIEMPRE
```

OpenAI no contesta, la red, un pico de carga: la transcripción vuelve vacía y
`processCallRecordingForUser` devolvía **éxito**. Con eso, los tres síntomas del
reporte salen a la vez y ninguno se ve desde fuera:

- `esperarYProcesarLaGrabacion` veía `success` y **paraba para siempre**;
- la fila quedaba con `hasRecording: true` y sin texto, que es exactamente de
  donde la tarjeta sacaba su «Procesando…» (`hasRecording && !transcript`);
- y sin transcripción **no se propone resultado**, porque la propuesta sale de
  clasificar ese texto.

Y los abandonos firmes —sin créditos, sin clave de IA, demasiado grande— no
dejaban **nada** en la fila: solo un `console.warn` en un servidor. Misma
pantalla, mismo silencio.

> **Un abandono deja su MOTIVO en la fila** (`raw.call.transcripcion`, por
> `anotarLaMarca`), con el MISMO vocabulario que una nota de voz de Chats
> —`NoSeTranscribio`, con su frase y su regla—. Dos vocabularios paralelos es
> uno que se afina y otro que se queda atrás, y la misma avería contada de dos
> maneras según dónde se mire. Es la misma decisión que la tarifa.

Y va en `raw`, **no en una columna nueva**: `chat_messages` la tocan la App, el
webhook del backend y el chat-store (el #360).

### «¿Se puede volver a pulsar?» y «¿sigo sondeando AHORA?» son DOS preguntas

Confundirlas cuesta por los dos lados, así que son dos funciones:

| | quién la usa | incluye `sin_creditos` |
| --- | --- | --- |
| `sePuedeReintentar` | el botón de la tarjeta y el barrido de abajo | **sí**: se recarga y se reintenta |
| `valeLaPenaSeguirEsperando` | el bucle de media hora | **no** |

Nadie recarga créditos en los treinta minutos siguientes a una llamada, y
**cada vuelta se baja el WAV entero**: serían sesenta descargas para abandonar
en el mismo sitio. Lo que sí es de este momento —el audio que aún no está
cerrado, OpenAI que no contestó— se sigue reintentando: para eso está la
ventana.

Cinco cosas que hay que mantener:

1. **El bucle decide por el MOTIVO, no por el texto del aviso.** Comparaba
   `res.message !== 'Grabación no disponible aún.'`; un texto no es un valor, y
   el día que alguien le cambiara una tilde el bucle dejaría de reintentar sin
   que nadie lo notara hasta ver una pantalla semanas después.
2. **Mientras se sondea NO se marca nada.** «Todavía no está» es el estado
   normal de una llamada en curso: marcarlo pintaría un error en la tarjeta de
   cada llamada que se está hablando. Lo que sí se marca es **agotar la
   ventana**, que media hora después ya no es normal.
3. **La marca se BORRA cuando sí sale**, en la misma escritura que guarda el
   texto. Dejarla pondría el error de ayer debajo de la transcripción de hoy.
   Y `anotarLaMarca` no pisa una transcripción que ya esté: si otra vuelta ganó
   la carrera, marcar «falló» encima sería contar un error sobre algo que salió
   bien.
4. **Lo que no se entiende en la marca vale «no hay marca».** Se ve de menos,
   nunca de más: equivocarse hacia «esta falló» pinta un aviso encima de una
   llamada que va perfectamente.
5. **Y hay botón** (`reintentarLaTranscripcionAction`), como en una nota de voz.
   El par de ids sale de la FILA, nunca del navegador: aceptarlos de fuera sería
   pedirle a AstraCalls la grabación que alguien nombrara y escribirla aquí.

### El relay se tragaba `isBot`, y por eso el «No contesta» no se marcaba nunca

AstraCalls solo sabe si se contestó cuando la llamada es del bot —arranca la IA
al conectar—; en una manual `answered` viaja en falso **siempre**. Por eso la
App exige las dos cosas juntas:

```ts
answered: body?.isBot === true && body?.answered === false ? false : undefined
```

Y el relay del backend mandaba `sid`, `callId`, `durationSecs`, `hasRecording` y
`answered` — **`isBot` no**. Así que esa condición era falsa siempre, `answered`
llegaba como «no se sabe», y el resultado **«No contesta» de una llamada del bot
no se marcaba jamás**: la tarjeta se quedaba en «Marcar resultado» como si nadie
la hubiera atendido.

**Ese relay no decide nada: pasa el recado ENTERO.** Si se añade otro campo al
aviso de fin, va igual.

### Y la tarjeta no puede deducir el estado de dos booleanos

`hasRecording && !transcript` solo produce «Procesando…», también media hora
después de haber abandonado: una llamada que se está transcribiendo ahora y una
que ya no va a salir se veían **idénticas**, y la segunda no volvía a cambiar.

Lo decide `loQueSeEnsenaDeLaLlamada` (puro, en
`lib/transcripcion-de-la-llamada.ts`), con los cuatro estados que de verdad
existen —cada uno lleva a una acción distinta: esperar, recargar, reintentar o
nada— y **el motivo manda sobre «cargando»**: enseñar «Cargando…» sobre algo
que ya se sabe que falló insinúa que todavía puede salir. Con un motivo escrito,
el diálogo además **deja de sondear**: seguir preguntando sería pedir quince
veces lo que la fila ya contestó.

Lo prueban `scripts/banco-grabacion-de-llamada.sh` (sección I: la vacía deja su
motivo y se reintenta, el reintento completa la llamada, lo firme se para y una
marca rota no pinta ningún error; `MODO=roto` lleva escrito literal el guardado
de antes y **afirma el fallo** —la vacía dada por buena, el bucle parándose y la
fila sin motivo—) y `scripts/banco-voicebot.sh` en el backend, que encadena el
relay con la regla de la App: sin `isBot`, «No contesta» no se puede marcar.

## Mudar un servicio de servidor: el certificado va DESPUÉS del DNS, y no se reintenta solo

Se movió WAHA del servidor de la App (`89.117.150.148`) al de Evolution
(`89.117.150.233`). Los datos salieron perfectos: los dos volúmenes se copiaron
byte a byte, y las cinco sesiones que estaban vivas **volvieron solas, sin
reescanear ningún QR**.

Y aun así, durante veinte minutos el sitio nuevo no tenía HTTPS, **sin un solo
error en ninguna parte**.

Traefik pidió el certificado a las 23:38:04, cuando se encendió el servicio
nuevo. En ese momento `waha.ia-app.com` todavía apuntaba al servidor viejo, así
que Let's Encrypt fue a validar el reto **allí** y no lo encontró:

```
legolog: [INFO] [waha.ia-app.com] acme: Trying to solve HTTP-01
error msg="Unable to obtain ACME certificate for domains \"waha.ia-app.com\":
  one or more domains had a problem"
```

Falló por el motivo correcto. El problema es lo que pasa después: **Traefik no
reintenta un pedido fallido.** Se queda sirviendo su certificado propio —
`CN=TRAEFIK DEFAULT CERT` — indefinidamente, y lo único que escribe es un
`debug` por petición (`Serving default certificate for request`). Desde fuera:
el sitio nuevo no tiene HTTPS y nadie dice por qué.

Tres reglas:

1. **El orden es: servicio arriba → DNS → certificado.** El certificado solo se
   puede emitir cuando el DNS ya apunta al servidor nuevo, porque el reto es
   HTTP y Let's Encrypt va a donde diga el DNS. Si el servicio se enciende antes
   de mover el DNS —que es lo correcto, así las sesiones reconectan mientras
   tanto— entonces **el primer intento de certificado está condenado** y hay que
   forzar otro a mano.
2. **Forzar el reintento se hace tocando una etiqueta DEL SERVICIO, no
   reiniciando nada.** Las `Labels` del servicio no son parte del
   `TaskTemplate`, así que Swarm **no recrea la tarea**: el contenedor sigue
   corriendo y las sesiones de WhatsApp ni se enteran. Reiniciar Traefik también
   funcionaría, pero corta un momento todo lo demás que hay en ese servidor.
3. **Se comprueba mirando el certificado, no la pantalla.** `CN=TRAEFIK DEFAULT
   CERT` significa "no emitido"; el dominio tiene que salir en el `acme.json`
   del volumen de Traefik:

   ```
   curl -sSv --resolve dominio:443:IP https://dominio/ 2>&1 | grep subject:
   grep -o dominio /etc/traefik/letsencrypt/acme.json
   ```

### Y Traefik no escribe en `docker logs`

Buscar el error costó de más por esto: el Traefik de esos servidores va con
`--log.filePath=/var/log/traefik/traefik.log`, así que `docker logs` enseña
**una sola línea**, la de arranque, y parece que no pasa nada. El log de verdad
está dentro del contenedor y se saca con la API de Docker
(`GET /containers/<id>/archive?path=...`), sin necesidad de `exec`.

Ese fichero estaba en **1,3 GB** y en `DEBUG`, creciendo sin freno.

### Copiar sesiones de WAHA: primero se apaga

Las sesiones son **SQLite con WAL** (`gows.db` + `-wal` + `-shm`), una base por
línea. Copiar eso con WAHA encendido da una copia a medias, que en una base de
datos no es "un trozo menos": es una sesión corrupta y un QR nuevo.

Con el servicio a 0 réplicas, WAHA cierra limpio y SQLite consolida sus WAL. Se
nota en el tamaño: el volumen pasó de **1.272 a 716 MiB** y desaparecieron todos
los `-wal` y `-shm`. Esa es además la señal de que el cierre fue limpio; si
quedan, algo se mató a la fuerza y la copia no es de fiar.

La media (6,4 GB) sí admite copia en caliente —son ficheros sueltos—, así que va
**antes** del corte y solo se repasa el delta durante él. Eso dejó el corte de
datos en unos 40 segundos.

### Para saber si una sesión ya estaba muerta antes

Después de la mudanza, dos de siete líneas pedían QR. La pregunta es siempre la
misma: ¿lo rompimos nosotros? Lo dice **la fecha de escritura de su `gows.db`**:

```
date -r /app/.sessions/gows/<SESION>/gows.db
```

Las seis vivas marcaban la hora exacta en que se apagó el servicio. La séptima
marcaba **27 horas antes**: llevaba deslogueada desde el día anterior y la
mudanza no tuvo nada que ver. Es la forma barata de separar "lo rompió el cambio"
de "ya venía roto", y se mira **antes** de ponerse a buscar culpables en el
cambio.

## Una pantalla de fuera de `(root)` nace SIN poder desplazarse

El formulario público de tickets —el que abre el enlace compartido— **no se
podía desplazar**: los campos de abajo y el botón de enviar quedaban pintados y
fuera de alcance, en computador y en móvil. Y no era de esa pantalla: era de
una clase escrita en otro fichero.

El `<body>` de la App va con **`overflow-hidden`** (`app/layout.tsx`). Está ahí
para el armazón autenticado, que se fija a `100dvh` y se desplaza por dentro
—ver el `SidebarInset` de `app/(root)/layout.tsx`—, así que para él no cambia
nada. Pero **el `overflow` del `body` se propaga al viewport** cuando el
`<html>` lo tiene en `visible`, que es el caso: el documento entero deja de
poder desplazarse, y con él **cualquier página que no viva dentro de
`(root)`** — que son justamente las públicas, las que abre un cliente final.

> **Toda pantalla de fuera de `(root)` declara su propio contenedor que se
> desplaza**, importando `PANTALLA_PUBLICA_QUE_SE_DESPLAZA` de
> `lib/pantalla-publica.ts`. No es una preferencia de estilo: sin eso nace rota.

`(public)` ya se lo había puesto a mano hace tiempo —era la única—; `/t/`,
`bookings`, `schedule` y `(auth)` no. **Lo que no se hizo fue quitar el
`overflow-hidden` del `<body>`**, que es la otra forma de arreglarlo: eso toca
el armazón de un centenar de pantallas autenticadas, que aquí no se pueden
medir, y este documento tiene media docena de reglas sobre lo que cuesta una
regresión de maquetación en Chats.

### Y por eso pasó desapercibido: `overflow: hidden` NO es `clip`

Es la parte que hay que saber antes de medir nada. `hidden` **recorta, pero
deja desplazar por código**: un `scrollTop`, un `scrollIntoView` o el traído
automático del campo que recibe el foco siguen funcionando. Así que
**tabulando con el teclado se llegaba al botón y con la rueda o el dedo no** —
que es la forma más fácil de probar una pantalla y darla por buena.

Y es el mismo error dentro del banco: la primera medida forzaba
`el.scrollTop = 99999` y **daba «llega» en todas las configuraciones, también
en la rota**, porque estaba midiendo justo lo único que seguía funcionando. Se
mide con **`page.mouse.wheel(...)`**, que es entrada de verdad.

### El alto es FIJO, y en `dvh`

- **`h-[100dvh]`, nunca `min-h-*`.** Con `min-h` el elemento crece con su
  contenido, así que su propio `overflow` no se dispara jamás y se vuelve
  exactamente al mismo sitio.
- **`dvh` y no `vh`**: en un móvil `100vh` es el viewport grande —el de cuando
  la barra del navegador está recogida—, así que con la barra desplegada el
  final del contenido queda debajo de ella.

### El centrado del login: el peligro es el alto FIJO, no `screen` frente a `full`

Esta frase se escribió primero al revés y **la medida la desmintió**, así que
conviene no volver a escribirla mal. Lo que corta el principio de un formulario
más alto que la ventana es **`flex h-full items-center`**: la caja no puede
crecer, el centrado reparte el sobrante arriba y abajo, y lo de arriba no se
alcanza porque el desplazamiento no llega a negativo. Medido con 1.400 px de
contenido: **−312 px** a 1319×726 y **−253 px** a 390×844.

`min-h-screen` **no** corta —ni con grid ni con flex—: con un mínimo la caja
crece con su contenido. Así que `CENTRADO_QUE_NO_SE_CORTA` es
`grid min-h-full place-items-center`, y `full` se prefiere a `screen` por otra
razón: lo que hay que llenar es el contenedor que se desplaza, no la ventana.

### Lo exento se dice, con su motivo

Dos pantallas no llevan contenedor **a propósito**, y el banco exige que el
motivo esté escrito: `/reunion/[codigo]` ocupa la pantalla entera por diseño
—la rejilla de video se reparte el alto y no hay nada que desplazar— y `/abrir`
es un `redirect` del servidor que no pinta ni un nodo.

### El banco: un barrido y la página SERVIDA

`scripts/banco-scroll-publico.sh`, dos mitades:

1. **El barrido** (`lib/__tests__/pantallas-publicas-se-desplazan.test.mjs`)
   recorre todo lo que vive fuera de `(root)` y falla si una pantalla no declara
   su contenedor ni está exenta con su motivo. En `MODO=roto` finge que el
   arreglo no está puesto y **exige que las cace**: sin ese modo, lo verde del
   normal no probaría que el barrido mira. Y comprueba la premisa —que el
   `<body>` sigue con `overflow-hidden`—: si algún día se quita, hay que volver
   aquí y decidir, no dejar los contenedores puestos sin motivo.
2. **La página servida**, en Chromium: levanta una base de usar y tirar, siembra
   un enlace público y abre `/t/<codigo>` de verdad. **No vale una maqueta** —el
   primer intento lo era y salió **más corta que la ficha real**, así que cabía
   entera en las cinco ventanas y la medida no ejercía nada—. El «antes» se
   obtiene quitándole al `<main>` las dos clases del contenedor sobre la página
   ya cargada: mismo DOM, misma hoja, mismo contenido.

Y el gate de cada ventana **no es que el contenido desborde**, es que **el botón
quede fuera sin desplazar**: a 1280×800 sobran 24 px que son el relleno de
abajo, el botón ya se veía, y ahí las dos columnas dicen «LLEGA» sin que eso
signifique nada.

| ventana | contenido | antes | ahora | |
| --- | --- | --- | --- | --- |
| 1319×726 · el del reporte | 824 px | **no llega** | **LLEGA** | el botón quedaba fuera |
| 390×844 · el del reporte | 931 px | **no llega** | **LLEGA** | el botón quedaba fuera |
| 1440×900 | 900 px | LLEGA | LLEGA | ya cabía |
| 1280×800 | 824 px | LLEGA | LLEGA | ya cabía |
| 1024×768 | 824 px | LLEGA | LLEGA | ya cabía |

Ninguna de las cinco desborda a lo ancho.

Y una del propio banco, que costó una vuelta: **una clase arbitraria que no use
ninguna pantalla no existe en el CSS del build.** El contenido de encargo del
centrado iba con `h-[1400px]`, que no genera ninguna regla, así que la caja
medía 28 px y la medida no ejercía nada. Va con `style`, que es lo único que no
depende de lo que Tailwind haya compilado.

## La App va a DOS réplicas; el backend a UNA, y la diferencia no es de tamaño

Aparecieron **dos contenedores del backend** corriendo en paralelo en
Portainer, donde siempre había habido uno. La tentación es leerlo como lo de
la App —que va a dos **a propósito**, y está contado en *los 100 segundos de
caída por despliegue*— y darlo por bueno. No lo es, y la diferencia es de
**corrección, no de escala**:

| | qué es el proceso | ¿dos réplicas? |
| --- | --- | --- |
| la App | un servidor que atiende peticiones; lo que hay que evitar es el hueco de `502` | **sí**, con `start-first` |
| el backend | un servidor **más 18 planificadores dentro del mismo proceso** | **no**, y subirlo es un fallo |

> **Un proceso que lleva dentro planificadores sin candado compartido no se
> replica.** Dos réplicas no reparten ese trabajo: lo **duplican**. Y lo que se
> duplica aquí son WhatsApps a clientes de verdad —seguimientos del CRM,
> recordatorios, informe semanal, seguimiento de prueba— y una vuelta de
> facturación que **suspende y elimina cuentas**.

Comprobado con un barrido, no supuesto: ninguno de los dieciocho
`*.scheduler.service.ts` toma `advisory_lock`, ni `FOR UPDATE SKIP LOCKED`, ni
elige líder. Y hay dos cosas más que se rompen al duplicar, las dos de familias
que este documento ya conoce:

- **`baileys-sessions` es un volumen `local`.** Dos procesos escribiendo los
  mismos ficheros de sesión de WhatsApp es exactamente la avería de *copiar
  sesiones de WAHA*: sesión corrupta y QR nuevo.
- **El antiflood guarda su estado en un `Map` de memoria.** Con dos réplicas
  cada una ve la mitad del tráfico, así que el tope deja pasar el doble **sin
  que nadie lo note** — un fallo mudo de los caros.

### Un healthcheck que no puede pasar deja DOS contenedores, no cero

Es la causa que estaba debajo, y es la misma trampa que ya costó el primer
intento del healthcheck de la App —*sin `ENV HOSTNAME=0.0.0.0`, `127.0.0.1` da
conexión rechazada*— reaparecida por el otro lado:

```
HEALTHCHECK ... http://localhost:3000/health     ← el de antes
```

Desde **Node 17** el orden de DNS es `verbatim`, y estas imágenes de Debian
llevan `::1 localhost` en `/etc/hosts`, así que `localhost` puede resolver a
**IPv6** primero. Nest escucha en `0.0.0.0`, que es **solo IPv4**: la petición
sale con `ECONNREFUSED` y el healthcheck falla **siempre**, sin que la App
tenga nada malo.

Y lo que eso produce no es «el servicio se cae». Es lo contrario, y por eso
despista: una tarea que no pasa el healthcheck se queda en `starting`, así que
con `start-first` **la vieja no se retira nunca** y quedan **dos contenedores
corriendo en paralelo indefinidamente**. El síntoma que se reporta no es un
error: es «ahora hay dos».

Dos reglas, y las dos valen para cualquier healthcheck de esta plataforma:

1. **`127.0.0.1`, nunca `localhost`.** Un nombre que puede resolver a dos
   familias de direcciones no sirve para preguntarle a un proceso que solo
   escucha en una.
2. **El margen de arranque cubre lo que de verdad tarda el arranque.** El
   backend corre `prisma migrate deploy` **antes** de `node dist/main`: con
   `--start-period=40s --retries=3` bastaban 90 segundos de arranque lento para
   dar la tarea por muerta.

### `start-first` es correcto en la App y está PROHIBIDO en el backend

Por lo mismo que prohíbe la segunda réplica: `start-first` **solapa** la vieja y
la nueva unos segundos, y en ese solape los planificadores corren por duplicado
y las dos tocan el volumen de baileys. El backend va con `stop-first` —que
además es el de Swarm por defecto— **escrito explícito**, para que no se cambie
sin leer por qué.

**Lo que cuesta se dice:** cada despliegue del backend deja un hueco en el que
los webhooks de Evolution, Waha y Meta no encuentran a nadie. Se acepta frente
a mandarle a un cliente el mismo seguimiento dos veces. Volver a `start-first`
pide sacar antes los planificadores a un candado compartido, y eso es un frente
aparte.

### Y se comprueba en el SERVICIO, nunca en el fichero

Es la regla del pendiente 1 aplicada aquí, y hay que tenerla delante antes de
dar nada por arreglado: el `portainer-stack.yml` del repo **no manda** sobre lo
que corre. Del repo entra el `HEALTHCHECK` de la imagen con el siguiente build
—el stack del backend no declara `healthcheck:`, así que el de la imagen es el
que corre—; el bloque `deploy:` solo entra si alguien vuelve a pegar ese stack
en Portainer.

```
docker service inspect backend-app_api-webhook-verzay \
  --format '{{.Spec.Mode.Replicated.Replicas}} {{.Spec.UpdateConfig.Order}}'
docker service ps backend-app_api-webhook-verzay --no-trunc
```

Un `2` ahí es el número que hay que bajar. Y `start-first` con una tarea vieja
en `Running` es la réplica sin retirar.

Lo protege `scripts/banco-replicas.sh` en el repo del backend, en dos modos:
comprueba que `replicas` es **1** y está declarado **una sola vez**, que el
orden es `stop-first`, que el healthcheck no usa `localhost` y tiene margen, y
que **ningún planificador toma candado** —que es *por qué* va a una—. Cuando
alguno lo tome, ese banco se pone rojo a propósito: entonces se puede volver a
decidir, leyendo el bloque `deploy:`, no borrando la línea.

## La pantalla en blanco: `app/global-error.tsx` no existia, y sin el no hay NADA

«Application error: a client-side exception has occurred (see the browser
console for more information).» sobre una pantalla en blanco, de forma
intermitente y en rutas distintas —se vio en `/crm/llamadas` y en otras—. Sin
un boton, sin decir que hacer y **sin dejar rastro de nada**: cuando pasa, la
persona recarga a mano o se va, y no queda ni una linea que mirar despues.

Ese texto **es de Next**, literal, en
`node_modules/next/dist/client/components/error-boundary.js:149`. Y saber de
quien es acota la busqueda entera, porque dice **donde** se monta:

```
ErrorBoundary(errorComponent = globalErrorComponent)   <- app/global-error.tsx
  \_ Router  (las tripas de AppRouter)
       \_ RootLayout (app/layout.tsx)
            \_ <ErrorBoundary> (la clase nuestra) -> ErrorScreen
```

> **El limite propio vive DENTRO del layout raiz, o sea por DEBAJO del que Next
> monta en la raiz del enrutador.** Todo lo que reviente en el propio enrutador,
> en el layout raiz o en lo que cuelgue fuera de ese boundary se le escapa por
> arriba — y arriba no habia absolutamente nada.

Y no habia nada de forma literal, que es la parte que hay que leer en el codigo
de Next antes de dar por hecho que «algun limite habra»:

```js
function ErrorBoundary({ errorComponent, errorStyles, errorScripts, children }) {
  const pathname = usePathname();
  if (errorComponent) { return <ErrorBoundaryHandler … /> }
  return <>{children}</>;          // <- SIN errorComponent es un Fragment PELADO
}
```

El repositorio no tenia **ni `app/global-error.tsx` ni `app/error.tsx`**, asi
que la App corria con **cero limites del App Router**: los dos boundaries que
Next monta eran Fragments, y lo unico que quedaba era su `GlobalError` por
defecto — la pantalla en blanco.

### Medido: el limite propio SI caza lo de dentro, y por eso el fallo venia de arriba

Es lo que hace falta saber antes de tocar nada, porque descarta media
investigacion. Se inyectaron fallos en un build servido de verdad, con sesion,
y se leyo que pantalla salia:

| que revienta | antes |
| --- | --- |
| la pagina, en el servidor | `ErrorScreen` (el limite propio) |
| un componente de cliente al pintar, dentro de `{children}` | `ErrorScreen` |
| un componente de cliente al pulsar | `ErrorScreen` |
| **`StoragePersistence`, montado FUERA del limite** | **la pantalla en blanco de Next** |
| **algo por ENCIMA del limite** (el enrutador, el layout raiz) | **la pantalla en blanco de Next** |

Las tres primeras filas son la prueba: **el `ErrorBoundary` de la clase
funciona**. Asi que lo reportado no podia venir de ahi, y las dos ultimas dicen
de donde venia. En las dos, `document.documentElement.id === "__next_error__"`
—la firma de `GlobalError`—, **cero botones** y cero registros.

Y el `<html id="__next_error__">` explica lo otro: `GlobalError` **pinta su
propio `<html>` y su propio `<body>`**, o sea que **sustituye al layout raiz
entero**. No hereda la hoja de estilos, ni las fuentes, ni nada. De ahi que se
vea en blanco y no «como la App pero con un error».

### `FontScaleApplier` y `StoragePersistence` estaban montados FUERA del limite

Eran los dos unicos, y el barrido del banco lo afirma leyendo `app/layout.tsx`
de `origin/main`. Pasan dentro, con su motivo escrito al lado.

Que no hayan reventado nunca hasta ahora no los hace seguros: **lo que se monta
fuera del limite no tiene red**, y los dos tocan APIs del navegador
(`navigator.storage`, la cookie del escalado). Es la misma familia que *nada que
detecte un fallo puede ir detras de algo que falle*, aplicada a la maqueta.

### `ChunkRecovery` no podia salvarlo, por tres motivos a la vez

Conviene decirlo porque parecia que ya habia una red puesta:

1. **Sus oyentes se instalan en un `useEffect`.** Hasta que la hidratacion no
   termina no escucha nadie, y un `ChunkLoadError` de un chunk de arranque
   revienta **antes** de eso.
2. **Cuando el limite global pinta, el layout raiz se desmonta** — y con el, el
   propio `ChunkRecovery`. La red se va con lo que venia a rescatar.
3. **Y su `return` era MUDO.** `MIN_GAP_MS` son 60 s, asi que dentro de ese
   minuto `recover()` se rendia sin escribir una linea: desde fuera, «no se
   recarga y no dice por que». Ahora avisa —y esa espera vive en un solo sitio,
   `lib/recuperar-del-desfase.ts`, que usan la pantalla global, la de ruta, el
   limite de la clase y los oyentes de ventana. Con la cuenta en cada sitio, uno
   recargaria mientras otro cree que todavia no toca.

### Las tres pantallas, y por que son tres y no una

| | de quien es | que pinta |
| --- | --- | --- |
| `app/global-error.tsx` | la raiz del enrutador | su propio `<html>`, con **estilos EN LINEA** |
| `app/error.tsx` | cada ruta | el `ErrorScreen` que ya existia |
| `components/error-bundary.tsx` | el arbol del layout | el mismo `ErrorScreen` |

**La global va con estilos en linea y sin importar ni un componente de la
interfaz.** Esto se monta cuando ya ha fallado algo gordo y Next ha sustituido
el layout raiz: dar por hecho que la hoja de estilos esta cargada es apostar la
ultima red a lo mismo que se acaba de romper. **Si no se ve, no sirve.**

Y la de ruta **reutiliza `ErrorScreen`**, con su recarga automatica, su copia
del detalle y su descarga. Escribir otra pantalla habria sido una segunda que
mantener a la par.

### El fallo se ANOTA antes de recargar, y se cuenta en el arranque siguiente

Es la mitad que de verdad cambia el diagnostico. Una recarga —la de un boton o
la automatica— **se lleva la consola por delante**, asi que lo que no este
guardado no existe: es exactamente el motivo por el que `hardReload(motivo)`
anota el suyo, y aqui se aplica al fallo.

`lib/fallos-del navegador.ts` guarda un anillo de **cinco** en `localStorage`
(`verzay:fallos`), y `ChunkRecovery` los cuenta al arrancar:

```
[app] esta pestaña arrastra 2 fallo(s) de pantalla sin contar
[app] fallo de pantalla { cazadoEn: "global", nombre: "ChunkLoadError", … }
```

Cinco cosas que hay que mantener:

1. **`localStorage`, no `sessionStorage`.** Una pestaña que muere y se abre de
   nuevo pierde la sesion, y ese es justo el caso: la persona cierra y vuelve a
   entrar. Y **cada acceso va en su `try`** — en una ventana privada leerlo
   lanza, y la ultima red no puede caerse por eso.
2. **`cazadoEn` dice por cual de las tres puertas entro** (`global`, `ruta`,
   `arbol`, `ventana`). Sin eso, un fallo anotado no dice si al limite propio se
   le escapo o si nunca llego a el, que es la pregunta que hay que contestar
   ANTES de tocar nada.
3. **Cinco y no cincuenta.** Un desfase de version dispara varios a la vez; lo
   que hace falta es el primero y saber que hubo mas, no un historial.
4. **Se anota ANTES de ofrecer el boton**, en el mismo efecto. Al reves, quien
   pulse deprisa recarga sin haber dejado rastro.
5. **Y sale por `console.error`**, que es lo unico que `removeConsole` no borra
   en ninguna configuracion. Comprobado en el build, y **buscando un trozo sin
   acentos** (la receta de *el build borraba los avisos*).

### La recarga automatica solo para lo que se cura recargando

`esRecuperable` es una lista cerrada: `ChunkLoadError`, «Loading chunk … failed»,
«Loading CSS chunk», «error loading dynamically imported module» y «Failed to
find Server Action». Todos son la misma cosa —**el navegador se quedo con el
build anterior**—, y esta plataforma despliega decenas de veces al dia con dos
replicas, asi que es la familia mas probable detras de lo reportado.

**Lo que no este en la lista NO recarga sola.** Un `TypeError` de verdad
recargando en bucle es peor que una pantalla con un boton: la pantalla se puede
leer y el bucle no se puede ni diagnosticar. Y el caso comun de un `undefined`
—`Cannot read properties of undefined (reading 'success')`, una accion que
revento— **se trata como recuperable a proposito**: ese patron sale de un
desfase entre el cliente y el servidor y lo unico que lo arregla es recargar.

**Lo que NO se pudo hacer, y se dice en vez de disimularlo:** el bundle de
produccion no se pudo inspeccionar desde aqui —`curl
https://agente.ia-app.com/login` contesta `curl: (56) CONNECT tunnel failed,
response 403`, la politica de red de este entorno— y ninguna de las inyecciones
locales reproduce el disparador exacto de produccion. Lo que si queda
establecido y medido es la causa estructural: el fallo escapaba por arriba y no
habia limite, ni mensaje, ni boton, ni registro. **El registro es lo que dira el
disparador la proxima vez**, y para eso se anade.

### El banco: la decision aparte, y el barrido del layout en dos modos

`scripts/banco-pantalla-en-blanco.sh`, sin navegador y en dos modos. Lo que
comprueba y no se ve leyendo:

- Las cinco formas del desfase se reconocen y las cuatro que no lo son **no
  recargan**.
- El anillo se queda con los ultimos cinco, y anotar con un `localStorage` que
  **lanza** no tumba nada.
- Existen las dos pantallas, la global va con `style={` y **sin ni un
  `className=`**, y llama a `anotarElFallo(` antes que a `hardReload(`.
- **Nada nuestro se monta fuera del limite**, leyendo el marcado de
  `app/layout.tsx`.
- Y ningun `hardReload(` de los seis ficheros que recargan se queda sin motivo.

`MODO=roto` lee `app/layout.tsx` de **`origin/main` con `git show`** y afirma el
fallo: encuentra exactamente `["FontScaleApplier","StoragePersistence"]` por
encima del limite. Copiado al banco se estaria comprobando lo que alguien
recuerda del layout viejo.

## Un despliegue que cuelga de UN aviso de GitHub no tiene red

El #1047 (la guía de Leads con el menú de iconos y el vídeo nuevo) se fusionó a
las 19:48 del 29-09 y en producción seguía la guía de antes: las letras sueltas
del menú y el vídeo de 1:16. Se sospechó de la caché y no era: **GitHub no creó
ninguna corrida de `docker-publish` para ese commit.** Ni roja ni cancelada:
ninguna. La fusión de antes (#1046) y la de después (#1048) sí la tuvieron. Y
nada lo decía: el PR salía «fusionado», Actions no enseñaba nada rojo, y el
servicio seguía con la imagen del #1046.

Lo descartado, para no volver a buscar ahí: **no hay caché de por medio.**
Traefik no lleva ningún middleware de caché y termina él el TLS
(Let's Encrypt); Next sirve `public/` con `Cache-Control: public, max-age=0`
—el navegador vuelve a preguntar cada vez— y con una ETag que cambia en cada
imagen; y el service worker (`public/sw.js`) no intercepta `fetch`. Lo que corre
se lee en el servicio: `docker service inspect` → la etiqueta de la imagen es el
commit desplegado, y `scripts/comprobar-entorno-de-agentes.sh` lo dice como
«atrasado».

> **La red sale de lo que queda escrito, no de un aviso.** Cada diez minutos
> `.github/workflows/despliegue-perdido.yml` mira si el último commit de `main`
> tiene su corrida de `docker-publish` y, si no tiene NINGUNA pasados diez
> minutos, la lanza (`workflow_dispatch`, que sí dispara flujos aunque lo pida
> el `GITHUB_TOKEN`). La decisión es `scripts/despliegue-perdido.mjs` (pura) y
> habla con GitHub `scripts/vigilar-despliegue.mjs`.

Cuatro cosas que hay que mantener:

1. **No relanza una corrida en rojo ni una cancelada**, ni un commit con
   `[skip ci]`. La roja ya es la señal —relanzarla cada diez minutos quemaría
   una construcción rota en bucle—, y una cancelada o un `[skip ci]` los decidió
   alguien. Solo cubre el caso «no hay nada».
2. **Si no puede preguntar o no puede lanzar, sale en ROJO.** Un vigilante que
   falla en silencio es el mismo fallo que viene a tapar.
3. **`docker-publish` va EN FILA** (`concurrency`, sin cancelar la que corre):
   sin eso dos fusiones seguidas construían a la vez y quedaba desplegada la que
   TERMINABA última, que no tenía por qué ser la más nueva. De las que esperan
   solo sigue la más nueva, que ya lleva dentro a las de antes.
4. **Su `workflow_dispatch` no se quita**: es por donde entra el vigilante.

Y para mirar las corridas de despliegue en Actions se filtra por el flujo
(`docker-publish.yml`): las del vigilante salen cada diez minutos y taparían la
lista. Lo prueba `scripts/banco-despliegue-perdido.sh` —la decisión, el
vigilante de verdad contra una API de GitHub fingida y los dos flujos—;
`MODO=roto` lee los flujos de `a147eaf` y afirma que nada volvía a mirar un push
perdido ni ponía las construcciones en fila.

# Pendientes

Lo que queda abierto en la plataforma. Actualizar aquí cuando se cierre algo.

## 1. El stack pisa el healthcheck de la imagen, y con los valores malos

**No se toca ahora**: queda anotado para ajustarlo con calma. Ahora mismo pasa
—los contenedores están `healthy` y el despliegue completa—, así que no urge;
pero los números son los que ya costaron una caída una vez.

El `docker-compose.yml` del stack define su propio bloque `healthcheck:`, y un
`healthcheck` de compose **pisa el `HEALTHCHECK` de la imagen**. Así que el del
Dockerfile —que es el bueno, y el que este documento describía como puesto— no
es el que corre:

| | Dockerfile (y la plantilla del repo) | Lo que corre de verdad |
| --- | --- | --- |
| `interval` | 10s | 10s |
| `timeout` | **10s** | **5s** |
| `retries` | **6** | **3** |
| `start-period` | **40s** | **20s** |

Leído del servicio con `docker service inspect`, no del panel.

**Por qué importa**: `timeout 5s, retries 3` son exactamente los del primer
intento de healthcheck, el que tumbó la App cada minuto (ver el cierre del
pendiente en Cerrados). El hilo de Node es uno: una consulta pesada bloquea el
bucle de eventos y durante ese rato `/api/health` tampoco contesta aunque la App
esté bien —se han medido parones de 25 segundos—. Con estos números bastan **15
segundos** de estrechez para dar la tarea por muerta; con los del Dockerfile
hacen falta más de un minuto.

Y ahora hay una consecuencia más que antes no existía: con `failure_action:
rollback` puesto, una lentitud pasajera durante un despliegue no solo mata la
tarea nueva, **revierte el despliegue entero**.

Dos formas de arreglarlo, y la segunda es mejor:

1. Copiar los cuatro valores del Dockerfile al `healthcheck:` del stack.
2. **Quitar el bloque `healthcheck:` del stack** y dejar que mande el de la
   imagen. Es una cosa menos que mantener sincronizada, y el Dockerfile ya lleva
   los valores buenos con su explicación al lado.

Y dónde se toca: **el `docker-compose.yml` del repo es una plantilla** —dominio
de ejemplo, límites distintos, un `pgbouncer` que en producción no existe—. El
stack que corre de verdad se edita en Portainer. Del repo salen el `CMD` y el
`HEALTHCHECK` del `Dockerfile`; el `healthcheck:` del stack y el `start-first`,
no.

La regla, que es la que se aprendió aquí: **cuando un ajuste vive en dos sitios,
hay que saber cuál gana.** El repo decía «el healthcheck está puesto» y era
cierto —en la imagen—, pero lo que corría era otro. Se comprueba en el servicio,
nunca en el fichero.

## Cerrados

- **Los 100 segundos de caída por despliegue.** Cerrado, y medido en el
  servicio, no en el fichero. Los tres pasos están:

  1. `CMD ["node", "server.js"]` sin el `sh`, para que Node sea el PID 1 y
     reciba el `SIGTERM`.
  2. `Order: start-first` en el stack, que es el que se llevaba el minuto y
     medio entero.
  3. El `healthcheck` contra `/api/health`, con `ENV HOSTNAME=0.0.0.0` —sin eso
     Next escucha en la IP del nombre del contenedor y `127.0.0.1` da conexión
     rechazada, que fue lo que tumbó el primer intento—.

  Confirmado con `docker service inspect` sobre `agente-app_verzay_app`:

  ```
  UpdateConfig  : Order "start-first", FailureAction "rollback", Parallelism 1
  RollbackConfig: Order "stop-first"
  replicas      : 2
  ```

  Y con un despliegue de verdad, el del 2026-09-15 a las 21:45 UTC:

  | | antes (2026-09-02) | ahora |
  | --- | --- | --- |
  | actualización | 01:05:53 → 01:07:34 | 21:45:39 → 21:46:39 |
  | duración | ~100 s | **60 s** |
  | sin nadie escuchando | **todo ese rato** | **nunca** |

  Lo que cambia no es que tarde menos: es que con `start-first` y **2 réplicas**
  siempre queda una atendiendo mientras entra la nueva. Traefik ya no tiene por
  qué contestar `502` durante un despliegue.

  Queda un cabo suelto que es ahora el pendiente 1: **el stack define su propio
  `healthcheck:` y pisa al de la imagen**, con los valores cortos que ya
  costaron una caída. Pasa, pero conviene ajustarlo.

- **Wompi de punta a punta.** Confirmado con dinero real el 2 de septiembre de
  2026: un cliente pagó y la cuenta se reactivó sola. Era el único pendiente que
  podía costar dinero. Lo que faltaba no era configuración sino código, en tres
  piezas: no existía ninguna ruta que recibiera los avisos de Wompi (ahora
  `/api/payment/wompi`, que verifica la firma del evento); `/api/payment` no
  estaba entre las rutas sin sesión del middleware, así que el aviso recibía una
  redirección al login en vez del webhook; y el enlace del aviso de cobro era
  uno por plan, igual para todos, así que el pago llegaba sin decir de quién era
  y no había a quién renovarle. Ahora cada cliente tiene el suyo, `/p/{codigo}`,
  que calcula el precio al abrirse y respeta el precio pactado de esa cuenta, no
  el de lista del plan.
- **Por qué reiniciaba el contenedor.** No era la memoria: **eran los
  despliegues**. Mirado en Portainer contra el histórico de tareas del servicio
  Swarm (`agente-app_verzay_app`), que es donde está el dato —`RestartCount` del
  contenedor es 0 y siempre lo será, porque Swarm no reinicia contenedores: los
  tira y crea otros—. Las 5 tareas del histórico (el límite es 5,
  `TaskHistoryRetentionLimit`) llevan **cada una una imagen distinta**, y cada
  una cae encima de un merge a `main`:

  | tarea creada (UTC) | commit | merge |
  | --- | --- | --- |
  | 00:24:28 | `48ae80a` | 00:19:00 |
  | 00:40:01 | `e8e8250` | 00:35:28 |
  | 00:47:12 | `08d3dfd` | 00:42:03 |
  | 00:53:17 | `aa289c8` | 00:47:49 |
  | 01:05:53 | `f7e15d3` | 01:00:57 |

  La imagen que corre ahora lleva el tag `f7e15d3d9df0…`, el commit de las
  01:00. Ninguna imagen se repite: **no hay ni un reinicio que no sea un
  despliegue**. Y hubo 30 despliegues el 2026-09-01, 25 el 08-31, 16 el 08-30 —
  cada merge a `main` dispara el webhook de Portainer.

  Lo de la memoria queda descartado con números, no por descarte: el cgroup del
  contenedor lleva `oom 0` y `oom_kill 0` en `memory.events`, `OOMKilled` es
  `false`, y el consumo se mueve entre **480 y 545 MiB de los 1536 MiB** del
  límite (~31 %). El host va a 1,7 GiB de 23,5 GiB y lleva 228 días sin
  reiniciar. El `exit 137` despistaba: aquí no es el `SIGKILL` del gestor de
  memoria, es el de Docker al agotarse los 10 s de gracia — el `sh` como PID 1,
  que se quitó al cerrar *los 100 segundos de caída por despliegue*.

  Se deja puesto el latido `[chats] latido del detector`: lo que diagnostica es
  que el ciclo de la lista corre, que es el fallo de la conversación atrasada,
  no este. Quitarlo es decisión aparte.
- **Seguimientos que salen tarde.** Van espaciados 1 a 2 minutos por número para
  no arriesgar la línea. Se deja como está: no se está superando la cola de 300
  donde el espaciado empezaría a doler.
- **Paginar la lista de chats.** Se hace, y era necesario: sin ello el filtro
  ofrecía «Ventas 574» y la lista solo tenía 300 filas que enseñar. Lo que se
  descartó en su día era **paginar de entrada** —cargar 50 y pedir el resto—,
  porque "no leídos" se calcula en el navegador (`localStorage`, clave
  `seenMessages`) y con tan pocos chats cargados ese contador dejaría de
  cuadrar. Eso sigue en pie: la primera página es grande (300) y las siguientes
  llegan **al bajar del todo**, así que los contadores de la cabecera solo
  ganan filas, nunca arrancan cortos.
- **Chats eliminados que no volvían.** Ahora vuelven si el contacto escribe
  después del borrado (ver `isChatDeletedByPreference`).
- **Flujo tipo chatbot que no se activaba.** El de Bienvenida estaba declarado
  como obligatorio y se había eliminado. Quitada esa declaración, funciona.
- **Lector de Google Sheets con cabeceras repetidas.** Dos columnas con el mismo
  nombre hacen que la segunda pise a la primera y esa columna desaparezca de la
  búsqueda: el asistente responde "no encontrado" sin ningún error. Se decide NO
  arreglarlo en código: dos encabezados iguales son un error de la hoja, y se
  corrigen ahí.
- **Índices de Postgres.** Se miró con datos: los repetidos suman 144 kB y los
  que nadie usa unos 3,5 MB, varios de ellos `_pkey`/`_key` que no se tocan. En
  una base de 1,6 GB no compensa.
- **`audit_logs`.** La nota decía que se escribía y no se leía nunca; se lee, en
  el botón de historial de una nota. Crecía sin freno pero despacio (2,3 MB en
  dos meses). Tiene borrado a los 90 días con el resto de la limpieza nocturna.
- **Archivos huérfanos.** Borrados `components/form-register.tsx` y
  `MisClientesMain.tsx`.

## Una cadena de tres servicios sin red debajo se cae con cualquier redespliegue

El 21 las llamadas con IA se registraban completas —duración, Resumen IA y
transcripción—. El 22 por la mañana, no. En medio: se cayó Postgres, se
borraron a mano los contenedores del backend en Portainer, y **los stacks de
postgres y del backend se volvieron a desplegar desde el editor**.

El arreglo del 21 (#877) es correcto y no se toca: AstraCalls avisa al colgar,
el backend lo relaya, la App anota la duración y va a por la grabación. Lo que
no tenía es **red debajo**, y eso es lo que lo hace frágil a cualquier cosa que
pase en un servidor:

| eslabón | de qué depende | qué se ve cuando falla |
| --- | --- | --- |
| AstraCalls → backend | `VOICEBOT_RESOLVE_URL`, con `/resolve` dentro | un `log.Warn` en un servidor |
| backend → App | `NEXTJS_URL` + `CRM_FOLLOW_UP_RUNNER_KEY` | otro `logger.warn` |
| la imagen del backend | que el redespliegue no fije un digest viejo | un `404` que solo ve AstraCalls |

**Los tres se configuran a mano en un editor de Portainer, los tres fallan
mudos, y ninguno deja nada en la base.** Así que el día que uno se cae, lo que
se ve desde fuera es el síntoma original y no hay dónde mirar.

### Lo que había debajo NO era una red

`esperarYProcesarLaGrabacion` es una promesa suelta (`void`) dentro de una
petición, en un proceso que **se despliega decenas de veces al día y corre a
dos réplicas**. Un despliegue se la lleva sin dejar rastro ni a quien
retomarla. Con la llamada ya colgada, eso es un dato que no vuelve nunca.

> **La red tiene que salir de la BASE, no de la memoria de nadie.** Una llamada
> que se lanzó dejó su fila con su par de ids dentro (`astraSid`,
> `astraCallId`); con eso se vuelve a ella desde cero, en otro proceso, en otro
> contenedor y tres despliegues después. Eso es lo único que sobrevive a un
> redespliegue del stack.

Lo decide `lib/rescate-de-llamadas.ts` (puro) y lo ejecuta
`lib/rescate-de-llamadas.server.ts`, por `/api/calls/rescatar`.

### Y la red no puede depender de lo mismo que viene a tapar

Es la decisión de la que cuelga todo lo demás, y es lo que hace que esto
sobreviva a un re-pegado de la plantilla:

> **El barrido usa SOLO `NEXTJS_URL` y `CRM_FOLLOW_UP_RUNNER_KEY`** —las dos
> que el relay ya usaba y **las dos que el `portainer-stack.yml` del repo sí
> lleva**—. Ninguna variable nueva: una variable más es una más que perder en
> el próximo redespliegue, que es exactamente el fallo del que viene. Y su
> reloj **nace ENCENDIDO**, al revés que los dieciocho runners del backend: uno
> que se apaga cuando se pierde su propia variable no tapa nada.

### El número de rescates ES la alarma

Esto no sustituye al aviso: hace que su caída deje de ser invisible. Si el
barrido no rescata nada, la cadena funciona. **Si `sinAviso` no es cero, algún
eslabón está roto ahora mismo**, y se dice nombrando los tres. Es la misma idea
que *una línea muerta no tiene filas*: el cero es el dato.

### Cinco cosas que hay que mantener

1. **Una llamada EN CURSO no está rota.** Sin `EDAD_MINIMA_MS` el barrido le
   pediría a AstraCalls la grabación de una conversación que se está teniendo
   —que no existe hasta que alguien cuelga— y gastaría sus intentos antes de
   que hubiera nada que rescatar.
2. **Hay un tope de intentos, y hace falta.** Cada rescate **se baja el WAV
   entero**. Sin tope, una llamada que no se puede transcribir —sin créditos,
   un audio imposible— se lo bajaría en cada vuelta para siempre. El sello va
   en `raw.call.rescate`: ni tabla nueva ni migración.
3. **El sello se escribe ANTES de intentarlo.** Al revés, un intento que
   revienta a mitad —o un despliegue que se lleva el proceso, que es justo lo
   que pasa aquí— dejaría la llamada sin gastar su turno y la vuelta siguiente
   volvería a bajarse el mismo WAV.
4. **Va acotado por `messageTimestamp`, en serie y a trozos.** Los cinco
   índices de `chat_messages` empiezan por `userId` y aquí no hay ninguno que
   dar: sin esa condición se barre la tabla más grande de la plataforma. Y el
   pool de Prisma son diez por proceso, los mismos turnos que atienden Chats.
5. **`hasRecording === false` es AstraCalls diciendo que no hay audio**, y esa
   llamada está cerrada y correcta. Solo el `false` explícito: sin el campo es
   «no se sabe», que es justo lo que hay que ir a mirar.

### Y lo que estaba mudo: una llamada que no se registra NO se recupera

`logOutgoingCallAction` tenía el `catch` **vacío**. Eso es exactamente el
síntoma «la llamada se hizo, se habló, y no aparece registrada en ninguna
parte»: cuando se llega ahí la llamada ya salió, así que lo único que se pierde
es el registro — y sin fila no hay a quién pedirle la grabación, **ni ahora ni
en el barrido**. De todos los fallos de esta familia es el único que no tiene
arreglo después, así que es el que menos puede callarse.

### La plantilla del stack no lleva los secretos, y eso hay que SABERLO

`api-webhook/portainer-stack.yml` **no lleva** `VOICEBOT_SECRET`,
`ASTRACALLS_URL` ni `ASTRACALLS_API_KEY`: son secretos y no se comitean. Lo que
no puede pasar es que nadie lo sepa, porque **pegar esa plantilla en el editor
de Portainer se los lleva por delante**. Ahora lo dice un bloque en la propia
plantilla, y el backend **nombra en el arranque** las que falten —una vez, no
por petición, que ahí se pierde entre los `logger.log` de `webhook.service`—.

Y lo que hace cada una al faltar, que no es lo mismo:

- **`VOICEBOT_SECRET`**: `if (expected && secret !== expected)`. Vacía **no
  cierra: ABRE** — `/voicebot/*` deja de pedir secreto y cualquiera puede
  gastar los créditos de una cuenta. No rompe las llamadas, y por eso no se
  nota.
- **`ASTRACALLS_URL` / `_API_KEY`**: la acción `AI_CALL` de un flujo no llama a
  nadie. Eso sí se nota, y solo en el registro del backend.

### El banco

`scripts/banco-rescate-de-llamadas.sh` (App, contra Postgres) y su hermano en
el backend. Los dos en dos modos, y el roto **afirma el fallo**: se reproduce
el despliegue que se lleva la promesa suelta y se comprueba que la llamada se
queda como nació —y que **su par de ids seguía ahí todo el tiempo**, que es lo
que convierte el fallo en arreglable: no faltaba el dato, faltaba quien lo
mirara. Comprobado además que quitando el barrido el modo normal **se pone en
rojo por seis sitios**: sin eso no se sabría si lo verde es que se arregló la
causa o que el caso no se ejerce.

### Y el eslabón que se cayó era un CUARTO que no estaba en la lista

La primera versión de esta sección decía que cuál de los tres se cayó no se
podía saber sin mirar el stack. **Se podía, y no era ninguno de los tres**: era
el `middleware.ts` de esta App, y está contado entero en la sección siguiente.
Lo que sigue valiendo de esta es la forma del arreglo — la red sale de la base
— que es lo que hace que el fallo, venga del eslabón que venga, deje de ser
definitivo. **A partir de ahora el barrido lo dice**: `sinAviso` por encima de
cero nombra la cadena en el registro del backend.

## Un `fetch` SIGUE las redirecciones, así que el middleware puede tragarse un aviso entero

Esta es la causa de verdad de «las llamadas con IA no dejan ni duración», y es
de las que se anuncian como un éxito.

El backend avisa del fin de una llamada con
`fetch(NEXTJS_URL + "/api/calls/call-ended")`, con su clave interna y **sin
cookie de sesión**. En `middleware.ts` no había ningún prefijo `/api/calls`, así
que esa petición caía en el `redirect` final hacia `/login`. Y ahí está lo
caro:

> **`fetch` sigue las redirecciones por defecto.** Así que el backend se traía
> **la página de login con un `200`**, `resp.ok` salía `true`, y escribía en su
> registro «fin de llamada avisado a la App» habiendo entregado exactamente
> nada.

Medido sobre el build servido, no deducido:

```
POST /api/calls/call-ended   ->  307 -> /login?callbackUrl=%2Fapi%2Fcalls%2Fcall-ended
como lo ve el backend        ->  resp.ok true · resp.status 200 · resp.url .../login
```

### Por qué su banco estaba verde

Porque llamaba al **manejador** directamente
(`avisarDelFinDeLaLlamada(new Request(...))`), y ahí no hay middleware. El
camino de producción tiene una capa más que ningún caso ejercía.

> **Un banco que llama al manejador de una ruta no prueba que esa ruta se
> alcance.** Son dos preguntas, y la segunda es la que falla en silencio.

### Y no era una ruta: eran nueve

El barrido que se escribió para esto —toda ruta que se autentique con la clave
interna tiene que estar detrás de un prefijo del middleware— encontró **ocho
más**, todas medidas con el mismo `307`:

| | qué se caía |
| --- | --- |
| `/api/calls/{call-ended,process-bot-recording,rescatar}` | el fin de llamada, la transcripción del flujo y su red |
| `/api/send-media`, `/api/products`, `/api/external-client-data{,/search,/tools}` | **las herramientas del agente**: pedía sus productos y sus datos externos y se traía la página de login |
| `/api/bookings/{slots,services,appointment}` | los horarios de reserva del agente |

**Abrir esos prefijos no abre nada**, y se comprobó ruta por ruta antes de
tocarlos: las doce tienen su puerta propia —once con la clave interna y
`calls/recording` con `currentUser()`—. Es la regla de siempre: *ninguna ruta
`/api` confía solo en el middleware*. Comprobado además sobre el build servido
que después del arreglo siguen contestando **401 sin clave y con clave
equivocada**.

### `/api/bookings` se queda fuera A PROPÓSITO, y sigue rota

Sus tres rutas importan ficheros `'use server'` (`bookings-actions`,
`send-message-with-history-action`), así que abrir su prefijo pone en rojo
`acciones-de-sistema.test.mjs` —la guarda de que un runner de sistema no quede
publicado como endpoint—. Eso es un frente aparte: o se le quita el
`'use server'` a esos dos, o se decide que esa guarda no aplica a una ruta con
clave propia. **Lo que no puede pasar es que se dé por revisado**: está en la
lista de exclusiones del banco con su motivo escrito al lado, y el banco falla
si el motivo se queda vacío.

### Las dos cosas que quedan para que no vuelva

1. **El barrido del banco**, que es lo que caza la PRÓXIMA ruta que nazca con
   el mismo agujero. Lee los prefijos **del propio `middleware.ts`** —copiados
   a mano se quedarían cortos el día que se añada uno— y exige además que cada
   prefijo declarado se USE en un `return NextResponse.next()`: declararlo y no
   usarlo se lee igual de bien y no deja pasar a nadie.
2. **Y el backend mira `resp.redirected`**, en los dos sitios que llaman a la
   App. El middleware ya está arreglado; la comprobación se queda porque **un
   fallo que se anuncia como un éxito es el más caro de todos**, y el día que
   alguien añada una ruta sin su prefijo esto lo dice en vez de callarlo.
   Comprobado quitándola: los dos casos se ponen en rojo.

## El DDL de arranque mira el catálogo primero y nunca espera un candado

El 2026-10-05 toda la plataforma salió en «mantenimiento». Una consulta larga
tenía cogida `ChatConversationPreference`; cada proceso que arrancaba (dos
réplicas, cada despliegue, cada reinicio) volvía a lanzar
`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, que pide AccessExclusiveLock **aunque
la columna ya exista**. Se quedaba en cola detrás de la lectura larga, y detrás
de él TODAS las lecturas de esa tabla: el pool se agotaba y reiniciar solo
aliviaba unos minutos.

> **El DDL "por proceso" va por `lib/ddl-sin-bloquear.ts`**:
> `asegurarColumna` / `asegurarIndice` preguntan primero a
> `information_schema` / `pg_indexes` (sin candado sobre la tabla) y solo si
> falta lanzan el DDL, con `SET LOCAL lock_timeout = '3s'`. Si falla, el
> recuerdo se suelta y la siguiente llamada reintenta. Un `CREATE INDEX` sin
> `CONCURRENTLY` también bloquea escrituras: va por `asegurarIndice`.

Lo prueba `scripts/banco-ddl-sin-bloquear.sh` contra Postgres con la tabla
cogida; `MODO=roto` corre el ALTER a pelo y afirma que las lecturas se quedaban
en cola.

## La imagen base se baja de `mirror.gcr.io`, no de Docker Hub

El 2026-10-09 el despliegue falló dos veces seguidas en un segundo:
`429 Too Many Requests` al pedir `node:22-bookworm-slim` a Docker Hub. Los
ejecutores de GitHub comparten IP y Docker Hub limita las descargas sin
cuenta: el código estaba fusionado y producción se quedó atrás.

El `Dockerfile` pide `mirror.gcr.io/library/node:22-bookworm-slim`, la copia
de Docker Hub que mantiene Google: la misma imagen, sin ese límite. No volver a
`node:…` a secas. Si un despliegue vuelve a salir rojo con un 429, es el
registro, no el código: no se arregla relanzando.
