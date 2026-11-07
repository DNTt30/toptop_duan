import type {
  DemoScenario,
  DemoScenarioResult,
  DemoTriggerGiftPayload,
  DemoTriggerGiftResult,
} from '@buddhalive/shared';
import crypto from 'node:crypto';
import type {
  IncomingPlatformEvent,
  LivePlatformAdapter,
  PlatformAdapterStatus,
  PlatformEventListener,
} from '../adapters/live-platform-adapter';
import { createLogger, type Logger } from '../config/logger';

export interface DemoSimulatorOptions {
  onEvent?: (event: IncomingPlatformEvent) => void;
  logger?: Logger;
}

/**
 * DemoSimulator độc lập cho Giai đoạn S5.
 * Đóng vai trò là Ingress Adapter với source = 'DEMO', hỗ trợ gửi quà đơn và 4 kịch bản thực chiến.
 */
export class DemoSimulator implements LivePlatformAdapter {
  public readonly name = 'DemoSimulator';
  public readonly platform = 'DEMO' as const;

  private isRunning = false;
  private readonly logger: Logger;
  private readonly listeners = new Set<PlatformEventListener>();
  private activeTimers: NodeJS.Timeout[] = [];

  constructor(options: DemoSimulatorOptions = {}) {
    this.logger = options.logger || createLogger('DemoSimulator');
    if (options.onEvent) {
      this.listeners.add(options.onEvent);
    }
  }

  public getStatus(): PlatformAdapterStatus {
    return this.isRunning ? 'CONNECTED' : 'DISCONNECTED';
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.logger.info('DemoSimulator started in CONNECTED mode');
  }

  public async stop(): Promise<void> {
    this.stopScenario();
    this.isRunning = false;
    this.logger.info('DemoSimulator stopped');
  }

  public onEvent(listener: PlatformEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private dispatchEvent(event: IncomingPlatformEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err: unknown) {
        this.logger.error('Error dispatching demo event to listener', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Tạo sự kiện quà tặng đơn lẻ
   */
  public createSingleGiftEvent(payload: DemoTriggerGiftPayload): IncomingPlatformEvent {
    const senderName = payload.senderName.trim();
    const giftCount = payload.giftCount ?? 1;
    const externalEventId = payload.externalEventId ?? `demo_${crypto.randomUUID()}`;
    const isComboEnd = payload.isComboEnd !== undefined ? payload.isComboEnd : true;

    return {
      source: 'DEMO',
      eventType: 'GIFT',
      senderId: `demo_user_${senderName.toLowerCase().replace(/\s+/g, '_')}`,
      senderName,
      giftId: 'lotus',
      giftName: 'Hoa Sen',
      giftCount,
      unitCoinValue: 10,
      comboGroupId: `demo_combo_${senderName.toLowerCase().replace(/\s+/g, '_')}`,
      isComboEnd,
      externalEventId,
      rawPayloadJson: JSON.stringify({
        ...payload,
        source: 'DEMO',
        simulatedAt: new Date().toISOString(),
      }),
    };
  }

  /**
   * Gửi quà tặng demo đơn lẻ (gọi các listeners đã đăng ký)
   */
  public triggerGift(payload: DemoTriggerGiftPayload): IncomingPlatformEvent {
    const ev = this.createSingleGiftEvent(payload);
    this.dispatchEvent(ev);
    return ev;
  }

  /**
   * Hủy mọi timers của kịch bản đang chạy
   */
  public stopScenario(): void {
    while (this.activeTimers.length > 0) {
      const timer = this.activeTimers.pop();
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Chạy 1 trong 4 kịch bản thực chiến
   */
  public async runScenario(scenario: DemoScenario): Promise<DemoScenarioResult> {
    this.stopScenario();

    switch (scenario) {
      case 'SINGLE_BURST': {
        // Kịch bản 1: 1 người gửi liên tục 5 quà nhỏ trong vòng 1200ms để kiểm chứng COMBO_MERGE
        const donor = 'Phật Tử Tinh Tấn';
        for (let i = 0; i < 5; i++) {
          const isLast = i === 4;
          const timer = setTimeout(() => {
            this.dispatchEvent({
              source: 'DEMO',
              eventType: 'GIFT',
              senderId: 'demo_single_burst',
              senderName: donor,
              giftId: 'lotus',
              giftName: 'Hoa Sen',
              giftCount: 2,
              unitCoinValue: 10,
              comboGroupId: 'burst_combo_1',
              isComboEnd: isLast,
              externalEventId: `demo_burst_${crypto.randomUUID()}`,
            });
          }, i * 200);
          this.activeTimers.push(timer);
        }
        return {
          scenario,
          started: true,
          eventCount: 5,
          description: '1 người gửi dồn 5 đợt quà trong 1200ms để kiểm chứng COMBO_MERGE',
        };
      }

      case 'CONCURRENT_SENDERS': {
        // Kịch bản 2: 5 người gửi khác nhau gửi quà gần như cùng lúc
        const senders = ['Thanh Tâm', 'Trí Dũng', 'Diệu Âm', 'Quang Minh', 'Tuệ Tĩnh'];
        senders.forEach((name, idx) => {
          const timer = setTimeout(() => {
            this.dispatchEvent({
              source: 'DEMO',
              eventType: 'GIFT',
              senderId: `demo_concurrent_${idx + 1}`,
              senderName: name,
              giftId: 'lotus',
              giftName: 'Hoa Sen',
              giftCount: 1,
              unitCoinValue: 10,
              externalEventId: `demo_concurrent_${crypto.randomUUID()}`,
            });
          }, idx * 40);
          this.activeTimers.push(timer);
        });
        return {
          scenario,
          started: true,
          eventCount: 5,
          description: '5 người khác nhau gửi quà đồng thời để kiểm chứng Priority DESC + FIFO queue',
        };
      }

      case 'VIP_INTERRUPT': {
        // Kịch bản 3: 3 quà thường (count=1), sau đó 1 quà VIP lớn (count=50, coin=500, priority cao)
        const regularDonors = ['Người Ẩn Danh A', 'Người Ẩn Danh B', 'Người Ẩn Danh C'];
        regularDonors.forEach((name, idx) => {
          const timer = setTimeout(() => {
            this.dispatchEvent({
              source: 'DEMO',
              eventType: 'GIFT',
              senderId: `demo_regular_${idx + 1}`,
              senderName: name,
              giftId: 'lotus',
              giftName: 'Hoa Sen',
              giftCount: 1,
              unitCoinValue: 10,
              externalEventId: `demo_regular_${crypto.randomUUID()}`,
            });
          }, idx * 50);
          this.activeTimers.push(timer);
        });

        // Quà VIP chèn ngang sau 200ms
        const vipTimer = setTimeout(() => {
          this.dispatchEvent({
            source: 'DEMO',
            eventType: 'GIFT',
            senderId: 'demo_vip_king',
            senderName: 'Đại Thí Chủ Kim Cương',
            giftId: 'lotus',
            giftName: 'Đại Hoa Sen Kim Cương',
            giftCount: 50,
            unitCoinValue: 500,
            externalEventId: `demo_vip_${crypto.randomUUID()}`,
          });
        }, 200);
        this.activeTimers.push(vipTimer);

        return {
          scenario,
          started: true,
          eventCount: 4,
          description: '3 quà thường vào hàng đợi, theo sau là 1 quà VIP ưu tiên cao chèn ngang',
        };
      }

      case 'QUEUE_OVERLOAD': {
        // Kịch bản 4: Gửi nhanh 35 sự kiện từ nhiều người để kích hoạt trần 30 và EVICTED_BY_PRIORITY
        for (let i = 1; i <= 35; i++) {
          const timer = setTimeout(() => {
            this.dispatchEvent({
              source: 'DEMO',
              eventType: 'GIFT',
              senderId: `demo_spammer_${i}`,
              senderName: `Spammer ${i}`,
              giftId: 'lotus',
              giftName: 'Hoa Sen',
              giftCount: 1,
              unitCoinValue: 10,
              externalEventId: `demo_overload_${crypto.randomUUID()}`,
            });
          }, i * 15);
          this.activeTimers.push(timer);
        }
        return {
          scenario,
          started: true,
          eventCount: 35,
          description: 'Gửi dồn dập 35 sự kiện để kiểm chứng trần 30, COALESCE và EVICTED_BY_PRIORITY',
        };
      }
    }
  }
}
