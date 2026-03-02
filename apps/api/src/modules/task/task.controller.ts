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
import { TaskService } from './task.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TokenPayload } from '@flowengine/shared';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get('inbox')
  @ApiOperation({ summary: 'Get task inbox for current user' })
  async getInbox(
    @CurrentUser() user: TokenPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.taskService.getInbox(user.tenantId, user.sub, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, data: result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details' })
  async findOne(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const task = await this.taskService.findOne(user.tenantId, id);
    return { success: true, data: task };
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim a pending task' })
  async claim(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const task = await this.taskService.claimTask(user.tenantId, id, user.sub);
    return { success: true, data: task };
  }

  @Post(':id/unclaim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unclaim an assigned task' })
  async unclaim(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const task = await this.taskService.unclaimTask(user.tenantId, id, user.sub);
    return { success: true, data: task };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a task with result data' })
  async complete(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
  ) {
    const task = await this.taskService.completeTask(user.tenantId, id, user.sub, dto);
    return { success: true, data: task };
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a task to a user' })
  async assign(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
  ) {
    const task = await this.taskService.assignTask(user.tenantId, id, dto);
    return { success: true, data: task };
  }
}
