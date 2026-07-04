import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthController } from './auth.controller';
import { PrivyAuthGuard } from './privy-auth.guard';
import { PrivyAuthService } from './privy-auth.service';
import { PrivyTokenService } from './privy-token.service';
import { PublicAuthConfigController } from './public-auth-config.controller';
import { PublicAuthConfigService } from './public-auth-config.service';
import {
    lookupPrivyEmbeddedWallets,
    PRIVY_EMBEDDED_WALLET_LOOKUP,
    PrivyWalletOwnershipService,
} from './privy-wallet-ownership.service';

@Module({
    imports: [DatabaseModule],
    controllers: [AuthController, PublicAuthConfigController],
    providers: [
        PrivyAuthGuard,
        PrivyAuthService,
        PrivyTokenService,
        PrivyWalletOwnershipService,
        PublicAuthConfigService,
        {
            provide: PRIVY_EMBEDDED_WALLET_LOOKUP,
            useValue: lookupPrivyEmbeddedWallets,
        },
    ],
    exports: [PrivyAuthGuard, PrivyAuthService],
})
export class AuthModule {}
