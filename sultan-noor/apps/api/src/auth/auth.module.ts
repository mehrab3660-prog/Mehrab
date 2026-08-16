import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SmsProvider } from './sms.provider';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), SettingsModule],
  controllers: [AuthController],
  providers: [AuthService, SmsProvider, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
