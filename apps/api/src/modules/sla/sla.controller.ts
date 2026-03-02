import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantRole, TokenPayload } from '@flowengine/shared';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../infrastructure/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SlaService } from './sla.service';
import { SlaEventsQueryDto, AcknowledgeSlaDto } from './dto/sla.dto';

@ApiTags('sla')
@Controller('sla')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@ApiBearerAuth()
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get('events')
  @Roles(TenantRole.OWNER, TenantRole.ADMIN, TenantRole.DESIGNER, TenantRole.OPERATOR)
  @ApiOperation({ summary: 'Get SLA events' })
  async getEvents(@CurrentUser() user: TokenPayload, @Query() query: SlaEventsQueryDto) {
    const events = await this.slaService.findAll(user.tenantId, query);
    return { success: true, data: events };
  }

  @Get('dashboard')
  @Roles(TenantRole.OWNER, TenantRole.ADMIN, TenantRole.DESIGNER, TenantRole.OPERATOR)
  @ApiOperation({ summary: 'Get SLA dashboard stats' })
  async getDashboard(@CurrentUser() user: TokenPayload) {
    const stats = await this.slaService.getDashboardStats(user.tenantId);
    return { success: true, data: stats };
  }

  @Post('events/:id/acknowledge')
  @Roles(TenantRole.OWNER, TenantRole.ADMIN, TenantRole.OPERATOR)
  @ApiOperation({ summary: 'Acknowledge an SLA event' })
  async acknowledgeEvent(
    @CurrentUser() user: TokenPayload,
    @Param('id') id: string,
    @Body() dto: AcknowledgeSlaDto,
  ) {
    const event = await this.slaService.acknowledge(user.tenantId, id, user.sub);
    return { success: true, data: event };
  }
}
