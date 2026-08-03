# Pendientes

Lo que queda abierto en la plataforma. Actualizar aquí cuando se cierre algo.

## 1. Wompi sin probar de punta a punta

Nunca se ha confirmado que un pago real active la cuenta. La cadena
Wompi → backend → App no se ha recorrido con dinero de verdad, así que no se
sabe si un cliente que paga queda habilitado solo o hay que activarlo a mano.

Es el único pendiente que puede costar dinero.

## 2. Menores

- 16 índices repetidos en Postgres.
- Tabla `audit_logs`: se escribe mucho y no se lee nunca.
- Dos archivos huérfanos en el repo: `components/form-register.tsx` y
  `MisClientesMain.tsx` — no los usa nada.
