-- Mi Flikker: mensaje único de bienvenida con el link, disparado en el
-- primer registro del cliente en cualquier negocio. `welcome_link_sent_at`
-- null = todavía nunca se mandó; se reclama atómicamente (updateMany
-- guardado por null) en FlikkerAccountService.sendWelcomeLinkOnce.

ALTER TABLE "flikker_accounts" ADD COLUMN "welcome_link_sent_at" TIMESTAMP(3);
