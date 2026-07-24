import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { currentUser } from '@/lib/auth';
import { UserWorkflows } from './_components';
import { MigrateFlowsButton } from './_components/MigrateFlowsButton';

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
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          ¿Quieres pasar estos flujos al <b className="text-foreground">creador visual</b>?
          Se crean las conexiones automáticamente y los nodos se conservan.
        </p>
        <MigrateFlowsButton />
      </div>
      <Suspense fallback={<UserWorkFlowSkeleton />}>
        <UserWorkflows userId={user.effectiveId} isPro={false} showSummary />
      </Suspense>
    </div>
  );
};

export default FlowPage;
