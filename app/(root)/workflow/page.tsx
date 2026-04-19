import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Header from '@/components/shared/header';
import { Skeleton } from '@/components/ui/skeleton';

import { currentUser } from '@/lib/auth';
import CreateWorflowDialog from '../flow/_components/CreateWorflowDialog';
import { UserWorkflows } from '../flow/_components';

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

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header fijo */}
      <div className="sticky top-0 z-1 mb-6">
        <div className="flex justify-between items-center">
          <Header
            title={'Flujos avanzados'}
          />
          <CreateWorflowDialog isPro={true} />
        </div>
      </div>

      <Suspense fallback={<UserWorkFlowSkeleton />}>
        <UserWorkflows userId={user.id} isPro={true} />
      </Suspense>
    </div>
  );
};

export default WorkflowPage;