import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, OptionalAuth, Public, type AuthUser } from '../common/auth';
import { ApiZodBody, ZBody } from '../common/zod';
import { createUploadSchema, MediaService } from './media.service';
import type { z } from 'zod';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Step 1: register an upload and receive a signed URL to PUT the bytes to. */
  @Post('uploads')
  @ApiZodBody(createUploadSchema)
  create(@CurrentUser() user: AuthUser, @ZBody(createUploadSchema) body: z.infer<typeof createUploadSchema>) {
    return this.media.createUpload(user, body);
  }

  /** Step 2 (local driver only): signed raw-bytes upload. */
  @Public()
  @Put(':id/upload')
  @HttpCode(204)
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: { exp: string; max: string; sig: string },
    @Req() req: Request,
    @Headers('content-type') contentType: string,
  ) {
    await this.media.receiveLocalUpload(id, q, req.body as Buffer, contentType);
  }

  /** Step 3: confirm the upload; the server checks the stored object before marking it ready. */
  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.complete(user, id);
  }

  /** Serves a file. Public media is open; private media only to its owner and verifying admins. */
  @OptionalAuth()
  @Get(':id/raw')
  async raw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser | undefined, @Res() res: Response) {
    const r = await this.media.resolveRead(id, user);
    if ('redirect' in r) {
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.redirect(302, r.redirect!);
    }
    res.setHeader('Content-Type', r.mimeType);
    res.setHeader('Content-Length', String(r.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', r.isPrivate ? 'private, no-store' : 'public, max-age=86400, immutable');
    r.stream.pipe(res);
  }
}
