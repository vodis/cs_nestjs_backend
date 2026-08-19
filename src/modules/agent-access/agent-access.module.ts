import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../api/auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { PortfolioModule } from '../portfolio';
import { AGENT_ACCESS_REPOSITORY } from './application/agent-access.repository';
import { AgentAccessService } from './application/agent-access.service';
import { SequelizeAgentAccessRepository } from './infrastructure/sequelize-agent-access.repository';
import { AgentConnectionsController } from './presentation/agent-connections.controller';
import { AgentOauthController } from './presentation/agent-oauth.controller';
import { McpController } from './presentation/mcp.controller';

@Module({
    imports: [ConfigModule, DatabaseModule, AuthModule, PortfolioModule],
    controllers: [AgentConnectionsController, AgentOauthController, McpController],
    providers: [AgentAccessService, { provide: AGENT_ACCESS_REPOSITORY, useClass: SequelizeAgentAccessRepository }],
})
export class AgentAccessModule {}
