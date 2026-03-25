import * as admin from 'firebase-admin';
import config from '../config';
import { Op } from 'sequelize';

import Notification from '../models/Notification';
import User from '../models/User';
import SalonMember from '../models/SalonMember';

// Initialize Firebase Admin SDK once
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return;
  if (!config.firebase.projectId || !config.firebase.clientEmail || !config.firebase.privateKey) {
    console.warn('[Firebase] Missing credentials — push notifications disabled');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
    firebaseInitialized = true;
    console.log('[Firebase] Admin SDK initialized');
  } catch (error) {
    console.error('[Firebase] Init failed:', error);
  }
}

// Initialize on module load
initFirebase();

export class NotificationService {
  /**
   * Create an in-app notification and send push via FCM.
   */
  static async send(params: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data?: any;
  }): Promise<void> {
    const { userId, title, body, type, data = {} } = params;

    // Save to DB
    await Notification.create({
      user_id: userId,
      title,
      body,
      type,
      data,
    });

    // Send push notification via FCM
    try {
      const user = await User.findByPk(userId, { attributes: ['id', 'name', 'fcm_token'] });
      if (user?.fcm_token) {
        console.log(`[FCM] Sending push to user ${user.name} (${userId}), token: ${user.fcm_token.substring(0, 20)}...`);
        await NotificationService.sendPush(user.fcm_token, title, body, { ...data, type });
      } else {
        console.warn(`[FCM] No FCM token for user ${userId} (${user?.name || 'unknown'}) — push skipped`);
      }
    } catch (error) {
      console.error('Push notification failed:', error);
      // Don't throw — push failure shouldn't break the flow
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging.
   */
  static async sendPush(fcmToken: string, title: string, body: string, data: any = {}): Promise<void> {
    if (!firebaseInitialized) {
      console.log('[FCM] Firebase not initialized — push skipped');
      return;
    }

    try {
      // Convert all data values to strings (FCM requirement)
      const stringData: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          stringData[key] = String(value);
        }
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'saloon_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const result = await admin.messaging().send(message);
      console.log(`[FCM] Push sent: ${result}`);
    } catch (error: any) {
      // If token is invalid, clear it from the user record
      if (
        error?.code === 'messaging/invalid-registration-token' ||
        error?.code === 'messaging/registration-token-not-registered'
      ) {
        console.warn(`[FCM] Invalid token, clearing: ${fcmToken.substring(0, 20)}...`);
        await User.update({ fcm_token: null }, { where: { fcm_token: fcmToken } });
      } else {
        console.error(`[FCM] Send failed:`, error?.message || error);
      }
    }
  }

  /**
   * Send notification to all members of a salon.
   */
  static async sendToSalonMembers(params: {
    salonId: string;
    title: string;
    body: string;
    type: string;
    data?: any;
    roles?: string[];
  }): Promise<void> {
    const where: any = { salon_id: params.salonId, is_active: true };
    if (params.roles && params.roles.length > 0) {
      where.role = { [Op.in]: params.roles };
    }

    const members = await SalonMember.findAll({ where, attributes: ['user_id'] });

    for (const member of members) {
      await NotificationService.send({
        userId: member.user_id,
        title: params.title,
        body: params.body,
        type: params.type,
        data: params.data,
      });
    }
  }
}
