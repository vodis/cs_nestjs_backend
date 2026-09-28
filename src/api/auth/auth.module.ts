import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../database/database.module';
import { ProductEventsModule } from '../product-events/product-events.module';
import { AuthController } from './auth.controller';
import { PrivyAuthGuard } from './privy-auth.guard';
import { PrivyAuthService } from './privy-auth.service';
import { PrivyTokenService } from './privy-token.service';
import { WalletLinkService } from './wallet-link.service';
import { NearWalletProofVerifier } from './near-wallet-proof.verifier';
import { WALLET_OWNERSHIP_VERIFIERS } from './wallet-ownership-verifier';
import { ChainRpcService } from '../balances/rpc/chain-rpc.service';
import { PublicAuthConfigController } from './public-auth-config.controller';
import { PublicAuthConfigService } from './public-auth-config.service';
import {
    lookupPrivyEmbeddedWallets,
    PRIVY_EMBEDDED_WALLET_LOOKUP,
    PrivyWalletOwnershipService,
} from './privy-wallet-ownership.service';

@Module({
    imports: [DatabaseModule, ProductEventsModule, HttpModule],
    controllers: [AuthController, PublicAuthConfigController],
    providers: [
        PrivyAuthGuard,
        PrivyAuthService,
        PrivyTokenService,
        WalletLinkService,
        NearWalletProofVerifier,
        {
            provide: WALLET_OWNERSHIP_VERIFIERS,
            useFactory: (near: NearWalletProofVerifier) => [near],
            inject: [NearWalletProofVerifier],
        },
        ChainRpcService,
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
