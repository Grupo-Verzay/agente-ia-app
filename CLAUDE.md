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
