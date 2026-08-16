import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind the production nginx config, only /api/* is proxied to this
  // service — everything else goes to the web app. Serving uploads under
  // /api/product-images keeps them reachable without a separate nginx rule.
  // trust proxy so req.protocol reflects nginx's X-Forwarded-Proto (https)
  // rather than the plain-HTTP connection nginx actually makes to this
  // container — needed to build correct absolute image URLs below.
  app.set('trust proxy', 1);

  // Uploaded product images are publicly viewable (plain <img src>, no auth) —
  // unlike the invoice PDFs, which stay behind the authenticated download
  // route in orders.controller.ts.
  app.useStaticAssets(process.env.PRODUCT_IMAGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'products'), {
    prefix: '/api/product-images/',
  });
  app.useStaticAssets(process.env.REVIEW_IMAGE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'reviews'), {
    prefix: '/api/review-images/',
  });

  app.use(
    helmet({
      // This is a pure JSON API with no HTML/browser rendering of its own —
      // CSP has nothing to protect here and would only risk breaking
      // legitimate cross-origin fetches from the web app.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? '*', credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(`Sultan Noor API listening on http://localhost:${port}/api`);
}
void bootstrap();
