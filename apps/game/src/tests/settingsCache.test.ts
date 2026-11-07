import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGES_DATA } from '../data/ages';
import { gameSettings, STORAGE_KEYS } from '../data/settings';
import { GameRenderer } from '../engine/Renderer';
import { Unit } from '../engine/Unit';
import { World } from '../engine/World';

describe('PHẦN 2: Kiểm thử Cache Settings & Khử localStorage khỏi Render Loop', () => {
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
    // Giả lập cửa sổ khác (OBS Studio hoặc tab thứ hai) ghi vào storage
    const externalWeapon = 'data:image/png;base64,fromExternalWindow';
    mockStorage.set(STORAGE_KEYS.CUSTOM_WEAPON, externalWeapon);

    // Kích hoạt hàm xử lý sự kiện ngoại vi
    (gameSettings as any).handleExternalUpdate(STORAGE_KEYS.CUSTOM_WEAPON, externalWeapon);

    // In-memory cache cập nhật ngay lập tức mà không cần F5/reload
    expect(gameSettings.getCustomWeapon()).toBe(externalWeapon);
  });

  it('5. Phòng vệ an toàn khi Storage bị quăng lỗi SecurityError (OBS / Electron sandbox)', () => {
    // Giả lập storage bị block hoặc throw Exception
    (globalThis as any).localStorage.getItem = vi.fn(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    (globalThis as any).localStorage.setItem = vi.fn(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });

    // Reload không bị sập (crash)
    expect(() => gameSettings.reloadFromStorage()).not.toThrow();
    // Vẫn trả về giá trị mặc định an toàn
    expect(gameSettings.getNickname()).toBe('Chiến Binh');
    expect(gameSettings.getCustomWeapon()).toBeNull();

    // Ghi cài đặt mới cũng không bị sập app
    expect(() => gameSettings.setNickname('Chiến Binh An Toàn')).not.toThrow();
    expect(gameSettings.getNickname()).toBe('Chiến Binh An Toàn');
  });
});
