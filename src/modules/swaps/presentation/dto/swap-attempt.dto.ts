import { IsIn, IsOptional } from 'class-validator';
export class SwapAttemptDto {
    @IsOptional() @IsIn(['AWAITING_APPROVAL', 'SUBMITTED', 'CANCELLED']) state?:
        'AWAITING_APPROVAL' | 'SUBMITTED' | 'CANCELLED';
}
