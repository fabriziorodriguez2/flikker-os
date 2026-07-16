"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-[#F5F6FA]">
      <div className="max-w-md w-full rounded-[12px] border border-red-200 bg-red-50 px-6 py-5 text-center">
        <p className="text-sm font-semibold text-[#C0392B]">
          Error al cargar la página
        </p>
        <p className="mt-1 text-xs text-[#8891A4]">
          {error.digest ? `Código: ${error.digest}` : "Intentá recargar la página."}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-[#5C6BC0] px-4 py-2 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
