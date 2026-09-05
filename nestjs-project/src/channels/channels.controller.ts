import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ChannelsService } from './channels.service';
import { UpdateChannelDto } from './dto/update-channel.dto';
import {
  ChannelResponseDto,
  toChannelResponse,
} from './dto/channel-response.dto';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  // `me` precisa vir antes de `:nickname`.
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Meu canal' })
  @ApiResponse({ status: 200, type: ChannelResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: errorRef,
  })
  async me(@CurrentUser() user: JwtPayload): Promise<ChannelResponseDto> {
    const channel = await this.channels.getMine(user.sub);
    return toChannelResponse(
      channel,
      await this.channels.countPublishedVideos(channel.id),
    );
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Editar meu canal',
    description: 'Nome, nickname (único) e descrição do canal do usuário.',
  })
  @ApiResponse({ status: 200, type: ChannelResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed',
    schema: errorRef,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: errorRef,
  })
  @ApiResponse({
    status: 409,
    description: 'Nickname já em uso',
    schema: errorRef,
  })
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateChannelDto,
  ): Promise<ChannelResponseDto> {
    const channel = await this.channels.updateMine(user.sub, dto);
    return toChannelResponse(
      channel,
      await this.channels.countPublishedVideos(channel.id),
    );
  }

  @Public()
  @Get(':nickname')
  @ApiOperation({
    summary: 'Página pública do canal',
    description: 'Dados públicos do canal e a quantidade de vídeos publicados.',
  })
  @ApiParam({ name: 'nickname', example: 'alice' })
  @ApiResponse({ status: 200, type: ChannelResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: errorRef,
  })
  async byNickname(
    @Param('nickname') nickname: string,
  ): Promise<ChannelResponseDto> {
    const channel = await this.channels.getByNickname(nickname);
    return toChannelResponse(
      channel,
      await this.channels.countPublishedVideos(channel.id),
    );
  }
}
