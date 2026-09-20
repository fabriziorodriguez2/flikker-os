import { IsString, MinLength } from 'class-validator';

/**
 * El nombre exacto del negocio, escrito a mano por el admin.
 *
 * No es decoración de UI: el servicio lo compara contra `Business.name` y
 * rechaza el borrado si no coincide. Un `POST` a este endpoint con el nombre
 * equivocado —o sin nombre— no borra nada, venga de la UI o de curl.
 */
export class HardDeleteBusinessDto {
  @IsString()
  @MinLength(1)
  confirmationName!: string;
}
