import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGES_DATA } from '../data/ages';
import { gameSettings, STORAGE_KEYS } from '../data/settings';
import { GameRenderer } from '../engine/Renderer';
import { Unit } from '../engine/Unit';
import { World } from '../engine/World';

describe('PHẦN 2 & 3: Kiểm thử Cache Settings, Khử localStorage khỏi Render Loop & Validation', () => {
  const mockStorage = new Map<string, string>();
  let getItemSpy: ReturnType<typeof vi.fn>;
  let setItemSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStorage.clear();
    getItemSpy = vi.fn((key: string) => mockStorage.get(key) || null);
    setItemSpy = vi.fn((key: string, val: string) => mockStorage.set(key, val));

    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: getItemSpy,
      setItem: setItemSpy,
      removeItem: vi.fn((key: string) => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
    };

    gameSettings.reloadFromStorage();
    getItemSpy.mockClear();
    setItemSpy.mockClear();
  });

  it('1. Settings được đọc đúng 1 lần từ storage, các lần get sau đọc từ RAM 0 lần I/O', () => {
    mockStorage.set(STORAGE_KEYS.NICKNAME, 'Chiến Thần Toptop');
    mockStorage.set(STORAGE_KEYS.CUSTOM_WEAPON, 'data:image/png;base64,weapon123');

    // Nạp lại 1 lần duy nhất
    gameSettings.reloadFromStorage();
    const initialReadCalls = getItemSpy.mock.calls.length;
    expect(initialReadCalls).toBeGreaterThan(0);

    // Xóa bộ đếm spy
    getItemSpy.mockClear();

    // Gọi liên tục 100 lần các hàm getter
    for (let i = 0; i < 100; i++) {
      expect(gameSettings.getNickname()).toBe('Chiến Thần Toptop');
      expect(gameSettings.getCustomWeapon()).toBe('data:image/png;base64,weapon123');
    }

    // Khẳng định: Hoàn toàn không phát sinh thêm bất kỳ lần đọc storage nào
    expect(getItemSpy).toHaveBeenCalledTimes(0);
  });

  it('2. Vòng lặp render (drawChibiUnitsBatch) chạy 60 khung hình KHÔNG gọi storage', () => {
    gameSettings.setCustomWeapon('data:image/png;base64,testclub');
    getItemSpy.mockClear();
    setItemSpy.mockClear();

    const world = new World(true); // Headless world
    const renderer = new GameRenderer(world);

    // Tạo quân lính Người Vượn Tiền Sử (stone_melee)
    const cavemanConfig = AGES_DATA[1]!.units[0]!;
    const unit = new Unit('test_unit_1', cavemanConfig, 'LEFT', 100, 520);
    world.playerUnits.push(unit);

    // Mô phỏng 60 khung hình render liên tục (tương đương 1 giây ở 60 FPS)
    for (let frame = 0; frame < 60; frame++) {
      (renderer as any).drawChibiUnitsBatch(1.0);
    }

    // Khẳng định: Tuyệt đối không gọi localStorage.getItem hoặc setItem trong lúc render
    expect(getItemSpy).toHaveBeenCalledTimes(0);
    expect(setItemSpy).toHaveBeenCalledTimes(0);

    renderer.destroy();
  });

  it('3. Đổi cài đặt cập nhật ngay lập tức vào in-memory cache mà không cần reload trang', () => {
    const listener = vi.fn();
    const unsub = gameSettings.subscribe(listener);

    gameSettings.setNickname('Đại Tướng Quân');
    expect(gameSettings.getNickname()).toBe('Đại Tướng Quân');
    expect(listener).toHaveBeenCalledWith(STORAGE_KEYS.NICKNAME, 'Đại Tướng Quân', expect.anything());

    const sampleDataUrl = 'data:image/png;base64,newCustomAxe';
    gameSettings.setCustomWeapon(sampleDataUrl);
    expect(gameSettings.getCustomWeapon()).toBe(sampleDataUrl);
    expect(listener).toHaveBeenCalledWith(STORAGE_KEYS.CUSTOM_WEAPON, sampleDataUrl, expect.anything());

    unsub();
  });

  it('4. Lắng nghe sự kiện Storage liên cửa sổ (OBS / Electron) cập nhật ngay bộ nhớ đệm', () => {
    const externalWeapon = 'data:image/png;base64,fromExternalWindow';
    mockStorage.set(STORAGE_KEYS.CUSTOM_WEAPON, externalWeapon);

    (gameSettings as any).handleExternalUpdate(STORAGE_KEYS.CUSTOM_WEAPON, externalWeapon);
    expect(gameSettings.getCustomWeapon()).toBe(externalWeapon);
  });

  it('5. Phòng vệ an toàn khi Storage bị quăng lỗi SecurityError (OBS / Electron sandbox)', () => {
    (globalThis as any).localStorage.getItem = vi.fn(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    (globalThis as any).localStorage.setItem = vi.fn(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    expect(() => gameSettings.reloadFromStorage()).not.toThrow();
    expect(gameSettings.getNickname()).toBe('Chiến Binh');
    expect(gameSettings.getCustomWeapon()).toBeNull();

    expect(() => gameSettings.setNickname('Chiến Binh An Toàn')).not.toThrow();
    expect(gameSettings.getNickname()).toBe('Chiến Binh An Toàn');
  });

  it('6. [4a Validation] Từ chối nạp dữ liệu ngoại vi không hợp lệ từ storage/BroadcastChannel', () => {
    // 1. Data URL độc hại hoặc không đúng định dạng hình ảnh
    gameSettings.setCustomWeapon('data:image/png;base64,validWeapon');
    expect(gameSettings.getCustomWeapon()).toBe('data:image/png;base64,validWeapon');

    // Cửa sổ ngoài gửi chuỗi JavaScript hoặc payload rác
    gameSettings.handleExternalUpdate(STORAGE_KEYS.CUSTOM_WEAPON, 'javascript:alert(1)');
    // Bộ nhớ đệm từ chối và giữ nguyên giá trị hợp lệ trước đó
    expect(gameSettings.getCustomWeapon()).toBe('data:image/png;base64,validWeapon');

    // 2. Grid sai kích thước (ví dụ 10x10 thay vì 32x32)
    const invalidGrid = JSON.stringify([['#000000']]);
    gameSettings.handleExternalUpdate(STORAGE_KEYS.CUSTOM_WEAPON_GRID, invalidGrid);
    expect(gameSettings.getCustomWeaponGrid()).toBeNull();

    // 3. Nickname quá dài (> 32 ký tự) được cắt gọt tự động
    const superLongName = 'Người Chơi Có Tên Siêu Dài Vượt Quá Ba Mươi Hai Ký Tự Trong Trận Đấu';
    gameSettings.handleExternalUpdate(STORAGE_KEYS.NICKNAME, superLongName);
    expect(gameSettings.getNickname().length).toBeLessThanOrEqual(32);
    expect(gameSettings.getNickname()).toBe(superLongName.trim().slice(0, 32));
  });

  it('7. [4b Storage Clear] Xử lý sự kiện storage khi clear (key = null) khôi phục mặc định sạch sẽ', () => {
    gameSettings.setCustomWeapon('data:image/png;base64,existingWeapon');
    gameSettings.setNickname('Chiến Tướng');
    expect(gameSettings.getCustomWeapon()).toBe('data:image/png;base64,existingWeapon');
    expect(gameSettings.getNickname()).toBe('Chiến Tướng');

    // Kích hoạt sự kiện storage clear (tương đương khi người dùng hoặc cửa sổ khác gọi localStorage.clear())
    gameSettings.handleExternalUpdate(null, null);

    // Toàn bộ cài đặt trong RAM tự động hoàn nguyên về mặc định an toàn
    expect(gameSettings.getCustomWeapon()).toBeNull();
    expect(gameSettings.getCustomWeaponGrid()).toBeNull();
    expect(gameSettings.getNickname()).toBe('Chiến Binh');
    expect(gameSettings.getFrameOverridesRaw()).toBeNull();
  });

  it('8. [4c Quota Exceeded] Lỗi hạn mức setItem QuotaExceededError KHÔNG làm hỏng bộ nhớ đệm', () => {
    // Giả lập storage bị tràn hạn mức (QuotaExceededError)
    (globalThis as any).localStorage.setItem = vi.fn(() => {
      const err = new Error('QuotaExceededError: DOMException 22');
      err.name = 'QuotaExceededError';
      throw err;
    });

    const newWeapon = 'data:image/png;base64,validNewWeaponData';
    // Ghi cài đặt: không bị ném exception ra ngoài làm sập app
    expect(() => gameSettings.setCustomWeapon(newWeapon)).not.toThrow();

    // RAM cache vẫn lưu trữ chính xác giá trị mới, không bị biến dạng hay mất mát
    expect(gameSettings.getCustomWeapon()).toBe(newWeapon);
    expect(gameSettings.isStorageAvailable).toBe(false);
  });
});
