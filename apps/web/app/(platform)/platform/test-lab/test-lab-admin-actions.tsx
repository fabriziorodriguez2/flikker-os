"use client";

import Link from "next/link";
import { Copy, ExternalLink, FlaskConical } from "lucide-react";
import { useState } from "react";

export default function TestLabAdminActions({
  businessId,
  widgetLandingUrl,
}: {
  businessId: string;
  widgetLandingUrl: string;
}) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openTestLab() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message  "No se pudo abrir el Test Lab");
      }
      window.location.href = "/dashboard/test-lab";
    } catch (err) {
      setError(err instanceof Error  err.message : "Error inesperado");
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(widgetLandingUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {error  (
        <div className="rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openTestLab()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4e5db0] disabled:opacity-60"
        >
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {loading  "Abriendo..." : "Abrir Test Lab"}
        </button>

        <Link
          href={widgetLandingUrl}
          target="_blank"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] transition-colors hover:bg-[#F5F6FA]"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Abrir landing demo
        </Link>

        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] transition-colors hover:bg-[#F5F6FA]"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copied  "Copiado" : "Copiar link"}
        </button>
      </div>
    </div>
  );
}
