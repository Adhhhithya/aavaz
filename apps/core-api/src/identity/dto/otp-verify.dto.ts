import { IsString, Length, MinLength } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @MinLength(6, { message: 'phoneNumber must look like an E.164 phone number' })
  phoneNumber!: string;

  @IsString()
  @Length(4, 8, { message: 'code must be the OTP digits as submitted by the user' })
  code!: string;
}
