import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LookupDto } from './dto/lookup.dto';
import { SubmitJoinRequestDto } from './dto/join-request.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TokenPayload } from '@flowengine/shared';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Look up tenants for an email address' })
  async lookup(@Body() dto: LookupDto) {
    const tenants = await this.authService.lookupTenants(dto.email);
    return { success: true, data: { tenants } };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.login(
      dto.email,
      dto.password,
      dto.tenantSlug,
      ipAddress,
      userAgent,
    );

    return { success: true, data: result };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user and create their tenant' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.register(
      dto.email,
      dto.password,
      dto.name,
      dto.tenantName,
      dto.tenantSlug,
      ipAddress,
      userAgent,
    );

    return { success: true, data: result };
  }

  @Post('join-request')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a request to join an existing tenant using an invite code' })
  async submitJoinRequest(@Body() dto: SubmitJoinRequestDto) {
    const result = await this.authService.submitJoinRequest(
      dto.email,
      dto.password,
      dto.name,
      dto.inviteCode,
    );
    return { success: true, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.refreshTokens(
      dto.refreshToken,
      ipAddress,
      userAgent,
    );

    if (!result) {
      return {
        success: false,
        error: {
          code: 'AUTH_REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token is invalid or expired',
        },
      };
    }

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        tokenType: 'Bearer',
      },
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke tokens' })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.replace('Bearer ', '');

    await this.authService.logout(dto.refreshToken, accessToken);

    return { success: true, data: { message: 'Logged out successfully' } };
  }

  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch to a different tenant' })
  async switchTenant(
    @CurrentUser() user: TokenPayload,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.switchTenant(
      user.sub,
      user.email,
      dto.tenantSlug,
      ipAddress,
      userAgent,
    );

    return { success: true, data: result };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: TokenPayload) {
    return {
      success: true,
      data: {
        id: user.sub,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        groups: user.groups,
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
      },
    };
  }

  @Get('providers')
  @ApiOperation({ summary: 'Get available auth providers for a tenant' })
  async getProviders(@Query('tenantSlug') tenantSlug: string) {
    const providers = await this.authService.getAuthProviders(tenantSlug);
    return { success: true, data: providers };
  }
}
