import { Controller, Get } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { GetAssetsResponseDto } from './dto/get-assets-response.dto';

@Controller({ version: '1', path: 'assets' })
export class AssetsController {
    constructor(private readonly assetsService: AssetsService) {}

    @Get()
    @ApiResponse({
        status: 200,
        description: 'Get supported assets',
        type: GetAssetsResponseDto,
    })
    async getAssets(): Promise<GetAssetsResponseDto> {
        return this.assetsService.getAssets();
    }
}
