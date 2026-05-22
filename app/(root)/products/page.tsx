// app/(dashboard)/products/page.tsx
import { listProducts, getProductLimitInfo } from "@/actions/products-actions";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainProducts } from './components/MainProducts';

export default async function ProductsPage({
    searchParams,
}: { searchParams?: { q?: string; page?: string } }) {
    const user = await currentUser();
    if (!user) {
        redirect('/login');
    };

    const effectiveId = user.effectiveId;
    const q = searchParams?.q ?? "";
    const page = Number(searchParams?.page ?? 1);
    const [data, limitInfo] = await Promise.all([
        listProducts({ userId: effectiveId, q, page, perPage: 20 }),
        getProductLimitInfo(effectiveId),
    ]);

    return (
        <Suspense fallback={<div>Cargando…</div>}>
            <MainProducts data={data} userId={effectiveId} initialFilter={q} limitInfo={limitInfo} />
        </Suspense>
    );
}