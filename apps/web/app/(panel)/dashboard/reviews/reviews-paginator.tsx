"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function ReviewsPaginator({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function navigate(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-[#8891A4]">
        Página {currentPage} de {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => navigate(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex h-8 items-center rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-40"
        >
          ← Anterior
        </button>
        <button
          type="button"
          onClick={() => navigate(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex h-8 items-center rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
