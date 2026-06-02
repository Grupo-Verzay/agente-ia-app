import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth';
import { UserWorkflows } from '../flow/_components';
import { getIntentTriggersByUser } from '@/actions/intent-trigger-actions';
import { IntentTrigger } from '@prisma/client';

function UserWorkFlowSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

const WorkflowPage = async () => {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const triggersRes = await getIntentTriggersByUser(user.effectiveId);
  const triggers = (triggersRes.success ? triggersRes.data ?? [] : []) as IntentTrigger[];

  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={<UserWorkFlowSkeleton />}>
        <UserWorkflows userId={user.effectiveId} isPro={true} triggers={triggers} showSummary />
      </Suspense>
    </div>
  );
};

export default WorkflowPage;
