import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { SERVER_PORT: PORT = 3000, ALLOWED_ORIGIN: ORIGIN = '*.craftscript.com' } = process.env;
const allowedOrigins = ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function isAllowedOrigin(origin?: string): boolean {
    if (!origin) {
        return true;
    }

    let hostname: string;

    try {
        hostname = new URL(origin).hostname;
    } catch {
        return false;
    }

    return allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin === '*') {
            return true;
        }

        const normalizedAllowedOrigin = allowedOrigin.replace(/^https?:\/\//, '');

        if (normalizedAllowedOrigin.startsWith('*.')) {
            return hostname.endsWith(normalizedAllowedOrigin.slice(1));
        }

        return origin === allowedOrigin || hostname === normalizedAllowedOrigin;
    });
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.enableCors({
        origin: (origin, callback) => {
            callback(null, isAllowedOrigin(origin));
        },
        credentials: true,
    });
    app.enableVersioning({ type: VersioningType.URI });

    app.setGlobalPrefix('/api', {
        exclude: [{ path: '/health', method: RequestMethod.GET }],
    });

    const config = new DocumentBuilder().setTitle('CSS-API Web Api Service').setVersion('1.0').build();
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
