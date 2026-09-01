# Reglas que no se tocan

## Chats: el reloj responde, el tiempo real solo adelanta

El chat abierto se refresca con **su propio intervalo, fijo y corto**, corra o
no el tiempo real. El aviso instantáneo es un acelerador: si acierta, el mensaje
aparece al momento; si no, el reloj lo trae unos segundos después y nadie se
entera.

**No subir esos intervalos**, y no condicionarlos a que el socket parezca vivo.

Esto costó una noche entera de atención con clientes esperando. Los intervalos
se habían relajado —la lista de 20s a 60s, la conversación a 20s— dando por
hecho que el tiempo real mantendría la frescura. No lo hizo: el aviso llega con
una de las varias identidades del contacto (`remoteJid`, `@lid`, `senderPn`) y
cuando no emparejaba con la conversación abierta, el mensaje salía en la lista y
en la conversación no. Con el reloj relajado, el retraso era de minutos.

Tres cosas concretas que hay que mantener:

1. El ciclo del chat abierto es un `setInterval` montado una sola vez, que lee
   todo por referencia. **No volver a una cadena de `setTimeout`**: si una vuelta
   no llega a programar la siguiente, el ciclo muere en silencio y la
   conversación se congela hasta cambiar de chat.
2. Al pedir mensajes se pasan **todas** las identidades conocidas del contacto,
   incluida la que trae el aviso. Preguntar solo por una devuelve vacío sin
   error.
3. Si Evolution contesta corto, se tira de nuestra propia base, que guarda cada
   mensaje con todas sus identidades.

## Chats: la lista es grande, no rehacerla por gusto

Hay cuentas con miles de chats. Rehacer la lista entera cuesta segundos de
navegador bloqueado, y mientras tanto no se dibuja nada ni corren los relojes.

- Lo caro de cada fila (nombre, foto, sesión, marca) se calcula en
  `contactosBase`, que **no** depende de cuál esté abierto. Lo que sí depende de
  la selección se aplica encima, en una pasada barata. No volver a juntarlas: con
  `selectedJid` en las dependencias de lo caro, cada clic reconstruía miles de
  filas.
- Los avisos de tiempo real se aplican **en tanda**, no uno por uno.

# Pendientes

Lo que queda abierto en la plataforma. Actualizar aquí cuando se cierre algo.

## 1. Wompi sin probar de punta a punta

Nunca se ha confirmado que un pago real active la cuenta. La cadena
Wompi → backend → App no se ha recorrido con dinero de verdad, así que no se
sabe si un cliente que paga queda habilitado solo o hay que activarlo a mano.

Es el único pendiente que puede costar dinero.

## 2. Seguimientos que salen tarde

Los seguimientos van espaciados 1 a 2 minutos por número, para no arriesgar la
línea. Una cola de 300 tarda la jornada entera en salir.

Falta decidir qué hacer con el que se pasa de X horas: descartarlo o enviarlo
igual aunque llegue tarde.

## Cerrados

- **Índices de Postgres.** Se miró con datos: los repetidos suman 144 kB y los
  que nadie usa unos 3,5 MB, varios de ellos `_pkey`/`_key` que no se tocan. En
  una base de 1,6 GB no compensa.
- **`audit_logs`.** La nota decía que se escribía y no se leía nunca; se lee, en
  el botón de historial de una nota. Crecía sin freno pero despacio (2,3 MB en
  dos meses). Tiene borrado a los 90 días con el resto de la limpieza nocturna.
- **Archivos huérfanos.** Borrados `components/form-register.tsx` y
  `MisClientesMain.tsx`.
