import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { SERVER_PORT: PORT = 3000, ALLOWED_ORIGIN: ORIGIN = '*.craftscript.com' } = process.env;

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.enableCors({
        origin: [...ORIGIN.split(',')],
        credentials: true,
    });
    app.enableVersioning({ type: VersioningType.URI });

    app.setGlobalPrefix('/api', {
        exclude: [{ path: '/health', method: RequestMethod.GET }],
    });

    const config = new DocumentBuilder()
        .setTitle('CSS-API Web Api Service')
        .setVersion('1.0')
        .build();
    const swaggerUrl = '/swagger';

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerUrl, app, document);

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // app.useGlobalInterceptors(
    //     new ClassSerializerInterceptor(app.get(Reflector), {
    //         strategy: 'excludeAll',
    //     }),
    // );

    await app.listen(PORT);
    console.log(`Server running on port ${PORT}`);
}
bootstrap();
