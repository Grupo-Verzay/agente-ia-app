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
