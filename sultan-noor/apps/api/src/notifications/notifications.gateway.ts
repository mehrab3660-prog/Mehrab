import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { Server } from 'socket.io';

// Real-time notification push. Clients join a room keyed by their userId
// (after authenticating over REST and obtaining the id) so server-side
// events (order updates, price drops, Q&A replies) reach them instantly.
@WebSocketGateway({ cors: { origin: '*' }, namespace: 'notifications' })
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join')
  handleJoin(@MessageBody() userId: string, client: any) {
    client.join(`user:${userId}`);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
