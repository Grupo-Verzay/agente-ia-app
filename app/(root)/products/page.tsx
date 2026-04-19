// app/(dashboard)/products/page.tsx
import { listProducts } from "@/actions/products-actions";
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

    const q = searchParams?.q ?? "";
    const page = Number(searchParams?.page ?? 1);
    const data = await listProducts({ userId: user.id, q, page, perPage: 20 });

    return (
        <Suspense fallback={<div>Cargando…</div>}>
            <MainProducts data={data} userId={user.id} initialFilter={q} />
        </Suspense>
    );
}