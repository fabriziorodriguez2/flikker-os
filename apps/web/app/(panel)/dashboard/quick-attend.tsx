"use client";

import { useState, useRef, useEffect } from "react";

interface Customer {
  id: string;
  name: string;
  phoneE164: string | null;
  attendedToday: boolean;
}

interface SearchResult {
  data: Customer[];
}

export default function QuickAttend() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());
  const [celebrated, setCelebrated] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/proxy/customers?search=${encodeURIComponent(trimmed)}&limit=5`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as SearchResult;
        setResults(json.data ?? []);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, [query]);

  async function attend(customer: Customer) {
    if (savingId) return;
    setSavingId(customer.id);
    try {
      const res = await fetch("/api/proxy/service-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          serviceType: "atendido",
          createdVia: "manual_panel",
        }),
      });
      if (!res.ok) return;
      setAttendedIds((prev) => new Set([...prev, customer.id]));
      setCelebrated(customer.name);
      setQuery("");
      setResults([]);
      setTimeout(() => setCelebrated(null), 3000);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        Marcar cliente atendido
      </p>
      <p className="mt-1 text-sm text-[#8891A4]">
        Buscá por nombre o teléfono y registrá la atención.
      </p>

      <div className="relative mt-4">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full rounded-[8px] border border-[#E8EAF0] bg-[#F9F9FB] px-4 py-2.5 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0] focus:ring-1 focus:ring-[#5C6BC0]/30 sm:max-w-sm"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#CBD5FF] border-t-[#5C6BC0]" />
          </span>
        )}
      </div>

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-[#E8EAF0] rounded-[8px] border border-[#E8EAF0] bg-white sm:max-w-sm">
          {results.map((c) => {
            const alreadyAttended = attendedIds.has(c.id) || c.attendedToday;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1A202C]">{c.name}</p>
                  {c.phoneE164 && (
                    <p className="text-xs text-[#8891A4]">{c.phoneE164}</p>
                  )}
                </div>
                {alreadyAttended ? (
                  <span className="shrink-0 rounded-full bg-[color:rgba(99,153,34,0.12)] px-2.5 py-1 text-xs font-semibold text-[#639922]">
                    Atendido hoy
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void attend(c)}
                    disabled={savingId === c.id}
                    className="shrink-0 rounded-[8px] bg-[#5C6BC0] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#4A58A8] disabled:opacity-60"
                  >
                    {savingId === c.id ? "..." : "Atender"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {celebrated && (
        <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color:rgba(99,153,34,0.25)] bg-[color:rgba(99,153,34,0.08)] px-4 py-3 text-sm font-semibold text-[#639922] sm:max-w-sm">
          <span aria-hidden="true">✓</span>
          {celebrated} marcado como atendido hoy
        </div>
      )}
    </section>
  );
}
