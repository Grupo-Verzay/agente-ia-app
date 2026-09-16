/**
 * Banco de pruebas de `lib/miniatura-del-anuncio.ts`.
 *
 * Corre sobre el modulo REAL, compilado antes a JS (ver la cabecera del
 * fichero de pruebas del CRM para el estilo: `node:test` + `node:assert`).
 *
 *   npx tsc lib/miniatura-del-anuncio.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler
 *   node --test lib/__tests__/miniatura-del-anuncio.test.mjs
 *
 * La primera prueba reproduce **el fallo tal y como se veia**, con la logica
 * vieja, y solo despues se comprueba que la nueva no lo comete. Sin ese primer
 * paso no se sabe si se arreglo la causa o algo que se le parece.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { miniaturaDelAnuncio } from "./.compilado/miniatura-del-anuncio.js";

/** Lo que hacia la App antes: `mediaUrl || thumbnail`, y el resto ignorado. */
function miniaturaVieja(adReply) {
  const rawThumb = adReply?.mediaUrl || adReply?.thumbnail;
  return rawThumb
    ? rawThumb.startsWith("data:") || rawThumb.startsWith("http")
      ? rawThumb
      : `data:image/jpeg;base64,${rawThumb}`
    : undefined;
}

// ── El fallo, tal cual se veia ───────────────────────────────────────────────

test("ANTES: con los bytes guardados, prefería el enlace de Facebook que caduca", () => {
  const anuncio = {
    mediaUrl: "https://scontent.xx.fbcdn.net/v/t45.123-4/caducado.jpg?oe=68AA",
    thumbnail: "/9j/4AAQSkZJRgABAQAAAQ",
  };
  // La vieja se iba al enlace firmado: cuando expira, icono roto.
  assert.equal(miniaturaVieja(anuncio), anuncio.mediaUrl);
  // La nueva usa los bytes, que no caducan nunca.
  assert.equal(miniaturaDelAnuncio(anuncio), `data:image/jpeg;base64,${anuncio.thumbnail}`);
});

test("ANTES: con la forma de Evolution se quedaba SIN imagen", () => {
  // `thumbnailUrl` es el campo que usan las lineas de Evolution, y la App no lo
  // miraba en ningun sitio. Para Waha el backend lo mapea a `mediaUrl`, y por
  // eso el fallo no se veia en esas lineas.
  const anuncio = { thumbnailUrl: "https://scontent.xx.fbcdn.net/v/t45/mini.jpg" };
  assert.equal(miniaturaVieja(anuncio), undefined);
  assert.equal(miniaturaDelAnuncio(anuncio), anuncio.thumbnailUrl);
});

// ── El orden de preferencia ──────────────────────────────────────────────────

test("manda `thumbnail` sobre los dos enlaces", () => {
  assert.equal(
    miniaturaDelAnuncio({
      thumbnail: "QUJD",
      thumbnailUrl: "https://cdn/mini.jpg",
      mediaUrl: "https://cdn/medio.mp4",
    }),
    "data:image/jpeg;base64,QUJD",
  );
});

test("sin `thumbnail`, la miniatura antes que el medio del anuncio", () => {
  // `mediaUrl` puede ser un video, y un video dentro de un `<img>` no se pinta.
  assert.equal(
    miniaturaDelAnuncio({ thumbnailUrl: "https://cdn/mini.jpg", mediaUrl: "https://cdn/medio.mp4" }),
    "https://cdn/mini.jpg",
  );
});

test("`mediaUrl` sigue valiendo cuando es lo unico que hay (las lineas Waha)", () => {
  assert.equal(miniaturaDelAnuncio({ mediaUrl: "https://cdn/x.jpg" }), "https://cdn/x.jpg");
});

test("acepta tambien la forma en mayusculas, como hace el backend", () => {
  assert.equal(miniaturaDelAnuncio({ thumbnailURL: "https://cdn/y.jpg" }), "https://cdn/y.jpg");
  assert.equal(miniaturaDelAnuncio({ mediaURL: "https://cdn/z.jpg" }), "https://cdn/z.jpg");
});

// ── Lo que NO se pinta ───────────────────────────────────────────────────────

test("la miniatura en bytes (lista de numeros) no se pinta", () => {
  // Sin esto acababa en el `src` como `data:image/jpeg;base64,1,2,3`, que es un
  // icono roto con pasos de mas.
  assert.equal(miniaturaDelAnuncio({ thumbnail: [1, 2, 3] }), undefined);
  assert.equal(miniaturaDelAnuncio({ thumbnail: { type: "Buffer", data: [1, 2] } }), undefined);
});

test("un campo vacio o en blanco no tapa al siguiente", () => {
  assert.equal(miniaturaDelAnuncio({ thumbnail: "", thumbnailUrl: "https://cdn/a.jpg" }), "https://cdn/a.jpg");
  assert.equal(miniaturaDelAnuncio({ thumbnail: "   ", mediaUrl: "https://cdn/b.jpg" }), "https://cdn/b.jpg");
});

test("sin anuncio, o sin nada que enseñar, no hay miniatura", () => {
  assert.equal(miniaturaDelAnuncio(null), undefined);
  assert.equal(miniaturaDelAnuncio(undefined), undefined);
  assert.equal(miniaturaDelAnuncio({}), undefined);
  assert.equal(miniaturaDelAnuncio({ title: "Solo titulo" }), undefined);
});

// ── Las formas de una cadena ─────────────────────────────────────────────────

test("un `data:` ya montado se deja tal cual", () => {
  const ya = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(miniaturaDelAnuncio({ thumbnail: ya }), ya);
});

test("el base64 de un JPEG empieza por '/' y NO se confunde con una ruta", () => {
  // `/9j/` es el principio de todo JPEG en base64. Tratar el "/" inicial como
  // una ruta del sitio dejaria la imagen apuntando a la propia App.
  assert.equal(
    miniaturaDelAnuncio({ thumbnail: "/9j/4AAQSkZJRg" }),
    "data:image/jpeg;base64,/9j/4AAQSkZJRg",
  );
});

test("se quitan los espacios de los bordes", () => {
  assert.equal(miniaturaDelAnuncio({ thumbnailUrl: "  https://cdn/c.jpg  " }), "https://cdn/c.jpg");
});
