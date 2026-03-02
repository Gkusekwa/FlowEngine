import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { ValidateWorkflowDto } from './dto/validate-workflow.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TokenPayload, WorkflowStatus } from '@flowengine/shared';

@ApiTags('workflows')
@Controller('workflows')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workflow definition' })
  async create(
    @CurrentUser() user: TokenPayload,
    @Body() dto: CreateWorkflowDto,
  ) {
    const workflow = await this.workflowService.create(user.tenantId, user.sub, dto);
    return { success: true, data: workflow };
  }

  @Get()
  @ApiOperation({ summary: 'List workflow definitions' })
  async findAll(
    @CurrentUser() user: TokenPayload,
    @Query('status') status?: WorkflowStatus,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.workflowService.findAll(user.tenantId, {
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, data: result };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate BPMN XML without saving' })
  async validate(@Body() dto: ValidateWorkflowDto) {
    const result = await this.workflowService.validateBpmn(dto.bpmnXml);
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow definition by ID' })
  async findOne(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const workflow = await this.workflowService.findOne(user.tenantId, id);
    return { success: true, data: workflow };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a draft workflow definition' })
  async update(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    const workflow = await this.workflowService.update(user.tenantId, id, dto);
    return { success: true, data: workflow };
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a draft workflow' })
  async publish(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const workflow = await this.workflowService.publish(user.tenantId, id);
    return { success: true, data: workflow };
  }

  @Post(':id/deprecate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deprecate a published workflow' })
  async deprecate(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const workflow = await this.workflowService.deprecate(user.tenantId, id);
    return { success: true, data: workflow };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a workflow' })
  async archive(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const workflow = await this.workflowService.archive(user.tenantId, id);
    return { success: true, data: workflow };
  }

  @Post(':id/new-version')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new draft version from an existing workflow' })
  async createNewVersion(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const workflow = await this.workflowService.createNewVersion(user.tenantId, id);
    return { success: true, data: workflow };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a workflow definition' })
  async delete(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.workflowService.delete(user.tenantId, id);
    return { success: true, data: { message: 'Workflow deleted' } };
  }

  @Get(':id/activity-configs')
  @ApiOperation({ summary: 'Get activity configurations for a workflow' })
  async getActivityConfigs(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const configs = await this.workflowService.getActivityConfigs(user.tenantId, id);
    return { success: true, data: configs };
  }

  @Get(':id/sla-definitions')
  @ApiOperation({ summary: 'Get SLA definitions for a workflow' })
  async getSlaDefinitions(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const definitions = await this.workflowService.getSlaDefinitions(user.tenantId, id);
    return { success: true, data: definitions };
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export workflow as BPMN XML' })
  async exportBpmn(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const xml = await this.workflowService.exportBpmn(user.tenantId, id);
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="workflow-${id}.bpmn"`,
    });
    res.send(xml);
  }
}
