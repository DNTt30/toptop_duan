import type {
  AppSetting,
  DemoTriggerGiftResult,
  ManagerStateSnapshot,
  StorageHealthReport,
} from '@buddhalive/shared';
import { contextBridge, ipcRenderer } from 'electron';

export interface RendererVerificationPayload {
  rendererIsolationOk: boolean;
  health: StorageHealthReport;
  updatedFpsJson?: string;
  demoExecutionOk?: boolean;
}

const desktopBridgeApi = {
  // S1 methods
  getStorageHealth: (): Promise<StorageHealthReport> =>
    ipcRenderer.invoke('s1:get-storage-health'),
  updateFpsLimit: (fps: 30 | 60): Promise<AppSetting> =>
    ipcRenderer.invoke('s1:update-fps-limit', fps),
  reportVerificationComplete: (
    payload: RendererVerificationPayload
  ): Promise<void> => ipcRenderer.invoke('s1:verification-complete', payload),
  isAutomatedVerifyMode: (): boolean =>
    process.argv.includes('--bls-s1-verify') ||
    process.argv.includes('--bls-s2-verify'),

  // S2 methods
  getServerInfo: (): Promise<{ overlayUrl: string; port: number }> =>
    ipcRenderer.invoke('s2:get-server-info'),
  getManagerState: (): Promise<ManagerStateSnapshot> =>
    ipcRenderer.invoke('s2:get-manager-state'),
  triggerDemoGift: (params: {
    senderName: string;
    giftCount?: number;
    externalEventId?: string | null;
  }): Promise<DemoTriggerGiftResult> =>
    ipcRenderer.invoke('s2:trigger-demo-gift', params),
  approveOverlayPair: (params: {
    pairingId: string;
    code: string;
  }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('s2:approve-overlay-pair', params),
  revokeOverlaySessions: (): Promise<{ ok: boolean; count: number }> =>
    ipcRenderer.invoke('s2:revoke-overlay-sessions'),
  onManagerStateUpdate: (
    callback: (snapshot: ManagerStateSnapshot) => void
  ): (() => void) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      snapshot: ManagerStateSnapshot
    ) => callback(snapshot);
    ipcRenderer.on('s2:manager-state-update', subscription);
    return () => {
      ipcRenderer.removeListener('s2:manager-state-update', subscription);
    };
  },

  // S4 methods: Multi-Character Management, Animation & Gift Rules
  listCharacters: () => ipcRenderer.invoke('s4:list-characters'),
  createCharacter: (params: any) => ipcRenderer.invoke('s4:create-character', params),
  updateCharacter: (id: string, data: any) => ipcRenderer.invoke('s4:update-character', { id, data }),
  setActiveCharacter: (id: string) => ipcRenderer.invoke('s4:set-active-character', id),
  deleteCharacter: (id: string) => ipcRenderer.invoke('s4:delete-character', id),

  importGlbAsset: (params: { filePath?: string; fileBufferBase64?: string; originalName?: string }) =>
    ipcRenderer.invoke('s4:import-glb-asset', params),
  pickGlbFile: () => ipcRenderer.invoke('s4:pick-glb-file'),
  inspectGlbAsset: (fileName: string) => ipcRenderer.invoke('s4:inspect-glb-asset', fileName),

  listAnimations: (characterId: string) => ipcRenderer.invoke('s4:list-animations', characterId),
  createAnimation: (params: any) => ipcRenderer.invoke('s4:create-animation', params),
  updateAnimation: (id: string, data: any) => ipcRenderer.invoke('s4:update-animation', { id, data }),
  toggleAnimation: (id: string, isEnabled?: boolean) => ipcRenderer.invoke('s4:toggle-animation', { id, isEnabled }),
  deleteAnimation: (id: string) => ipcRenderer.invoke('s4:delete-animation', id),

  listGiftRules: (characterId?: string) => ipcRenderer.invoke('s4:list-gift-rules', characterId),
  createGiftRule: (params: any) => ipcRenderer.invoke('s4:create-gift-rule', params),
  updateGiftRule: (id: string, data: any) => ipcRenderer.invoke('s4:update-gift-rule', { id, data }),
  toggleGiftRule: (id: string, isEnabled?: boolean) => ipcRenderer.invoke('s4:toggle-gift-rule', { id, isEnabled }),
  deleteGiftRule: (id: string) => ipcRenderer.invoke('s4:delete-gift-rule', id),

  // S5 methods: Queue Controls & Demo Scenarios (T-14, T-15)
  queueControl: (params: { action: 'PAUSE' | 'RESUME' | 'SKIP' | 'CLEAR'; reason?: string }) =>
    ipcRenderer.invoke('s5:queue-control', params),
  runDemoScenario: (scenario: string) => ipcRenderer.invoke('s5:run-demo-scenario', scenario),
  stopDemoScenario: () => ipcRenderer.invoke('s5:stop-demo-scenario'),
  getQueueMetrics: () => ipcRenderer.invoke('s5:get-queue-metrics'),

  // S6 methods: Backup, Restore & Diagnostics (T-18)
  createBackup: (params?: { scope?: 'DATABASE_ONLY' | 'FULL_DATA_BUNDLE' }) =>
    ipcRenderer.invoke('s6:create-backup', params),
  pickAndRestoreBackup: () => ipcRenderer.invoke('s6:pick-and-restore-backup'),
  getDiagnostics: () => ipcRenderer.invoke('s6:get-diagnostics'),
  exportDiagnostics: () => ipcRenderer.invoke('s6:export-diagnostics'),

  // S9 methods: Live Provider Configuration & Status (T-30 & T-31)
  getLiveConfig: () => ipcRenderer.invoke('s9:get-live-config'),
  saveLiveConfig: (config: any) => ipcRenderer.invoke('s9:save-live-config', config),
  saveLiveApiKey: (payload: { provider: 'EULERSTREAM'; apiKey: string }) =>
    ipcRenderer.invoke('s9:save-live-api-key', payload),
  clearLiveApiKey: (provider: 'EULERSTREAM') =>
    ipcRenderer.invoke('s9:clear-live-api-key', provider),
  getLiveConnectionSummary: () => ipcRenderer.invoke('s9:get-live-connection-summary'),
  connectLive: () => ipcRenderer.invoke('s9:connect-live'),
  disconnectLive: () => ipcRenderer.invoke('s9:disconnect-live'),
  getLiveDiagnostics: () => ipcRenderer.invoke('s9:get-live-diagnostics'),
  exportLiveDiagnostics: (format?: 'markdown' | 'json') =>
    ipcRenderer.invoke('s9:export-live-diagnostics', format),
  getLiveTraces: () => ipcRenderer.invoke('s9:get-live-traces'),
};

export type DesktopBridgeApi = typeof desktopBridgeApi;

contextBridge.exposeInMainWorld('buddhaDesktop', desktopBridgeApi);
