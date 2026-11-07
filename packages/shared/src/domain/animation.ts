import { z } from 'zod';

export const AnimationCategorySchema = z.enum(['IDLE', 'REACTION', 'SPECIAL', 'TRANSITION']);
export type AnimationCategory = z.infer<typeof AnimationCategorySchema>;

export const AnimationLoopModeSchema = z.enum(['ONCE', 'LOOP', 'REPEAT_N']);
export type AnimationLoopMode = z.infer<typeof AnimationLoopModeSchema>;

export const AnimationSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  name: z.string().min(1).max(100),
  clipName: z.string().min(1).max(100),
  category: AnimationCategorySchema.default('REACTION'),
  durationMs: z.number().int().positive(),
  loopMode: AnimationLoopModeSchema.default('ONCE'),
  repeatCount: z.number().int().positive().default(1),
  blendInMs: z.number().int().nonnegative().default(250),
  blendOutMs: z.number().int().nonnegative().default(250),
  soundPath: z.string().nullable(),
  soundVolume: z.number().min(0.0).max(1.0).default(1.0),
  vfxPreset: z.string().nullable(),
  isEnabled: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Animation = z.infer<typeof AnimationSchema>;

export const CreateAnimationInputSchema = z.object({
  characterId: z.string().uuid('ID nhân vật không hợp lệ'),
  name: z.string().min(1, 'Tên hoạt ảnh không được để trống').max(100),
  clipName: z.string().min(1, 'Tên clip GLB không được để trống').max(100),
  category: AnimationCategorySchema.default('REACTION'),
  durationMs: z.number().int().positive('Thời lượng phải lớn hơn 0ms'),
  loopMode: AnimationLoopModeSchema.default('ONCE'),
  repeatCount: z.number().int().positive().default(1),
  blendInMs: z.number().int().nonnegative().default(250),
  blendOutMs: z.number().int().nonnegative().default(250),
  soundPath: z.string().nullable().optional().default(null),
  soundVolume: z.number().min(0.0).max(1.0).default(1.0),
  vfxPreset: z.string().nullable().optional().default(null),
  isEnabled: z.boolean().optional().default(true),
});
export type CreateAnimationInput = z.infer<typeof CreateAnimationInputSchema>;

export const UpdateAnimationInputSchema = CreateAnimationInputSchema.omit({ characterId: true }).partial();
export type UpdateAnimationInput = z.infer<typeof UpdateAnimationInputSchema>;
