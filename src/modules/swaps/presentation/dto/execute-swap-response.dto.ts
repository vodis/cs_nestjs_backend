import { ApiProperty } from '@nestjs/swagger';

export class ExecuteSwapResultDto {
    @ApiProperty()
    intentHash: string;
}

export class ExecuteSwapResponseDto {
    @ApiProperty({ type: ExecuteSwapResultDto })
    data: ExecuteSwapResultDto;
}
