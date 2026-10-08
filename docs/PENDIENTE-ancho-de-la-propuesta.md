# Pendiente: ancho de la propuesta pública = ancho de la landing de planes

Hecho: `PropuestaPublica.tsx` usa `ANCHO_DE_LA_LANDING` (antes: escalones max-w-2xl→6xl con padding chico).

Falta:
- Reducir el relleno de la tarjeta de servicio (`p-4 sm:p-5`) si las tarjetas de capacidad aún se ven apretadas.
- Reescribir `lib/__tests__/ancho-de-la-propuesta.test.mjs` (ESPERADO era 672/896/1024/1024/1152) al ancho de la landing y medir las tarjetas de capacidad dentro de un servicio con plan (prop `planes`).
- Ajustar `scripts/banco-ancho-de-la-propuesta.sh` (maqueta con un plan) y `MODO=roto` pinchado a `f8057cb`; comprobar que se pone en rojo sin el arreglo.
- Correr tsc y los bancos de propuesta/pie/plan-dentro.
- Actualizar la sección "El ancho" en CLAUDE.md.
- Luego fusionar y comprobar el despliegue.
