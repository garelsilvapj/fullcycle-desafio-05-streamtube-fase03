import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
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
import { SubscriptionsService } from './subscriptions.service';
import {
  FollowedChannelDto,
  SubscriptionStateDto,
} from './dto/subscription.dto';

const errorRef = { $ref: getSchemaPath(ApiErrorEnvelope) };
const CHANNEL_PARAM = {
  name: 'id',
  format: 'uuid',
  description: 'ID do canal',
};

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('channels/:id/subscription')
  @ApiOperation({
    summary: 'Estado da inscrição e total de inscritos do canal',
  })
  @ApiParam(CHANNEL_PARAM)
  @ApiResponse({ status: 200, type: SubscriptionStateDto })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: errorRef,
  })
  async state(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubscriptionStateDto> {
    return this.subscriptions.state(user?.sub ?? null, id);
  }

  @Put('channels/:id/subscription')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Inscrever-se no canal (idempotente)' })
  @ApiParam(CHANNEL_PARAM)
  @ApiResponse({ status: 200, type: SubscriptionStateDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: errorRef,
  })
  @ApiResponse({ status: 409, description: 'Próprio canal', schema: errorRef })
  async subscribe(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubscriptionStateDto> {
    return this.subscriptions.subscribe(user.sub, id);
  }

  @Delete('channels/:id/subscription')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancelar inscrição' })
  @ApiParam(CHANNEL_PARAM)
  @ApiResponse({ status: 200, type: SubscriptionStateDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  @ApiResponse({
    status: 404,
    description: 'Canal não encontrado',
    schema: errorRef,
  })
  async unsubscribe(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubscriptionStateDto> {
    return this.subscriptions.unsubscribe(user.sub, id);
  }

  @Get('me/subscriptions')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Canais que sigo, com os últimos vídeos publicados',
  })
  @ApiResponse({ status: 200, type: [FollowedChannelDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized', schema: errorRef })
  async mine(@CurrentUser() user: JwtPayload): Promise<FollowedChannelDto[]> {
    return this.subscriptions.listMine(user.sub);
  }
}
