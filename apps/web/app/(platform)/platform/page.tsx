"use client";

import { useState, useEffect } from "react";
import { FEATURES } from "@/src/config/features";

interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  status: string;
  industry: string | null;
  country: string;
  createdAt: string;
  plan: string;
  planSlug: string;
  subscriptionStatus: string | null;
  branchCount: number;
  memberCount: number;
}

export default function PlatformPage() {
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/proxy/platform/businesses");
        if (!res.ok) throw new Error("Error al cargar cuentas");
        setBusinesses(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando cuentas...</p>;
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Cuentas ({businesses.length})
      </h1>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {businesses.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No hay cuentas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">
                  Negocio
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">
                  Plan
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">
                  Estado
                </th>
                {FEATURES.MULTI_LOCAL ? (
                  <th className="text-right px-4 py-2.5 font-medium text-zinc-600">
                    Sucursales
                  </th>
                ) : null}
                {FEATURES.MULTI_USER ? (
                  <th className="text-right px-4 py-2.5 font-medium text-zinc-600">
                    Miembros
                  </th>
                ) : null}
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">
                  País
                </th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-zinc-50 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-zinc-900 font-medium">
                        {b.name}
                      </span>
                      <span className="text-zinc-400 ml-1 text-xs">
                        /{b.slug}
                      </span>
                    </div>
                    {b.industry && (
                      <span className="text-xs text-zinc-400">
                        {b.industry}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                      {b.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        b.status === "ACTIVE"
                          ? "bg-green-50 text-green-700"
                          : b.status === "DRAFT"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  {FEATURES.MULTI_LOCAL ? (
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {b.branchCount}
                    </td>
                  ) : null}
                  {FEATURES.MULTI_USER ? (
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {b.memberCount}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-zinc-500">{b.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
