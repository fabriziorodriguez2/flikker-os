import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ProgramaClient from "./programa-client";

export default async function ProgramaPage() {
  const session = await getSession();
  if (!session?.activeBusinessId) redirect("/login");

  return <ProgramaClient />;
}
