import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthController } from './auth.controller';
import { PrivyAuthGuard } from './privy-auth.guard';
import { PrivyAuthService } from './privy-auth.service';
import { PrivyTokenService } from './privy-token.service';

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController],
    providers: [PrivyAuthGuard, PrivyAuthService, PrivyTokenService],
    exports: [PrivyAuthGuard, PrivyAuthService],
})
export class AuthModule {}
