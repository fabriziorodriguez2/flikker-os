import CustomerShell from "@/components/public/customer-shell";

/**
 * Caso borde defensivo (Parte 6): el negocio eligió DIRECT_GOOGLE pero
 * todavía no conectó Google — no debería poder pasar (el admin no deja
 * guardar ese modo sin URL), pero si pasa, nunca se manda al cliente a un
 * link vacío ni se revierte en silencio al formulario privado que el
 * negocio explícitamente desactivó.
 */
export default function NoReviewFlowConfigured({
  businessName,
}: {
  businessName: string;
}) {
  return (
    <CustomerShell business={{ name: businessName, logoUrl: null }} showWordmark>
      <h1
        className="mb-2 text-[22px] font-extrabold leading-tight tracking-[-0.03em]"
        style={{ color: "var(--pub-text)" }}
      >
        ¡Gracias por tu visita!
      </h1>
      <p
        className="text-sm leading-6"
        style={{ color: "var(--pub-text-muted, #6B7280)" }}
      >
        Todavía no podemos recibir tu reseña por acá. Probá más tarde.
      </p>
    </CustomerShell>
  );
}
