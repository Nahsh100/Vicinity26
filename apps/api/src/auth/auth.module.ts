import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { AuthGuard } from '../common/auth';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PhoneAuthService } from './phone-auth.service';
import { SocialAuthService, SocialTokenVerifier } from './social.service';
import { createSmsTransport, SMS_TRANSPORT } from './sms';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: env().JWT_ACCESS_SECRET, signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, OtpService, PhoneAuthService, SocialAuthService, SocialTokenVerifier, { provide: SMS_TRANSPORT, useFactory: createSmsTransport }],
  exports: [AuthService, AuthGuard, OtpService, SMS_TRANSPORT],
})
export class AuthModule {}
