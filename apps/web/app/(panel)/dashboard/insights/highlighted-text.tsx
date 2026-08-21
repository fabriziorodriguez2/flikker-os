/**
 * Resalta los números dentro de un texto ya armado (resumen de IA,
 * afirmaciones narradas) — mismo criterio de "qué es un número" que ya usa
 * el backend (`NUMBER_PATTERN` en los validators de grounding): dígitos con
 * separador decimal opcional, más `%`/`★` pegados si los hay. Puramente
 * visual, nunca cambia el texto en sí.
 */
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?%?★?/g;

export default function HighlightedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <span key={index} className="text-base font-bold text-[#6D4AFF]">
        {match[0]}
      </span>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
