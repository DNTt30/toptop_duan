import { z } from 'zod';

export const CharacterVisibilityModeSchema = z.enum(['APPEAR_ON_EVENT', 'PERSISTENT_IDLE']);
export type CharacterVisibilityMode = z.infer<typeof CharacterVisibilityModeSchema>;

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().nullable(),
  modelPath: z.string().min(1),
  thumbnailPath: z.string().nullable(),
  visibilityMode: CharacterVisibilityModeSchema.default('APPEAR_ON_EVENT'),
  scale: z.number().positive().default(1.0),
  positionJson: z.string().default('{"x":0,"y":0,"z":0}'),
  rotationJson: z.string().default('{"x":0,"y":0,"z":0}'),
  defaultIdleAnimationId: z.string().nullable(),
  isActive: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CreateCharacterInputSchema = z.object({
  name: z.string().min(1, 'Tên nhân vật không được để trống').max(100),
  slug: z.string().min(1, 'Slug không được để trống').max(100).regex(/^[a-z0-9_-]+$/, 'Slug chỉ chứa chữ thường, số, gạch nối hoặc gạch dưới'),
  description: z.string().nullable().optional().default(null),
  modelPath: z.string().min(1, 'Đường dẫn mô hình 3D không được để trống'),
  thumbnailPath: z.string().nullable().optional().default(null),
  visibilityMode: CharacterVisibilityModeSchema.default('APPEAR_ON_EVENT'),
  scale: z.number().positive('Scale phải lớn hơn 0').default(1.0),
  positionJson: z.string().default('{"x":0,"y":0,"z":0}'),
  rotationJson: z.string().default('{"x":0,"y":0,"z":0}'),
  defaultIdleAnimationId: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(false),
});
export type CreateCharacterInput = z.infer<typeof CreateCharacterInputSchema>;

export const UpdateCharacterInputSchema = CreateCharacterInputSchema.partial();
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterInputSchema>;
