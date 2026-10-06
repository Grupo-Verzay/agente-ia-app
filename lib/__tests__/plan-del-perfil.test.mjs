// Banco de «Plan y facturación» del Perfil. MODO=roto corre la regla de antes
// (prueba = nunca ha pagado) y AFIRMA el fallo: un plan puesto a mano por el
// administrador salía como «Prueba» con las tarjetas de los planes debajo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const MODO = process.env.MODO ?? 'bueno';
const ANTES = process.env.ANTES_REF ?? '7c1db1f';
const TARJETA = 'app/(root)/profile/_components/PlanBillingCard.tsx';
let mal = 0;
const caso = (n, f) => { try { f(); console.log('ok  ', n); } catch (e) { mal++; console.log('MAL ', n, '—', e.message); } };

// Cliente al que el administrador le puso el plan a mano: cuenta ya no demo,
// PAID, sin `lastPaymentAt` (el panel no la escribe).
const aMano = { esDemo: false, billingStatus: 'PAID', lastPaymentAt: null, price: '250000', accessStatus: 'ACTIVE', dueDate: new Date(Date.now() + 20 * 864e5).toISOString() };
const prueba = { esDemo: true, billingStatus: 'UNPAID', lastPaymentAt: null, price: '0', accessStatus: 'ACTIVE', dueDate: new Date(Date.now() + 5 * 864e5).toISOString() };

if (MODO === 'roto') {
  const viejo = execSync(`git show ${ANTES}:"${TARJETA}"`).toString();
  const enPruebaAntes = (b) => !b.lastPaymentAt; // nuncaHaPagado
  caso('ANTES: el plan puesto a mano salía en prueba', () => assert.equal(enPruebaAntes(aMano), true));
  caso('ANTES: la tarjeta pintaba los planes', () => assert.match(viejo, /<ChoosePlanToPay/));
  process.exit(mal ? 1 : 0);
}

const { estaEnPrueba, diasQueQuedan, seOfrecePagar } = await import('../plan-del-perfil.ts');
caso('plan puesto a mano NO es prueba', () => assert.equal(estaEnPrueba(aMano), false));
caso('PAID sin lastPaymentAt NO es prueba aunque fuera demo', () => assert.equal(estaEnPrueba({ ...aMano, esDemo: true }), false));
caso('cuenta demo sin cobrar SÍ es prueba', () => assert.equal(estaEnPrueba(prueba), true));
caso('demo con un pago registrado NO es prueba', () => assert.equal(estaEnPrueba({ ...prueba, lastPaymentAt: new Date().toISOString() }), false));
caso('sin datos no es prueba', () => assert.equal(estaEnPrueba(null), false));
caso('días que quedan', () => assert.equal(diasQueQuedan(prueba.dueDate), 5));
caso('vencido es 0, sin fecha null', () => { assert.equal(diasQueQuedan('2020-01-01'), 0); assert.equal(diasQueQuedan(null), null); });
caso('se ofrece pagar al plan de pago', () => assert.equal(seOfrecePagar(aMano), true));
caso('no se ofrece pagar en prueba ni sin precio', () => { assert.equal(seOfrecePagar({ ...prueba, price: '99' }), false); assert.equal(seOfrecePagar({ ...aMano, price: '0' }), false); });

const t = readFileSync(TARJETA, 'utf8');
caso('la tarjeta ya no pinta los planes', () => assert.doesNotMatch(t, /ChoosePlanToPay/));
caso('la tarjeta usa la regla compartida', () => assert.match(t, /estaEnPrueba\(billing\)/));
const a = readFileSync('actions/billing/billing-actions.ts', 'utf8');
caso('la acción lee isDemo de la cuenta y lo devuelve', () => { assert.match(a, /isDemo: true \}/); assert.equal((a.match(/esDemo: cuenta\?\.isDemo === true/g) || []).length, 2); });
process.exit(mal ? 1 : 0);
