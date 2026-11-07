import { z } from 'zod';

export const ComboTriggerModeSchema = z.enum(['COMBO_MERGE', 'THRESHOLD_STEP', 'EACH_EVENT']);
export type ComboTriggerMode = z.infer<typeof ComboTriggerModeSchema>;

export const InterruptPolicySchema = z.enum(['QUEUE', 'PREEMPT_LOWER', 'DROP_IF_BUSY']);
export type InterruptPolicy = z.infer<typeof InterruptPolicySchema>;

export const GiftRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  characterId: z.string().uuid(),
  animationId: z.string().uuid(),
  triggerGiftId: z.string().nullable(),
  minGiftCount: z.number().int().positive().default(1),
  minCoinValue: z.number().int().nonnegative().default(0),
  comboTriggerMode: ComboTriggerModeSchema.default('COMBO_MERGE'),
  priority: z.number().int().min(1).max(100).default(10),
  interruptPolicy: InterruptPolicySchema.default('QUEUE'),
  cooldownMs: z.number().int().nonnegative().default(0),
  maxQueuePerRule: z.number().int().positive().default(5),
  overlayTextTemplate: z.string().default('{senderName} đã tặng {giftCount}x {giftName}'),
  isEnabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GiftRule = z.infer<typeof GiftRuleSchema>;

export const CreateGiftRuleInputSchema = z.object({
  name: z.string().min(1, 'Tên quy tắc không được để trống').max(100),
  characterId: z.string().uuid('ID nhân vật không hợp lệ'),
  animationId: z.string().uuid('ID hoạt ảnh không hợp lệ'),
  triggerGiftId: z.string().nullable().optional().default(null),
  minGiftCount: z.number().int().positive('Số lượng quà tối thiểu phải >= 1').default(1),
  minCoinValue: z.number().int().nonnegative('Giá trị xu phải >= 0').default(0),
  comboTriggerMode: ComboTriggerModeSchema.default('COMBO_MERGE'),
  priority: z.number().int().min(1, 'Priority tối thiểu 1').max(100, 'Priority tối đa 100').default(10),
  interruptPolicy: InterruptPolicySchema.default('QUEUE'),
  cooldownMs: z.number().int().nonnegative().default(0),
  maxQueuePerRule: z.number().int().positive().default(5),
  overlayTextTemplate: z.string().default('{senderName} đã tặng {giftCount}x {giftName}'),
  isEnabled: z.boolean().optional().default(true),
});
export type CreateGiftRuleInput = z.infer<typeof CreateGiftRuleInputSchema>;

export const UpdateGiftRuleInputSchema = CreateGiftRuleInputSchema.partial();
export type UpdateGiftRuleInput = z.infer<typeof UpdateGiftRuleInputSchema>;
