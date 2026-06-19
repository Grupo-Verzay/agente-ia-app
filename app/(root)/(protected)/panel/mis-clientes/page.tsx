"use server";

import { redirect } from "next/navigation";

const MisClientesPage = async () => {
  redirect("/panel/clientes");
};

export default MisClientesPage;
