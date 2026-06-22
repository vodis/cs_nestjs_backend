import { Controller, Get } from '@nestjs/common';
import { PublicAuthConfigService } from './public-auth-config.service';

@Controller({ version: '1', path: 'public/auth-config' })
export class PublicAuthConfigController {
    constructor(private readonly publicAuthConfigService: PublicAuthConfigService) {}

    @Get()
    getConfig() {
        return this.publicAuthConfigService.getConfig();
    }
}
