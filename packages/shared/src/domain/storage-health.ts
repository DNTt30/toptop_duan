import { z } from 'zod';

export const StorageHealthReportSchema = z
  .object({
    ok: z.boolean(),
    dbFilePath: z.string().min(1),
    journalMode: z.string().min(1),
    foreignKeysEnabled: z.boolean(),
    appliedMigrations: z.array(z.string().min(1)),
    settingsCount: z.number().int().nonnegative(),
    readWriteProbeOk: z.boolean(),
    readWriteProbeValue: z.string().min(1),
    isPackaged: z.boolean(),
    electronVersion: z.string().nullable(),
    nodeVersion: z.string().min(1),
  })
  .strict();

export type StorageHealthReport = z.infer<typeof StorageHealthReportSchema>;
