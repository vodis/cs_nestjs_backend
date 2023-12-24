import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsString } from 'class-validator';

class LanguageDetails {
    @ApiProperty()
    @Expose()
    @IsString()
    language: string;

    @ApiProperty()
    @Expose()
    @IsString()
    title: string;
}

class LanguagesIndexer {
    [indexer: string]: LanguageDetails;
}

class TranslationsIndexer {
    [indexer: string]: LanguageDetails;
}

export class GetLanguageRequestsDto {
    @ApiProperty()
    @Expose()
    @Type(() => LanguageDetails)
    languages: LanguagesIndexer;

    @ApiProperty()
    @Expose()
    @Type()
    translations: TranslationsIndexer;
}
