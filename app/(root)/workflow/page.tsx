import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Header from '@/components/shared/header';
import { Skeleton } from '@/components/ui/skeleton';
import CreateWorflowDialog from '../flow/_components/CreateWorflowDialog';

import { currentUser } from '@/lib/auth';
import { UserWorkflows } from '../flow/_components';
import { getIntentTriggersByUser } from '@/actions/intent-trigger-actions';
import { IntentTrigger } from '@prisma/client';

function UserWorkFlowSkeleton() {
  return (
    <div className='space-y-2'>
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} className='h-32 w-full' />
      ))}
    </div>
  );
};

const WorkflowPage = async () => {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  };

  const triggersRes = await getIntentTriggersByUser(user.id);
  const triggers = (triggersRes.success ? (triggersRes as any).data ?? [] : []) as IntentTrigger[];

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-6">
        <Header title="Flujos avanzados" />
        <CreateWorflowDialog isPro={true} />
      </div>

      <Suspense fallback={<UserWorkFlowSkeleton />}>
        <UserWorkflows userId={user.id} isPro={true} triggers={triggers} />
      </Suspense>
    </div>
  );
};

export default WorkflowPage;
