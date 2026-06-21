import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthController } from './auth.controller';
import { PrivyAuthGuard } from './privy-auth.guard';
import { PrivyAuthService } from './privy-auth.service';
import { PrivyTokenService } from './privy-token.service';
import { PublicAuthConfigController } from './public-auth-config.controller';
import { PublicAuthConfigService } from './public-auth-config.service';

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController, PublicAuthConfigController],
    providers: [PrivyAuthGuard, PrivyAuthService, PrivyTokenService, PublicAuthConfigService],
    exports: [PrivyAuthGuard, PrivyAuthService],
})
export class AuthModule {}
