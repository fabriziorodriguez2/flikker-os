"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CustomerDetailContent from "../customer-detail-content";

/**
 * Página de detalle — deep link y compatibilidad (ver `/dashboard/customers`,
 * que desde la lista abre el mismo contenido en un modal/drawer en vez de
 * navegar acá). El contenido real vive en `CustomerDetailContent`, compartido
 * entre los dos.
 */
export default function CustomerDetailClient({
  customerId,
}: {
  customerId: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/dashboard/customers"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7F879C] transition-colors hover:text-[#202333]"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Link>
      <CustomerDetailContent customerId={customerId} />
    </div>
  );
}
