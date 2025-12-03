import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { TelegramGateway } from './telegram.gateway';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient;
  private isConnected = false;
  private monitoredChannels: string[] = [];

  constructor(
    private configService: ConfigService,
    private telegramGateway: TelegramGateway,
    private prisma: PrismaService,
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

      // maddingStock 채널 특별 처리
      if (channelUsername.toLowerCase().includes('maddingstock')) {
        await this.handleMaddingStockMessage(messageData, message);
      } else {
        // 일반 채널 로그
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.logger.log(`📬 NEW MESSAGE from @${channelUsername}`);
        this.logger.log(`📝 ${messageData.text}`);
        this.logger.log(`🕐 ${new Date(message.date * 1000).toLocaleString()}`);
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }

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

  /**
   * maddingStock 채널 메시지 전용 처리 함수
   */
  private async handleMaddingStockMessage(messageData: any, originalMessage: any) {
    try {
      const text = messageData.text || '';
      const timestamp = new Date(messageData.date * 1000);

      // 메시지 파싱
      const parsedData = this.parseMaddingStockMessage(text);

      // 데이터베이스에 저장 (중복 체크)
      const savedMessage = await this.prisma.maddingStockMessage.upsert({
        where: { messageId: BigInt(messageData.id) },
        update: {
          rawText: text,
          strategy: parsedData.strategy,
          stockName: parsedData.stockName,
          tradeType: parsedData.tradeType,
          status: parsedData.status,
          price: parsedData.price,
          additionalInfo: parsedData.additionalInfo,
          profitRate: parsedData.profitRate,
          changePercent: parsedData.changePercent,
          keywords: parsedData.keywords,
          symbols: parsedData.symbols,
          urls: parsedData.urls,
          messageDate: timestamp,
          channelUsername: messageData.channelUsername,
        },
        create: {
          messageId: BigInt(messageData.id),
          rawText: text,
          strategy: parsedData.strategy,
          stockName: parsedData.stockName,
          tradeType: parsedData.tradeType,
          status: parsedData.status,
          price: parsedData.price,
          additionalInfo: parsedData.additionalInfo,
          profitRate: parsedData.profitRate,
          changePercent: parsedData.changePercent,
          keywords: parsedData.keywords,
          symbols: parsedData.symbols,
          urls: parsedData.urls,
          messageDate: timestamp,
          channelUsername: messageData.channelUsername,
        },
      });

      // 처리된 메시지 데이터
      const processedMessage = {
        id: savedMessage.id,
        messageId: Number(savedMessage.messageId),
        rawText: savedMessage.rawText,
        parsed: {
          strategy: savedMessage.strategy,
          stockName: savedMessage.stockName,
          tradeType: savedMessage.tradeType,
          status: savedMessage.status,
          price: savedMessage.price,
          additionalInfo: savedMessage.additionalInfo,
          profitRate: savedMessage.profitRate,
          changePercent: savedMessage.changePercent,
          keywords: savedMessage.keywords,
          symbols: savedMessage.symbols,
          urls: savedMessage.urls,
        },
        timestamp: savedMessage.messageDate,
        channelUsername: savedMessage.channelUsername,
        processed: true,
      };

      // 특별한 로그 형식으로 출력
      this.logger.log('╔════════════════════════════════════════════════╗');
      this.logger.log('║  📈 MADDINGSTOCK MESSAGE (💾 SAVED TO DB)      ║');
      this.logger.log('╚════════════════════════════════════════════════╝');
      this.logger.log(`🆔 Message ID: ${messageData.id}`);
      this.logger.log(`💾 DB ID: ${savedMessage.id}`);
      this.logger.log(`📅 Time: ${timestamp.toLocaleString('ko-KR')}`);
      this.logger.log(`📝 Raw Text:\n${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
      
      if (parsedData.stockName) {
        this.logger.log(`\n📊 Parsed Data:`);
        if (parsedData.strategy) this.logger.log(`   전략: ${parsedData.strategy}`);
        this.logger.log(`   주식명: ${parsedData.stockName}`);
        if (parsedData.tradeType) this.logger.log(`   매매유형: ${parsedData.tradeType}`);
        if (parsedData.status) this.logger.log(`   상태: ${parsedData.status}`);
        if (parsedData.price) this.logger.log(`   가격: ${parsedData.price}`);
        if (parsedData.additionalInfo) this.logger.log(`   추가정보: ${parsedData.additionalInfo}`);
        if (parsedData.profitRate) this.logger.log(`   손익율: ${parsedData.profitRate}`);
        if (parsedData.changePercent) this.logger.log(`   변동률: ${parsedData.changePercent}`);
        if (parsedData.keywords.length > 0) {
          this.logger.log(`   키워드: ${parsedData.keywords.join(', ')}`);
        }
      }
      
      this.logger.log('═══════════════════════════════════════════════════\n');

      // WebSocket으로 특별한 이벤트 전송
      this.telegramGateway.server.emit('maddingstock:message', processedMessage);

    } catch (error) {
      this.logger.error('Error processing MaddingStock message:', error);
    }
  }

  /**
   * maddingStock 메시지 파싱 함수
   * 
   * 지원하는 포맷:
   * 1. [전략A][삼성전자][매수][50000]
   * 2. [전략A][일진전기][매수][접근][51000] : 1차(50400) 접근
   * 3. [전략C][싸이닉솔루션][매도][도달][10280] : 강화 반등 - 손익율:8.98%
   */
  private parseMaddingStockMessage(text: string) {
    const parsed: any = {
      strategy: null,        // 전략 (예: 전략A, 전략C)
      stockName: null,       // 주식명
      tradeType: null,       // 매매유형 (매수, 매도)
      status: null,          // 상태 (도달, 접근 등)
      price: null,           // 가격
      additionalInfo: null,  // 추가정보 (예: 강화 반등, 1차(50400) 접근)
      profitRate: null,      // 손익율
      changePercent: null,   // 변동률
      keywords: [],
      symbols: [],
      urls: [],
    };

    if (!text) return parsed;

    // 1단계: 기본 구조 파싱 [전략][주식명][매매유형][상태?][가격]
    // 더 유연한 패턴: 대괄호 5개 또는 4개
    const basicPattern = /\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?\[?(\d+)\]?/;
    const basicMatch = text.match(basicPattern);
    
    if (basicMatch) {
      parsed.strategy = basicMatch[1] || null;
      parsed.stockName = basicMatch[2] || null;
      parsed.tradeType = basicMatch[3] || null;
      
      // 4번째와 5번째 그룹 처리
      // [상태][가격] 또는 [가격]만 있을 수 있음
      if (basicMatch[5]) {
        // 5개 대괄호: [전략][주식][매매][상태][가격]
        parsed.status = basicMatch[4] || null;
        parsed.price = basicMatch[5];
      } else if (basicMatch[4]) {
        // 4개 대괄호: [전략][주식][매매][가격]
        parsed.price = basicMatch[4];
      }
      
      // 2단계: `:` 이후 내용 파싱
      const colonIndex = text.indexOf(':');
      if (colonIndex !== -1) {
        const afterColon = text.substring(colonIndex + 1).trim();
        
        // 손익율 추출
        const profitMatch = afterColon.match(/손익율:?\s*([\d.]+%)/);
        if (profitMatch) {
          parsed.profitRate = profitMatch[1];
          // 손익율 제거하고 나머지를 additionalInfo로
          const infoText = afterColon.replace(/\s*-?\s*손익율:?\s*[\d.]+%/, '').trim();
          if (infoText) {
            parsed.additionalInfo = infoText;
          }
        } else {
          // 손익율이 없으면 전체를 additionalInfo로
          parsed.additionalInfo = afterColon;
        }
      }
      
      // 키워드에 자동 추가
      if (parsed.strategy) parsed.keywords.push(parsed.strategy);
      if (parsed.tradeType) parsed.keywords.push(parsed.tradeType);
      if (parsed.status) parsed.keywords.push(parsed.status);
      if (parsed.additionalInfo) {
        // 추가정보에서 키워드 추출
        const infoKeywords = parsed.additionalInfo.match(/[가-힣]+/g);
        if (infoKeywords) {
          parsed.keywords.push(...infoKeywords);
        }
      }
    } else {
      // 기존 파싱 로직 (구조화되지 않은 메시지용)
      
      // 주식명 추출 (예: "삼성전자", "카카오" 등)
      const stockNameMatch = text.match(/[가-힣]+전자|[가-힣]+바이오|[가-힣]+제약|[가-힣]+솔루션|[가-힣]{2,}/);
      if (stockNameMatch) {
        parsed.stockName = stockNameMatch[0];
      }

      // 가격 추출 (예: "50,000원", "5만원", "$100", "10280")
      const priceMatch = text.match(/(\d{1,3}(,\d{3})*|\d+)원?|\$\d+/g);
      if (priceMatch) {
        parsed.price = priceMatch[0];
      }

      // 변동률 추출 (예: "+5%", "-3.2%", "▲2.5%")
      const changeMatch = text.match(/[▲▼+-]?\s*\d+\.?\d*%/g);
      if (changeMatch) {
        parsed.changePercent = changeMatch[0];
      }

      // 손익율 추출
      const profitMatch = text.match(/손익율:?\s*(\d+\.?\d*%)/);
      if (profitMatch) {
        parsed.profitRate = profitMatch[1];
      }

      // 키워드 추출
      const keywords = ['매수', '매도', '상승', '하락', '급등', '급락', '추천', '주목', 
                        '목표가', '저가매수', '고가매도', '신고가', '신저가', '반등', '조정',
                        '도달', '강화', '전략A', '전략B', '전략C', '전략D'];
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          parsed.keywords.push(keyword);
        }
      });
    }

    // 심볼 추출 (예: #주식, #매수 등)
    const hashtagMatch = text.match(/#[가-힣A-Za-z0-9_]+/g);
    if (hashtagMatch) {
      parsed.symbols = hashtagMatch;
    }

    // URL 추출
    const urlMatch = text.match(/https?:\/\/[^\s]+/g);
    if (urlMatch) {
      parsed.urls = urlMatch;
    }

    // 중복 키워드 제거
    parsed.keywords = [...new Set(parsed.keywords)];

    return parsed;
  }

  /**
   * maddingStock 채널의 저장된 메시지 조회 (데이터베이스에서)
   */
  async getMaddingStockMessages(limit: number = 20, offset: number = 0) {
    const [messages, total] = await Promise.all([
      this.prisma.maddingStockMessage.findMany({
        orderBy: { messageDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.maddingStockMessage.count(),
    ]);

    return {
      total,
      limit,
      offset,
      messages: messages.map(msg => ({
        id: msg.id,
        messageId: Number(msg.messageId),
        rawText: msg.rawText,
        parsed: {
          strategy: msg.strategy,
          stockName: msg.stockName,
          tradeType: msg.tradeType,
          status: msg.status,
          price: msg.price,
          additionalInfo: msg.additionalInfo,
          profitRate: msg.profitRate,
          changePercent: msg.changePercent,
          keywords: msg.keywords,
          symbols: msg.symbols,
          urls: msg.urls,
        },
        timestamp: msg.messageDate,
        channelUsername: msg.channelUsername,
        createdAt: msg.createdAt,
      })),
    };
  }

  /**
   * maddingStock 메시지 검색 (데이터베이스에서)
   */
  async searchMaddingStockMessages(keyword: string, limit: number = 20) {
    const messages = await this.prisma.maddingStockMessage.findMany({
      where: {
        OR: [
          { rawText: { contains: keyword, mode: 'insensitive' } },
          { stockName: { contains: keyword, mode: 'insensitive' } },
          { keywords: { has: keyword } },
        ],
      },
      orderBy: { messageDate: 'desc' },
      take: limit,
    });

    return {
      total: messages.length,
      keyword,
      messages: messages.map(msg => ({
        id: msg.id,
        messageId: Number(msg.messageId),
        rawText: msg.rawText,
        parsed: {
          strategy: msg.strategy,
          stockName: msg.stockName,
          tradeType: msg.tradeType,
          status: msg.status,
          price: msg.price,
          additionalInfo: msg.additionalInfo,
          profitRate: msg.profitRate,
          changePercent: msg.changePercent,
          keywords: msg.keywords,
          symbols: msg.symbols,
          urls: msg.urls,
        },
        timestamp: msg.messageDate,
        channelUsername: msg.channelUsername,
      })),
    };
  }

  /**
   * maddingStock 통계 (데이터베이스에서)
   */
  async getMaddingStockStats() {
    const [total, recentMessages, allMessages] = await Promise.all([
      this.prisma.maddingStockMessage.count(),
      this.prisma.maddingStockMessage.findMany({
        orderBy: { messageDate: 'desc' },
        take: 5,
      }),
      this.prisma.maddingStockMessage.findMany({
        select: {
          stockName: true,
          keywords: true,
        },
      }),
    ]);

    // 주식명 수집
    const stocksMentioned = new Set<string>();
    const keywordFrequency: Record<string, number> = {};

    allMessages.forEach(msg => {
      if (msg.stockName) {
        stocksMentioned.add(msg.stockName);
      }

      msg.keywords.forEach(keyword => {
        keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
      });
    });

    return {
      totalMessages: total,
      stocksMentioned: Array.from(stocksMentioned),
      topKeywords: Object.entries(keywordFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([keyword, count]) => ({ keyword, count })),
      recentMessages: recentMessages.map(msg => ({
        id: msg.id,
        messageId: Number(msg.messageId),
        rawText: msg.rawText.substring(0, 100),
        stockName: msg.stockName,
        timestamp: msg.messageDate,
      })),
    };
  }
}

