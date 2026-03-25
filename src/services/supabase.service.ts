import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import config from '../config';

class SupabaseService {
  private client: SupabaseClient | null = null;
  // Pool of subscribed channels
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscribedChannels: Set<string> = new Set();
  // Queue of pending broadcasts (waiting for channel subscription)
  private pendingBroadcasts: Map<string, Array<{ event: string; payload: Record<string, any> }>> = new Map();

  private getClient(): SupabaseClient | null {
    const url = config.supabase.url;
    const key = (config.supabase.serviceRoleKey && !config.supabase.serviceRoleKey.startsWith('your_'))
      ? config.supabase.serviceRoleKey
      : config.supabase.anonKey;

    if (!url || !key) {
      return null;
    }

    if (!this.client) {
      this.client = createClient(url, key);
      console.log('[Supabase] Client initialized for realtime broadcast');
    }

    return this.client;
  }

  /**
   * Get or create a channel, subscribing if needed.
   * Sends are queued until the channel is in SUBSCRIBED state.
   */
  private ensureChannel(channelName: string): RealtimeChannel | null {
    const client = this.getClient();
    if (!client) return null;

    const existing = this.channels.get(channelName);
    if (existing) return existing;

    const channel = client.channel(channelName);
    this.channels.set(channelName, channel);

    channel.subscribe((status: string, err?: Error) => {
      console.log(`[Supabase] Channel ${channelName} status: ${status}`);
      if (err) {
        console.error(`[Supabase] Channel ${channelName} error:`, err);
      }
      if (status === 'SUBSCRIBED') {
        this.subscribedChannels.add(channelName);
        // Flush any pending broadcasts for this channel
        this.flushPending(channelName);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Remove failed channel so it gets recreated next time
        this.channels.delete(channelName);
        this.subscribedChannels.delete(channelName);
        this.pendingBroadcasts.delete(channelName);
        client.removeChannel(channel);
      }
    });

    return channel;
  }

  /**
   * Flush pending broadcasts for a channel that just became SUBSCRIBED.
   */
  private flushPending(channelName: string): void {
    const pending = this.pendingBroadcasts.get(channelName);
    if (!pending || pending.length === 0) return;

    const channel = this.channels.get(channelName);
    if (!channel) return;

    console.log(`[Supabase] Flushing ${pending.length} pending broadcasts for ${channelName}`);

    for (const { event, payload } of pending) {
      channel.send({ type: 'broadcast', event, payload })
        .then(() => console.log(`[Supabase] Broadcast sent: ${event} on ${channelName}`))
        .catch((error: any) => console.error(`[Supabase] Broadcast send error:`, error));
    }

    this.pendingBroadcasts.delete(channelName);
  }

  /**
   * Broadcast an event to a named channel.
   * If the channel is already subscribed, sends immediately.
   * If not yet subscribed, queues the broadcast until subscription completes.
   */
  private broadcast(channelName: string, event: string, payload: Record<string, any>): void {
    const channel = this.ensureChannel(channelName);
    if (!channel) {
      console.warn('[Supabase] Not configured, skipping realtime broadcast');
      return;
    }

    // If already subscribed, send immediately
    if (this.subscribedChannels.has(channelName)) {
      channel.send({ type: 'broadcast', event, payload })
        .then(() => console.log(`[Supabase] Broadcast sent: ${event} on ${channelName}`))
        .catch((error: any) => console.error(`[Supabase] Broadcast send error:`, error));
      return;
    }

    // Queue for when subscription completes
    if (!this.pendingBroadcasts.has(channelName)) {
      this.pendingBroadcasts.set(channelName, []);
    }
    this.pendingBroadcasts.get(channelName)!.push({ event, payload });
    console.log(`[Supabase] Queued broadcast: ${event} on ${channelName} (awaiting subscription)`);
  }

  /**
   * Broadcast a new chat message to a room channel.
   */
  broadcastMessage(roomId: string, message: {
    id: string;
    chat_room_id: string;
    sender_id: string;
    content: string;
    message_type: string;
    is_read: boolean;
    created_at: string;
    sender?: { id: string; name: string; profile_photo: string | null };
  }): void {
    this.broadcast(`chat:${roomId}`, 'new_message', message);
  }

  /**
   * Broadcast typing indicator.
   */
  broadcastTyping(roomId: string, userId: string, userName: string, isTyping: boolean): void {
    this.broadcast(`chat:${roomId}`, 'typing', {
      user_id: userId,
      user_name: userName,
      is_typing: isTyping,
    });
  }

  /**
   * Broadcast message read receipt.
   */
  broadcastReadReceipt(roomId: string, readByUserId: string): void {
    this.broadcast(`chat:${roomId}`, 'messages_read', {
      read_by: readByUserId,
      room_id: roomId,
    });
  }

  /**
   * Broadcast room status change.
   */
  broadcastRoomStatus(roomId: string, isActive: boolean): void {
    this.broadcast(`chat:${roomId}`, 'room_status', {
      room_id: roomId,
      is_active: isActive,
    });
  }

  /**
   * Broadcast unread count update to a user's personal channel.
   */
  broadcastUnreadUpdate(userId: string, roomId: string, unreadCount: number): void {
    this.broadcast(`chat:user:${userId}`, 'unread_update', {
      room_id: roomId,
      unread_count: unreadCount,
    });
  }
}

export const supabaseService = new SupabaseService();
