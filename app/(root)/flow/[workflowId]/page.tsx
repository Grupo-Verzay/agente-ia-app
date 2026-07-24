import { redirect } from 'next/navigation';

// El creador de flujos se unificó en el editor visual (/workflow).
// Cualquier flujo abierto por la ruta antigua (/flow/:id) se redirige al
// editor visual, que ya maneja los flujos hechos con el editor de lista.
const CustomWorkflow = ({ params }: { params: { workflowId: string } }) => {
  redirect(`/workflow/${params.workflowId}`);
};

export default CustomWorkflow;
