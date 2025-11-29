import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { TelegramGateway } from './telegram.gateway';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient;
  private isConnected = false;
  private monitoredChannels: string[] = [];

  constructor(
    private configService: ConfigService,
    private telegramGateway: TelegramGateway,
  ) {}

  async onModuleInit() {
    try {
      await this.initializeClient();
      if (this.isConnected) {
        await this.setupMessageListeners();
      }
    } catch (error) {
      this.logger.error('Failed to initialize Telegram client', error);
    }
  }

  private async initializeClient() {
    const apiId = this.configService.get<number>('TELEGRAM_API_ID');
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    const sessionString = this.configService.get<string>('TELEGRAM_SESSION_STRING') || '';

    if (!apiId || !apiHash) {
      this.logger.warn('Telegram API credentials not configured');
      return;
    }

    const session = new StringSession(sessionString);
    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    try {
      await this.client.connect();
      this.isConnected = true;
      this.logger.log('✅ Telegram client connected successfully');

      // Save session string for future use
      try {
        const newSessionString = (this.client.session.save() as unknown) as string;
        if (newSessionString && newSessionString !== sessionString) {
          this.logger.log('📝 New session string generated. Please save this to TELEGRAM_SESSION_STRING:');
          this.logger.log(newSessionString);
        }
      } catch (error) {
        this.logger.warn('Could not save session string');
      }
    } catch (error) {
      this.logger.error('Failed to connect to Telegram', error);
      this.isConnected = false;
    }
  }

  async getChannelMessages(channelUsername: string, limit: number = 10) {
    if (!this.isConnected || !this.client) {
      throw new Error('Telegram client is not connected');
    }

    try {
      // Get the channel entity
      const channel = await this.client.getEntity(channelUsername);

      // Get messages from the channel
      const messages = await this.client.getMessages(channel, {
        limit,
      });

      return messages.map((message) => ({
        id: message.id,
        text: message.text || message.message,
        date: message.date,
        views: message.views,
        forwards: message.forwards,
        replies: message.replies?.replies || 0,
        media: message.media ? this.getMediaInfo(message.media) : null,
      }));
    } catch (error) {
      this.logger.error(`Failed to get messages from ${channelUsername}`, error);
      throw error;
    }
  }

  async getChannelInfo(channelUsername: string) {
    if (!this.isConnected || !this.client) {
      throw new Error('Telegram client is not connected');
    }

    try {
      const channel = await this.client.getEntity(channelUsername);

      if (channel instanceof Api.Channel) {
        return {
          id: channel.id.toString(),
          title: channel.title,
          username: channel.username,
          participantsCount: channel.participantsCount,
          verified: channel.verified,
          restricted: channel.restricted,
          scam: channel.scam,
          fake: channel.fake,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get channel info for ${channelUsername}`, error);
      throw error;
    }
  }

  async searchChannelMessages(
    channelUsername: string,
    query: string,
    limit: number = 10,
  ) {
    if (!this.isConnected || !this.client) {
      throw new Error('Telegram client is not connected');
    }

    try {
      const channel = await this.client.getEntity(channelUsername);

      const messages = await this.client.getMessages(channel, {
        limit,
        search: query,
      });

      return messages.map((message) => ({
        id: message.id,
        text: message.text || message.message,
        date: message.date,
        views: message.views,
        forwards: message.forwards,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to search messages in ${channelUsername}`,
        error,
      );
      throw error;
    }
  }

  private getMediaInfo(media: any) {
    if (!media) return null;

    if (media instanceof Api.MessageMediaPhoto) {
      return { type: 'photo', hasPhoto: true };
    } else if (media instanceof Api.MessageMediaDocument) {
      return { type: 'document', hasDocument: true };
    } else if (media instanceof Api.MessageMediaWebPage) {
      const webpage = media.webpage as any;
      return { 
        type: 'webpage', 
        url: webpage?.url || undefined 
      };
    }

    return { type: 'unknown' };
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasClient: !!this.client,
      monitoredChannels: this.monitoredChannels,
    };
  }

  private async setupMessageListeners() {
    const channelsConfig = this.configService.get<string>('TELEGRAM_CHANNELS');
    
    if (!channelsConfig) {
      this.logger.warn('⚠️  TELEGRAM_CHANNELS not configured. Skipping message listeners.');
      this.logger.log('💡 To enable real-time messages, add TELEGRAM_CHANNELS to .env');
      this.logger.log('   Example: TELEGRAM_CHANNELS=telegram,durov');
      return;
    }

    const channels = channelsConfig.split(',').map((c) => c.trim());
    this.monitoredChannels = channels;

    this.logger.log(`📡 Setting up real-time listeners for ${channels.length} channel(s)...`);

    // Add event handler for new messages
    this.client.addEventHandler(
      async (event: NewMessageEvent) => {
        await this.handleNewMessage(event);
      },
      new NewMessage({}),
    );

    // Get initial messages for each channel
    for (const channelUsername of channels) {
      try {
        const channel = await this.client.getEntity(channelUsername);
        const messages = await this.client.getMessages(channel, { limit: 5 });
        
        this.logger.log(`✅ Monitoring @${channelUsername} (${messages.length} recent messages)`);
        
        // Display initial messages
        messages.reverse().forEach((msg) => {
          if (msg.message) {
            this.logger.log(`📨 [@${channelUsername}] ${msg.message.substring(0, 100)}`);
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ Failed to monitor @${channelUsername}:`, errorMessage);
      }
    }

    this.logger.log('🎉 Real-time message monitoring active!');
  }

  private async handleNewMessage(event: NewMessageEvent) {
    try {
      const message = event.message;
      const chat = await event.getChat();

      let channelUsername = 'unknown';
      if (chat && 'username' in chat && chat.username) {
        channelUsername = chat.username;
      }

      // Only process if it's from a monitored channel
      if (!this.monitoredChannels.some((c) => channelUsername.includes(c))) {
        return;
      }

      const messageData = {
        id: message.id,
        text: message.text || message.message,
        date: message.date,
        channelUsername,
      };

      // Log to console
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.log(`📬 NEW MESSAGE from @${channelUsername}`);
      this.logger.log(`📝 ${messageData.text}`);
      this.logger.log(`🕐 ${new Date(message.date * 1000).toLocaleString()}`);
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Broadcast via WebSocket
      this.telegramGateway.broadcastMessage(channelUsername, messageData);
    } catch (error) {
      this.logger.error('Error handling new message:', error);
    }
  }

  async startMonitoring(channelUsername: string) {
    if (!this.monitoredChannels.includes(channelUsername)) {
      this.monitoredChannels.push(channelUsername);
      this.logger.log(`✅ Started monitoring @${channelUsername}`);
      
      // Get and display recent messages
      try {
        const messages = await this.getChannelMessages(channelUsername, 5);
        this.logger.log(`📨 Recent messages from @${channelUsername}:`);
        messages.forEach((msg) => {
          this.logger.log(`   [${msg.id}] ${msg.text?.substring(0, 80)}`);
        });
      } catch (error) {
        this.logger.error(`Failed to get messages from @${channelUsername}`);
      }
    }
    return { success: true, channel: channelUsername };
  }

  async stopMonitoring(channelUsername: string) {
    const index = this.monitoredChannels.indexOf(channelUsername);
    if (index > -1) {
      this.monitoredChannels.splice(index, 1);
      this.logger.log(`⏹️  Stopped monitoring @${channelUsername}`);
    }
    return { success: true, channel: channelUsername };
  }

  getMonitoredChannels() {
    return this.monitoredChannels;
  }
}

