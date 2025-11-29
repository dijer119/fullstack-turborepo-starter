import { Controller, Get, Query, Param, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GetMessagesDto, SearchMessagesDto } from './dto/get-messages.dto';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('status')
  getStatus() {
    return this.telegramService.getConnectionStatus();
  }

  @Get('channel/:username')
  async getChannelInfo(@Param('username') username: string) {
    return this.telegramService.getChannelInfo(username);
  }

  @Get('messages')
  async getMessages(@Query() dto: GetMessagesDto) {
    return this.telegramService.getChannelMessages(dto.channel, dto.limit);
  }

  @Get('search')
  async searchMessages(@Query() dto: SearchMessagesDto) {
    return this.telegramService.searchChannelMessages(
      dto.channel,
      dto.query,
      dto.limit,
    );
  }

  @Get('monitoring')
  getMonitoredChannels() {
    return {
      channels: this.telegramService.getMonitoredChannels(),
      count: this.telegramService.getMonitoredChannels().length,
    };
  }

  @Post('monitoring/start/:channel')
  async startMonitoring(@Param('channel') channel: string) {
    return this.telegramService.startMonitoring(channel);
  }

  @Post('monitoring/stop/:channel')
  async stopMonitoring(@Param('channel') channel: string) {
    return this.telegramService.stopMonitoring(channel);
  }
}

