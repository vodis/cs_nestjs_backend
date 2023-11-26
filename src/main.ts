import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, VersioningType } from '@nestjs/common';

const { SERVER_PORT: PORT = 3000 } = process.env;

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.setGlobalPrefix('/api', {
        exclude: [{ path: '/health', method: RequestMethod.GET }],
    });
    app.enableVersioning({ type: VersioningType.URI });

    await app.listen(PORT);
    console.log(`Server running on port ${PORT}`);
}
bootstrap();
