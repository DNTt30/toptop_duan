import type { EventSource } from '@buddhalive/shared';

export type PlatformAdapterStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'RECEIVING_EVENTS'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'ERROR';

export interface IncomingPlatformEvent {
  source: EventSource;
  eventType: 'GIFT' | 'LIKE' | 'CHAT' | 'FOLLOW' | 'SHARE';
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  giftId?: string | null;
  giftName?: string | null;
  giftCount?: number;
  unitCoinValue?: number;
  comboGroupId?: string | null;
  isComboEnd?: boolean;
  externalEventId?: string | null;
  rawPayloadJson?: string;
}

export type PlatformEventListener = (event: IncomingPlatformEvent) => void;

/**
 * Hợp đồng giao tiếp (Interface) LivePlatformAdapter cho mọi nguồn livestream.
 * EventEngine không bao giờ phụ thuộc trực tiếp vào SDK hay socket của bất kỳ nền tảng nào.
 */
export interface LivePlatformAdapter {
  readonly name: string;
  readonly platform: 'TIKTOK' | 'DEMO' | 'CUSTOM';

  getStatus(): PlatformAdapterStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: PlatformEventListener): () => void;
}
