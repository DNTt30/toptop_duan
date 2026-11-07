/**
 * The Singularity Odyssey — Game Settings & Storage Cache Module
 *
 * Quản lý tập trung toàn bộ cấu hình người dùng (vũ khí tùy biến, tên nhân vật, frame overrides).
 * - Đọc MỘT LẦN duy nhất lúc khởi tạo và lưu vào bộ nhớ RAM (In-Memory Cache).
 * - Tuyệt đối không đọc storage trong vòng lặp render 60 FPS.
 * - An toàn 100% trong môi trường OBS Studio / Electron iframe (bọc try/catch, fallback mặc định).
 * - Đồng bộ thời gian thực giữa các cửa sổ OBS / Electron qua sự kiện 'storage' & BroadcastChannel.
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

class GameSettings {
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
  private isStorageAvailable: boolean = true;

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
      return null;
    }
  }

  /**
   * Ghi an toàn vào localStorage với try/catch phòng vệ
   */
  private safeSetItem(key: string, value: string | null): void {
    if (typeof window === 'undefined') return;
    try {
      this.writeCount++;
      if (value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      this.isStorageAvailable = false;
    }
  }

  /**
   * Tải lại toàn bộ dữ liệu từ Storage vào bộ nhớ RAM (Chỉ chạy khi khởi tạo hoặc khi test yêu cầu)
   */
  public reloadFromStorage(): void {
    const customWeapon = this.safeGetItem(STORAGE_KEYS.CUSTOM_WEAPON);
    const customWeaponGrid = this.safeGetItem(STORAGE_KEYS.CUSTOM_WEAPON_GRID);
    const nickname = this.safeGetItem(STORAGE_KEYS.NICKNAME) || 'Chiến Binh';
    const frameOverridesRaw = this.safeGetItem(STORAGE_KEYS.FRAME_OVERRIDES);

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
        if (!e.key) return;
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
          if (key) {
            this.handleExternalUpdate(key as SettingsKey, value, false);
          }
        };
      }
    } catch {
      this.broadcastChannel = null;
    }
  }

  /**
   * Xử lý cập nhật từ cửa sổ ngoài truyền vào
   */
  private handleExternalUpdate(key: SettingsKey, newValue: string | null, shouldBroadcast: boolean = false): void {
    let changed = false;

    switch (key) {
      case STORAGE_KEYS.CUSTOM_WEAPON:
        if (this.state.customWeapon !== newValue) {
          this.state.customWeapon = newValue;
          changed = true;
        }
        break;
      case STORAGE_KEYS.CUSTOM_WEAPON_GRID:
        if (this.state.customWeaponGrid !== newValue) {
          this.state.customWeaponGrid = newValue;
          changed = true;
        }
        break;
      case STORAGE_KEYS.NICKNAME:
        const validNick = newValue || 'Chiến Binh';
        if (this.state.nickname !== validNick) {
          this.state.nickname = validNick;
          changed = true;
        }
        break;
      case STORAGE_KEYS.FRAME_OVERRIDES:
        if (this.state.frameOverridesRaw !== newValue) {
          this.state.frameOverridesRaw = newValue;
          changed = true;
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
    if (this.state.customWeapon === dataUrl) return;
    this.state.customWeapon = dataUrl;
    this.safeSetItem(STORAGE_KEYS.CUSTOM_WEAPON, dataUrl);
    this.broadcastUpdate(STORAGE_KEYS.CUSTOM_WEAPON, dataUrl);
  }

  public setCustomWeaponGrid(gridJson: string | null): void {
    if (this.state.customWeaponGrid === gridJson) return;
    this.state.customWeaponGrid = gridJson;
    this.safeSetItem(STORAGE_KEYS.CUSTOM_WEAPON_GRID, gridJson);
    this.broadcastUpdate(STORAGE_KEYS.CUSTOM_WEAPON_GRID, gridJson);
  }

  public setNickname(name: string): void {
    const clean = (name || '').trim() || 'Chiến Binh';
    if (this.state.nickname === clean) return;
    this.state.nickname = clean;
    this.safeSetItem(STORAGE_KEYS.NICKNAME, clean);
    this.broadcastUpdate(STORAGE_KEYS.NICKNAME, clean);
  }

  public setFrameOverridesRaw(raw: string | null): void {
    if (this.state.frameOverridesRaw === raw) return;
    this.state.frameOverridesRaw = raw;
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
