# deploy/ e infraestructura

Este directorio guarda stacks auxiliares: `librechat/`, `wordpress/`
(plantilla de Portainer y DNS) y `sql/` (barridos manuales). La App no se
despliega desde aquí.

## Cómo se despliega la App

1. Fusionar en `main` dispara `.github/workflows/docker-publish.yml`: build
   de la imagen → `ghcr.io/grupo-verzay/agente-ia-app:<sha>` → webhook de
   Portainer (.148) con esa versión. En fila, nunca dos a la vez.
2. `despliegue-perdido.yml` mira cada 10 min que el último commit de `main`
   tenga su corrida y la lanza si GitHub perdió el aviso.
3. El backend se despliega al fusionar en `master` de `api-webhook`;
   astracalls (llamadas) se despliega a mano.

## Reglas

- **La App va a DOS réplicas (`start-first`); el backend a UNA.** El backend
  lleva 18 planificadores sin candado: dos réplicas duplican WhatsApps a
  clientes y la facturación. Nunca subirlo.
- El healthcheck del stack pisa el de la imagen (pendiente abierto en
  `docs/reglas/infraestructura-y-despliegue.md`).
- Una cadena de servicios sin red debajo se cae con cualquier redespliegue.
- Mudar un servicio de servidor: el certificado va DESPUÉS del DNS.
- Los agentes solo MIRAN Portainer, aunque la llave permita más.
- Un despliegue rojo: leer el primer `Type error` del log.

## Detalle

- `docs/reglas/infraestructura-y-despliegue.md`
- `docs/manual-emergencia.md`, `docs/entorno-claude-code-agentes.md`
