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
  ParseUUIDPipe,
} from '@nestjs/common';
import { SharedLibraryService } from './shared-library.service';
import { ShareWorkflowDto } from './dto/share-workflow.dto';
import { UpdateSharedWorkflowDto } from './dto/update-shared.dto';
import { BrowseLibraryDto } from './dto/browse-library.dto';
import { ImportWorkflowDto } from './dto/import-workflow.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TokenPayload } from '@flowengine/shared';

@Controller('shared-library')
@UseGuards(JwtAuthGuard)
export class SharedLibraryController {
  constructor(private readonly sharedLibraryService: SharedLibraryService) {}

  @Post()
  async share(
    @CurrentUser() user: TokenPayload,
    @Body() dto: ShareWorkflowDto,
  ) {
    const shared = await this.sharedLibraryService.share(user.tenantId, user.sub, dto);
    return { success: true, data: shared };
  }

  @Put(':id')
  async update(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSharedWorkflowDto,
  ) {
    const updated = await this.sharedLibraryService.update(user.tenantId, id, dto);
    return { success: true, data: updated };
  }

  @Delete(':id')
  async unshare(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.sharedLibraryService.unshare(user.tenantId, user.sub, id);
    return { success: true };
  }

  @Get()
  async browse(@Query() query: BrowseLibraryDto) {
    const result = await this.sharedLibraryService.browse(query);
    return { success: true, data: result };
  }

  @Get('categories')
  async getCategories() {
    const categories = await this.sharedLibraryService.getCategories();
    return { success: true, data: categories };
  }

  @Get('tags')
  async getTags() {
    const tags = await this.sharedLibraryService.getTags();
    return { success: true, data: tags };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const shared = await this.sharedLibraryService.findOne(id);
    return { success: true, data: shared };
  }

  @Post(':id/import')
  async importWorkflow(
    @CurrentUser() user: TokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportWorkflowDto,
  ) {
    const workflow = await this.sharedLibraryService.importWorkflow(
      user.tenantId,
      user.sub,
      id,
      dto.mode,
    );
    return { success: true, data: workflow };
  }
}
