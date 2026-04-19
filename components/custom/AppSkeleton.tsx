// components/custom/AppSkeleton.tsx

export default function AppSkeleton() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-slate-100 dark:bg-black">
            <div className="space-y-4 text-center">
                <div className="h-6 w-48 bg-gray-300 dark:bg-gray-700 rounded animate-pulse mx-auto" />
                <div className="h-6 w-64 bg-gray-300 dark:bg-gray-700 rounded animate-pulse mx-auto" />
                <div className="h-6 w-40 bg-gray-300 dark:bg-gray-700 rounded animate-pulse mx-auto" />
            </div>
        </div>
    );
}
