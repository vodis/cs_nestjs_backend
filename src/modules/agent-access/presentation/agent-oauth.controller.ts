import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Post,
    Query,
    Res,
    VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgentAccessService } from '../application/agent-access.service';
import { AgentScope } from '../application/agent-access.types';
import { AuthorizeQueryDto, DeviceAuthorizationDto, RevokeTokenDto, TokenRequestDto } from './agent-oauth.dto';

@Controller({ version: VERSION_NEUTRAL })
export class AgentOauthController {
    constructor(private readonly agents: AgentAccessService) {}

    @Get('.well-known/oauth-protected-resource')
    protectedResource() {
        return this.agents.protectedResourceMetadata();
    }

    @Get('.well-known/oauth-authorization-server')
    authorizationServer() {
        return this.agents.authorizationServerMetadata();
    }

    @Get('oauth/authorize')
    async authorize(@Query() query: AuthorizeQueryDto, @Res() response: Response) {
        const location = await this.agents.beginBrowserAuthorization({
            clientId: query.client_id,
            redirectUri: query.redirect_uri,
            state: query.state,
            resource: query.resource,
            scopes: this.scopes(query.scope),
            codeChallenge: query.code_challenge,
        });
        response.redirect(302, location);
    }

    @Post('oauth/device_authorization')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    deviceAuthorization(@Body() body: DeviceAuthorizationDto) {
        return this.agents.beginDeviceAuthorization({
            clientId: body.client_id,
            resource: body.resource,
            scopes: this.scopes(body.scope),
        });
    }

    @Get('oauth/complete')
    async complete(@Query('transaction') transaction: string, @Res() response: Response) {
        response.redirect(302, await this.agents.completeBrowserAuthorization(transaction));
    }

    @Post('oauth/token')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    token(@Body() body: TokenRequestDto) {
        if (
            body.grant_type === 'authorization_code' &&
            body.code &&
            body.redirect_uri &&
            body.code_verifier &&
            body.resource
        ) {
            return this.agents.exchangeAuthorizationCode({
                code: body.code,
                clientId: body.client_id,
                redirectUri: body.redirect_uri,
                verifier: body.code_verifier,
                resource: body.resource,
            });
        }
        if (body.grant_type === 'urn:ietf:params:oauth:grant-type:device_code' && body.device_code) {
            return this.agents.exchangeDeviceCode({ deviceCode: body.device_code, clientId: body.client_id });
        }
        if (body.grant_type === 'refresh_token' && body.refresh_token) {
            return this.agents.refresh(body.refresh_token, body.client_id);
        }
        throw new BadRequestException({ error: 'unsupported_grant_type' });
    }

    @Post('oauth/revoke')
    @HttpCode(200)
    async revoke(@Body() body: RevokeTokenDto) {
        await this.agents.revokeToken(body.token);
        return {};
    }

    private scopes(value: string): AgentScope[] {
        return value.split(/\s+/).filter(Boolean) as AgentScope[];
    }
}
