import {
  CENTRADO_QUE_NO_SE_CORTA,
  PANTALLA_PUBLICA_QUE_SE_DESPLAZA,
} from "@/lib/pantalla-publica";

/**
 * Login, registro y salida: pantallas que se abren SIN sesión.
 *
 * Van fuera de `(root)`, así que heredan el `overflow-hidden` del `<body>` y
 * necesitan declarar su propio contenedor que se desplaza — ver
 * `lib/pantalla-publica.ts`.
 *
 * **Y el centrado va DENTRO, con `min-h-full`.** Centrar contra un alto FIJO
 * —`flex h-full items-center`— reparte el sobrante arriba y abajo cuando el
 * formulario no cabe, y lo de arriba deja de alcanzarse: el desplazamiento no
 * llega a negativo. Está medido en el banco, con su número.
 */
const AuthLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className={PANTALLA_PUBLICA_QUE_SE_DESPLAZA}>
      <div className={CENTRADO_QUE_NO_SE_CORTA}>{children}</div>
    </div>
  );
};
export default AuthLayout;
