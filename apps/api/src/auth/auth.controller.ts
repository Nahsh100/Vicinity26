import { Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { forgotPasswordSchema, loginSchema, passwordSchema, phoneStartSchema, phoneVerifySchema, registerSchema, resetPasswordSchema } from '@vicinity/shared';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody } from '../common/zod';
import { AuthService } from './auth.service';
import { OTP_POLICY } from './otp.service';
import { PhoneAuthService } from './phone-auth.service';

const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const logoutSchema = z.object({ refreshToken: z.string().optional() });
const tokenSchema = z.object({ token: z.string().min(10).max(200) });
const emailSchema = z.object({ email: z.string().trim().email().max(254) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

const client = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/** Stricter rate limit on credential endpoints: 10 requests per minute per IP. */
const AuthThrottle = () => Throttle({ default: { limit: 10, ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly phone: PhoneAuthService,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('register')
  @ApiZodBody(registerSchema)
  register(@ZBody(registerSchema) body: z.output<typeof registerSchema>, @Req() req: Request) {
    return this.auth.register({ ...body, phone: body.phone || undefined }, client(req));
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(loginSchema)
  login(@ZBody(loginSchema) body: z.output<typeof loginSchema>, @Req() req: Request) {
    return this.auth.login(body, client(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiZodBody(refreshSchema)
  refresh(@ZBody(refreshSchema) body: z.output<typeof refreshSchema>, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, client(req));
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @ZBody(logoutSchema) body: z.output<typeof logoutSchema>) {
    await this.auth.logout(body.refreshToken, user.id);
    return { loggedOut: true };
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.auth.logoutAll(user.id);
    return { loggedOut: true };
  }

  @Public()
  @AuthThrottle()
  @Post('verify-email')
  @HttpCode(200)
  @ApiZodBody(tokenSchema)
  verifyEmail(@ZBody(tokenSchema) body: z.output<typeof tokenSchema>) {
    return this.auth.verifyEmail(body.token);
  }

  @ApiBearerAuth()
  @AuthThrottle()
  @Post('resend-verification')
  @HttpCode(200)
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiZodBody(forgotPasswordSchema)
  forgot(@ZBody(forgotPasswordSchema) body: z.output<typeof forgotPasswordSchema>, @Req() req: Request) {
    return this.auth.forgotPassword(body.email, client(req));
  }

  @Public()
  @AuthThrottle()
  @Post('reset-password')
  @HttpCode(200)
  @ApiZodBody(resetPasswordSchema)
  reset(@ZBody(resetPasswordSchema) body: z.output<typeof resetPasswordSchema>, @Req() req: Request) {
    return this.auth.resetPassword(body.token, body.password, client(req));
  }

  @ApiBearerAuth()
  @AuthThrottle()
  @Post('change-password')
  @HttpCode(200)
  @ApiZodBody(changePasswordSchema)
  changePassword(@CurrentUser() user: AuthUser, @ZBody(changePasswordSchema) body: z.output<typeof changePasswordSchema>) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser, @Headers() _h: unknown) {
    return this.auth.me(user.id);
  }


  /** Adds an email to the signed-in account (phone sign-in accounts start without one). */
  @ApiBearerAuth()
  @AuthThrottle()
  @Post('email')
  @HttpCode(200)
  setEmail(@CurrentUser() user: AuthUser, @ZBody(emailSchema) body: z.output<typeof emailSchema>) {
    return this.auth.setEmail(user.id, body.email);
  }
  // ── Phone sign-in with SMS codes (PHONE_OTP_AUTH) ──

  /** Which sign-in methods this deployment offers (the app shows the phone option only when on). */
  @Public()
  @Get('methods')
  methods() {
    return { email: true, phone: this.phone.enabled, codeLength: OTP_POLICY.length, resendSeconds: OTP_POLICY.resendCooldownSeconds };
  }

  /** Sends a 6-digit code by SMS. Same response whether or not the number has an account. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/start')
  @HttpCode(200)
  @ApiZodBody(phoneStartSchema)
  phoneStart(@ZBody(phoneStartSchema) body: z.output<typeof phoneStartSchema>, @Req() req: Request) {
    return this.phone.start(body.phone, client(req));
  }

  /** Checks the code and signs in, creating the account on a number's first sign-in (`isNewUser`). */
  @Public()
  @AuthThrottle()
  @Post('phone/verify')
  @HttpCode(200)
  @ApiZodBody(phoneVerifySchema)
  phoneVerify(@ZBody(phoneVerifySchema) body: z.output<typeof phoneVerifySchema>, @Req() req: Request) {
    return this.phone.verify(body.phone, body.code, client(req));
  }

  /** Signed in: send a code to add or change the account's sign-in number. */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/link/start')
  @HttpCode(200)
  @ApiZodBody(phoneStartSchema)
  phoneLinkStart(@CurrentUser() user: AuthUser, @ZBody(phoneStartSchema) body: z.output<typeof phoneStartSchema>, @Req() req: Request) {
    return this.phone.linkStart(user.id, body.phone, client(req));
  }

  @ApiBearerAuth()
  @AuthThrottle()
  @Post('phone/link/verify')
  @HttpCode(200)
  @ApiZodBody(phoneVerifySchema)
  phoneLinkVerify(@CurrentUser() user: AuthUser, @ZBody(phoneVerifySchema) body: z.output<typeof phoneVerifySchema>) {
    return this.phone.linkVerify(user.id, body.phone, body.code);
  }
}
