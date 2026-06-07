import { ApiProperty } from '@nestjs/swagger';

export class CreateOneClickQuoteResponseDto {
    @ApiProperty()
    data: unknown;
}
