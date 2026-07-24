import { redirect } from 'next/navigation';

// El creador de flujos se unificó en el editor visual (/workflow).
// Esta ruta se conserva solo para redirigir enlaces antiguos.
const FlowPage = () => {
  redirect('/workflow');
};

export default FlowPage;
