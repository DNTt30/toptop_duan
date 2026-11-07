var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
var desktopBridgeApi = {
  // S1 methods
  getStorageHealth: () => import_electron.ipcRenderer.invoke("s1:get-storage-health"),
  updateFpsLimit: (fps) => import_electron.ipcRenderer.invoke("s1:update-fps-limit", fps),
  reportVerificationComplete: (payload) => import_electron.ipcRenderer.invoke("s1:verification-complete", payload),
  isAutomatedVerifyMode: () => process.argv.includes("--bls-s1-verify") || process.argv.includes("--bls-s2-verify"),
  // S2 methods
  getServerInfo: () => import_electron.ipcRenderer.invoke("s2:get-server-info"),
  getManagerState: () => import_electron.ipcRenderer.invoke("s2:get-manager-state"),
  triggerDemoGift: (params) => import_electron.ipcRenderer.invoke("s2:trigger-demo-gift", params),
  approveOverlayPair: (params) => import_electron.ipcRenderer.invoke("s2:approve-overlay-pair", params),
  revokeOverlaySessions: () => import_electron.ipcRenderer.invoke("s2:revoke-overlay-sessions"),
  onManagerStateUpdate: (callback) => {
    const subscription = (_event, snapshot) => callback(snapshot);
    import_electron.ipcRenderer.on("s2:manager-state-update", subscription);
    return () => {
      import_electron.ipcRenderer.removeListener("s2:manager-state-update", subscription);
    };
  },
  // S4 methods: Multi-Character Management, Animation & Gift Rules
  listCharacters: () => import_electron.ipcRenderer.invoke("s4:list-characters"),
  createCharacter: (params) => import_electron.ipcRenderer.invoke("s4:create-character", params),
  updateCharacter: (id, data) => import_electron.ipcRenderer.invoke("s4:update-character", { id, data }),
  setActiveCharacter: (id) => import_electron.ipcRenderer.invoke("s4:set-active-character", id),
  deleteCharacter: (id) => import_electron.ipcRenderer.invoke("s4:delete-character", id),
  importGlbAsset: (params) => import_electron.ipcRenderer.invoke("s4:import-glb-asset", params),
  pickGlbFile: () => import_electron.ipcRenderer.invoke("s4:pick-glb-file"),
  inspectGlbAsset: (fileName) => import_electron.ipcRenderer.invoke("s4:inspect-glb-asset", fileName),
  listAnimations: (characterId) => import_electron.ipcRenderer.invoke("s4:list-animations", characterId),
  createAnimation: (params) => import_electron.ipcRenderer.invoke("s4:create-animation", params),
  updateAnimation: (id, data) => import_electron.ipcRenderer.invoke("s4:update-animation", { id, data }),
  toggleAnimation: (id, isEnabled) => import_electron.ipcRenderer.invoke("s4:toggle-animation", { id, isEnabled }),
  deleteAnimation: (id) => import_electron.ipcRenderer.invoke("s4:delete-animation", id),
  listGiftRules: (characterId) => import_electron.ipcRenderer.invoke("s4:list-gift-rules", characterId),
  createGiftRule: (params) => import_electron.ipcRenderer.invoke("s4:create-gift-rule", params),
  updateGiftRule: (id, data) => import_electron.ipcRenderer.invoke("s4:update-gift-rule", { id, data }),
  toggleGiftRule: (id, isEnabled) => import_electron.ipcRenderer.invoke("s4:toggle-gift-rule", { id, isEnabled }),
  deleteGiftRule: (id) => import_electron.ipcRenderer.invoke("s4:delete-gift-rule", id),
  // S5 methods: Queue Controls & Demo Scenarios (T-14, T-15)
  queueControl: (params) => import_electron.ipcRenderer.invoke("s5:queue-control", params),
  runDemoScenario: (scenario) => import_electron.ipcRenderer.invoke("s5:run-demo-scenario", scenario),
  stopDemoScenario: () => import_electron.ipcRenderer.invoke("s5:stop-demo-scenario"),
  getQueueMetrics: () => import_electron.ipcRenderer.invoke("s5:get-queue-metrics"),
  // S6 methods: Backup, Restore & Diagnostics (T-18)
  createBackup: (params) => import_electron.ipcRenderer.invoke("s6:create-backup", params),
  pickAndRestoreBackup: () => import_electron.ipcRenderer.invoke("s6:pick-and-restore-backup"),
  getDiagnostics: () => import_electron.ipcRenderer.invoke("s6:get-diagnostics"),
  exportDiagnostics: () => import_electron.ipcRenderer.invoke("s6:export-diagnostics"),
  // S9 methods: Live Provider Configuration & Status (T-30 & T-31)
  getLiveConfig: () => import_electron.ipcRenderer.invoke("s9:get-live-config"),
  saveLiveConfig: (config) => import_electron.ipcRenderer.invoke("s9:save-live-config", config),
  saveLiveApiKey: (payload) => import_electron.ipcRenderer.invoke("s9:save-live-api-key", payload),
  clearLiveApiKey: (provider) => import_electron.ipcRenderer.invoke("s9:clear-live-api-key", provider),
  getLiveConnectionSummary: () => import_electron.ipcRenderer.invoke("s9:get-live-connection-summary"),
  connectLive: () => import_electron.ipcRenderer.invoke("s9:connect-live"),
  disconnectLive: () => import_electron.ipcRenderer.invoke("s9:disconnect-live"),
  getLiveDiagnostics: () => import_electron.ipcRenderer.invoke("s9:get-live-diagnostics"),
  exportLiveDiagnostics: (format) => import_electron.ipcRenderer.invoke("s9:export-live-diagnostics", format),
  getLiveTraces: () => import_electron.ipcRenderer.invoke("s9:get-live-traces")
};
import_electron.contextBridge.exposeInMainWorld("buddhaDesktop", desktopBridgeApi);
//# sourceMappingURL=preload.cjs.map
