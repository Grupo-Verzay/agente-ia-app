'use server';

import { db } from '@/lib/db';
import { UserWithPausar } from '@/lib/types';
import { IaCredit, Pausar, Prisma, User } from '@prisma/client';
import { ClientInterface } from "@/lib/types";
import { revalidatePath } from 'next/cache';
import { getIaCreditByUser } from './actions-ia-credits';
import { inheritResellerAiConfig } from './userAiconfig-actions';
import { currentUser } from '@/lib/auth';
import { isAdminLike, isAdminOrReseller } from '@/lib/rbac';
import { clientesDelAsesor } from '@/lib/clientes-del-asesor';
import { cuentaQueManda } from '@/lib/cuenta-que-manda';
import {
  cuentasDeLasQueCuelga,
  elRolConElQueNace,
  elRolQueSePuedeGuardar,
  exigirGestionDelCliente,
  puedeAdministrarClientes,
  puedeGestionarAlCliente,
} from '@/lib/gestion-de-clientes';
import { esSuperAdminDeVerdad } from '@/lib/super-admin-de-verdad';
import { apuntarUnaVezAlDia } from '@/lib/apuntar-actividad';
import { purgarCuentaEliminada } from '@/lib/purge-account.server';
import { estadoDeLaSesionDeLaLinea, proveedorDeLaFila } from '@/lib/sesion-de-la-linea';
import { getRemindersByUserId } from './reminders-actions';
import { DEFAULT_REMINDERS_TEMPLATES } from '@/types/reminder';
import bcrypt from "bcryptjs";
import { borrarUnaAUna, comoListaDeIds, comoResumen, type ResumenDelBorrado } from "@/lib/borrado-en-bloque";

interface ClientResponse<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
}
type FilterOptions = {
  resellerId?: string;
  userIds?: string[];
  // Excluye clientes asignados a un reseller (demoResellerId != null). Para que
  // el panel de Verzay no liste los clientes de los resellers.
  excludeResellerClients?: boolean;
};
// Campos que NUNCA se copian de un formulario, por mucho que lleguen. `id` y
// `ownerId` son la identidad de la fila —quién es y de quién cuelga—, y
// `tokenVersion` es lo que invalida las sesiones: los tres se escribían tal
// cual porque `assignNonBooleanFields` copia lo que venga. El `role` no está
// aquí porque sí se puede cambiar, pero solo pasando por
// `elRolQueSePuedeGuardar` (ver más abajo).
const RESTRICTED_FIELDS = new Set<string>([
  'openMsg',
  'passPlainTxt',
  'id',
  'ownerId',
  'owner_id',
  'tokenVersion',
]);
const BOOLEAN_FIELDS = [
  'muteAgentResponses',
  'onFacebook',
  'onInstagram',
  'onTelegram',
  'onWhatsappCloud',
  'onCalls',
  'enabledSynthesizer',
  'enabledLeadStatusClassifier',
  'enabledCrmFollowUps',
  'enableVoiceResponses',
  'status',
] as const;

/** Normaliza un booleano desde FormData (soporta hidden+checkbox, "true"/"on") */
const normalizeBoolean = (fd: FormData, key: string): boolean | undefined => {
  if (!fd.has(key)) return undefined; // si no vino, no actualizar
  // getAll para considerar hidden + checkbox
  const values = fd.getAll(key).map(v => String(v).toLowerCase());
  return values.includes('true') || values.includes('on');
};

/** Copia valores no booleanos de FormData respetando campos restringidos */
const assignNonBooleanFields = (fd: FormData, target: Record<string, any>) => {
  fd.forEach((value, key) => {
    if (RESTRICTED_FIELDS.has(key)) return;
    if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) return; // ya procesados
    target[key] = value;
    });
};

/**
 * A qué clientes puede asomarse quien está pidiendo.
 *
 * `null` = sin límite (admin o reseller, que ya se acotan por otro lado). Un
 * conjunto = solo esos, que es el caso del colaborador con clientes asignados.
 * Y si no es ninguna de las dos cosas, no pasa.
 */
const clientesPermitidos = async (): Promise<Set<string> | null> => {
  const me = await currentUser();
  if (!me) throw new Error("No autorizado.");

  const cartera = await clientesDelAsesor(me);
  if (!cartera) return null;
  if (cartera.length === 0) throw new Error("No autorizado.");
  return new Set(cartera);
};

/**
 * Las cuentas que esta lista NO puede enseñar: aquellas de las que cuelga la
 * cuenta que mira.
 *
 * Desde una cuenta vinculada con rol `admin` —Verzay | Atencion bajo Grupo
 * Verzay— esta consulta devolvía a su propia madre, porque trae a todo el que
 * no tenga `ownerId`. Y con la fila delante se le podía abrir la ficha.
 *
 * El súper administrador de plataforma no se filtra: su regla es ver y
 * administrar todo, en cualquier cuenta.
 */
const cuentasQueNoSeEnsenan = async (): Promise<string[]> => {
  const me = await currentUser();
  if (!me) return [];
  if (esSuperAdminDeVerdad(me)) return [];
  const cuenta = await cuentaQueManda(me);
  if (!cuenta.id) return [];
  return cuentasDeLasQueCuelga(cuenta.id);
};

/**
 * Quien manda en el panel de Clientes: la plataforma, un reseller sobre los
 * suyos, y el `administrador` de una cuenta, que actua por ella.
 *
 * Se pregunta por la CUENTA y no por la persona: un administrador se crea con
 * rol `user`, asi que pidiendole el rol se le cerraba la pantalla entera.
 */
const ensureAdminOrResellerUser = async () => {
  const me = await currentUser();
  if (!me || !(await puedeAdministrarClientes(me))) {
    throw new Error("No autorizado.");
  }
  return me;
};

const ensureSelfOrAdmin = async (targetUserId: string) => {
  const me = await currentUser();
  if (!me) throw new Error("No autorizado.");
  const effectiveId = me.effectiveId ?? me.id;
  if (me.id !== targetUserId && effectiveId !== targetUserId && !isAdminOrReseller(me.role)) {
    throw new Error("No autorizado.");
  }
  return me;
};

export async function getEnrichedClients(filter?: FilterOptions): Promise<ClientResponse<ClientInterface[]>> {
  try {
    // Un colaborador del equipo no tiene rol de admin, pero puede tener clientes
    // asignados: entonces lee, y solo los suyos. Se acota aquí y no en quien
    // llama, para que ninguna pantalla pueda pedir de más por descuido.
    const soloEstos = await clientesPermitidos();
    const prohibidas = await cuentasQueNoSeEnsenan();

    let userIds: string[] | undefined;

    if (filter?.userIds) {
      userIds = soloEstos ? filter.userIds.filter((id) => soloEstos.has(id)) : filter.userIds;
      if (!userIds.length) return { success: true, message: "Sin clientes.", data: [] };
    } else if (filter?.resellerId) {
      // Los clientes de un reseller llegan por dos caminos: la tabla `reseller`
      // (el método viejo, asignación manual) y `demoResellerId` en el propio
      // usuario (el que usa el registro desde la landing). Mirando solo el
      // primero, todo el que se registraba por el enlace del reseller quedaba
      // fuera de la lista — y como el panel de la plataforma excluye a los que
      // tienen reseller, no aparecía en ningún sitio.
      const [assignments, propios] = await Promise.all([
        db.reseller.findMany({
          where: { resellerid: filter.resellerId },
          select: { userId: true },
        }),
        db.user.findMany({
          where: { demoResellerId: filter.resellerId },
          select: { id: true },
        }),
      ]);
      userIds = Array.from(new Set([
        ...(assignments.map(a => a.userId).filter(Boolean) as string[]),
        ...propios.map(u => u.id),
      ]));

      if (!userIds.length) {
        return {
          success: true,
          message: "No hay usuarios asignados.",
          data: [],
        };
      }
    }

    // Sin filtro pedido, un colaborador ve su cartera y nada más.
    if (!userIds && soloEstos) {
      userIds = [...soloEstos];
      if (!userIds.length) return { success: true, message: "Sin clientes.", data: [] };
    }

    // Para el panel de admin: excluir clientes asignados a CUALQUIER reseller,
    // tanto por el método nuevo (demoResellerId) como por el viejo (tabla reseller).
    let resellerAssignedIds: string[] = [];
    if (!userIds && filter?.excludeResellerClients) {
      const oldAssigned = await db.reseller.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
      });
      resellerAssignedIds = oldAssigned.map(a => a.userId).filter(Boolean) as string[];
    }

    const users = await db.user.findMany({
      // Excluir asesores (sub-cuentas con ownerId): no son clientes, se
      // gestionan dentro del equipo de su cuenta padre.
      // Opcionalmente excluir clientes de resellers (demoResellerId != null
      // y/o asignados por la tabla reseller vieja).
      // `deletedAt: null` deja fuera las cuentas ya eliminadas: siguen en la
      // base unos segundos mientras se purgan sus datos, y sin esto reaparecían
      // en la lista después de borrarlas.
      where: userIds
        ? {
            id: { in: userIds.filter((id) => !prohibidas.includes(id)) },
            ownerId: null,
            deletedAt: null,
          }
        : {
            ownerId: null,
            deletedAt: null,
            ...(filter?.excludeResellerClients ? { demoResellerId: null } : {}),
            ...(resellerAssignedIds.length || prohibidas.length
              ? { id: { notIn: [...resellerAssignedIds, ...prohibidas] } }
              : {}),
          },
      include: {
        pausar: true,
        aiConfigs: true,
        // TODAS las instancias, con su token. El estado se comprueba sobre estas
        // y no sobre la que devuelve getDataApi: aquella usa findFirst sin orden
        // ni filtro de tipo, así que con más de una fila podía devolver la de
        // Telegram, o una vieja, cuyo nombre no existe en Evolution — y una
        // consulta a un nombre inexistente es indistinguible de una línea caída.
        instancias: { select: { instanceName: true, instanceType: true, instanceId: true } },
        // Credenciales de Evolution de la CUENTA. La clave hace falta aparte del
        // token de la instancia: no todas las rutas aceptan el mismo.
        apiKey: { select: { url: true, key: true } },
        // Si el servicio está al día. Es el MISMO estado que mandan Finanzas y
        // Analíticas, y es lo que separa a un cliente de verdad de una cuenta
        // que quedó ahí: sin esto, la lista decía «35 clientes» contando
        // suspendidos y morosos. Solo los dos estados, no el precio: el
        // `Decimal` no viaja a un componente de cliente.
        billing: { select: { accessStatus: true, billingStatus: true } },
      },
      orderBy: { name: "asc" },
    });

    // El Robot de cada cuenta, de UNA consulta y para TODOS los proveedores.
    //
    // Estaba dentro del bloque que habla con Evolution, y ese bloque solo corre
    // si la cuenta tiene alguna linea de tipo `whatsapp`/`evolution`. Una cuenta
    // servida por Waha no entraba nunca, asi que `isEvoEnabled` se quedaba en su
    // valor inicial —`false`— y la columna Agente salia SIEMPRE en rojo, "Robot
    // apagado", con el Robot encendido. Es el mismo fallo que ya se arreglo en la
    // tarjeta de la linea: la marca vale para los dos proveedores (el backend lee
    // `bot_enabled` en cada mensaje, venga de donde venga), lo que sobraba era
    // preguntarselo a Evolution.
    //
    // Y va fuera del `map`: una consulta por cliente son 34 idas y vueltas a la
    // base cada vez que se abre la pantalla.
    const robotPorCuenta = new Map<string, boolean>();
    let hayColumnaDelRobot = true;
    if (users.length > 0) {
      try {
        const marcas = await db.$queryRaw<{ userId: string; bot_enabled: boolean }[]>(
          Prisma.sql`SELECT "userId", "bot_enabled" FROM "Instancias" WHERE "userId" IN (${Prisma.join(users.map((u) => u.id))})`,
        );
        // Con varias lineas basta con que UNA tenga el Robot encendido.
        for (const marca of marcas) {
          if (marca.bot_enabled) robotPorCuenta.set(marca.userId, true);
          else if (!robotPorCuenta.has(marca.userId)) robotPorCuenta.set(marca.userId, false);
        }
      } catch {
        // La columna la crea el backend. Sin ella se sigue como antes, con lo
        // que diga el webhook de Evolution (ver mas abajo).
        hayColumnaDelRobot = false;
      }
    }

    const enrichedUsers: ClientInterface[] = await Promise.all(
      users.map(async (user): Promise<ClientInterface> => {
        // qrStatus === true significa DESCONECTADO (así lo leen la tabla, los
        // contadores y el filtro).
        let isEvoEnabled = robotPorCuenta.get(user.id) ?? false;
        let reseller: User | null = null;
        let credits: IaCredit | null = null;

        // Las líneas por QR, de LOS DOS proveedores. Meta y Telegram no son QR
        // y se quedan fuera: preguntarle a un servidor de WhatsApp por ellas
        // devuelve "no existe", que aquí se leería como línea caída. Lo que no
        // se puede comprobar no se marca en rojo.
        //
        // Waha estaba fuera con el motivo escrito de que «mantiene la sesión
        // dentro del backend» y no se podía comprobar. Sí se puede:
        // `getWahaSession` contesta `WORKING` o no, que es exactamente la misma
        // pregunta que `connectionState` en Evolution. Mientras estuvo fuera,
        // un cliente con su línea en Waha **no salía ni en verde ni en rojo**,
        // así que su línea se podía caer sin que apareciera nunca en la lista
        // de a quién escribirle.
        const lineasPorQr = user.instancias.filter(
          (i) => Boolean(i.instanceName) && proveedorDeLaFila(i.instanceType) !== 'otro',
        );
        const lineasEvolution = lineasPorQr.filter(
          (i) => proveedorDeLaFila(i.instanceType) === 'evolution',
        );

        const lineasWaha = lineasPorQr.filter(
          (i) => proveedorDeLaFila(i.instanceType) === 'waha',
        );

        // Un cliente que aún NO ha creado su línea no está conectado. Salía en
        // verde porque, al no haber nada que consultar, se saltaba la
        // comprobación y se quedaba con el valor inicial: contaba como conectado
        // sin tener siquiera instancia. Y es justo a quien hay que escribirle,
        // porque no ha terminado de configurarse.
        //
        // Los que sí tienen línea pero de un canal que no es QR (Meta, Telegram)
        // se quedan fuera de la cuenta: no se pueden comprobar desde aquí, así
        // que ni verde ni rojo — no inventamos un estado.
        const tieneOtroCanal = user.instancias.length > lineasPorQr.length;
        let qrStatus = lineasPorQr.length === 0 ? !tieneOtroCanal : true;

        // Qué líneas contestaron que están conectadas, de cualquiera de los dos
        // proveedores. Se junta y se decide UNA vez al final: con dos bloques
        // decidiendo por su cuenta, el segundo pisaría al primero y un cliente
        // con una línea sana de cada proveedor saldría rojo según el orden.
        const conectadas: boolean[] = [];

        if (lineasWaha.length > 0) {
          const estados = await Promise.all(
            lineasWaha.map((linea) =>
              estadoDeLaSesionDeLaLinea({
                instanceName: linea.instanceName as string,
                instanceType: linea.instanceType,
                userId: user.id,
              }).catch(() => 'desconocido' as const),
            ),
          );
          // `desconocido` no cuenta como conectada NI se pinta en rojo por sí
          // solo: solo deja de aportar un "sí".
          estados.forEach((e) => {
            if (e === 'conectada') conectadas.push(true);
          });
        }

        const baseEvolution = (() => {
          const url = (user.apiKey?.url ?? '').trim().replace(/\/+$/, '');
          if (!url) return '';
          return /^https?:\/\//i.test(url) ? url : `https://${url}`;
        })();

        if (baseEvolution && lineasEvolution.length > 0) {
          // Hay algo que comprobar, y hasta comprobarlo se da por DESCONECTADO:
          // si la consulta falla, el cliente aparece en la lista de revisar en
          // vez de darse por bueno sin haber mirado.
          try {
            // El estado se consulta SIEMPRE. Antes solo se miraba con el robot
            // apagado, así que con el robot encendido la columna salía verde sin
            // haber comprobado nada: clientes caídos quedaban fuera del filtro,
            // que es justo para lo que sirve esa columna.
            //
            // Se pregunta por el estado de la conexión en vez de pedir un QR:
            // pedirlo es una operación de conexión, no una consulta, y hacerla
            // contra todas las líneas sanas cada vez que se abre la pantalla es
            // tocar lo que no está roto.
            //
            // Se prueban DOS credenciales: la clave de la cuenta y el token de la
            // instancia. `/webhook/find` acepta el token, pero las rutas
            // `/instance/*` pueden exigir la de la cuenta, y usar la equivocada
            // devuelve un rechazo indistinguible de "línea caída".
            const consultar = async (ruta: string, tokenInstancia: string) => {
              const credenciales = Array.from(
                new Set([user.apiKey?.key, tokenInstancia].filter(Boolean) as string[]),
              );
              for (const credencial of credenciales) {
                const resp = await fetch(`${baseEvolution}${ruta}`, {
                  method: 'GET',
                  headers: { apikey: credencial },
                  cache: 'no-store',
                }).catch(() => null);
                if (resp?.ok) return resp.json().catch(() => null);
              }
              return null;
            };

            const resultados = await Promise.all(
              lineasEvolution.map(async (linea) => {
                const nombre = encodeURIComponent(linea.instanceName as string);
                const [webhook, estado] = await Promise.all([
                  consultar(`/webhook/find/${nombre}`, linea.instanceId),
                  consultar(`/instance/connectionState/${nombre}`, linea.instanceId),
                ]);
                const conexion = String(
                  estado?.instance?.state ?? estado?.state ?? estado?.connectionState ?? '',
                ).toLowerCase();
                return { conectada: conexion === 'open', robot: webhook?.enabled === true };
              }),
            );

            resultados.forEach((r) => {
              if (r.conectada) conectadas.push(true);
            });

            // El robot ya no es el webhook: es la marca `bot_enabled` de la
            // linea (ver actions/robot-actions.ts), y esa ya se leyo arriba para
            // todas las cuentas. El webhook va siempre encendido, asi que leerlo
            // diria "robot encendido" para todas: solo manda cuando la columna
            // todavia no existe.
            if (!hayColumnaDelRobot) isEvoEnabled = resultados.some((r) => r.robot);
          } catch (error) {
            console.warn(`No se pudo comprobar el estado de las líneas del usuario ${user.id}`, error);
          }
        }

        // Con varias líneas basta con que UNA esté bien: el cliente está
        // operando. Marcarlo en rojo por una instancia vieja que quedó suelta
        // lo metería en la lista de a quién escribirle sin motivo.
        if (lineasPorQr.length > 0) {
          qrStatus = conectadas.length === 0;
        }

        // Buscar reseller asociado
        const assigned = await db.reseller.findFirst({
          where: { userId: user.id },
        });

        if (assigned?.resellerid !== null && assigned?.resellerid !== undefined) {
          const resellerAsUser = await db.user.findFirst({
            where: { id: assigned.resellerid },
          });

          reseller = resellerAsUser;
        }

        // Buscar créditos por usuario
        const resCredits = await getIaCreditByUser(user.id);
        if (resCredits.success && resCredits.data && resCredits.data.length > 0) {
          credits = resCredits.data[0]
        }

        return {
          ...user,
          pausar: user.pausar as Pausar[],
          isEvoEnabled,
          qrStatus,
          reseller,
          credits,
          instancias: user.instancias,
          billing: user.billing ?? null,
        };
      })
    );

    return {
      success: true,
      message: "Datos de usuarios cargados correctamente.",
      data: enrichedUsers,
    };
  } catch (error) {
    console.error("Error obteniendo clientes:", error);
    return {
      success: false,
      message: "Error al obtener clientes.",
    };
  }
}

// ==============================
// GET CLIENTS FOR SELECTOR (lightweight — no API calls, no credits, no reseller)
// ==============================

export interface ClientSelectorItem {
  id: string;
  label: string;
  email: string;
}

export async function getClientsForSelector(
  filter?: FilterOptions,
): Promise<ClientResponse<ClientSelectorItem[]>> {
  try {
    await ensureAdminOrResellerUser();

    let userIds: string[] | undefined;

    if (filter?.resellerId) {
      const assignments = await db.reseller.findMany({
        where: { resellerid: filter.resellerId },
        select: { userId: true },
      });
      userIds = assignments.map((a) => a.userId).filter(Boolean) as string[];

      if (!userIds.length) {
        return { success: true, message: 'No hay usuarios asignados.', data: [] };
      }
    }

    const users = await db.user.findMany({
      where: userIds ? { id: { in: userIds } } : undefined,
      select: { id: true, name: true, email: true, company: true },
      orderBy: { name: 'asc' },
    });

    const data: ClientSelectorItem[] = users.map((u) => ({
      id: u.id,
      label: u.company ?? u.name ?? u.email ?? u.id,
      email: u.email ?? '',
    }));

    return { success: true, message: 'Clientes cargados.', data };
  } catch (error) {
    console.error('Error obteniendo clientes para selector:', error);
    return { success: false, message: 'Error al obtener clientes.' };
  }
}

// ==============================
// GET CLIENT DATA BY USER ID
// ==============================
export const getClientDataByUserId = async (userId: string): Promise<ClientResponse<UserWithPausar>> => {
  try {
    await ensureSelfOrAdmin(userId);

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        pausar: true, // relación con tabla Pausar
      },
    });

    if (!user) {
      return {
        success: false,
        message: 'User not found.',
      };
    }

    return {
      success: true,
      message: 'User and Pausar data fetched successfully.',
      data: {
        ...user
      },
    };
  } catch (error) {
    console.error('Error fetching client data:', error);
    return {
      success: false,
      message: 'Error fetching client data.',
    };
  }
};
// ==============================
// UPDATE CLIENT DATA BY FIELD
// ==============================
export const updateClientDataByField = async (
  userId: string,
  field: string,
  value: string
): Promise<{ success: boolean; message: string }> => {
  try {
    await ensureSelfOrAdmin(userId);

    if (field === 'openMsg') {
      return { success: false, message: 'El campo openMsg está restringido y no puede ser actualizado aquí.' };
    }
    if (!field) {
      return { success: false, message: 'El campo no existe en este formulario.' };
    }
    // Esta acción escribe `{ [field]: valor }` con el nombre que le manden, así
    // que es una segunda puerta al `role` — y su portero, `ensureSelfOrAdmin`,
    // solo mira si quien llama tiene rol de admin o reseller. Ninguna pantalla
    // manda estos campos por aquí (Perfil escribe datos de la ficha y el tema),
    // así que se cierran en seco: el rol se cambia en Clientes, que es donde
    // pasa por `elRolQueSePuedeGuardar`.
    if (RESTRICTED_FIELDS.has(field) || field === 'role' || field === 'password') {
      console.warn('[clientes] se intentó escribir un campo protegido por el camino de un solo campo', { field });
      return { success: false, message: `El campo "${field}" no se cambia por aquí.` };
    }

    const isBooleanField = (BOOLEAN_FIELDS as readonly string[]).includes(field);
    const parsedValue = isBooleanField ? (value === 'true' || value === 'on') : value;

    await db.user.update({
      where: { id: userId },
      data: { [field]: parsedValue },
    });

    return { success: true, message: `Campo "${field}" actualizado correctamente.` };
  } catch (error) {
    console.error('Error actualizando datos del cliente:', error);
    return { success: false, message: 'Error interno al actualizar los datos.' };
  }
};

// ==============================
// UPDATE CLIENT DATA
// ==============================
export const updateClientData = async (userId: string, formData: FormData) => {
  try {
    // De quien es esta cuenta. Antes bastaba con tener rol de admin o de
    // reseller y no se miraba el cliente: un reseller podia editar la ficha de
    // un cliente que no era suyo con solo llamar a la accion.
    const me = await currentUser();
    if (!me) throw new Error("No autorizado.");
    await exigirGestionDelCliente(me, userId);

    const dataToUpdate: Record<string, any> = {};

    (BOOLEAN_FIELDS as readonly string[]).forEach((key) => {
      const b = normalizeBoolean(formData, key);
      if (b !== undefined) dataToUpdate[key] = b;
    });

    assignNonBooleanFields(formData, dataToUpdate);

    if (!formData.has('password')) delete dataToUpdate.password;

    // El rol NO se copia a ciegas. `exigirGestionDelCliente` contesta «¿gestionas
    // a este cliente?» y nada más; el rol que se le pone es otra pregunta, y era
    // la que faltaba: un `admin` podía escribir `super_admin` en el formulario y
    // la acción lo guardaba. Se mira el que pide y el que ya tenía — degradar a
    // quien está por encima es la misma escalada por el otro lado.
    if ('role' in dataToUpdate) {
      const fila = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
      const veredicto = await elRolQueSePuedeGuardar(me, dataToUpdate.role, fila?.role);
      if (!veredicto.ok) return { success: false, message: veredicto.motivo };
      if (veredicto.rol === undefined) delete dataToUpdate.role;
      else dataToUpdate.role = veredicto.rol;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return { success: false, message: "No se encontraron campos válidos para actualizar." };
    }

    await db.user.update({ where: { id: userId }, data: dataToUpdate });

    // Actividad del equipo: «clientes tocados». El `refId` es el cliente, así
    // que la deduplicación por día la hace la misma fila de resultado — tocar
    // dos veces la ficha del mismo cliente en un día es un cliente tocado, no
    // dos. Nunca lanza: la ficha ya está guardada.
    await apuntarUnaVezAlDia(me, "cliente_tocado", userId);

    return { success: true, message: "Datos del cliente actualizados correctamente." };
  } catch (error) {
    console.error("Error actualizando datos del cliente desde formData:", error);
    return { success: false, message: "Error interno al actualizar los datos." };
  }
};

// ==============================
// Función para actualizar la duración de la reunión de un usuario
// ==============================
// Función para actualizar la duración de la reunión de un usuario
export async function updateUserMeetingDuration(
  userId: string,
  meetingDuration: number,
  meetingUrl?: string,
  minNoticeMinutes?: number
): Promise<ClientResponse> {
  try {
    await ensureSelfOrAdmin(userId);

    // 1) Validación duración
    if (meetingDuration < 1 || meetingDuration > 480) {
      return {
        success: false,
        message: "La duración debe estar entre 1 y 480 minutos.",
      };
    }

    // Normalizamos la URL (si viene vacía, queda "")
    const url = (meetingUrl ?? "").trim();

    // 2) Validar que el usuario tenga recordatorios
    const remindersRes = await getRemindersByUserId(userId);

    if (!remindersRes.success || !remindersRes.data || remindersRes.data.length === 0) {
      return {
        success: false,
        message: "Este usuario no tiene recordatorios configurados.",
      };
    }

    // 3) Buscar recordatorio con field === "minutes-1" (el que entrega los detalles de ingreso)
    const reminderMinutes1 = remindersRes.data.find((r) => r.time === "minutes-1");

    if (!reminderMinutes1) {
      return {
        success: false,
        message: 'No se encontró el recordatorio con field "minutes-1".',
      };
    }

    // 4) Actualizar duración + meetingUrl + minNoticeMinutes del usuario
    await db.user.update({
      where: { id: userId },
      data: {
        meetingDuration,
        meetingUrl: url,
        ...(minNoticeMinutes !== undefined && { minNoticeMinutes: Math.max(0, minNoticeMinutes) }),
      },
    });

    // 5) Si hay URL, concatenarla al final del description del recordatorio minutes-1
    if (url) {
      const newDesc = `${DEFAULT_REMINDERS_TEMPLATES[4].description} Este es el link de acceso.\n\n👉 ${url}`;

      await db.reminders.update({
        where: { id: reminderMinutes1.id },
        data: { description: newDesc },
      });
    }

    return {
      success: true,
      message: "Reunión actualizada correctamente.",
    };
  } catch (error) {
    console.error("Error al actualizar la duración/URL de la reunión:", error);
    return {
      success: false,
      message: "No se pudo actualizar la duración/URL de la reunión.",
    };
  }
}
// ==============================
// UPDATE PAUSA DATA
// ==============================
export const updateAbrirPhrase = async (userId: string, mensaje: string) => {
  try {
    await ensureSelfOrAdmin(userId);

    const userWithPausar = await db.user.findUnique({
      where: { id: userId },
      include: {
        pausar: true, // o filtra con where si solo te interesa tipo = 'abrir'
      },
    });

    if (!userWithPausar) return { success: false, message: 'No se encontró el usuario.' };

    const pausa = userWithPausar?.pausar.find(p => p.tipo === 'abrir');
    const pausarId = pausa?.id;

    if (!pausa) return { success: false, message: 'Debe existir una frase creada por defecto.' };

    await db.pausar.update({
      where: { id: pausarId },
      data: { mensaje },
    });

    return { success: true, message: 'Frase actualizada correctamente' };
  } catch (error) {
    console.error('Error actualizando openMsg:', error);
    return { success: false, message: 'Error actualizando la frase' };
  }
};
// ==============================
// CREATE USER + INSERT TO PAUSAR
// ==============================
export const createUserWithPausar = async (
  userData: Omit<UserWithPausar, 'id' | 'createdAt' | 'updatedAt' | 'pausar'> & {
    openingPhrase?: string;
    subscriptionPlanId?: string;
  }
): Promise<ClientResponse<UserWithPausar>> => {
  try {
    const me = await ensureAdminOrResellerUser();
    // Si quien crea es el administrador de una cuenta reseller, el cliente
    // nuevo cuelga de la CUENTA, no de el: es ella la que tiene las licencias.
    const cuenta = await cuentaQueManda(me);

    const { openingPhrase, subscriptionPlanId, ...userFields } = userData;

    // Con qué rol nace. Es el mismo agujero que el de editar, un paso antes:
    // el formulario mandaba el rol y `createUserWithPausar` lo guardaba, así
    // que un `admin` podía crearse un «Super administrador» de cero.
    const conQueRol = await elRolConElQueNace(me, userFields.role);
    if (!conQueRol.ok) return { success: false, message: conQueRol.motivo };
    userFields.role = conQueRol.rol ?? 'user';

    // Si el creador es reseller, vincular el cliente a su pool y heredar su
    // configuración de Evolution/IA cuando el formulario no la trae (esos
    // campos están ocultos para resellers).
    let pool: {
      id: string;
      usedLicenses: number;
      totalLicenses: number;
      subscriptionPlan: { credits: number };
    } | null = null;
    if (cuenta.role === 'reseller') {
      if (!userFields.demoResellerId) userFields.demoResellerId = cuenta.id;
      if (!userFields.apiKeyId) userFields.apiKeyId = me.apiKeyId ?? null;
      if (!userFields.apiUrl) userFields.apiUrl = me.apiUrl;

      // Validar la licencia del plan elegido ANTES de crear (consume 1 cupo).
      // El uso se calcula DINÁMICAMENTE = clientes activos reales de ese pool,
      // así eliminar un cliente libera el cupo automáticamente (modelo A).
      if (subscriptionPlanId) {
        pool = await db.resellerLicensePool.findUnique({
          where: { resellerUserId_subscriptionPlanId: { resellerUserId: cuenta.id, subscriptionPlanId } },
          include: { subscriptionPlan: true },
        });
        if (!pool) return { success: false, message: 'No tienes licencias de ese plan.' };
        const used = await db.user.count({
          where: { demoResellerId: cuenta.id, isDemo: false, resellerSubscriptionPlanId: subscriptionPlanId },
        });
        if (used >= pool.totalLicenses) {
          return {
            success: false,
            message: `Sin licencias disponibles para ese plan. Tienes ${pool.totalLicenses - used} disponibles.`,
          };
        }
        // Etiquetar al cliente con el pool que consume (clave para contar y liberar).
        userFields.resellerSubscriptionPlanId = subscriptionPlanId;
      }
    }

    // apiKeyId vacío ("") no es una FK válida → normalizar a null.
    if (!userFields.apiKeyId) userFields.apiKeyId = null;
    // `contactFieldsConfig` es una columna JSON, y ahi Prisma no acepta `null`
    // a secas: hay que decirle con `DbNull` que se quiere guardar NULL.
    const contactFieldsConfig =
      userFields.contactFieldsConfig === null || userFields.contactFieldsConfig === undefined
        ? Prisma.DbNull
        : (userFields.contactFieldsConfig as Prisma.InputJsonValue);
    // apiUrl no puede ir vacío (columna con default de plataforma).
    if (!userFields.apiUrl) userFields.apiUrl = 'https://api.openAI.co';

    // 1. Crear el usuario
    const user = await db.user.create({
      data: { ...userFields, contactFieldsConfig },
    });

    // 1b. Si se consumió un pool de licencias, crear los créditos IA del plan.
    // (El uso del pool se cuenta dinámicamente; no se toca usedLicenses.)
    if (pool) {
      const renewalDate = new Date();
      renewalDate.setMonth(renewalDate.getMonth() + 1);
      await db.iaCredit.create({
        data: { userId: user.id, total: pool.subscriptionPlan.credits, used: 0, renewalDate },
      });
    }

    // 1c. Heredar la config de IA (proveedor + API Key + modelo) del RESELLER
    // dueño: el consumo de IA de los clientes de un reseller lo cubre EL RESELLER
    // con su propia key (no Verzay). Solo aplica a clientes NUEVOS con reseller.
    // Best-effort: nunca rompe la creación del cliente.
    let resellerKeyMissing = false;
    if (userFields.demoResellerId) {
      const inh = await inheritResellerAiConfig(user.id, userFields.demoResellerId);
      if (inh.success && inh.data && !inh.data.inherited) resellerKeyMissing = true;
    }

    let pausarRecord: Pausar | null = null;

    // 2. Crear registro Pausar si existe openingPhrase
    if (openingPhrase) {
      pausarRecord = await db.pausar.create({
        data: {
          userId: user.id,
          instanciaId: 'default-instancia-id', // Considera hacer estos parámetros opcionales
          apikeyId: 'default-apikey-id',
          tipo: 'abrir',
          mensaje: openingPhrase,
          baseurl: 'https://conexion.verzay.co',
        },
      });
    }

    // 3. Obtener el usuario con sus relaciones para devolverlo completo
    const createdUser = await db.user.findUnique({
      where: { id: user.id },
      include: { pausar: true },
    });

    if (!createdUser) {
      throw new Error('User creation failed');
    }

    return {
      success: true,
      message: resellerKeyMissing
        ? 'Cliente creado. ⚠️ Configura tu API Key de OpenAI en tu Perfil para que el agente de tus clientes funcione (tú cubres su consumo).'
        : 'User and Pausar data created successfully',
      data: createdUser as UserWithPausar,
    };
  } catch (error) {
    console.error('Error creating user and Pausar record:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error creating user',
    };
  }
};
// ==============================
// DELETE USER
// ==============================
export async function deleteUserOld(id: string): Promise<ClientResponse> {
  if (!id) {
    return {
      success: false,
      message: 'User ID is required.',
    };
  }

  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return {
        success: false,
        message: "No autorizado.",
      };
    }

    await db.user.delete({
      where: { id },
    });

    revalidatePath("/admin/clientes");

    return {
      success: true,
      message: 'User deleted successfully.',
    };
  } catch (error) {
    console.error('Error deleting user:', error);

    return {
      success: false,
      message: 'Failed to delete user.',
    };
  }
}

export async function deleteUser(id: string) {
  if (!id) {
    return { success: false, message: "User ID is required." };
  }

  let currentStep = "init";

  try {
    // Una sola llave, la misma que abre Editar y Módulos: la plataforma sobre
    // todas, el reseller sobre las suyas —por los dos caminos con los que se le
    // vinculan clientes, no solo `demoResellerId`— y el administrador de una
    // cuenta sobre lo que mande su cuenta.
    const me = await currentUser();
    if (!me || !(await puedeGestionarAlCliente(me, id))) {
      return { success: false, message: "No autorizado." };
    }

    // FASE 1 — apagar y marcar. Transacción corta: solo toca la cuenta.
    //
    // Lo que de verdad importa al pulsar Eliminar es que la cuenta deje de
    // funcionar YA: sin acceso, sin agente contestando y fuera de las listas.
    // Eso son tres UPDATE. Borrar sus datos es otra cosa, y es lo que tardaba.
    currentStep = "marcar_eliminada";
    await db.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id },
        data: { deletedAt: new Date(), status: false },
      });
      // Los asesores caen con la cuenta madre: sin ella no tienen servicio.
      await tx.user.updateMany({
        where: { ownerId: id },
        data: { deletedAt: new Date(), status: false },
      });
      await tx.userBilling.updateMany({
        where: { userId: id },
        data: { accessStatus: "SUSPENDED", suspendedAt: new Date(), suspendedReason: "Cuenta eliminada" },
      });
    });

    // FASE 2 — purgar los datos, por lotes y fuera de transacción.
    //
    // No se espera a que termine: la pantalla ya puede seguir, la cuenta ya está
    // apagada y lo que queda es limpieza. Si el proceso se reinicia a medias, el
    // barrido diario retoma lo que falte.
    void purgarCuentaEliminada(id).catch((e) => {
      console.error("[deleteUser] purga en segundo plano falló", { userId: id, error: e });
    });

    revalidatePath("/admin/clientes");
    revalidatePath("/panel/clientes");

    return {
      success: true,
      message: "Cuenta eliminada. Sus datos se están borrando en segundo plano.",
      debugStep: currentStep,
    };
  } catch (error) {
    const errMsg = (error as { message?: string })?.message || String(error);
    console.error("[deleteUser] ERROR", { userId: id, step: currentStep, error: errMsg });
    return {
      success: false,
      message: `No se pudo eliminar la cuenta (paso: ${currentStep}). ${errMsg}`,
      debugStep: currentStep,
    };
  }
}

export async function getUserAppointmentUrl() {
  const user = await currentUser();
  // Sin sesion no hay enlace que dar: antes se armaba uno con "undefined"
  // dentro y se le entregaba igual a quien lo pidiera.
  if (!user) return null;
  return `https://agente.ia-app.com/schedule/${user.id}`
}

export async function updateUserVoiceSettings(
  userId: string,
  enableVoiceResponses: boolean,
  voiceId: string,
  voiceModel?: string,
  voiceInstructions?: string,
  ttsProvider?: string,
  elevenLabsApiKey?: string,
  elevenLabsVoiceId?: string,
): Promise<ClientResponse> {
  try {
    await ensureSelfOrAdmin(userId);

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (ttsProvider !== 'elevenlabs' && !validVoices.includes(voiceId)) {
      return { success: false, message: 'Voz no válida.' };
    }

    const validModels = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'];
    if (voiceModel && !validModels.includes(voiceModel)) {
      return { success: false, message: 'Modelo de voz no válido.' };
    }

    await db.user.update({
      where: { id: userId },
      data: {
        enableVoiceResponses,
        voiceId,
        ...(voiceModel ? { voiceModel } : {}),
        ...(voiceInstructions !== undefined ? { voiceInstructions } : {}),
        ...(ttsProvider ? { ttsProvider } : {}),
        ...(elevenLabsApiKey !== undefined ? { elevenLabsApiKey } : {}),
        ...(elevenLabsVoiceId !== undefined ? { elevenLabsVoiceId } : {}),
      } as Prisma.UserUpdateInput,
    });

    return { success: true, message: 'Configuración de voz actualizada.' };
  } catch (error) {
    console.error('[UPDATE_VOICE_SETTINGS]', error);
    return { success: false, message: 'Error al actualizar la configuración de voz.' };
  }
}

export type UserVoiceSettings = {
  enableVoiceResponses: boolean;
  voiceId: string;
  voiceModel: string;
  voiceInstructions: string;
  ttsProvider: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
};

/** Lee la configuración de voz del agente (global por cuenta) para inicializar el panel. */
export async function getUserVoiceSettings(
  userId: string,
): Promise<ClientResponse<UserVoiceSettings>> {
  try {
    await ensureSelfOrAdmin(userId);
    const row = await db.user.findUnique({
      where: { id: userId },
      select: {
        enableVoiceResponses: true,
        voiceId: true,
        voiceModel: true,
        voiceInstructions: true,
        ttsProvider: true,
        elevenLabsApiKey: true,
        elevenLabsVoiceId: true,
      } as Prisma.UserSelect,
    }) as {
      enableVoiceResponses?: boolean | null;
      voiceId?: string | null;
      voiceModel?: string | null;
      voiceInstructions?: string | null;
      ttsProvider?: string | null;
      elevenLabsApiKey?: string | null;
      elevenLabsVoiceId?: string | null;
    } | null;

    if (!row) return { success: false, message: 'Usuario no encontrado.' };

    return {
      success: true,
      message: 'OK',
      data: {
        enableVoiceResponses: !!row.enableVoiceResponses,
        voiceId: row.voiceId ?? 'nova',
        voiceModel: row.voiceModel ?? 'gpt-4o-mini-tts',
        voiceInstructions: row.voiceInstructions ?? '',
        ttsProvider: row.ttsProvider ?? 'openai',
        elevenLabsApiKey: row.elevenLabsApiKey ?? '',
        elevenLabsVoiceId: row.elevenLabsVoiceId ?? '',
      },
    };
  } catch (error) {
    console.error('[GET_USER_VOICE_SETTINGS]', error);
    return { success: false, message: 'Error al cargar la configuración de voz.' };
  }
}

export async function getElevenLabsVoices(
  apiKey: string,
): Promise<ClientResponse<{ voice_id: string; name: string; category: string }[]>> {
  try {
    const trimmedKey = apiKey.trim();

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': trimmedKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      await res.text();
      const msg = res.status === 401
        ? 'API key inválido o expirado. Cópialo desde elevenlabs.io → Profile → API Key.'
        : `Error ElevenLabs: ${res.status} ${res.statusText}`;
      return { success: false, message: msg };
    }

    const data = await res.json();
    type ElevenLabsVoiceRaw = { voice_id: string; name: string; category?: string };
    const voices = ((data.voices ?? []) as ElevenLabsVoiceRaw[]).map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category ?? 'premade',
    }));

    return { success: true, message: 'Voces cargadas.', data: voices };
  } catch (error) {
    console.error('[GET_ELEVENLABS_VOICES]', error);
    return { success: false, message: 'No se pudo conectar con ElevenLabs. Verifica el API key.' };
  }
}

/**
 * Elimina VARIOS clientes de una vez, desde el `⋯` de la barra.
 *
 * **No reimplementa nada**: llama a `deleteUser` una vez por cuenta, que es
 * quien lleva la llave (`puedeGestionarAlCliente`, la misma que abren Editar y
 * Módulos) y las dos fases —apagar la cuenta ya, purgar sus datos de fondo—.
 * Una copia de esa lógica aquí sería un segundo borrado que el día que se
 * afine el de al lado se queda atrás, y esto borra cuentas de clientes.
 *
 * Lo que sí cambia es el número de viajes: Next serializa las acciones de
 * servidor de una página, así que veinte llamadas desde el navegador son
 * veinte idas y vueltas en fila india. Aquí es una.
 *
 * En serie a propósito: cada borrado abre su transacción y lanza una purga de
 * fondo; veinte a la vez se comen los diez turnos del pool de Prisma, que son
 * los mismos que atienden la bandeja de Chats.
 */
export async function eliminarClientesAction(ids: string[]): Promise<ResumenDelBorrado> {
  const lista = comoListaDeIds(ids);
  if (lista.length === 0) {
    return { success: false, borrados: 0, fallaron: 0, message: "No se recibió ningún cliente." };
  }

  const { borrados, fallaron } = await borrarUnaAUna(lista, async (id) => {
    const res = await deleteUser(id);
    return !!res?.success;
  });

  return comoResumen(borrados, fallaron, "clientes");
}
