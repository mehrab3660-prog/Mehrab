import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { ActivityModule } from './activity/activity.module';
import { SearchModule } from './search/search.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';

import { BrandsModule } from './catalog/brands/brands.module';
import { CategoriesModule } from './catalog/categories/categories.module';
import { WarehousesModule } from './catalog/warehouses/warehouses.module';
import { SuppliersModule } from './catalog/suppliers/suppliers.module';
import { ProductsModule } from './catalog/products/products.module';

import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { PricingModule } from './pricing/pricing.module';
import { OrdersModule } from './orders/orders.module';
import { ShippingModule } from './shipping/shipping.module';
import { PaymentsModule } from './payments/payments.module';

import { ReviewsModule } from './reviews/reviews.module';
import { QaModule } from './qa/qa.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BlogModule } from './blog/blog.module';
import { BannersModule } from './banners/banners.module';
import { AiAdvisorModule } from './ai-advisor/ai-advisor.module';
import { AiProductModule } from './ai-product/ai-product.module';
import { MediaSearchModule } from './media-search/media-search.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { StockSubscriptionsModule } from './stock-subscriptions/stock-subscriptions.module';
import { ReturnsModule } from './returns/returns.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { WholesaleLeadsModule } from './wholesale-leads/wholesale-leads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    ScheduleModule.forRoot(),

    PrismaModule,
    AuditModule,
    ActivityModule,
    SearchModule,
    SettingsModule,

    AuthModule,
    UsersModule,
    AddressesModule,

    BrandsModule,
    CategoriesModule,
    WarehousesModule,
    SuppliersModule,
    ProductsModule,

    CartModule,
    WishlistModule,
    PricingModule,
    OrdersModule,
    ShippingModule,
    PaymentsModule,

    ReviewsModule,
    QaModule,
    NotificationsModule,
    BlogModule,
    BannersModule,
    AiAdvisorModule,
    AiProductModule,
    MediaSearchModule,
    DashboardModule,
    StockSubscriptionsModule,
    ReturnsModule,
    LoyaltyModule,
    WholesaleLeadsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
