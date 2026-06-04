'use client'

import { useEffect } from 'react'
import { ModuleWithItems } from '@/schema/module';
import { ThemeApp, User } from '@prisma/client'
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { ResellerInfoResponse } from '@/schema/reseller';
import { useThemeStore } from '@/stores'
import { useResellerStore } from '@/stores/resellers/resellerStore';
import { usePathname, useRouter } from 'next/navigation';
import { canAccessRoute } from '@/utils/access';
import { toast } from 'sonner';
import type { UserNavPref } from '@/types/nav-preference';
import { getAccessDeniedMessage } from '@/lib/permissions';

interface AppInitializerInterface {
    onReseller: ResellerInfoResponse
    modules: ModuleWithItems[]
    user: User
    navPrefs: UserNavPref[]
};

export default function AppInitializer({ onReseller, modules, user, navPrefs }: AppInitializerInterface) {
    const pathname = usePathname();
    const router = useRouter();
    const { initTheme } = useThemeStore();
    const { setReseller, clearReseller } = useResellerStore();
    const { labelModule } = useModuleStore();
    const { setModules, setNavPrefs } = useModuleStore();

    const theme: ThemeApp = onReseller.success
        ? onReseller.data?.theme ?? 'Default'
        : 'Default';

    useEffect(() => {
        if (!user) return;
        const access = canAccessRoute({
            route: pathname ?? '/',
            userRole: user.role,
            userPlan: user.plan,
            modules,
            label: labelModule ?? '',
            isAdvisor: !!user.ownerId,
        });

        if (!access.allowed) {
            toast.info(getAccessDeniedMessage(access.reason));
            router.push("/credits");
        }
    }, [pathname, user, modules, labelModule, router]);

    useEffect(() => {
        setModules(modules)
    }, [modules, setModules])

    useEffect(() => {
        setNavPrefs(navPrefs)
    }, [navPrefs, setNavPrefs])

    useEffect(() => {
        initTheme(theme)
    }, [theme, initTheme])

    useEffect(() => {
        if (onReseller.success && onReseller.data) {
            setReseller(onReseller.data)
        } else {
            clearReseller();
        }
    }, [onReseller, setReseller, clearReseller])

    return <></>
}
