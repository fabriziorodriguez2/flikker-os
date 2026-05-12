export const BUSINESS_VERTICAL_OPTIONS = [
  { value: "dental", label: "Clinica dental" },
  { value: "estetica", label: "Centro de estetica / spa" },
  { value: "fisio", label: "Fisioterapia / kinesiologia" },
  { value: "medico", label: "Consultorio medico" },
  { value: "nutricion", label: "Nutricion" },
  { value: "gimnasio", label: "Gimnasio / yoga / pilates" },
  { value: "otro", label: "Otro" },
] as const;

export const BUSINESS_TIMEZONE_OPTIONS = [
  { value: "America/Montevideo", label: "Uruguay" },
  { value: "America/Buenos_Aires", label: "Argentina" },
  { value: "America/Santiago", label: "Chile" },
  { value: "America/Sao_Paulo", label: "Brasil" },
  { value: "America/Bogota", label: "Colombia" },
  { value: "America/Lima", label: "Peru" },
  { value: "America/Mexico_City", label: "Mexico" },
] as const;

export const DEFAULT_BUSINESS_VERTICAL = "otro";
export const DEFAULT_BUSINESS_TIMEZONE = "America/Montevideo";

export function isValidBusinessVertical(value: string | null | undefined) {
  return BUSINESS_VERTICAL_OPTIONS.some((option) => option.value === value);
}

export function isValidBusinessTimezone(value: string | null | undefined) {
  return BUSINESS_TIMEZONE_OPTIONS.some((option) => option.value === value);
}
