import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthController } from './auth.controller';
import { PrivyAuthGuard } from './privy-auth.guard';
import { PrivyAuthService } from './privy-auth.service';
import { PRIVY_ACCESS_TOKEN_VERIFIER, PrivyTokenService, verifyWithPrivyNodeSdk } from './privy-token.service';
import { PublicAuthConfigController } from './public-auth-config.controller';
import { PublicAuthConfigService } from './public-auth-config.service';

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController, PublicAuthConfigController],
    providers: [
        PrivyAuthGuard,
        PrivyAuthService,
        PrivyTokenService,
        PublicAuthConfigService,
        {
            provide: PRIVY_ACCESS_TOKEN_VERIFIER,
            useValue: verifyWithPrivyNodeSdk,
        },
    ],
    exports: [PrivyAuthGuard, PrivyAuthService],
})
export class AuthModule {}
