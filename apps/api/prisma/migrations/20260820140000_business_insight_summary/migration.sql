-- Insights → "Resumen de Flikker": una fila por negocio, cache del resumen
-- generado por IA + hasta 3 recomendaciones. Se recalcula por TTL o botón
-- "Actualizar análisis" (lógica de aplicación, no de base) -- nunca en cada
-- carga de la pantalla.

CREATE TABLE "business_insight_summaries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "summary_text" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_insight_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_insight_summaries_business_id_key" ON "business_insight_summaries"("business_id");

ALTER TABLE "business_insight_summaries" ADD CONSTRAINT "business_insight_summaries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
