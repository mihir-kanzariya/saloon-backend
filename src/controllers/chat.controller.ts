import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';
import { supabaseService } from '../services/supabase.service';
import { NotificationService } from '../services/notification.service';

import ChatRoom from '../models/ChatRoom';
import ChatMessage from '../models/ChatMessage';
import User from '../models/User';
import Salon from '../models/Salon';
import Booking from '../models/Booking';
import SalonMember from '../models/SalonMember';

export class ChatController {
  // Verify the requesting user has access to the chat room
  private static async verifyRoomAccess(room: any, userId: string): Promise<void> {
    if (room.customer_id === userId) return;

    const membership = await SalonMember.findOne({
      where: { salon_id: room.salon_id, user_id: userId, is_active: true },
    });
    if (!membership) {
      throw ApiError.forbidden('You do not have access to this chat room');
    }
  }

  /**
   * Reusable mark-read logic: marks all unread messages in a room as read
   * for the given user, broadcasts read receipt, and returns count updated.
   */
  private static async markMessagesAsRead(roomId: string, userId: string): Promise<number> {
    const [updatedCount] = await ChatMessage.update(
      { is_read: true },
      {
        where: {
          chat_room_id: roomId,
          sender_id: { [Op.ne]: userId },
          is_read: false,
        },
      }
    );

    if (updatedCount > 0) {
      supabaseService.broadcastReadReceipt(roomId, userId);
    }

    return updatedCount;
  }

  // Get chat rooms for user
  static async getRooms(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;

      // Get salon IDs the user is a member of
      const memberships = await SalonMember.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['salon_id'],
      });
      const salonIds = memberships.map((m: any) => m.salon_id);

      const rooms = await ChatRoom.findAll({
        where: {
          [Op.or]: [
            { customer_id: userId },
            ...(salonIds.length > 0 ? [{ salon_id: { [Op.in]: salonIds } }] : []),
          ],
        },
        attributes: {
          include: [
            // B.1: Use replacements to prevent SQL injection
            [
              sequelize.literal(`(SELECT COUNT(*) FROM chat_messages WHERE chat_messages.chat_room_id = "ChatRoom".id AND chat_messages.sender_id != :currentUserId AND chat_messages.is_read = false)`),
              'unread_count',
            ],
            // D.5: Include last message content
            [
              sequelize.literal(`(SELECT content FROM chat_messages WHERE chat_messages.chat_room_id = "ChatRoom".id ORDER BY chat_messages.created_at DESC LIMIT 1)`),
              'last_message',
            ],
          ],
        },
        include: [
          { model: User, as: 'customer', attributes: ['id', 'name', 'profile_photo'] },
          { model: Salon, as: 'salon', attributes: ['id', 'name', 'cover_image'] },
          {
            model: Booking, as: 'booking',
            attributes: ['id', 'booking_number', 'booking_date', 'status'],
            include: [
              {
                model: SalonMember, as: 'stylist',
                attributes: ['id', 'role'],
                include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
              },
            ],
          },
        ],
        order: [['updated_at', 'DESC']],
        replacements: { currentUserId: userId },
      } as any);

      ApiResponse.success(res, { data: rooms });
    } catch (error) {
      next(error);
    }
  }

  // Get messages in a chat room
  static async getMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      const { page, limit, offset } = parsePagination({ ...req.query, limit: req.query.limit || '50' });

      const room = await ChatRoom.findByPk(roomId);
      if (!room) throw ApiError.notFound('Chat room not found');

      await ChatController.verifyRoomAccess(room, req.user!.id);

      const { rows, count } = await ChatMessage.findAndCountAll({
        where: { chat_room_id: roomId },
        include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'profile_photo'] }],
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      // Mark messages as read
      await ChatController.markMessagesAsRead(roomId as string, req.user!.id);

      ApiResponse.paginated(res, { data: rows.reverse(), page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // A.2: Dedicated mark-read endpoint
  static async markAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;

      const room = await ChatRoom.findByPk(roomId);
      if (!room) throw ApiError.notFound('Chat room not found');

      await ChatController.verifyRoomAccess(room, req.user!.id);

      const updatedCount = await ChatController.markMessagesAsRead(roomId as string, req.user!.id);

      ApiResponse.success(res, { message: 'Messages marked as read', data: { updated: updatedCount } });
    } catch (error) {
      next(error);
    }
  }

  // Send message
  static async sendMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      const { content, message_type } = req.body;

      const room = await ChatRoom.findByPk(roomId);
      if (!room) throw ApiError.notFound('Chat room not found');
      if (!room.is_active) throw ApiError.badRequest('Chat room is closed');

      await ChatController.verifyRoomAccess(room, req.user!.id);

      const message = await ChatMessage.create({
        chat_room_id: roomId,
        sender_id: req.user!.id,
        content,
        message_type: message_type || 'text',
      });

      const fullMessage = await ChatMessage.findByPk(message.id, {
        include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'profile_photo'] }],
      });

      // Update room's updated_at for sorting
      await room.update({ updated_at: new Date() });

      // Broadcast via Supabase Realtime
      const msgData = fullMessage.toJSON();
      supabaseService.broadcastMessage(roomId as string, {
        id: msgData.id,
        chat_room_id: msgData.chat_room_id,
        sender_id: msgData.sender_id,
        content: msgData.content,
        message_type: msgData.message_type,
        is_read: msgData.is_read,
        // Sequelize returns createdAt (camelCase) — normalize to created_at for Flutter
        created_at: msgData.createdAt || msgData.created_at,
        sender: msgData.sender,
      });

      // A.4: Broadcast unread count to recipient user channel
      const senderId = req.user!.id;
      if (room.customer_id === senderId) {
        // Sender is customer → notify salon members
        const salonMembers = await SalonMember.findAll({
          where: { salon_id: room.salon_id, is_active: true },
          attributes: ['user_id'],
        });
        for (const member of salonMembers) {
          if (member.user_id !== senderId) {
            const unreadCount = await ChatMessage.count({
              where: { chat_room_id: roomId, sender_id: { [Op.ne]: member.user_id }, is_read: false },
            });
            supabaseService.broadcastUnreadUpdate(member.user_id, roomId as string, unreadCount);
          }
        }
      } else {
        // Sender is salon member → notify customer
        const unreadCount = await ChatMessage.count({
          where: { chat_room_id: roomId, sender_id: { [Op.ne]: room.customer_id }, is_read: false },
        });
        supabaseService.broadcastUnreadUpdate(room.customer_id, roomId as string, unreadCount);
      }

      // A.6: Send push notification for new chat messages
      if (room.customer_id !== senderId) {
        // Sender is salon member → push to customer
        NotificationService.send({
          userId: room.customer_id,
          title: `New message from ${msgData.sender?.name || 'Someone'}`,
          body: content.length > 100 ? content.substring(0, 100) + '...' : content,
          type: 'chat_message',
          data: { room_id: roomId, message_id: msgData.id },
        }).catch((err: any) => console.error('[Chat] Push notification failed:', err));
      } else {
        // Sender is customer → push to salon members
        const salonMembers = await SalonMember.findAll({
          where: { salon_id: room.salon_id, is_active: true },
          attributes: ['user_id'],
        });
        for (const member of salonMembers) {
          if (member.user_id !== senderId) {
            NotificationService.send({
              userId: member.user_id,
              title: `New message from ${msgData.sender?.name || 'Customer'}`,
              body: content.length > 100 ? content.substring(0, 100) + '...' : content,
              type: 'chat_message',
              data: { room_id: roomId, message_id: msgData.id },
            }).catch((err: any) => console.error('[Chat] Push notification failed:', err));
          }
        }
      }

      ApiResponse.created(res, { data: fullMessage });
    } catch (error) {
      next(error);
    }
  }

  // Send typing indicator
  static async sendTyping(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;
      const { is_typing } = req.body;

      const room = await ChatRoom.findByPk(roomId);
      if (!room) throw ApiError.notFound('Chat room not found');

      await ChatController.verifyRoomAccess(room, req.user!.id);

      supabaseService.broadcastTyping(
        roomId as string,
        req.user!.id,
        req.user!.name || 'User',
        is_typing ?? true
      );

      ApiResponse.success(res, { message: 'OK' });
    } catch (error) {
      next(error);
    }
  }

  // Close chat room
  static async closeRoom(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roomId } = req.params;

      const room = await ChatRoom.findByPk(roomId);
      if (!room) throw ApiError.notFound('Chat room not found');

      await ChatController.verifyRoomAccess(room, req.user!.id);

      await room.update({ is_active: false, closed_at: new Date() });

      // Broadcast room closure
      supabaseService.broadcastRoomStatus(roomId as string, false);

      ApiResponse.success(res, { message: 'Chat room closed' });
    } catch (error) {
      next(error);
    }
  }
}
