-- Self-service FREE (tarjeta de sellos): tope de clientes identificados
-- participantes. Nullable — null significa "sin tope" para cualquier plan
-- que no sea ese FREE self-service. Aditivo únicamente.
ALTER TABLE "Plan" ADD COLUMN "maxCustomers" INTEGER;
