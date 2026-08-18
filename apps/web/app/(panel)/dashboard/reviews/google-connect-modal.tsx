"use client";

import { useState } from "react";
import { Loader2, MapPin, Search, Star, X } from "lucide-react";

interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  formattedAddress: string | null;
  rating: number | null;
  userRatingCount: number | null;
}

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "Error inesperado";
    throw new Error(message);
  }
  return data;
}

/**
 * "Reseñas → Conectar Google" — buscá tu negocio → resultados → seleccioná
 * → guarda el Place ID real. Google Places API (New): Text Search para
 * buscar, Place Details al conectar (rating, dirección, link para escribir
 * una reseña). Nunca crea un QR nuevo — esto solo conecta el perfil de
 * Google al MISMO negocio; el QR/NFC de siempre sigue siendo la única
 * puerta de entrada del cliente.
 */
export default function GoogleConnectModal({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/businesses/current/google-places/search?query=${encodeURIComponent(query.trim())}`,
      );
      const data = (await readJson(res)) as {
        available: boolean;
        results: PlaceSearchResult[];
      };
      setUnavailable(!data.available);
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos buscar tu negocio.");
    } finally {
      setSearching(false);
    }
  }

  async function connect(placeId: string) {
    setConnectingId(placeId);
    setError(null);
    try {
      const res = await fetch(
        "/api/proxy/businesses/current/google-places/connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId }),
        },
      );
      await readJson(res);
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos conectar ese negocio.");
    } finally {
      setConnectingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscá tu negocio en Google"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[16px] border border-[#E8EAF0] bg-white p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#1A202C]">
            ¿Cuál es tu negocio?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-[#8891A4]">
          Buscamos en Google — elegí el resultado correcto para conectarlo.
        </p>

        <form onSubmit={(e) => void search(e)} className="mt-4 flex gap-2">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8891A4]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre de tu negocio…"
              autoFocus
              className="h-11 w-full rounded-[10px] border border-[#E8EAF0] bg-white pl-9 pr-3 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
            />
          </label>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}

        {unavailable ? (
          <p className="mt-4 rounded-[10px] bg-[#FFF7EE] px-3.5 py-2.5 text-sm text-[#8A520D]">
            La búsqueda por nombre no está disponible ahora. Cerrá esta
            ventana y pegá el link de tu ficha de Google directamente.
          </p>
        ) : null}

        {results !== null && !unavailable ? (
          results.length === 0 ? (
            <p className="mt-4 text-sm text-[#8891A4]">
              No encontramos resultados para &quot;{query}&quot;. Probá con
              otro nombre o agregá la ciudad.
            </p>
          ) : (
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {results.map((place) => (
                <li
                  key={place.placeId}
                  className="rounded-[12px] border border-[#E8EAF0] p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1A202C]">
                        {place.displayName}
                      </p>
                      {place.formattedAddress ? (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#8891A4]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {place.formattedAddress}
                        </p>
                      ) : null}
                      {place.rating != null ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#C6900A]">
                          <Star className="h-3 w-3 fill-current" />
                          {place.rating.toFixed(1)}
                          {place.userRatingCount != null ? (
                            <span className="font-normal text-[#8891A4]">
                              ({place.userRatingCount})
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void connect(place.placeId)}
                      disabled={connectingId !== null}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] bg-[#5C6BC0] px-3 text-xs font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
                    >
                      {connectingId === place.placeId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Elegir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
