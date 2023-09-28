import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import configuration from '../config/configuration';
import { KnexModule } from 'nest-knexjs';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
    }),
    KnexModule.forRoot({
      config: configuration().database,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
