import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class AuthorizeQueryDto {
    @IsString() @IsNotEmpty() client_id: string;
    @IsString() @IsNotEmpty() redirect_uri: string;
    @IsIn(['code']) response_type: string;
    @IsString() @Matches(/^[A-Za-z0-9_-]{43,128}$/) code_challenge: string;
    @IsIn(['S256']) code_challenge_method: string;
    @IsString() @IsNotEmpty() scope: string;
    @IsString() @IsNotEmpty() resource: string;
    @IsOptional() @IsString() state?: string;
}

export class DeviceAuthorizationDto {
    @IsString() @IsNotEmpty() client_id: string;
    @IsString() @IsNotEmpty() scope: string;
    @IsString() @IsNotEmpty() resource: string;
}

export class TokenRequestDto {
    @IsString() @IsNotEmpty() grant_type: string;
    @IsString() @IsNotEmpty() client_id: string;
    @IsOptional() @IsString() code?: string;
    @IsOptional() @IsString() redirect_uri?: string;
    @IsOptional() @IsString() code_verifier?: string;
    @IsOptional() @IsString() resource?: string;
    @IsOptional() @IsString() device_code?: string;
    @IsOptional() @IsString() refresh_token?: string;
}

export class RevokeTokenDto {
    @IsString() @IsNotEmpty() token: string;
}

export class DeviceCodeLookupDto {
    @IsString() @Matches(/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/) userCode: string;
}
