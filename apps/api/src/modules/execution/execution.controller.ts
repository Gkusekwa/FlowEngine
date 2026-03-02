import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExecutionService } from './execution.service';
import { StartInstanceDto } from './dto/start-instance.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TokenPayload, InstanceStatus } from '@flowengine/shared';

@ApiTags('instances')
@Controller('instances')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new workflow instance' })
  async startInstance(
    @CurrentUser() user: TokenPayload,
    @Body() dto: StartInstanceDto,
  ) {
    const instance = await this.executionService.startWorkflow(user.tenantId, user.sub, dto);
    return { success: true, data: instance };
  }

  @Get()
  @ApiOperation({ summary: 'List workflow instances' })
  async findAll(
    @CurrentUser() user: TokenPayload,
    @Query('status') status?: InstanceStatus,
    @Query('workflowDefinitionId') workflowDefinitionId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.executionService.findAll(user.tenantId, {
      status,
      workflowDefinitionId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow instance details' })
  async findOne(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const instance = await this.executionService.findOne(user.tenantId, id);
    return { success: true, data: instance };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running workflow instance' })
  async cancel(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const instance = await this.executionService.cancelInstance(user.tenantId, id);
    return { success: true, data: instance };
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a running workflow instance' })
  async suspend(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const instance = await this.executionService.suspendInstance(user.tenantId, id);
    return { success: true, data: instance };
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a suspended workflow instance' })
  async resume(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const instance = await this.executionService.resumeInstance(user.tenantId, id);
    return { success: true, data: instance };
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get workflow instance timeline' })
  async getTimeline(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const timeline = await this.executionService.getTimeline(user.tenantId, id);
    return { success: true, data: timeline };
  }
}
