'use server';

import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { getWorkflowFeatureAccessMap } from "@/actions/workflow-feature-access-actions";
import { WorkflowFeaturesAdmin } from "./_components/WorkflowFeaturesAdmin";

const WorkflowFeaturesPage = async () => {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) {
    return <AccessDenied />;
  }

  const access = await getWorkflowFeatureAccessMap();
  return <WorkflowFeaturesAdmin initial={access} />;
};

export default WorkflowFeaturesPage;
