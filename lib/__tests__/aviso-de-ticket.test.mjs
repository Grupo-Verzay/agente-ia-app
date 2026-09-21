/**
 * A quién le salta un ticket: la regla, sin base y sin navegador.
 *
 * # Qué se prueba
 *
 * Una frase: *si el ticket tiene responsable, el aviso es suyo; si no, es de
 * todo el que alcance el módulo.* Y la mitad que se olvida: **el responsable
 * pasa por el mismo filtro que los demás**, porque un aviso que lleva a una
 * pantalla que esa persona no puede abrir es peor que no mandarlo.
 *
 * `MODO=roto` corre la versión INGENUA —la que se escribe sola: avisar a todo
 * el equipo y no mirar el módulo— y **afirma los dos fallos**: que la persona
 * sin acceso recibe, y que un ticket ya asignado sigue despertando al equipo
 * entero. Sin ese modo, lo verde de al lado no diría si la regla se cumple o
 * si el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-avisos-de-ticket.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    aQuienAvisaUnTicket,
    elEnlaceDelTicket,
    tituloDelAvisoDeTicket,
} from "./.compilado/aviso-de-ticket.js";

const ROTO = process.env.MODO === "roto";

/**
 * La forma INGENUA, la que el modo roto reproduce.
 *
 * Es lo que se escribe sin pensarlo: la lista entera de quien atiende, sin
 * mirar el módulo y sin mirar si el ticket ya tiene dueño. Desde fuera no se
 * ve ningún error — se ve a media plataforma recibiendo avisos de tickets que
 * no son suyos, y a alguien recibiendo uno que le lleva a una pantalla cerrada.
 */
function comoSiFueraIngenuo(input) {
    return {
        destinatarios: [...(input.todoElEquipo ?? [])],
        soloElResponsable: false,
        elResponsableNoAlcanza: false,
    };
}

const EQUIPO = ["ana", "beto", "caro"];
/** Caro está restringida a otro módulo: no alcanza Tickets. */
const CON_ACCESO = ["ana", "beto"];

function decidir({ responsableId }) {
    return ROTO
        ? comoSiFueraIngenuo({ todoElEquipo: EQUIPO })
        : aQuienAvisaUnTicket({ responsableId, conAcceso: CON_ACCESO });
}

test("un ticket SIN responsable va a todo el que alcanza el modulo", () => {
    const r = decidir({ responsableId: null });

    if (ROTO) {
        // EL FALLO: caro no alcanza el modulo y recibe el aviso igual.
        assert.ok(r.destinatarios.includes("caro"), "ingenuo: avisa a quien no lo ve");
        return;
    }

    assert.deepEqual(r.destinatarios, ["ana", "beto"]);
    assert.equal(r.soloElResponsable, false);
    assert.equal(r.elResponsableNoAlcanza, false);
});

test("un ticket YA asignado va SOLO a su responsable", () => {
    const r = decidir({ responsableId: "beto" });

    if (ROTO) {
        // EL SEGUNDO FALLO: el ticket tiene dueno y sigue despertando al equipo.
        assert.deepEqual(r.destinatarios, EQUIPO, "ingenuo: avisa a todos igual");
        return;
    }

    assert.deepEqual(r.destinatarios, ["beto"]);
    assert.equal(r.soloElResponsable, true);
});

test("un responsable que NO alcanza el modulo no recibe, y se DICE", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");

    const r = aQuienAvisaUnTicket({ responsableId: "caro", conAcceso: CON_ACCESO });
    // Ni a el ni a nadie: el aviso es suyo, y el suyo no se puede mandar.
    assert.deepEqual(r.destinatarios, []);
    assert.equal(r.soloElResponsable, true);
    // Y la bandera que obliga a quien llama a escribirlo en la consola: un
    // aviso que no sale sin decirlo se lee como «a mi no me llega nada».
    assert.equal(r.elResponsableNoAlcanza, true);
});

test("nadie con acceso NO es un fallo del reparto: es una lista vacia", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");

    const r = aQuienAvisaUnTicket({ responsableId: null, conAcceso: [] });
    assert.deepEqual(r.destinatarios, []);
    assert.equal(r.elResponsableNoAlcanza, false, "sin responsable no hay a quien culpar");
});

test("los repetidos y los vacios se caen antes de decidir", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");

    const r = aQuienAvisaUnTicket({
        responsableId: null,
        conAcceso: ["ana", "ana", "  ", "", "beto"],
    });
    // Dos filas para la misma persona serian dos ventanas por un solo ticket.
    assert.deepEqual(r.destinatarios, ["ana", "beto"]);
});

test("el responsable se compara SIN espacios", (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");

    const r = aQuienAvisaUnTicket({ responsableId: "  beto  ", conAcceso: CON_ACCESO });
    assert.deepEqual(r.destinatarios, ["beto"]);
    assert.equal(r.elResponsableNoAlcanza, false);
});

test("el enlace lleva al TICKET, no a la lista, y el id va escapado", () => {
    assert.equal(elEnlaceDelTicket("abc-123"), "/tickets?ticket=abc-123");
    // Un id con algo que en una URL significa otra cosa no puede partir el
    // parametro: aterrizar en la lista y dejar buscar la tarjeta no es llegar.
    assert.equal(elEnlaceDelTicket("a&b=c"), "/tickets?ticket=a%26b%3Dc");
});

test("sin nombre NO se inventa a nadie", () => {
    assert.equal(tituloDelAvisoDeTicket("Marta"), "Marta abrió un ticket de soporte");
    assert.equal(tituloDelAvisoDeTicket("   "), "Nuevo ticket de soporte");
    assert.equal(tituloDelAvisoDeTicket(null), "Nuevo ticket de soporte");
});
