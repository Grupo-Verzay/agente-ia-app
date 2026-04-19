'use client';

import React from 'react';

interface ConversationDateBadgeProps {
  label: string;
}

export const ConversationDateBadge: React.FC<ConversationDateBadgeProps> = ({ label }) => (
  <div className="sticky top-2 z-10 my-3 flex justify-center pointer-events-none">
    <div className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-[0.68rem] font-medium text-slate-600 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/85 dark:text-slate-200">
      {label}
    </div>
  </div>
);
