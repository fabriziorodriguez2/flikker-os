-- Prueba de presencia para el check-in.
--
-- El QR de CHECKIN_V2 es físico y estático (carteles A4, soportes acrílicos
-- con NFC), así que no puede rotar solo: una URL guardada en casa sirve para
-- siempre y el dedup de 8 h / 1 por día justamente PERMITE una visita nueva
-- por día. `rotating_code` exige además un código corto y rotativo que el
-- negocio muestra desde el panel en el mostrador.
--
-- Default `off`: ningún negocio existente cambia de comportamiento.

CREATE TYPE "CheckinPresenceMode" AS ENUM ('off', 'rotating_code');

ALTER TABLE "Business"
  ADD COLUMN "checkin_presence_mode" "CheckinPresenceMode" NOT NULL DEFAULT 'off';

-- Identidad de la ventana de presencia que acreditó la visita (nunca el
-- código en claro). El índice único es el anti-replay: un mismo desafío no
-- puede acreditar dos visitas del mismo cliente. Postgres trata los NULL
-- como distintos, así que las visitas sin prueba de presencia (todo lo
-- existente y todo negocio en `off`) no se estorban entre sí.
ALTER TABLE "visits"
  ADD COLUMN "presence_challenge_id" TEXT;

CREATE UNIQUE INDEX "visits_business_id_customer_id_presence_challenge_id_key"
  ON "visits" ("business_id", "customer_id", "presence_challenge_id");
