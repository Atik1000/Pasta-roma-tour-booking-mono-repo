import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Makes `PrismaService` injectable everywhere without repeated imports. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
