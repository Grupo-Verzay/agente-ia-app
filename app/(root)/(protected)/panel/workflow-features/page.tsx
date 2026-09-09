'use server';

import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { getWorkflowFeatureAccessMap } from "@/actions/workflow-feature-access-actions";
import { WorkflowFeaturesAdmin } from "./_components/WorkflowFeaturesAdmin";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";

const WorkflowFeaturesPage = async () => {
  const user = await currentUser();
  // Quien manda aqui es la CUENTA, no la persona: su administrador actua por
  // ella (ver `lib/cuenta-que-manda.ts`). Con su propio rol —`user`— esta
  // pantalla le contestaba «Acceso Denegado» aunque el menu se la enseñara.
  const cuenta = user ? await cuentaQueManda(user) : null;
  if (!user || !cuenta || !isAdminLike(cuenta.role)) {
    return <AccessDenied />;
  }

  const access = await getWorkflowFeatureAccessMap();
  return <WorkflowFeaturesAdmin initial={access} />;
};

export default WorkflowFeaturesPage;
