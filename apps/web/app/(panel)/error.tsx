"use client";

import { useEffect } from "react";

export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[panel-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-[12px] border border-red-200 bg-red-50 px-6 py-5 text-center">
        <p className="text-sm font-semibold text-[#C0392B]">
          Error al cargar el panel
        </p>
        <p className="mt-1 text-xs text-[#8891A4]">
          {error.digest ? `Código: ${error.digest}` : "Intentá recargar la página."}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-[#5C6BC0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4A5AB0]"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
