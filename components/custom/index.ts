// ⚠️ NO IMPORTAR DESDE AQUÍ.
//
// Este índice reexporta 12 componentes, y uno de ellos (LeadsChart) usa la
// librería de gráficos. Importar CUALQUIER cosa de este archivo arrastra a los
// demás al paquete de la página: pedir las migas de pan desde el layout metía
// 343 kB de gráficos en TODAS las pantallas de la app, incluidas las que no
// dibujan ninguno.
//
// Usa siempre la ruta del componente:
//
//   import { Breadcrumbs } from "@/components/custom/Breadcrumbs";
//
// Se conserva el archivo por compatibilidad; ya no queda ningún uso en el
// código.

export * from './Breadcrumbs';
export * from './LeadsChart';
export * from './ThemeSwitcher';
export * from './WorkWithUs';
export * from './CreditsWidget';
export * from './UnderConstruction';
export * from './DateTimePicker';
export * from './SelectComboBox';
export * from './UtilComboBox';
export * from './SelectWorkflowBox';
export * from './BrandSelector';
export * from './ModulesSelector';