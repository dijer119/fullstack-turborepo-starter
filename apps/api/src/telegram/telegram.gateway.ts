import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TelegramGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TelegramGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
  }

  broadcastMessage(channel: string, message: any) {
    this.server.emit('telegram:message', {
      channel,
      message,
      timestamp: new Date(),
    });
  }

  broadcastChannelUpdate(channel: string, data: any) {
    this.server.emit('telegram:update', {
      channel,
      data,
      timestamp: new Date(),
    });
  }
}

