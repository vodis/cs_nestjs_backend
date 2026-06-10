import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import * as cookieParser from 'cookie-parser';
import { config as loadEnv } from 'dotenv';

loadEnv();

const LOCAL_DEV_ORIGINS = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:5002',
    'http://127.0.0.1:5002',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
const DEFAULT_ALLOWED_ORIGINS = ['*.craftscript.com', ...LOCAL_DEV_ORIGINS].join(',');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {
    SERVER_PORT: PORT = 3000,
    ALLOWED_ORIGIN: ORIGIN = DEFAULT_ALLOWED_ORIGINS,
    NODE_ENV = 'development',
} = process.env;
const isProduction = NODE_ENV === 'production';
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
    app.useWebSocketAdapter(new WsAdapter(app));

    app.enableCors({
        origin: isProduction
            ? (origin, callback) => {
                  callback(null, isAllowedOrigin(origin));
              }
            : true,
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
    console.log(`Server running on port ${PORT} (NODE_ENV=${NODE_ENV}, CORS=${isProduction ? 'restricted' : 'open'})`);
}
bootstrap();
