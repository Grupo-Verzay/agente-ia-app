import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth';
import { UserWorkflows } from './_components';

function UserWorkFlowSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

const FlowPage = async () => {
  const user = await currentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={<UserWorkFlowSkeleton />}>
        <UserWorkflows userId={user.effectiveId} isPro={false} showSummary />
      </Suspense>
    </div>
  );
};

export default FlowPage;
