import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { GroupsController, OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Global()
@Module({
  controllers: [OrganizationsController, GroupsController],
  providers: [OrganizationsService, AccessService],
  exports: [OrganizationsService, AccessService],
})
export class OrganizationsModule {}
