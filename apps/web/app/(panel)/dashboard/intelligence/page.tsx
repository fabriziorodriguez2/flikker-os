import IntelligenceClient from "./intelligence-client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Flikker Intelligence — conversaciones persistentes del usuario. La sesión y
 * el negocio activo los resuelve el layout del panel; los datos se piden desde
 * el cliente por el proxy, que agrega el token y el negocio. `?c=` solo
 * preselecciona: el backend decide si esa conversación es tuya.
 */
export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { c } = await searchParams;
  const initialConversationId = typeof c === "string" && UUID_RE.test(c) ? c : null;

  return (
    <>
      <h1 className="sr-only">Intelligence</h1>
      <IntelligenceClient initialConversationId={initialConversationId} />
    </>
  );
}
