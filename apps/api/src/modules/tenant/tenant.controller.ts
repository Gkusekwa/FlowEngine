import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { InviteMemberDto, UpdateMemberRoleDto } from './dto/manage-member.dto';
import { GenerateInviteCodeDto } from './dto/invite-code.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../infrastructure/guards/roles.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantRole, TokenPayload } from '@flowengine/shared';

@ApiTags('tenants')
@Controller('tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
  ) {}

  @Get('current')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current tenant details' })
  async getCurrent(@CurrentUser() user: TokenPayload) {
    const tenant = await this.tenantService.getTenantById(user.tenantId);
    return {
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        settings: tenant.settings,
        subscriptionPlan: tenant.subscriptionPlan,
        maxUsers: tenant.maxUsers,
        maxWorkflows: tenant.maxWorkflows,
        createdAt: tenant.createdAt,
      },
    };
  }

  @Put('current')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current tenant' })
  async update(@CurrentUser() user: TokenPayload, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenantService.updateTenant(user.tenantId, dto);
    return {
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        settings: tenant.settings,
      },
    };
  }

  @Get('current/members')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tenant members' })
  async getMembers(@CurrentUser() user: TokenPayload) {
    const members = await this.tenantService.getMembers(user.tenantId);
    return { success: true, data: members };
  }

  @Post('current/members')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a new member to the tenant' })
  async inviteMember(@CurrentUser() user: TokenPayload, @Body() dto: InviteMemberDto) {
    await this.tenantService.inviteMember(user.tenantId, dto);
    return { success: true, data: { message: 'Member invited successfully' } };
  }

  @Put('current/members/:userId/role')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a member role' })
  async updateMemberRole(
    @CurrentUser() user: TokenPayload,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    await this.tenantService.updateMemberRole(user.tenantId, userId, dto, user.sub);
    return { success: true, data: { message: 'Member role updated' } };
  }

  @Delete('current/members/:userId')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a member from the tenant' })
  async removeMember(
    @CurrentUser() user: TokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.tenantService.removeMember(user.tenantId, userId, user.sub);
    return { success: true, data: { message: 'Member removed' } };
  }

  // --- Invite Codes ---

  @Post('current/invite-codes')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a new invite code' })
  async generateInviteCode(
    @CurrentUser() user: TokenPayload,
    @Body() dto: GenerateInviteCodeDto,
  ) {
    const code = await this.authService.generateInviteCode(
      user.tenantId,
      user.sub,
      dto.maxUses,
      dto.expiresInDays,
    );
    return {
      success: true,
      data: {
        id: code.id,
        code: code.code,
        maxUses: code.maxUses,
        useCount: code.useCount,
        expiresAt: code.expiresAt,
        isActive: code.isActive,
        createdAt: code.createdAt,
      },
    };
  }

  @Get('current/invite-codes')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invite codes for the current tenant' })
  async listInviteCodes(@CurrentUser() user: TokenPayload) {
    const codes = await this.authService.listInviteCodes(user.tenantId);
    return {
      success: true,
      data: codes.map((c) => ({
        id: c.id,
        code: c.code,
        maxUses: c.maxUses,
        useCount: c.useCount,
        expiresAt: c.expiresAt,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
    };
  }

  @Post('current/invite-codes/:codeId/revoke')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invite code' })
  async revokeInviteCode(
    @CurrentUser() user: TokenPayload,
    @Param('codeId') codeId: string,
  ) {
    await this.authService.revokeInviteCode(user.tenantId, codeId);
    return { success: true, data: { message: 'Invite code revoked' } };
  }

  // --- Join Requests ---

  @Get('current/join-requests')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List join requests for the current tenant' })
  async listJoinRequests(@CurrentUser() user: TokenPayload) {
    const requests = await this.authService.listJoinRequests(user.tenantId);
    return {
      success: true,
      data: requests.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        status: r.status,
        inviteCode: r.inviteCode,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
      })),
    };
  }

  @Post('current/join-requests/:requestId/approve')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a join request' })
  async approveJoinRequest(
    @CurrentUser() user: TokenPayload,
    @Param('requestId') requestId: string,
  ) {
    await this.authService.approveJoinRequest(user.tenantId, requestId, user.sub);
    return { success: true, data: { message: 'Join request approved' } };
  }

  @Post('current/join-requests/:requestId/reject')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(TenantRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a join request' })
  async rejectJoinRequest(
    @CurrentUser() user: TokenPayload,
    @Param('requestId') requestId: string,
  ) {
    await this.authService.rejectJoinRequest(user.tenantId, requestId, user.sub);
    return { success: true, data: { message: 'Join request rejected' } };
  }
}
