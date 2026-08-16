import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

// Real-time notification push. Each socket must present a valid access JWT
// on connection (handshake.auth.token) — the server derives the room from
// the verified token, never from anything the client claims to be.
@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN?.split(',') ?? '*' },
  namespace: 'notifications',
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private jwt: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (typeof token !== 'string' || !token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<{ sub: string }>(token, { secret: process.env.JWT_ACCESS_SECRET });
      void client.join(`user:${payload.sub}`);
    } catch (err) {
      this.logger.debug(`Rejected unauthenticated socket: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
