/**
 * The Singularity Odyssey — Game Settings & Storage Cache Module
 *
 * Quản lý tập trung toàn bộ cấu hình người dùng (vũ khí tùy biến, tên nhân vật, frame overrides).
 * - Đọc MỘT LẦN duy nhất lúc khởi tạo và lưu vào bộ nhớ RAM (In-Memory Cache).
 * - Tuyệt đối không đọc storage trong vòng lặp render 60 FPS.
 * - An toàn 100% trong môi trường OBS Studio / Electron iframe (bọc try/catch, fallback mặc định).
 * - Đồng bộ thời gian thực giữa các cửa sổ OBS / Electron qua sự kiện 'storage' & BroadcastChannel.
 * - Kiểm duyệt xác thực dữ liệu ngoại vi (Data Validation & Sanitization).
 */

export const STORAGE_KEYS = {
  CUSTOM_WEAPON: 'custom_weapon_stone_melee',
  CUSTOM_WEAPON_GRID: 'custom_weapon_grid_stone_melee',
  NICKNAME: 'singularity_nickname',
  FRAME_OVERRIDES: 'singularity_sprite_frame_overrides_v1',
} as const;

export type SettingsKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface SettingsState {
  customWeapon: string | null;
  customWeaponGrid: string | null;
  nickname: string;
  frameOverridesRaw: string | null;
}

export type SettingsListener = (key: SettingsKey, value: any, state: SettingsState) => void;

// ==========================================
// BỘ KIỂM TRA HỢP LỆ (DATA VALIDATORS)
// ==========================================

export function validateCustomWeaponDataUrl(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val !== 'string') return false;
  if (val.length > 1_500_000) return false; // Không vượt quá 1.5MB
  return val.startsWith('data:image/');
}

export function validateWeaponGridJson(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val !== 'string') return false;
  if (val.length > 250_000) return false;
  try {
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed) || parsed.length !== 32) return false;
    for (let r = 0; r < 32; r++) {
      const row = parsed[r];
      if (!Array.isArray(row) || row.length !== 32) return false;
      for (let c = 0; c < 32; c++) {
        const cell = row[c];
        if (typeof cell !== 'string') return false;
        if (cell !== '' && !/^#[0-9a-fA-F]{3,8}$/.test(cell)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function validateNickname(val: unknown): string {
  if (typeof val !== 'string') return 'Chiến Binh';
  const clean = val.trim().slice(0, 32);
  return clean || 'Chiến Binh';
}

export function validateFrameOverridesJson(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val !== 'string') return false;
  try {
    const parsed = JSON.parse(val);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export class GameSettings {
  private state: SettingsState = {
    customWeapon: null,
    customWeaponGrid: null,
    nickname: 'Chiến Binh',
    frameOverridesRaw: null,
  };

  private listeners: Set<SettingsListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  public readCount: number = 0;
  public writeCount: number = 0;
  public isStorageAvailable: boolean = true;
  public lastStorageError: Error | null = null;

  constructor() {
    this.reloadFromStorage();
    this.initCrossWindowSync();
  }

  /**
   * Đọc an toàn từ localStorage với try/catch phòng vệ
   */
  private safeGetItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      this.readCount++;
      return window.localStorage.getItem(key);
    } catch (e) {
      this.isStorageAvailable = false;
      this.lastStorageError = e instanceof Error ? e : new Error(String(e));
      return null;
    }
  }

  /**
   * Ghi an toàn vào localStorage với try/catch phòng vệ (kể cả khi QuotaExceededError)
   */
  public safeSetItem(key: string, value: string | null): boolean {
    if (typeof window === 'undefined') return false;
    try {
      this.writeCount++;
      if (value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
      return true;
    } catch (e) {
      this.isStorageAvailable = false;
      this.lastStorageError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[GameSettings] Không thể ghi '${key}' vào storage:`, e);
      return false;
    }
  }

  /**
   * Tải lại toàn bộ dữ liệu từ Storage vào bộ nhớ RAM
   */
  public reloadFromStorage(): void {
    const rawWeapon = this.safeGetItem(STORAGE_KEYS.CUSTOM_WEAPON);
    const customWeapon = validateCustomWeaponDataUrl(rawWeapon) ? rawWeapon : null;

    const rawGrid = this.safeGetItem(STORAGE_KEYS.CUSTOM_WEAPON_GRID);
    const customWeaponGrid = validateWeaponGridJson(rawGrid) ? rawGrid : null;

    const rawNick = this.safeGetItem(STORAGE_KEYS.NICKNAME);
    const nickname = validateNickname(rawNick);

    const rawOverrides = this.safeGetItem(STORAGE_KEYS.FRAME_OVERRIDES);
    const frameOverridesRaw = validateFrameOverridesJson(rawOverrides) ? rawOverrides : null;

    this.state = {
      customWeapon,
      customWeaponGrid,
      nickname,
      frameOverridesRaw,
    };
  }

  /**
   * Thiết lập đồng bộ liên cửa sổ (Cross-Window Sync) cho Electron / OBS Studio
   */
  private initCrossWindowSync(): void {
    if (typeof window === 'undefined') return;

    // 1. Lắng nghe sự kiện Storage chuẩn của trình duyệt
    try {
      window.addEventListener('storage', (e: StorageEvent) => {
        // (b) Xử lý sự kiện storage khi clear (key === null hoặc rỗng)
        if (e.key === null || e.key === '') {
          this.handleExternalUpdate(null, null);
          return;
        }
        this.handleExternalUpdate(e.key as SettingsKey, e.newValue);
      });
    } catch {
      // Bỏ qua nếu môi trường không hỗ trợ addEventListener
    }

    // 2. Kênh BroadcastChannel nội bộ đồng bộ tức thì không cần reload
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('singularity_settings_sync');
        this.broadcastChannel.onmessage = (event: MessageEvent) => {
          const { key, value } = event.data || {};
          if (key === null || key === undefined || key === '__CLEAR__') {
            this.handleExternalUpdate(null, null, false);
          } else if (key) {
            this.handleExternalUpdate(key as SettingsKey, value, false);
          }
        };
      }
    } catch {
      this.broadcastChannel = null;
    }
  }

  /**
   * Xử lý cập nhật từ cửa sổ ngoài truyền vào với kiểm tra hợp lệ
   */
  public handleExternalUpdate(key: SettingsKey | null, newValue: string | null, shouldBroadcast: boolean = false): void {
    // (b) Xử lý trường hợp key === null (clear storage toàn cục)
    if (key === null) {
      this.state = {
        customWeapon: null,
        customWeaponGrid: null,
        nickname: 'Chiến Binh',
        frameOverridesRaw: null,
      };
      this.notifyListeners(STORAGE_KEYS.CUSTOM_WEAPON, null);
      this.notifyListeners(STORAGE_KEYS.CUSTOM_WEAPON_GRID, null);
      this.notifyListeners(STORAGE_KEYS.NICKNAME, 'Chiến Binh');
      this.notifyListeners(STORAGE_KEYS.FRAME_OVERRIDES, null);
      return;
    }

    let changed = false;

    // (a) Kiểm tra tính hợp lệ của từng loại dữ liệu trước khi nạp
    switch (key) {
      case STORAGE_KEYS.CUSTOM_WEAPON:
        if (validateCustomWeaponDataUrl(newValue)) {
          if (this.state.customWeapon !== newValue) {
            this.state.customWeapon = newValue;
            changed = true;
          }
        } else {
          console.warn('[GameSettings] Từ chối nạp customWeapon không hợp lệ:', newValue);
        }
        break;

      case STORAGE_KEYS.CUSTOM_WEAPON_GRID:
        if (validateWeaponGridJson(newValue)) {
          if (this.state.customWeaponGrid !== newValue) {
            this.state.customWeaponGrid = newValue;
            changed = true;
          }
        } else {
          console.warn('[GameSettings] Từ chối nạp weaponGrid JSON không hợp lệ');
        }
        break;

      case STORAGE_KEYS.NICKNAME:
        const validNick = validateNickname(newValue);
        if (this.state.nickname !== validNick) {
          this.state.nickname = validNick;
          changed = true;
        }
        break;

      case STORAGE_KEYS.FRAME_OVERRIDES:
        if (validateFrameOverridesJson(newValue)) {
          if (this.state.frameOverridesRaw !== newValue) {
            this.state.frameOverridesRaw = newValue;
            changed = true;
          }
        } else {
          console.warn('[GameSettings] Từ chối nạp frameOverrides JSON không hợp lệ');
        }
        break;
    }

    if (changed) {
      this.notifyListeners(key, newValue);
      if (shouldBroadcast && this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage({ key, value: newValue });
        } catch {
          // ignore
        }
      }
    }
  }

  private notifyListeners(key: SettingsKey, value: any): void {
    for (const listener of this.listeners) {
      try {
        listener(key, value, { ...this.state });
      } catch (e) {
        console.error('[GameSettings] Lỗi listener:', e);
      }
    }
  }

  /**
   * Đăng ký lắng nghe thay đổi cài đặt
   */
  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ==========================================
  // GETTERS (Truy cập 100% trong RAM, 0 Storage I/O)
  // ==========================================

  public getCustomWeapon(): string | null {
    return this.state.customWeapon;
  }

  public getCustomWeaponGrid(): string | null {
    return this.state.customWeaponGrid;
  }

  public getNickname(): string {
    return this.state.nickname;
  }

  public getFrameOverridesRaw(): string | null {
    return this.state.frameOverridesRaw;
  }

  // ==========================================
  // SETTERS (Cập nhật RAM + ghi Storage an toàn)
  // ==========================================

  public setCustomWeapon(dataUrl: string | null): void {
    if (!validateCustomWeaponDataUrl(dataUrl)) {
      console.warn('[GameSettings] Data URL không hợp lệ:', dataUrl);
      return;
    }
    if (this.state.customWeapon === dataUrl) return;
    this.state.customWeapon = dataUrl;
    // (c) Lỗi hạn mức storage không làm hỏng RAM cache
    this.safeSetItem(STORAGE_KEYS.CUSTOM_WEAPON, dataUrl);
    this.broadcastUpdate(STORAGE_KEYS.CUSTOM_WEAPON, dataUrl);
  }

  public setCustomWeaponGrid(gridJson: string | null): void {
    if (!validateWeaponGridJson(gridJson)) {
      console.warn('[GameSettings] Grid JSON không hợp lệ:', gridJson);
      return;
    }
    if (this.state.customWeaponGrid === gridJson) return;
    this.state.customWeaponGrid = gridJson;
    // (c) Lỗi hạn mức storage không làm hỏng RAM cache
    this.safeSetItem(STORAGE_KEYS.CUSTOM_WEAPON_GRID, gridJson);
    this.broadcastUpdate(STORAGE_KEYS.CUSTOM_WEAPON_GRID, gridJson);
  }

  public setNickname(name: string): void {
    const clean = validateNickname(name);
    if (this.state.nickname === clean) return;
    this.state.nickname = clean;
    // (c) Lỗi hạn mức storage không làm hỏng RAM cache
    this.safeSetItem(STORAGE_KEYS.NICKNAME, clean);
    this.broadcastUpdate(STORAGE_KEYS.NICKNAME, clean);
  }

  public setFrameOverridesRaw(raw: string | null): void {
    if (!validateFrameOverridesJson(raw)) {
      console.warn('[GameSettings] Frame overrides JSON không hợp lệ:', raw);
      return;
    }
    if (this.state.frameOverridesRaw === raw) return;
    this.state.frameOverridesRaw = raw;
    // (c) Lỗi hạn mức storage không làm hỏng RAM cache
    this.safeSetItem(STORAGE_KEYS.FRAME_OVERRIDES, raw);
    this.broadcastUpdate(STORAGE_KEYS.FRAME_OVERRIDES, raw);
  }

  private broadcastUpdate(key: SettingsKey, value: string | null): void {
    this.notifyListeners(key, value);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ key, value });
      } catch {
        // ignore
      }
    }
  }

  public destroy(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // ignore
      }
      this.broadcastChannel = null;
    }
    this.listeners.clear();
  }
}

export const gameSettings = new GameSettings();
