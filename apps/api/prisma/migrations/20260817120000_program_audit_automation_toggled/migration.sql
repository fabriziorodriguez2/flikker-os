-- "Te extrañamos"/"Cerca del premio" ON<->OFF desde Notificaciones no dejaba
-- ningún rastro histórico — imposible distinguir después "el dueño lo
-- apagó" de "nunca se inicializó" mirando solo el booleano actual. Aditivo
-- únicamente: un valor de enum nuevo.
ALTER TYPE "ProgramAuditEventType" ADD VALUE 'automation_toggled';
