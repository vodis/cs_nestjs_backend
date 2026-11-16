import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../api/auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { PortfolioModule } from '../portfolio';
import { AGENT_ACCESS_REPOSITORY } from './application/agent-access.repository';
import { AgentAccessService } from './application/agent-access.service';
import { CLIENT_METADATA_RESOLVER } from './application/client-metadata';
import { CachedClientMetadataResolver } from './infrastructure/cached-client-metadata.resolver';
import { SafeMetadataFetcher } from './infrastructure/safe-metadata-fetcher';
import { SequelizeAgentAccessRepository } from './infrastructure/sequelize-agent-access.repository';
import { AgentConnectionsController } from './presentation/agent-connections.controller';
import { AgentOauthController } from './presentation/agent-oauth.controller';
import { McpController } from './presentation/mcp.controller';

@Module({
    imports: [ConfigModule, DatabaseModule, AuthModule, PortfolioModule],
    controllers: [AgentConnectionsController, AgentOauthController, McpController],
    providers: [
        AgentAccessService,
        { provide: AGENT_ACCESS_REPOSITORY, useClass: SequelizeAgentAccessRepository },
        {
            provide: CLIENT_METADATA_RESOLVER,
            useFactory: () => new CachedClientMetadataResolver(new SafeMetadataFetcher()),
        },
    ],
})
export class AgentAccessModule {}
