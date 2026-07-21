// Verticales de salud/clínica. Solo estos usan el concepto de "atención"
// (marcar atendido, avisar turno, últimas atenciones).
export const CLINIC_VERTICALS = new Set([
  "dental",
  "estetica",
  "fisio",
  "medico",
  "nutricion",
]);

export function isClinicVertical(vertical: string | null | undefined): boolean {
  return CLINIC_VERTICALS.has(vertical ?? "");
}
