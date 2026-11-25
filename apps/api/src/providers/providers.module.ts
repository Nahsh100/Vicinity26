import { Global, Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Global()
@Module({ controllers: [ProvidersController], providers: [ProvidersService], exports: [ProvidersService] })
export class ProvidersModule {}
