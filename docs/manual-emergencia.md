# Manual de emergencia

**Para quién es:** Yair, administrador de la plataforma.
**Para qué sirve:** que cuando algo se caiga sepas exactamente qué mirar, qué
puedes tocar y en qué momento hay que llamar a Carlos.

**Teléfono de Carlos:** _(anótalo aquí la primera vez que leas esto)_

> **Lo más importante:** no pasa nada por llamar a Carlos "de más". Sí pasa por
> tocar algo que no tocaba. Si dudas, para y llama.

---

## Las cinco reglas que nunca se rompen

Léelas antes que nada. Valen para los cuatro escenarios de abajo.

| | Qué |
| --- | --- |
| ✅ **SÍ puedes** | Reiniciar **Evolution** y **WAHA** desde Portainer del servidor `.233` |
| ✅ **SÍ puedes** | Usar **Claude Code** para mirar, leer y entender qué está pasando |
| 🚫 **NUNCA** | Tocar el servidor de **base de datos** (`.144` — Postgres, Redis, MinIO) |
| 🚫 **NUNCA** | Entrar al **Portainer de la app** (servidor `.148`) |
| 🚫 **NUNCA** | **Desplegar** — ni tú a mano, ni pidiéndoselo a Claude Code |

Dos aclaraciones, porque son las dos que más se confunden:

- **Hay dos Portainer distintos.** El del servidor `.233` es el de WhatsApp
  (Evolution y WAHA): ese es tuyo. El del servidor `.148` es el de la app: ese
  no se abre. Son enlaces distintos, guárdalos con nombres distintos en tus
  favoritos para no equivocarte con prisa.
- **"Desplegar" es subir una versión nueva de la app.** Eso lo hace Carlos.
  Reiniciar Evolution o WAHA **no es** desplegar: es apagar y encender algo que
  ya está, sin cambiar nada. Eso sí es tuyo.

---

## Antes de cualquier cosa: las tres preguntas de 30 segundos

Contéstalas siempre, en este orden. Muchas veces la respuesta aparece aquí y no
hace falta tocar nada.

**1. ¿Le pasa a todo el mundo o solo a mí?**
Abre la plataforma desde el celular con **datos móviles** (sin wifi). Si desde
ahí funciona, el problema es de tu red o de tu navegador, no de la plataforma.

**2. ¿Le pasa a todos los clientes o a uno solo?**
Un cliente con problema = casi siempre su línea de WhatsApp (escenario 2).
Muchos clientes a la vez = casi siempre el servidor de WhatsApp (escenario 3) o
la base de datos (escenario 4).

**3. ¿Qué hora empezó?**
Apúntala. Es el dato que más ayuda a Carlos y el que siempre se olvida.

---

## Escenario 1 — La app no carga

### Cómo se ve

- La pantalla se queda en blanco o dando vueltas y no termina de abrir.
- Sale un mensaje que dice **502**, **503**, **Bad Gateway** o
  *"No se puede acceder a este sitio"*.
- Entras, pero al segundo te devuelve al login una y otra vez.

### Qué revisar primero

1. **Prueba desde el celular con datos móviles.** Si ahí sí abre, es tu red.
   Reinicia tu wifi y listo.
2. **Comprueba si la plataforma está viva.** Abre esta dirección en el
   navegador:

   ```
   https://agente.ia-app.com/api/health
   ```

   - Si te contesta algo parecido a `{"ok":true, ...}` → **la app está en pie**.
     El problema es tu navegador, tu red o tu sesión: sigue con el paso 3.
   - Si no contesta, da error o se queda cargando → **la app está caída**.
     Salta directo a "Cuándo parar y llamar".

3. **Limpia tu lado.** En este orden, probando después de cada uno:
   - Recarga forzando: **Ctrl + Shift + R** (en Mac, **Cmd + Shift + R**).
   - Abre la plataforma en una **ventana de incógnito**.
   - Cierra sesión y vuelve a entrar.

4. **¿Se acaba de subir una versión?** Si Carlos te avisó de un cambio hace
   menos de cinco minutos, espera dos minutos y vuelve a probar. Al subir una
   versión nueva hay un momento de acomodo, pero **es de segundos**: la
   plataforma está preparada para no caerse mientras tanto. Si pasan más de
   cinco minutos así, ya no es eso.

### 🛑 Cuándo parar y llamar a Carlos

**Ya.** La app no es tuya para reiniciar: aquí no hay ningún botón tuyo que
pulsar. Llama en cuanto:

- La dirección de salud no contesta, **o**
- Abre desde datos móviles y desde incógnito y sigue igual, **o**
- Llevas más de cinco minutos con esto.

Mientras esperas, avisa por el grupo de asesores: "la plataforma está caída,
atiendan desde el celular". Los mensajes de WhatsApp **siguen llegando** al
teléfono de cada línea aunque la plataforma no abra.

---

## Escenario 2 — Una línea de WhatsApp se desconectó

Este es el más común de todos, y casi siempre se resuelve sin llamar a nadie.

### Cómo se ve

- El cliente dice *"no me están llegando los mensajes"* o *"el bot dejó de
  responder"*.
- En **Conexión**, la tarjeta de esa línea aparece desconectada o pidiendo un
  código QR.
- En **Panel › Clientes**, ese cliente sale marcado como desconectado.

### Qué revisar primero

Va en este orden, porque los dos primeros son los que más veces son la causa y
los que no requieren tocar nada:

**1. ¿Está encendido el Robot?**
En la tarjeta de la línea, dentro de **Conexión**, hay un botón del **Robot**.
Si está apagado, la línea funciona y recibe mensajes, pero **la IA no
responde** — que desde fuera se ve igual que estar desconectado. A veces lo
apaga un asesor a propósito. Enciéndelo solo si confirmas con el cliente que
debía estar encendido.

**2. ¿El cliente está al día con su pago?**
Cuando una cuenta se vence, **la plataforma apaga el agente automáticamente**.
La línea sigue conectada y los asesores pueden escribir a mano, pero la IA se
calla. Míralo en **Panel › Clientes**. Si es eso, no hay nada que arreglar:
hay que cobrar. En cuanto se confirma el pago, el agente vuelve solo, sin
escanear ningún QR.

**3. ¿Es solo esta línea?**
Abre **Panel › Analíticas** y busca el bloque **Actividad de instancias**. Ahí
solo aparecen las líneas con problema: las sanas no se listan.
- Aparece **una sola** → sigue aquí, es esta línea.
- Aparecen **varias a la vez** → no es la línea, es el servidor. Vete al
  escenario 3.

**4. ¿Y el teléfono del cliente?**
Pregúntale:
- ¿Tiene internet el celular donde está la línea?
- ¿Alguien cerró sesión desde *Dispositivos vinculados* en su WhatsApp?
- ¿Cambió de teléfono o reinstaló WhatsApp?

Cualquiera de esas tres desconecta la línea y **es normal**: hay que volver a
escanear.

### Qué hacer, paso a paso

Si después de lo anterior la línea sigue caída y hay que reconectarla:

1. Entra a la cuenta de ese cliente y abre **Conexión**.
2. Busca la tarjeta de la línea de WhatsApp.
3. Pide el **código QR**.
4. Pásale al cliente estas instrucciones tal cual (sirven igual para WhatsApp
   normal y para WhatsApp Business):
   > Abre WhatsApp en tu celular → toca los tres puntos (arriba a la derecha)
   > → **Dispositivos vinculados** → **Vincular un dispositivo** → apunta la
   > cámara a la pantalla.
5. El QR **dura poco**. Si se vence antes de que alcance a escanear, pide uno
   nuevo. Puedes repetirlo las veces que haga falta, no rompe nada.
6. Cuando enlace, la tarjeta cambia a conectada. Espera un minuto y pídele al
   cliente que te escriba un mensaje de prueba.

### 🚫 Lo que no se toca en esta pantalla

En la tarjeta de la línea hay dos botones peligrosos. Míralos bien una vez, con
calma, para reconocerlos cuando tengas prisa:

- **La papelera (🗑️)**: **no se toca nunca.** No "desconecta": **borra la
  línea entera**. Es el botón que más daño hace de toda la plataforma.
- **El botón verde**: cierra la sesión y obliga a escanear el QR de nuevo. Solo
  se usa cuando ya decidiste reconectar y el cliente está con el teléfono en la
  mano, listo para escanear. Nunca "a ver si con esto se arregla".

### 🛑 Cuándo parar y llamar a Carlos

- El QR **no aparece** o da error al pedirlo.
- Se escanea, conecta, y **se vuelve a caer** a los pocos minutos. (Si pasa dos
  veces seguidas, para. No lo intentes una tercera.)
- El cliente dice que WhatsApp le muestra un aviso de **bloqueo o suspensión**
  de su número. Eso no se arregla desde la plataforma.
- Se cayeron **varias líneas a la vez** → eso es el escenario 3.

---

## Escenario 3 — Evolution o WAHA no responden

Este es **el único** donde tú reinicias algo.

Evolution y WAHA son los dos programas que conectan la plataforma con WhatsApp.
Cada línea de cliente usa uno de los dos. Los dos viven en el **servidor
`.233`**, y ese Portainer sí es tuyo.

### Cómo se ve

- **Varios clientes a la vez** reportan que no les llegan o no les salen
  mensajes.
- Los mensajes se quedan "enviando" o no salen del todo.
- En **Panel › Analíticas › Actividad de instancias** aparecen varias líneas en
  rojo.
- En **Panel › Salud de envíos** ves fallos seguidos, y arriba el resumen te
  dice **por cuál proveedor** están fallando.

### Qué revisar primero

**1. Confirma que son varias líneas, no una.** Si es una sola, vuelve al
escenario 2. Reiniciar un servidor entero por una línea es desproporcionado:
molesta a todos los demás clientes que sí están bien.

**2. Averigua cuál de los dos está fallando.** Abre **Panel › Salud de
envíos**. El resumen de arriba separa por proveedor y te dice cuál no está
consiguiendo entregar nada. Ese es el que hay que reiniciar.

> **Esto importa de verdad:** se reinicia **solo el que falla**, nunca los dos
> "por si acaso". Reiniciar el que está sano corta las conversaciones de
> clientes que en ese momento funcionan perfectamente.

**3. ¿Abre Portainer?** Entra al Portainer del servidor `.233`. Si **Portainer
mismo no carga**, el servidor entero está caído: no hay nada que reiniciar y
esto ya es para Carlos.

### Qué hacer, paso a paso

1. Entra al **Portainer del servidor `.233`** (el de WhatsApp — **no** el de la
   app).
2. En el menú de la izquierda, entra a **Containers**.
3. Busca en la lista el que lleve en el nombre **`evolution`** o **`waha`**,
   según cuál te dijo el paso anterior que está fallando.

   > Nombre exacto del de Evolution: _______________________
   > Nombre exacto del de WAHA: _______________________
   >
   > _(pídeselos a Carlos y anótalos aquí la primera vez. Con el nombre escrito
   > no hay que adivinar nada con prisa.)_

4. Márcalo con la casilla de la izquierda y pulsa **Restart**.

   > **Solo el botón que diga `Restart`.** Si no encuentras un botón que diga
   > exactamente eso, **no pulses ningún otro** — sobre todo ninguno que hable
   > de *Update*, *Redeploy* o *Deploy*. Llama a Carlos y que lo haga él. Es
   > preferible esperarlo cinco minutos a pulsar el botón equivocado.

5. Espera **tres minutos sin tocar nada**. Es normal que durante ese rato las
   líneas se vean caídas: se están levantando.
6. Vuelve a **Conexión** y mira las tarjetas. Lo normal es que las líneas
   vuelvan **solas**, sin escanear ningún QR.
7. Pide una prueba: que un cliente (o tú desde tu celular a una línea) mande un
   mensaje y confirma que llega.

### 🚫 Lo que no se toca dentro de Portainer

**Tu único botón es `Restart`.** Cualquier otro, no. En concreto:

- **Nunca** `Remove`, `Delete`, `Kill` ni `Prune`. Esos no apagan: **borran**.
- **Nunca** nada que diga `Update` o `Redeploy`, en ninguna pantalla. Eso es
  desplegar, aunque el botón esté al lado del de reiniciar y se parezcan.
  `Restart` vuelve a encender lo mismo que ya había; `Update` pone otra cosa.
- **Nunca** edites el texto de configuración (el YAML) ni las variables de
  entorno, aunque veas algo que te parezca mal escrito.
- **Nunca** reinicies dos veces seguidas. Si un reinicio no arregló, el segundo
  tampoco va a arreglar: lo único que hace es cortar más conversaciones.

### 🛑 Cuándo parar y llamar a Carlos

- **Después de UN reinicio**, si a los tres minutos sigue igual. Uno. No dos.
- Las líneas vuelven pero **piden QR todas**. Eso no es normal después de un
  reinicio y es señal de algo más serio: no empieces a reescanear, llama.
- Portainer no abre, o abre y no te deja reiniciar.
- No logras distinguir cuál de los dos está fallando. Mejor preguntar que
  reiniciar el que no era.

---

## Escenario 4 — La base de datos no responde

Aquí **no se toca absolutamente nada**. Ni un botón.

La base de datos vive en el servidor `.144`, junto con otros dos servicios
(Redis y MinIO, que guardan la memoria rápida y los archivos). Ese servidor es
el corazón de todo: si se toca mal, se puede perder información de clientes de
forma **que no se recupera**.

### Cómo se ve

Lo que la distingue de la app caída: **la plataforma sí abre**, pero por dentro
no funciona nada.

- Entras, se ve el menú, y **todas** las pantallas dan error o salen vacías.
- Sale *"Error interno"*, *"No se pudo cargar"* o *"Revisa la conexión"* en
  sitios distintos.
- Chats no carga las conversaciones, o carga la lista y ningún mensaje.
- No puedes ni iniciar sesión, pero la pantalla de login sí se ve bien.

### Qué revisar primero

Esto es solo para **confirmar** que es la base de datos, no para arreglarlo.

Abre en el navegador:

```
https://agente.ia-app.com/api/health
```

- **Contesta `{"ok":true...}` pero la plataforma por dentro no funciona** → es
  la base de datos. Esa dirección a propósito no consulta la base: por eso
  contesta bien aunque la base esté caída. Es exactamente la señal que buscamos.
- **No contesta** → no es esto, es el escenario 1.

### Qué hacer, paso a paso

1. **No tocar nada.** Nada en el servidor `.144`. Ni reiniciar, ni entrar, ni
   "probar".
2. **Llama a Carlos ya.** Este escenario no tiene paso intermedio ni intento
   previo: se llama de una.
3. Mientras esperas, haz lo que sí ayuda:
   - Apunta **la hora exacta** en que empezó.
   - Toma **capturas** de los errores que veas.
   - Avisa a los asesores: que atiendan desde el celular de cada línea. Los
     mensajes de WhatsApp siguen llegando al teléfono aunque la plataforma esté
     así.
   - Anota qué se quedó a medias: cobros, seguimientos, envíos programados.

### 🚫 Por qué no se reinicia

Por si alguien te lo sugiere en el momento: reiniciar una base de datos
mientras la plataforma le está escribiendo es como apagar el computador de un
tirón mientras guardas un archivo. Puede quedar a medio escribir. Y a medio
escribir, a veces, no se arregla — se pierde.

Un reinicio mal hecho aquí convierte **una hora de caída** en **días de trabajo
perdido de todos los clientes**. Por eso esta regla no tiene excepciones ni
"depende".

### 🛑 Cuándo llamar a Carlos

**Inmediatamente.** Este es el único escenario donde se llama antes de intentar
nada.

---

## Claude Code: para entender, nunca para tocar

Puedes abrir una sesión de Claude Code y pedirle que investigue. Es tu mejor
herramienta para llegar a Carlos con el diagnóstico medio hecho, en vez de con
un "algo pasa".

### ✅ Lo que sí le puedes pedir

Preguntas. Cosas que empiecen por *mira*, *revisa*, *dime*, *explícame*:

- "Revisa Salud de envíos y dime cuál proveedor está fallando y desde cuándo."
- "¿Por qué no salieron los cobros de ayer?"
- "Explícame qué significa este error." (y le pegas el error)
- "¿Qué líneas están desconectadas ahora mismo?"
- "Prepárame un resumen de lo que está pasando para mandárselo a Carlos."

### 🚫 Lo que nunca le puedes pedir

Nada que **cambie** algo. Aunque él te diga que puede hacerlo:

- "Arréglalo" / "corrige eso" / "sube el cambio"
- "Haz el merge" / "despliega" / "publica"
- "Reinicia el servidor" / "borra eso" / "actualiza la base"

### La regla simple, para cuando tengas prisa

> **Si Claude Code te pide permiso para algo, la respuesta es NO.**

Leer no pide permiso. Si aparece un cuadro pidiéndote que apruebes o confirmes,
es porque va a **escribir, cambiar o subir** algo — y eso no es tuyo. Di que no
y mándale la pregunta a Carlos.

Palabras que, si las ves en lo que te pide aprobar, significan **no** sin
pensarlo dos veces: `merge`, `push`, `deploy`, `docker`, `restart`, `DELETE`,
`UPDATE`, `DROP`.

> Ojo con una que se presta a confusión: **`restart` aquí es un no**, aunque
> reiniciar Evolution o WAHA sí sea cosa tuya. La diferencia es quién lo hace:
> ese reinicio lo haces **tú, con tu mano, en Portainer**, viendo qué aprietas.
> Dejar que lo haga Claude Code es otra cosa, y esa no.

---

## Cuando llames a Carlos, mándale esto

No lo llames solo con "se cayó". Con estos cinco datos resuelve mucho más
rápido. Copia esta plantilla y rellénala:

```
QUÉ PASA:        (ej. varias líneas dejaron de enviar mensajes)
DESDE CUÁNDO:    (hora exacta en que lo notaste)
A QUIÉN LE PASA: (un cliente / varios / todos / solo a mí)
QUÉ YA PROBÉ:    (ej. probé desde datos móviles, reinicié WAHA una vez)
QUÉ VEO:         (el mensaje de error tal cual, o una captura)
```

El dato que más vale de los cinco es **"qué ya probé"**: le evita a Carlos
repetir lo que tú ya descartaste.

---

## Resumen de una sola pantalla

Si te aprendes solo esta tabla, ya vas bien:

| Lo que ves | Qué es | Qué haces |
| --- | --- | --- |
| La plataforma no abre para nadie | App caída | Nada que reiniciar → **llama a Carlos** |
| Un cliente sin mensajes | Su línea | Robot → pago → QR (escenario 2) |
| Varios clientes sin mensajes | Evolution o WAHA | **Un** reinicio en Portainer `.233` |
| Abre pero todo da error por dentro | Base de datos | **No toques nada → llama ya** |

Y lo que nunca cambia, pase lo que pase:

1. **Servidor `.144` (base de datos): no se toca.** Nunca, por ningún motivo.
2. **Portainer de la app (`.148`): no se abre.**
3. **Desplegar no es tuyo**, ni a mano ni pidiéndoselo a Claude Code.
4. **Un intento, no dos.** Si el primero no arregló, para y llama.
5. **Llamar de más no cuesta nada. Tocar de más, sí.**
