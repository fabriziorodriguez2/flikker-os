-- Retención/Reactivación → resumen IA de "X contactados → Y volvieron → Z%
-- de recuperación": una fila por negocio, cache del resumen generado por IA.
-- Nunca guarda recomendaciones — la IA solo resume los números que el
-- backend ya calculó (ver reactivation-funnel-summary.service.ts).

CREATE TABLE "reactivation_funnel_summaries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "summary_text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reactivation_funnel_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reactivation_funnel_summaries_business_id_key" ON "reactivation_funnel_summaries"("business_id");

ALTER TABLE "reactivation_funnel_summaries" ADD CONSTRAINT "reactivation_funnel_summaries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
