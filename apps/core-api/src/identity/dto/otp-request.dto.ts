import { IsString, MinLength } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  @MinLength(6, { message: 'phoneNumber must look like an E.164 phone number' })
  phoneNumber!: string;
}
