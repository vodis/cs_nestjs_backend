import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../api/auth/current-user.decorator';
import { PrivyAuthGuard, RequirePrivyBearer } from '../../../api/auth/privy-auth.guard';
import { AuthenticatedUser } from '../../../api/auth/types';
import { AgentAccessService } from '../application/agent-access.service';
import { DeviceCodeLookupDto } from './agent-oauth.dto';

@ApiTags('agent-integrations')
@ApiBearerAuth()
@Controller({ version: '1' })
@UseGuards(PrivyAuthGuard)
export class AgentConnectionsController {
    constructor(private readonly agents: AgentAccessService) {}

    @Get('agent-integrations/config') config() {
        return this.agents.integrationConfig();
    }

    @Get('agent-connections') async connections(@CurrentUser() user: AuthenticatedUser) {
        return { connections: await this.agents.connectionsForUser(user.id) };
    }

    @Delete('agent-connections/:id')
    @RequirePrivyBearer()
    async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        await this.agents.revokeConnection(user.id, id);
        return { status: 'revoked' };
    }

    @Get('agent-authorizations/:id') authorization(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        return this.agents.authorizationForUser(id, user.id);
    }

    @Post('agent-authorizations/device-code')
    @RequirePrivyBearer()
    deviceAuthorization(@CurrentUser() user: AuthenticatedUser, @Body() body: DeviceCodeLookupDto) {
        return this.agents.authorizationForDeviceCode(body.userCode, user.id);
    }

    @Post('agent-authorizations/:id/approve')
    @RequirePrivyBearer()
    async approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        return { continueUrl: await this.agents.decide(id, user.id, 'approve') };
    }

    @Post('agent-authorizations/:id/deny')
    @RequirePrivyBearer()
    async deny(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        return { continueUrl: await this.agents.decide(id, user.id, 'deny') };
    }
}
