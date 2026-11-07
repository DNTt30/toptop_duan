import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface UserDataPaths {
  baseDir: string;
  dataDir: string;
  dbFilePath: string;
  assetsDir: string;
  securityDir: string;
  logsDir: string;
}

export function resolveUserDataPaths(overrideBaseDir?: string): UserDataPaths {
  const configuredDir =
    overrideBaseDir?.trim() ||
    process.env.BUDDHALIVE_USER_DATA_DIR?.trim() ||
    path.join(process.env.APPDATA || os.homedir(), 'BuddhaLiveStudio');

  const baseDir = path.resolve(configuredDir);
  const dataDir = path.join(baseDir, 'data');
  const assetsDir = path.join(baseDir, 'assets');
  const securityDir = path.join(baseDir, 'security');
  const logsDir = path.join(baseDir, 'logs');
  const dbFilePath = path.join(dataDir, 'buddhalive.db');

  for (const dir of [baseDir, dataDir, assetsDir, securityDir, logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    baseDir,
    dataDir,
    dbFilePath,
    assetsDir,
    securityDir,
    logsDir,
  };
}
