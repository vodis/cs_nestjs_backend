import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpClientsModule } from '@http-clients/http-clients.module';
import { ApiModule } from './api/api.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        HttpClientsModule,
        ApiModule,
    ],
})
export class AppModule {}
