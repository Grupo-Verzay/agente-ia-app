# WordPress en el Swarm — sacar los tres sitios de Hostinger

Un stack por dominio (`wp-<dominio>`), cada uno con su WordPress y su MariaDB,
detrás del Traefik de siempre (`minha_rede`, certificado de Let's Encrypt solo).

> Esto es infraestructura: se crea en **Portainer**, no es un cambio de la App.

## Crear un sitio

```
PORTAINER_URL=https://panel-n8n.ia-app.com PORTAINER_TOKEN=ptr_... \
  deploy/wordpress/crear-stack.sh midominio.com
```

Crea el stack `wp-midominio-com` con contraseñas generadas, que quedan como
variables del stack en Portainer. Si el backup de Hostinger usa otro prefijo de
tablas, se pasa de segundo parámetro (`crear-stack.sh midominio.com wpxx_`) o se
cambia luego en las variables del stack: el `wp-config.php` de la imagen las lee
en caliente.

## Sin límites

- PHP: subidas de 2 GB, 15 minutos por petición, `memory_limit` 512M
  (`zz-sin-limites.ini`, escrito por el entrypoint).
- MariaDB: `max_allowed_packet` 256M, para dumps con filas grandes.
- Traefik y Apache no ponen tope de tamaño.

## Restaurar el backup de Hostinger

1. Bajar de hPanel → Archivos → Backups los **archivos** (`public_html`) y la
   **base de datos** (`.sql`) del último punto.
2. Archivos: al volumen `wp-<slug>_html` (es `/var/www/html` del contenedor).
   Base: `mariadb wordpress < backup.sql` dentro del contenedor `db`, con el
   usuario `wordpress` y la contraseña del stack.
3. Quitar el plugin de LiteSpeed Cache (Hostinger lo mete siempre; aquí es
   Apache): borrar `wp-content/plugins/litespeed-cache` y las líneas
   `LiteSpeed` del `.htaccess`.
4. Si `siteurl`/`home` en `wp_options` no coinciden con el dominio, corregirlos.

## Cambiar el DNS al final

Probar primero apuntando el dominio en `/etc/hosts` a `89.117.150.148`. Cuando
el sitio se vea bien, cambiar los registros A de `@` y `www` a esa IP; Traefik
saca el certificado en el primer acceso. **Los dos registros**: el router pide
un certificado con `dominio` y `www.dominio`, y si `www` no apunta aquí, el
reto de Let's Encrypt falla para los dos.

Hostinger no se cancela hasta ver los tres sitios sirviendo desde aquí.

## Los dominios: DNS a Cloudflare antes de nada

Los tres (`verzay.com`, `verzana.pro`, `realizarpago.com`) tienen hoy los
nameservers de Hostinger (`*.dns-parking.com`), así que el DNS **también** se
va con Hostinger. Primero se lleva a Cloudflare, con todo apuntando donde
apunta hoy; el sitio no se entera.

1. Cloudflare → Add a site → el dominio, plan Free. Cuando pida los registros,
   importar el fichero `dns/<dominio>.zone` de aquí (Import and Export → Import),
   que tiene lo que había en Hostinger el 2026-09-11: los A del CDN de
   Hostinger, el correo (MX, SPF, DKIM, DMARC, autoconfig) y `www`.
2. En el **registrador** (donde se compró el dominio), cambiar los nameservers a
   los dos que dé Cloudflare. Tarda de minutos a un día en propagarse.
3. Dejar `@` y `www` **sin proxy (nube gris)** hasta que el WordPress esté aquí
   y con certificado: con el proxy naranja, el reto HTTP de Let's Encrypt que
   usa Traefik no llega al servidor. Encenderlo después es un clic.

**El correo se queda en Hostinger** mientras los MX apunten a
`mx1/mx2.hostinger.com`. Cancelar el hosting sin haber movido antes los buzones
(a otro proveedor, o quedándose solo el plan de correo de Hostinger) los deja
sin servicio. Es una decisión aparte de mover los sitios.
