import { Matches } from 'class-validator';

export class NotifyAppointmentDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  appointmentTime: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  appointmentDate: string;
}
