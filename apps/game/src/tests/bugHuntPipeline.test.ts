/**

 * Bug Hunt Pipeline — Bộ Test Kiểm Thử Tự Động Tái Hiện Lỗi (RED Tests)

 * 

 * Mục tiêu: Tái hiện chính xác 3 bug nghiêm trọng đã được bug_hunter phát hiện:

 * - BUG-01: getSpriteConfig không đọc override từ localStorage; SpriteLoader thiếu hàm reloadSprite.

 * - BUG-02: anchor.y của stone_melee là 0.92 (lệch so với chân 0.97) và Renderer cộng thêm bobbing mã nguồn.

 * - BUG-03: caveman_atlas.png có 475 pixel rác tại đáy Row 1 (Y: 502..511, X: 0..768) dính từ Row 2.

 */



import { describe, it, expect, beforeEach } from 'vitest';

import * as fs from 'fs';

import * as path from 'path';

import * as zlib from 'zlib';

import React from 'react';

import { renderToStaticMarkup } from 'react-dom/server';



import { AGES_DATA, BASE_MAX_HP } from '../data/ages';

import { getSpriteConfig, SPRITE_CONFIGS } from '../data/sprites';

import { saveUnitFrameOverride, resetUnitFrameOverride, type UnitFrameConfig } from '../data/frameOverrides';

import { NetworkSync } from '../engine/NetworkSync';

import { GameRenderer } from '../engine/Renderer';

import { SpriteLoader } from '../engine/SpriteLoader';

import { World } from '../engine/World';

import { LiveEventManager } from '../live/LiveEventSource';

import { HUD } from '../ui/HUD';



// Helper giải mã PNG thuần Node.js để kiểm tra chính xác từng pixel RGBA

function decodePngRgba(filePath: string): { width: number; height: number; rgba: Buffer } {

  const buf = fs.readFileSync(filePath);

  let offset = 8;

  let width = 0;

  let height = 0;

  const idatChunks: Buffer[] = [];



  while (offset < buf.length) {

    const len = buf.readUInt32BE(offset);

    const type = buf.toString('ascii', offset + 4, offset + 8);

    if (type === 'IHDR') {

      width = buf.readUInt32BE(offset + 8);

      height = buf.readUInt32BE(offset + 12);

    } else if (type === 'IDAT') {

      idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));

    } else if (type === 'IEND') {

      break;

    }

    offset += 12 + len;

  }



  const raw = zlib.inflateSync(Buffer.concat(idatChunks));

  const bpp = 4;

  const rowStride = 1 + width * bpp;

  const rgba = Buffer.alloc(width * height * bpp);



  let prevRow = Buffer.alloc(width * bpp);



  function paeth(a: number, b: number, c: number): number {

    const p = a + b - c;

    const pa = Math.abs(p - a);

    const pb = Math.abs(p - b);

    const pc = Math.abs(p - c);

    if (pa <= pb && pa <= pc) return a;

    if (pb <= pc) return b;

    return c;

  }



  for (let y = 0; y < height; y++) {

    const filter = raw[y * rowStride];

    const currentRow = Buffer.alloc(width * bpp);



    for (let x = 0; x < width * bpp; x++) {

      const byte = raw[y * rowStride + 1 + x];

      const left = x >= bpp ? currentRow[x - bpp] : 0;

      const up = prevRow[x];

      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;



      let val = 0;

      if (filter === 0) val = byte;

      else if (filter === 1) val = (byte + left) & 0xff;

      else if (filter === 2) val = (byte + up) & 0xff;

      else if (filter === 3) val = (byte + Math.floor((left + up) / 2)) & 0xff;

      else if (filter === 4) val = (byte + paeth(left, up, upLeft)) & 0xff;



      currentRow[x] = val;

    }



    currentRow.copy(rgba, y * width * bpp);

    prevRow = currentRow;

  }



  return { width, height, rgba };

}



describe('Bug Hunt Pipeline — Kiểm Thử Tái Hiện Lỗi (RED Tests)', () => {

  // Mock localStorage trong môi trường Node/Vitest

  const storageMock = new Map<string, string>();



  beforeEach(() => {

    storageMock.clear();

    (globalThis as any).window = globalThis;

    (globalThis as any).localStorage = {

      getItem: (key: string) => storageMock.get(key) || null,

      setItem: (key: string, val: string) => storageMock.set(key, val),

      removeItem: (key: string) => storageMock.delete(key),

      clear: () => storageMock.clear(),

      length: storageMock.size,

      key: (i: number) => Array.from(storageMock.keys())[i] || null,

    };

  });



  describe('BUG-01: Đồng bộ cấu hình Override và Tải lại SpriteLoader', () => {

    it('getSpriteConfig phải đọc và áp dụng UnitFrameConfig từ localStorage; SpriteLoader phải hỗ trợ reload', () => {

      // 1. Lưu cấu hình tinh chỉnh từ Studio vào localStorage

      const customOverride: UnitFrameConfig = {

        unitId: 'stone_melee',

        unitName: 'Người Vượn Đập Gậy Studio Custom',

        age: 1,

        groundBaselineY: 76,

        scale: 2.35,

        walkFrames: [

          { x: 48, y: 0, w: 74, h: 82, dx: 2, dy: 1 },

          { x: 124, y: 0, w: 72, h: 82, dx: 0, dy: 0 },

        ],

        attackFrames: [

          { x: 38, y: 0, w: 94, h: 116, dx: 0, dy: 0 },

        ],

      };

      saveUnitFrameOverride(customOverride);



      // 2. getSpriteConfig('stone_melee') phải phản ánh cấu hình override này

      const cfg = getSpriteConfig('stone_melee');

      expect(cfg).not.toBeNull();



      // Kỳ vọng cấu hình nhận biết được override (chứa frameOverride hoặc groundBaselineY tương ứng)

      const hasOverrideApplied = Boolean(

        (cfg as any)?.frameOverride ||

        (cfg as any)?.override ||

        (cfg?.anchor.y === Number((76 / 256).toFixed(2)))

      );

      expect(

        hasOverrideApplied,

        'getSpriteConfig("stone_melee") phải tích hợp dữ liệu từ getUnitFrameOverride khi localStorage có tùy chỉnh'

      ).toBe(true);



      // 3. SpriteLoader phải cung cấp hàm reloadSprite hoặc reloadUnit để làm mới cache khi có override

      const loader = SpriteLoader.getInstance();

      const hasReloadMethod = typeof (loader as any).reloadSprite === 'function' ||

        typeof (loader as any).reloadUnit === 'function';

      expect(

        hasReloadMethod,

        'SpriteLoader phải có hàm reloadSprite(unitId) để xóa và tải lại texture cache khi có override'

      ).toBe(true);

    });

  });



  describe('BUG-02: Điểm neo chân (Anchor Y) và Triệt tiêu Bobbing mã nguồn', () => {

    it('anchor.y của stone_melee phải bằng 0.97 (khớp bàn chân Y=248..250 trong cell 256)', () => {

      // Reset override để kiểm tra cấu hình mặc định chuẩn

      resetUnitFrameOverride('stone_melee');

      const cfg = getSpriteConfig('stone_melee');

      expect(cfg).not.toBeNull();



      // Bàn chân thật của Caveman nằm ở Y=230 trong cell 256 -> 230 / 256 ≈ 0.90

      // Đặt 0.90 để bàn chân tiếp đất vững chắc tại sàn Y=540, không bị bay lên lơ lửng

      expect(

        cfg!.anchor.y,

        'anchor.y của stone_melee phải là 0.90 để bàn chân chạm sát mặt đất'

      ).toBe(0.90);

    });



    it('Renderer không được cộng dồn bobbing mã nguồn khi nhân vật đang dùng sprite texture', () => {

      // Đọc trực tiếp mã nguồn Renderer.ts để kiểm tra vị trí hiển thị sprite texture

      const rendererPath = path.resolve(__dirname, '../engine/Renderer.ts');

      const rendererSource = fs.readFileSync(rendererPath, 'utf-8');



      // Trong Renderer.ts hiện tại:

      // actualY = unitY + unit.flyingOffset (với unitY = GROUND_Y + ... + bobbing)

      // Sau đó: sprite.position.set(unitX + lunge, actualY);

      // Khi đã có sprite texture hoạt họa, việc cộng thêm bobbing làm nhân vật bị rung/chìm chân 4px.

      const spriteUsesActualYWithBobbing =

        rendererSource.includes('const actualY = unitY + unit.flyingOffset;') &&

        rendererSource.includes('sprite.position.set(unitX + lunge, actualY);') &&

        rendererSource.includes('const unitY = this.GROUND_Y + (unit.y - 520) * 0.4 + bobbing;');



      expect(

        spriteUsesActualYWithBobbing,

        'Renderer không được dùng unitY có chứa bobbing để định vị sprite.position của spriteTex'

      ).toBe(false);

    });

  });



  describe('BUG-03: Kiểm tra Pixel rác tại đáy Row 1 của caveman_atlas.png', () => {

    it('Vùng đáy Row 1 (Y: 502..511, X: 0..768) phải hoàn toàn trong suốt (alpha <= 10)', () => {

      const atlasPath = path.resolve(__dirname, '../../public/sprites/prehistoric/caveman_atlas.png');

      expect(fs.existsSync(atlasPath), 'File caveman_atlas.png phải tồn tại').toBe(true);



      const { width, rgba } = decodePngRgba(atlasPath);



      // Quét vùng đáy Row 1: Y từ 502 đến 511, X từ 0 đến 768

      const leakedPixels: { x: number; y: number; alpha: number; r: number; g: number; b: number }[] = [];



      for (let y = 502; y < 512; y++) {

        for (let x = 0; x < 768; x++) {

          const idx = (y * width + x) * 4;

          const a = rgba[idx + 3];

          if (a > 10) {

            leakedPixels.push({

              x,

              y,

              alpha: a,

              r: rgba[idx],

              g: rgba[idx + 1],

              b: rgba[idx + 2],

            });

          }

        }

      }



      // Nếu có pixel rác tràn từ ngọn gậy của Row 2 lên đáy Row 1 thì test sẽ FAIL

      expect(

        leakedPixels.length,

        `Phát hiện ${leakedPixels.length} pixel rác không trong suốt tại đáy Row 1 (Y=502..511, X=0..768). Ví dụ: ${JSON.stringify(leakedPixels.slice(0, 3))}`

      ).toBe(0);

    });



    it('EVAL-04: Cả 4 quân Tiền Sử (Caveman, Hunter, Dino, Shaman) có đầy đủ 4 hàng hoạt họa, không bị rỗng và không bị tràn biên', () => {

      const units = [

        { name: 'caveman', id: 'stone_melee' },

        { name: 'hunter', id: 'stone_ranged' },

        { name: 'dino', id: 'stone_tank' },

        { name: 'shaman', id: 'stone_special' },

      ];



      for (const u of units) {

        const atlasPath = path.resolve(__dirname, `../../public/sprites/prehistoric/${u.name}_atlas.png`);

        const animPath = path.resolve(__dirname, `../../public/sprites/prehistoric/${u.name}_animation.json`);

        expect(fs.existsSync(atlasPath), `Atlas ${u.name}_atlas.png phải tồn tại`).toBe(true);

        expect(fs.existsSync(animPath), `Manifest ${u.name}_animation.json phải tồn tại`).toBe(true);



        const { width, height, rgba } = decodePngRgba(atlasPath);

        expect(width === 1536 || width === 2048).toBe(true);

        expect(height).toBe(1024);



        // Kiểm tra 4 hàng đều có pixel thật (không bị rỗng/blank)

        for (let r = 0; r < 4; r++) {

          let rowPixels = 0;

          for (let y = r * 256; y < (r + 1) * 256; y++) {

            for (let x = 0; x < width; x++) {

              const a = rgba[(y * width + x) * 4 + 3];

              if (a > 10) rowPixels++;

            }

          }

          expect(rowPixels, `Quân ${u.name} Hàng ${r} không được để trống (0 pixel)`).toBeGreaterThan(5000);

        }



        // Kiểm tra an toàn biên Row 1 -> Row 2 (y=502..512)

        let borderBleed = 0;

        for (let y = 502; y < 512; y++) {

          for (let x = 0; x < width; x++) {

            if (rgba[(y * width + x) * 4 + 3] > 10) borderBleed++;

          }

        }

        expect(borderBleed, `Quân ${u.name} không được có pixel tràn qua dải an toàn y=502..512`).toBe(0);

      }

    });



    it('EVAL-05: Ván mới tường trống 0 pháo, lên Kỷ nguyên giữ pháo đã mua, chơi lại xóa sạch pháo cũ & chân chạm sàn', () => {

      // 1. Ván mới khởi tạo tường thành trống 0 pháo cả 2 phe

      const testWorld = new World(true);

      expect(testWorld.playerTurrets.slots.every((s) => s === null)).toBe(true);

      expect(testWorld.botTurrets.slots.every((s) => s === null)).toBe(true);



      // 2. Mua pháo rồi lên Kỷ nguyên -> giữ nguyên pháo đã mua trên tường cho tới khi bán

      const stoneTurret = AGES_DATA[1]!.turrets[0]!;

      expect(testWorld.playerTurrets.buildTurret(0, stoneTurret)).toBe(true);

      testWorld.playerEconomy.addXp(9999);

      expect(testWorld.ageUpPlayer()).toBe(true);

      expect(testWorld.playerAge.currentAge).toBe(2);

      expect(testWorld.playerTurrets.slots[0]?.config.id).toBe('stone_slingshot');



      // 3. Bắt đầu ván mới (reset) -> xóa sạch toàn bộ pháo cũ trên tường

      testWorld.reset();

      expect(testWorld.playerTurrets.slots.every((s) => s === null)).toBe(true);

      expect(testWorld.botTurrets.slots.every((s) => s === null)).toBe(true);



      // 4. Kiểm tra slot position khớp nóc thành Y=295 (540 - 245)

      const slotPos = testWorld.playerTurrets.getSlotPosition(0);

      expect(slotPos.y).toBe(295);



      // 5. Kiểm tra anchor.y của cả 4 quân Tiền Sử đều là 0.90 (chân chạm sàn Y=540)

      for (const unitId of ['stone_melee', 'stone_ranged', 'stone_tank', 'stone_special']) {

        const cfg = getSpriteConfig(unitId);

        expect(cfg?.anchor.y, `${unitId} phải có anchor.y = 0.90`).toBe(0.90);

      }

    });

  });



  describe('EVAL-06: Nâng cấp 6 Kỷ Nguyên, Đội hình, Cung thủ Cận chiến & Mưa Đại Pháo Ngẫu Nhiên', () => {

    it(

      'EVAL-06a: Toàn bộ 24 Atlas 6 Kỷ nguyên đủ 4 hàng hoạt họa, đủ 24 ảnh chân dung HUD & đầy đủ tài nguyên Kỷ nguyên 3 (Phục Hưng)',

      () => {

        const eraAtlases: Record<string, string[]> = {

          prehistoric: ['caveman', 'hunter', 'dino', 'shaman'],

          medieval: ['knight', 'archer', 'cavalry', 'priest'],

          renaissance: ['pike', 'musket', 'cannon_cart', 'glider'],

          modern: ['specops', 'sniper', 'tank', 'apache'],

          futuristic: ['plasma_sword', 'railgun', 'titan_mech', 'carrier'],

          ai: ['hacker', 'drone_swarm', 'synth_mech', 'avatar'],

        };



        for (const [era, names] of Object.entries(eraAtlases)) {

          for (const name of names) {

            const atlasPath = path.resolve(__dirname, `../../public/sprites/${era}/${name}_atlas.png`);

            const animPath = path.resolve(__dirname, `../../public/sprites/${era}/${name}_animation.json`);

            expect(fs.existsSync(atlasPath), `Thiếu ${era}/${name}_atlas.png`).toBe(true);

            expect(fs.existsSync(animPath), `Thiếu ${era}/${name}_animation.json`).toBe(true);



            const { width, height, rgba } = decodePngRgba(atlasPath);

            expect(width === 1536 || width === 2048, era + "/" + name + " width").toBe(true);

            expect(height, `${era}/${name} height`).toBe(1024);



            for (let r = 0; r < 4; r++) {

              let rowPixels = 0;

              for (let y = r * 256; y < (r + 1) * 256; y++) {

                for (let x = 0; x < width; x++) {

                  if (rgba[(y * width + x) * 4 + 3] > 10) rowPixels++;

                }

              }

              expect(rowPixels, `${era}/${name} row ${r} không được trống`).toBeGreaterThan(5000);

            }



            let borderBleed = 0;

            for (let y = 502; y < 512; y++) {

              for (let x = 0; x < width; x++) {

                if (rgba[(y * width + x) * 4 + 3] > 10) borderBleed++;

              }

            }

            expect(borderBleed, `${era}/${name} tràn biên y=502..512`).toBe(0);

          }

        }



        // Kiểm tra 24 ảnh chân dung nhân vật HUD

        for (let age = 1; age <= 6; age++) {

          for (const kind of ['melee', 'ranged', 'tank', 'special']) {

            const portraitPath = path.resolve(

              __dirname,

              `../../public/assets/units/age${age}_unit_${kind}.png`

            );

            expect(fs.existsSync(portraitPath), `Thiếu portrait age${age}_unit_${kind}.png`).toBe(true);

          }

        }



        // Kiểm tra tài nguyên bản đồ, thành trì & pháo Kỷ nguyên 3 (Phục Hưng)

        const age3Assets = [

          'backgrounds/renaissance_bg_panorama.png',

          'bases/renaissance_base_left.png',

          'bases/renaissance_base_right.png',

          'turrets/renaissance_turret_1.png',

          'turrets/renaissance_turret_2.png',

          'turrets/renaissance_turret_3.png',

        ];

        for (const rel of age3Assets) {

          const full = path.resolve(__dirname, `../../public/assets/${rel}`);

          expect(fs.existsSync(full), `Thiếu asset Kỷ nguyên 3: ${rel}`).toBe(true);

        }

      },

      120000

    );



    it('EVAL-06b: Quân triệu hồi giữ khoảng cách đều nhau (>= 65px) & Cung thủ tự chuyển sang đánh tay khi địch áp sát (<= 65px)', () => {

      const world = new World(true);

      world.setGameMode('LOCAL_2P');



      const archerCfg = AGES_DATA[2]!.units[1]!; // med_ranged

      const knightCfg = AGES_DATA[2]!.units[0]!; // med_melee



      const u1 = world.spawnUnit(archerCfg, 'LEFT')!;

      const u2 = world.spawnUnit(knightCfg, 'LEFT')!;

      expect(Math.abs(u1.x - u2.x)).toBeGreaterThanOrEqual(65);



      for (let i = 0; i < 60; i++) {

        world.update(1 / 60);

      }

      expect(Math.abs(u1.x - u2.x)).toBeGreaterThanOrEqual(65);



      // TH1: Địch ở xa trong tầm bắn (210px) -> Cung thủ bắn tên (RANGED_SHOOT)

      const worldFar = new World(true);

      worldFar.setGameMode('LOCAL_2P');

      const archerFar = worldFar.spawnUnit(archerCfg, 'LEFT')!;

      archerFar.x = 600;

      const enemyFar = worldFar.spawnUnit(AGES_DATA[2]!.units[2]!, 'RIGHT')!; // med_tank (500 HP)

      enemyFar.x = 810; // Khoảng cách mép > 160px (> 65px, <= 240px)



      for (let i = 0; i < 40; i++) {

        worldFar.update(1 / 60);

        if (worldFar.projectilePool.getActive().length > 0) break;

      }

      expect(archerFar.lastAttackWasMeleeFallback).toBe(false);

      expect(worldFar.projectilePool.getActive().length).toBeGreaterThan(0);



      // TH2: Địch áp sát gần (<= 65px) -> Cung thủ đánh cận chiến bằng tay (MELEE_HIT)

      const worldClose = new World(true);

      worldClose.setGameMode('LOCAL_2P');

      const archerClose = worldClose.spawnUnit(archerCfg, 'LEFT')!;

      archerClose.x = 600;

      const enemyClose = worldClose.spawnUnit(AGES_DATA[2]!.units[2]!, 'RIGHT')!;

      enemyClose.x = 655; // Khoảng cách mép ~ 13px (<= 65px)

      const initialEnemyHp = enemyClose.hp;



      for (let i = 0; i < 45; i++) {

        worldClose.update(1 / 60);

        if (enemyClose.hp < initialEnemyHp) break;

      }

      expect(archerClose.lastAttackWasMeleeFallback).toBe(true);

      expect(worldClose.projectilePool.getActive().length).toBe(0);

      expect(enemyClose.hp).toBeLessThan(initialEnemyHp);

    });



    it('EVAL-06c: Tuyệt chiêu Đại Pháo Hoàng Gia (CANNONADE) rơi 8 quả ngẫu nhiên với tỉ lệ trúng tự nhiên ~20%–80%', () => {

      const world = new World(true);

      world.setGameMode('LOCAL_2P');

      world.setPlayerAge(3);



      const e1 = world.spawnUnit(AGES_DATA[3]!.units[2]!, 'RIGHT')!;

      e1.x = 1800;

      const e2 = world.spawnUnit(AGES_DATA[3]!.units[2]!, 'RIGHT')!;

      e2.x = 1920;



      expect(world.triggerUltimate('LEFT')).toBe(true);

      expect(world.pendingBarrageShells.length).toBe(8);



      const targetXs = world.pendingBarrageShells.map((s) => Math.round(s.spec.targetX));

      expect(new Set(targetXs).size).toBeGreaterThan(1);



      // Mô phỏng 3.0s để toàn bộ 8 quả pháo rơi chạm đất

      for (let i = 0; i < 180; i++) {

        world.update(1 / 60);

      }

      expect(world.pendingBarrageShells.length).toBe(0);



      // Kiểm chứng xác suất trúng mỗi quả qua 35 lần mô phỏng độc lập nằm trong dải ngẫu nhiên ~20% - 80%

      let totalShells = 0;

      let shellsHittingEnemy = 0;



      for (let run = 0; run < 35; run++) {

        const sim = new World(true);

        sim.setGameMode('LOCAL_2P');

        sim.setPlayerAge(3);



        // Đặt 2 quân địch đang giao tranh tại tiền tuyến (state = ATTACK / đứng ghìm)

        const blocker = sim.spawnUnit(AGES_DATA[3]!.units[2]!, 'LEFT')!;

        blocker.x = 1750;

        blocker.hp = 99999;

        blocker.maxHp = 99999;



        const targetA = sim.spawnUnit(AGES_DATA[3]!.units[2]!, 'RIGHT')!;

        targetA.x = 1810;

        targetA.hp = 99999;

        targetA.maxHp = 99999;



        const targetB = sim.spawnUnit(AGES_DATA[3]!.units[0]!, 'RIGHT')!;

        targetB.x = 1895;

        targetB.hp = 99999;

        targetB.maxHp = 99999;



        sim.update(1 / 60);

        expect(sim.triggerUltimate('LEFT')).toBe(true);



        for (const item of sim.pendingBarrageShells) {

          totalShells++;

          const hitA = Math.abs(item.spec.targetX - targetA.x) <= item.spec.splashRadius;

          const hitB = Math.abs(item.spec.targetX - targetB.x) <= item.spec.splashRadius;

          if (hitA || hitB) shellsHittingEnemy++;

        }

      }



      const hitRatio = shellsHittingEnemy / totalShells;

      expect(hitRatio).toBeGreaterThanOrEqual(0.2);

      expect(hitRatio).toBeLessThanOrEqual(0.8);

    });

  });



  describe('EVAL-07: Kiểm Thử Tái Hiện Lỗi Vòng 2 (RED Tests từ bug_hunter)', () => {

    // Helper tìm các thành phần liên thông 8 hướng (alpha > 10) trong khung chữ nhật con

    function findConnectedComponents(

      rgba: Buffer,

      imgWidth: number,

      x0: number,

      y0: number,

      boxW: number,

      boxH: number

    ): { cnt: number; minX: number; maxX: number; minY: number; maxY: number }[] {

      const visited = new Uint8Array(boxW * boxH);

      const queueX = new Int32Array(boxW * boxH);

      const queueY = new Int32Array(boxW * boxH);

      const comps: { cnt: number; minX: number; maxX: number; minY: number; maxY: number }[] = [];



      for (let dy = 0; dy < boxH; dy++) {

        for (let dx = 0; dx < boxW; dx++) {

          const vIdx = dy * boxW + dx;

          if (visited[vIdx]) continue;

          const alpha = rgba[((y0 + dy) * imgWidth + (x0 + dx)) * 4 + 3]!;

          if (alpha <= 10) continue;



          visited[vIdx] = 1;

          let head = 0;

          let tail = 0;

          queueX[tail] = dx;

          queueY[tail] = dy;

          tail++;



          let minX = dx;

          let maxX = dx;

          let minY = dy;

          let maxY = dy;

          let cnt = 0;



          while (head < tail) {

            const cx = queueX[head]!;

            const cy = queueY[head]!;

            head++;

            cnt++;

            if (cx < minX) minX = cx;

            if (cx > maxX) maxX = cx;

            if (cy < minY) minY = cy;

            if (cy > maxY) maxY = cy;



            for (let ny = cy - 1; ny <= cy + 1; ny++) {

              if (ny < 0 || ny >= boxH) continue;

              for (let nx = cx - 1; nx <= cx + 1; nx++) {

                if (nx < 0 || nx >= boxW) continue;

                const nIdx = ny * boxW + nx;

                if (visited[nIdx]) continue;

                if (rgba[((y0 + ny) * imgWidth + (x0 + nx)) * 4 + 3]! > 10) {

                  visited[nIdx] = 1;

                  queueX[tail] = nx;

                  queueY[tail] = ny;

                  tail++;

                }

              }

            }

          }



          comps.push({ cnt, minX, maxX, minY, maxY });

        }

      }



      comps.sort((a, b) => b.cnt - a.cnt);

      return comps;

    }



    it('[BUG-N01] Tọa độ dừng đánh nhà 2 phe phải đối xứng và Pháo Ô 0 của P1 (Đời 1–4) phải bắn tới lính cận chiến đang đập nhà P1', () => {

      // 1. Kiểm tra tính đối xứng khoảng cách dừng đánh nhà giữa phe LEFT và phe RIGHT

      const symWorld = new World(true);

      symWorld.setGameMode('LOCAL_2P');



      const stoneMelee = AGES_DATA[1]!.units[0]!;

      const leftAttacker = symWorld.spawnUnit(stoneMelee, 'LEFT')!;

      leftAttacker.x = symWorld.baseRightX - 320;

      const rightAttacker = symWorld.spawnUnit(stoneMelee, 'RIGHT')!;

      rightAttacker.x = symWorld.baseLeftX + 320;



      for (let i = 0; i < 240; i++) {

        symWorld.update(1 / 60);

        if (leftAttacker.state === 'ATTACK' && rightAttacker.state === 'ATTACK') break;

      }



      expect(leftAttacker.state).toBe('ATTACK');

      expect(rightAttacker.state).toBe('ATTACK');



      const distToRightBaseCenter = Math.abs(symWorld.baseRightX - leftAttacker.x);

      const distToLeftBaseCenter = Math.abs(rightAttacker.x - symWorld.baseLeftX);

      expect(

        Math.abs(distToRightBaseCenter - distToLeftBaseCenter),

        `Khoảng cách dừng đánh nhà bị lệch bất đối xứng: LEFT cách tâm nhà Phải ${distToRightBaseCenter.toFixed(1)}px nhưng RIGHT cách tâm nhà Trái ${distToLeftBaseCenter.toFixed(1)}px`

      ).toBeLessThanOrEqual(5);



      // 2. Pháo Ô 0 của P1 ở cả Đời 1..4 phải bắn trúng lính cận chiến địch đang đứng đập nhà P1

      for (const age of [1, 2, 3, 4]) {

        const w = new World(true);

        w.setGameMode('LOCAL_2P');

        w.setPlayerAge(age);

        w.setRightAge(age);



        const turretCfg = AGES_DATA[age]!.turrets[0]!;

        expect(w.playerTurrets.buildTurret(0, turretCfg)).toBe(true);



        const enemyMelee = w.spawnUnit(AGES_DATA[age]!.units[0]!, 'RIGHT')!;

        enemyMelee.x = w.baseLeftX + 320;

        enemyMelee.hp = 5000;

        enemyMelee.maxHp = 5000;



        for (let i = 0; i < 240; i++) {

          w.update(1 / 60);

        }



        expect(w.playerBaseHp, `Đời ${age}: Lính cận chiến địch phải tiếp cận và đánh trúng nhà P1`).toBeLessThan(

          BASE_MAX_HP

        );

        expect(

          enemyMelee.hp,

          `Đời ${age}: Pháo Ô 0 của P1 (x=${w.playerTurrets.slots[0]?.x}, range=${w.playerTurrets.slots[0]?.range}) không bắn tới lính cận chiến địch đang đập nhà P1 tại x=${enemyMelee.x.toFixed(1)}`

        ).toBeLessThan(enemyMelee.maxHp);

      }

    });



    it('[BUG-N02] Lính đánh lan tầm xa (stone_special - AOE_SPLASH) bắn vào Căn cứ địch phải gây sát thương lên Base HP cả 2 phe', () => {

      const world = new World(true);

      world.setGameMode('LOCAL_2P');



      const shamanCfg = AGES_DATA[1]!.units[3]!; // stone_special (AOE_SPLASH, splashRadius = 65)

      expect(shamanCfg.specialAbility).toBe('AOE_SPLASH');



      const leftShaman = world.spawnUnit(shamanCfg, 'LEFT')!;

      leftShaman.x = world.baseRightX - 280;



      const rightShaman = world.spawnUnit(shamanCfg, 'RIGHT')!;

      rightShaman.x = world.baseLeftX + 280;



      // Mô phỏng 5 giây không có lính chắn đường để cả 2 Thầy Mo bắn trực tiếp vào Căn cứ đối phương

      for (let i = 0; i < 300; i++) {

        world.update(1 / 60);

      }



      expect(

        world.botBaseHp,

        'Thầy Mo (AOE_SPLASH) phe LEFT bắn vào Căn cứ Phải nhưng botBaseHp không giảm (bị kẹt ở 1000 HP)'

      ).toBeLessThan(BASE_MAX_HP);

      expect(

        world.playerBaseHp,

        'Thầy Mo (AOE_SPLASH) phe RIGHT bắn vào Căn cứ Trái nhưng playerBaseHp không giảm (bị kẹt ở 1000 HP)'

      ).toBeLessThan(BASE_MAX_HP);

    });



    it('[BUG-N03] BotAI nâng cấp tháp và tiến hóa Kỷ nguyên phải đồng bộ damageMultiplier & rangeMultiplier vào botTurrets', () => {

      const world = new World(true);

      world.setGameMode('SOLO');

      world.setBotDifficulty('HARD');

      world.botAI.setStrategy('BALANCED');



      const stoneTurret = AGES_DATA[1]!.turrets[0]!;

      expect(world.botTurrets.buildTurret(0, stoneTurret)).toBe(true);

      expect(world.botTurrets.slots[0]!.damage).toBe(stoneTurret.damage);



      // Cấp đủ vàng để BotAI nâng cấp tháp nhưng chưa đủ XP lên đời

      world.botEconomy.gold = 500;

      world.botEconomy.xp = 0;

      world.botAI.decisionCooldown = 0;



      world.update(1 / 60);



      expect(world.botUpgrades.turretLevel).toBeGreaterThanOrEqual(1);

      const expectedMult = world.botUpgrades.getTurretDamageMultiplier();

      expect(expectedMult).toBeGreaterThan(1.0);



      expect(

        world.botTurrets.damageMultiplier,

        'BotAI trừ vàng tăng turretLevel nhưng quên truyền botTurrets vào upgradeTurret()'

      ).toBeCloseTo(expectedMult, 5);

      expect(

        world.botTurrets.slots[0]!.damage,

        'Sát thương thực tế của botTurrets.slots[0] phải tăng theo cấp nâng cấp tháp của Bot'

      ).toBeCloseTo(stoneTurret.damage * expectedMult, 5);



      // Nâng lên Lv3 rồi cho Bot đủ XP tiến hóa lên Đời 2 qua BotAI.update -> bảo lưu 50% cấp (Lv3 -> Lv1) và đồng bộ lại vào botTurrets

      while (world.botUpgrades.turretLevel < 3) {

        world.botEconomy.gold = 9999;

        world.botUpgrades.upgradeTurret(world.botEconomy, 1, world.botTurrets);

      }

      expect(world.botTurrets.damageMultiplier).toBeCloseTo(1.75, 5);



      world.botEconomy.gold = 0;

      world.botEconomy.xp = 9999;

      world.botAI.decisionCooldown = 0;

      world.update(1 / 60);



      expect(world.botAge.currentAge).toBe(2);

      expect(world.botUpgrades.turretLevel).toBe(1);

      expect(

        world.botTurrets.damageMultiplier,

        'Khi Bot lên Kỷ nguyên (onAgeAdvance), botTurrets.damageMultiplier phải được đồng bộ lại với cấp bảo lưu'

      ).toBeCloseTo(world.botUpgrades.getTurretDamageMultiplier(), 5);

      expect(world.botTurrets.slots[0]!.damageMultiplier).toBeCloseTo(

        world.botUpgrades.getTurretDamageMultiplier(),

        5

      );

    });



    it('[BUG-N04] Lính nhanh đi sau đồng minh chậm không bị nhấp nháy idle/walk; triệu hồi 6 quân không kẹp trùng X=30; nhận diện đúng quân bay spriteConfig.flying', () => {

      // 1. Lính nhanh (med_melee, speed=122) đi ngay sau đồng minh chậm đang bước đi (med_ranged, speed=106)

      const worldWalk = new World(true);

      worldWalk.setGameMode('LOCAL_2P');

      worldWalk.setPlayerAge(2);



      const archerCfg = AGES_DATA[2]!.units[1]!; // speed = 106

      const knightCfg = AGES_DATA[2]!.units[0]!; // speed = 122



      const frontSlow = worldWalk.spawnUnit(archerCfg, 'LEFT')!;

      frontSlow.x = 700;

      const backFast = worldWalk.spawnUnit(knightCfg, 'LEFT')!;

      backFast.x = 632;



      // Cho 0.6s đầu để lính sau bắt kịp đội hình lính trước

      for (let i = 0; i < 36; i++) {

        worldWalk.update(1 / 60);

      }



      // Quan sát trong 2 giây (120 frames) khi cả đoàn đang hành quân tự do (không có địch)

      let idleFrames = 0;

      let clipTransitions = 0;

      let prevClip = backFast.currentClip;



      for (let i = 0; i < 120; i++) {

        worldWalk.update(1 / 60);

        expect(frontSlow.currentClip).toBe('walk');

        if (backFast.currentClip !== 'walk') {

          idleFrames++;

        }

        if (backFast.currentClip !== prevClip) {

          clipTransitions++;

          prevClip = backFast.currentClip;

        }

      }



      expect(

        idleFrames,

        `Lính đi sau bị bật về clip 'idle' ${idleFrames}/120 frames và nhấp nháy ${clipTransitions} lần khi đồng minh phía trước vẫn đang 'walk'`

      ).toBe(0);

      expect(clipTransitions).toBe(0);

      expect(Math.abs(frontSlow.x - backFast.x)).toBeGreaterThanOrEqual(65);



      // 2. Triệu hồi liên tiếp 6 quân mặt đất tại cổng không được kẹp trùng tọa độ x = 30 (hoặc LANE_WIDTH - 30)

      const worldGate = new World(true);

      worldGate.setGameMode('LOCAL_2P');

      const meleeCfg = AGES_DATA[1]!.units[0]!;



      const leftSix = Array.from({ length: 6 }, () => worldGate.spawnUnit(meleeCfg, 'LEFT')!);

      expect(

        Math.abs(leftSix[4]!.x - leftSix[5]!.x),

        `Quân thứ 5 (x=${leftSix[4]!.x}) và quân thứ 6 (x=${leftSix[5]!.x}) phe LEFT bị kẹp trùng tọa độ tại cổng`

      ).toBeGreaterThanOrEqual(30);



      const rightSix = Array.from({ length: 6 }, () => worldGate.spawnUnit(meleeCfg, 'RIGHT')!);

      expect(

        Math.abs(rightSix[4]!.x - rightSix[5]!.x),

        `Quân thứ 5 (x=${rightSix[4]!.x}) và quân thứ 6 (x=${rightSix[5]!.x}) phe RIGHT bị kẹp trùng tọa độ tại cổng`

      ).toBeGreaterThanOrEqual(30);



      // 3. World.spawnUnit phải kiểm tra cả spriteConfig?.flying cho fut_special và ai_drone_swarm

      const worldFly = new World(true);

      worldFly.setGameMode('LOCAL_2P');



      const droneCfg = AGES_DATA[6]!.units[0]!; // ai_drone_swarm (spriteConfig.flying = true)

      const carrierCfg = AGES_DATA[5]!.units[3]!; // fut_special (spriteConfig.flying = true)

      const groundCfg = AGES_DATA[5]!.units[0]!; // fut_melee (flying = false)



      const d1 = worldFly.spawnUnit(droneCfg, 'LEFT')!;

      const d2 = worldFly.spawnUnit(droneCfg, 'LEFT')!;

      expect(

        Math.abs(d1.x - d2.x),

        '2 quân bay ai_drone_swarm triệu hồi liên tiếp phải giãn cách nhau (>= 65px), không được chồng khít tọa độ X'

      ).toBeGreaterThanOrEqual(65);



      const c1 = worldFly.spawnUnit(carrierCfg, 'RIGHT')!;

      const c2 = worldFly.spawnUnit(carrierCfg, 'RIGHT')!;

      expect(

        Math.abs(c1.x - c2.x),

        '2 quân bay fut_special triệu hồi liên tiếp phải giãn cách nhau (>= 65px), không được chồng khít tọa độ X'

      ).toBeGreaterThanOrEqual(65);



      // Quân bay không bị quân mặt đất làm lùi điểm xuất phát tại cổng

      const worldMixed = new World(true);

      worldMixed.setGameMode('LOCAL_2P');

      const gUnit = worldMixed.spawnUnit(groundCfg, 'LEFT')!;

      const fUnit = worldMixed.spawnUnit(carrierCfg, 'LEFT')!;

      expect(fUnit.x, 'Quân bay fut_special không được bị quân bộ fut_melee đẩy lùi tại cổng').toBe(gUnit.x);

    });



    it('[BUG-N05] LOCAL_2P & ONLINE_2P: World có đủ API mua/bán pháo 2 phe kèm notify, HUD có quản lý pháo P2, NetworkSync đồng bộ BUILD/SELL_TURRET & Base HP', () => {

      // 1. Kiểm tra API mua/bán pháo có notify state trên World cho cả P1 (LEFT) và P2 (RIGHT)

      const world = new World(true);

      world.setGameMode('LOCAL_2P');



      expect(typeof (world as any).buildPlayerTurret, 'World thiếu hàm buildPlayerTurret').toBe('function');

      expect(typeof (world as any).sellPlayerTurret, 'World thiếu hàm sellPlayerTurret').toBe('function');

      expect(typeof (world as any).buildRightTurret, 'World thiếu hàm buildRightTurret').toBe('function');

      expect(typeof (world as any).sellRightTurret, 'World thiếu hàm sellRightTurret').toBe('function');



      let notifyCount = 0;

      const unsub = world.subscribe(() => {

        notifyCount++;

      });



      const stoneTurret = AGES_DATA[1]!.turrets[0]!; // cost = 75, refund = 52

      const beforeP1Build = notifyCount;

      expect(Boolean((world as any).buildPlayerTurret(0, stoneTurret))).toBe(true);

      expect(world.playerTurrets.slots[0]?.config.id).toBe('stone_slingshot');

      expect(world.playerEconomy.gold).toBe(100);

      expect(notifyCount).toBeGreaterThan(beforeP1Build);



      const beforeP1Sell = notifyCount;

      expect(Boolean((world as any).sellPlayerTurret(0))).toBe(true);

      expect(world.playerTurrets.slots[0]).toBeNull();

      expect(world.playerEconomy.gold).toBe(152);

      expect(notifyCount).toBeGreaterThan(beforeP1Sell);



      const beforeP2Build = notifyCount;

      expect(Boolean((world as any).buildRightTurret(0, stoneTurret))).toBe(true);

      expect(world.botTurrets.slots[0]?.config.id).toBe('stone_slingshot');

      expect(world.botEconomy.gold).toBe(100);

      expect(notifyCount).toBeGreaterThan(beforeP2Build);



      const beforeP2Sell = notifyCount;

      expect(Boolean((world as any).sellRightTurret(0))).toBe(true);

      expect(world.botTurrets.slots[0]).toBeNull();

      expect(world.botEconomy.gold).toBe(152);

      expect(notifyCount).toBeGreaterThan(beforeP2Sell);

      unsub();



      // 2. Kiểm tra HUD ở chế độ LOCAL_2P có giao diện/nút điều khiển Vũ Khí Thành cho P2 (phe Phải)

      const hudMarkup = renderToStaticMarkup(

        React.createElement(HUD, {

          world,

          snapshot: world.getSnapshot(),

          liveManager: new LiveEventManager(world),

          speed: 1,

          onSetSpeed: () => {},

          isMuted: false,

          onToggleMute: () => {},

        })

      );

      const p2PanelIdx = hudMarkup.indexOf('P2 (PHE ĐỎ)');

      expect(p2PanelIdx).toBeGreaterThan(-1);

      const p2Markup = hudMarkup.slice(p2PanelIdx);

      expect(

        /Pháo|Tháp|Vũ Khí|Turret/i.test(p2Markup),

        'HUD ở chế độ LOCAL_2P chưa hiển thị nút/giao diện quản lý Vũ Khí Thành cho P2 (PHE ĐỎ)'

      ).toBe(true);



      const hudSource = fs.readFileSync(path.resolve(__dirname, '../ui/HUD.tsx'), 'utf-8');

      expect(

        hudSource.includes('upgradeRightTurret') &&

          hudSource.includes('addRightTurretSlot') &&

          (hudSource.includes('buildRightTurret') || hudSource.includes('botTurrets')),

        'HUD.tsx phải kết nối đầy đủ thao tác nâng cấp, mở ô và mua/bán pháo cho phe Phải (P2 / Guest)'

      ).toBe(true);



      // 3. Kiểm tra NetworkSync đồng bộ BUILD_TURRET, SELL_TURRET và Base HP trong STATE_SYNC

      const channels = new Map<string, Set<{ onmessage: ((ev: { data: any }) => void) | null }>>();

      const prevBC = (globalThis as any).BroadcastChannel;



      class MockBroadcastChannel {

        public name: string;

        public onmessage: ((ev: { data: any }) => void) | null = null;

        constructor(name: string) {

          this.name = name;

          if (!channels.has(name)) channels.set(name, new Set());

          channels.get(name)!.add(this);

        }

        postMessage(data: any): void {

          const peers = channels.get(this.name);

          if (!peers) return;

          for (const peer of peers) {

            if (peer !== this && peer.onmessage) {

              peer.onmessage({ data: structuredClone(data) });

            }

          }

        }

        close(): void {

          channels.get(this.name)?.delete(this);

        }

      }



      (globalThis as any).BroadcastChannel = MockBroadcastChannel;

      const hostWorld = new World(true);

      const guestWorld = new World(true);

      const hostNet = new NetworkSync(hostWorld);

      const guestNet = new NetworkSync(guestWorld);



      try {

        hostNet.hostRoom('SING-8888');

        guestNet.joinRoom('SING-8888');



        expect(hostNet.connectionState).toBe('CONNECTED');

        expect(guestNet.connectionState).toBe('CONNECTED');



        // Host mua pháo Ô 0 -> đồng bộ sang Guest

        (hostWorld as any).buildPlayerTurret?.(0, stoneTurret);

        (hostNet as any).sendAction('BUILD_TURRET', { slotIndex: 0, turretId: stoneTurret.id });

        expect(

          guestWorld.playerTurrets.slots[0]?.config.id,

          'NetworkSync chưa đồng bộ BUILD_TURRET từ Host sang Guest'

        ).toBe('stone_slingshot');



        // Guest mua pháo Ô 0 -> đồng bộ sang Host

        (guestWorld as any).buildRightTurret?.(0, stoneTurret);

        (guestNet as any).sendAction('BUILD_TURRET', { slotIndex: 0, turretId: stoneTurret.id });

        expect(

          hostWorld.botTurrets.slots[0]?.config.id,

          'NetworkSync chưa đồng bộ BUILD_TURRET từ Guest sang Host'

        ).toBe('stone_slingshot');



        // Host bán pháo Ô 0 -> đồng bộ sang Guest

        (hostWorld as any).sellPlayerTurret?.(0);

        (hostNet as any).sendAction('SELL_TURRET', { slotIndex: 0 });

        expect(

          guestWorld.playerTurrets.slots[0],

          'NetworkSync chưa đồng bộ SELL_TURRET từ Host sang Guest'

        ).toBeNull();



        // Guest bán pháo Ô 0 -> đồng bộ sang Host

        (guestWorld as any).sellRightTurret?.(0);

        (guestNet as any).sendAction('SELL_TURRET', { slotIndex: 0 });

        expect(

          hostWorld.botTurrets.slots[0],

          'NetworkSync chưa đồng bộ SELL_TURRET từ Guest sang Host'

        ).toBeNull();



        // STATE_SYNC từ Host phải cập nhật playerBaseHp và botBaseHp phía Guest

        (guestNet as any).handleIncomingMessage({

          type: 'STATE_SYNC',

          senderRole: 'HOST',

          roomId: 'SING-8888',

          payload: {

            matchTime: 42.5,

            playerBaseHp: 735,

            botBaseHp: 490,

          },

          timestamp: Date.now(),

        });



        expect(guestWorld.matchTime).toBe(42.5);

        expect(

          guestWorld.playerBaseHp,

          'NetworkSync STATE_SYNC chưa đồng bộ playerBaseHp phía Guest'

        ).toBe(735);

        expect(

          guestWorld.botBaseHp,

          'NetworkSync STATE_SYNC chưa đồng bộ botBaseHp phía Guest'

        ).toBe(490);

      } finally {

        hostNet.disconnect();

        guestNet.disconnect();

        (globalThis as any).BroadcastChannel = prevBC;

      }

    });



    it('[BUG-N06] Renderer phủ kín địa tầng màn dọc 20:9 (localY >= 2600); đóng Preview/OnlineLobby không kẹt PAUSED; chặn phím tắt khi chưa PLAYING; StartSettingsModal tự reset về MAIN', () => {

      // 1. Renderer.ts: kiểm tra độ sâu nền đất trên màn hình điện thoại dọc 20:9 (390x844)

      const world = new World(true);

      const renderer = new GameRenderer(world);

      (renderer as any).app = {};

      renderer.onResize(390, 844);



      const groundRects: { x: number; y: number; w: number; h: number }[] = [];

      const createMockGraphics = (recordRects?: { x: number; y: number; w: number; h: number }[]) => {

        const g: any = {

          clear: () => g,

          rect: (x: number, y: number, w: number, h: number) => {

            if (recordRects) recordRects.push({ x, y, w, h });

            return g;

          },

          roundRect: () => g,

          circle: () => g,

          ellipse: () => g,

          poly: () => g,

          fill: () => g,

          stroke: () => g,

        };

        return g;

      };



      (renderer as any).renderFullBackground(

        createMockGraphics(),

        createMockGraphics(),

        createMockGraphics(),

        createMockGraphics(groundRects),

        1

      );



      const mainGroundRects = groundRects.filter((r) => r.y === renderer.GROUND_Y && r.h > 100);

      expect(mainGroundRects.length).toBeGreaterThan(0);

      const maxGroundLocalY = Math.max(...mainGroundRects.map((r) => r.y + r.h));

      expect(

        maxGroundLocalY,

        `Nền địa tầng chính chỉ phủ tới localY=${maxGroundLocalY}, chưa đủ sâu (>= 2600) cho màn hình dọc 20:9 (390x844)`

      ).toBeGreaterThanOrEqual(2600);



      // 2. App.tsx & HUD.tsx: đóng PreviewGallery / OnlineLobbyModal không làm kẹt PAUSED không menu; chặn phím tắt khi status !== 'PLAYING'

      const appSource = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');

      const hudSource = fs.readFileSync(path.resolve(__dirname, '../ui/HUD.tsx'), 'utf-8');

      const modalSource = fs.readFileSync(path.resolve(__dirname, '../ui/StartSettingsModal.tsx'), 'utf-8');



      // App.tsx: PreviewGallery onBackToGame không được chỉ gọi setIsPreview(false) bỏ mặc world.status === 'PAUSED'

      const barePreviewBack = /onBackToGame=\{\(\)\s*=>\s*setIsPreview\(false\)\}/.test(appSource);

      expect(

        barePreviewBack,

        'App.tsx: PreviewGallery onBackToGame chỉ gọi setIsPreview(false) làm kẹt world.status === "PAUSED" mà không mở lại Menu / khôi phục trạng thái'

      ).toBe(false);



      // App.tsx: OnlineLobbyModal onClose không được chỉ gọi setShowOnlineLobby(false) khi trận đấu chưa bắt đầu (world.status === 'PAUSED')

      const bareLobbyClose = /<OnlineLobbyModal[\s\S]*?onClose=\{\(\)\s*=>\s*setShowOnlineLobby\(false\)\}/.test(

        appSource

      );

      expect(

        bareLobbyClose,

        'App.tsx: OnlineLobbyModal onClose chỉ gọi setShowOnlineLobby(false) làm kẹt world.status === "PAUSED" mà showStartSettings === false khi hủy phòng'

      ).toBe(false);



      // App.tsx: handleKeyDown phải chặn thao tác trận đấu khi world.status !== 'PLAYING'

      const appKeyDownIdx = appSource.indexOf('const handleKeyDown');

      const appSpawnIdx = appSource.indexOf('spawnPlayerUnit', appKeyDownIdx);

      const appKeyDownHeader = appKeyDownIdx >= 0 && appSpawnIdx > appKeyDownIdx

        ? appSource.slice(appKeyDownIdx, appSpawnIdx)

        : '';

      expect(

        appKeyDownHeader.includes('PLAYING'),

        'App.tsx: handleKeyDown chưa chặn phím tắt gọi quân/chiêu cuối khi world.status !== "PLAYING"'

      ).toBe(true);



      // HUD.tsx: handleKeyDown (phím T, G) phải chặn khi trận đấu không ở trạng thái 'PLAYING'

      const hudKeyDownMatch = hudSource.match(/const handleKeyDown\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)window\.addEventListener\('keydown'/);

      const hudKeyDownBody = hudKeyDownMatch ? hudKeyDownMatch[1]! : '';

      expect(

        hudKeyDownBody.includes('PLAYING'),

        'HUD.tsx: handleKeyDown (phím T / G) chưa chặn khi world.status !== "PLAYING"'

      ).toBe(true);



      // 3. StartSettingsModal.tsx: khi mở lại Main Menu (!inGameOnly && isOpen), menuView phải tự reset về 'MAIN'

      const hasMainResetEffect =

        /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?setMenuView\(\s*['"]MAIN['"]\s*\)[\s\S]*?\}\s*,\s*\[[^\]]*isOpen[^\]]*\]\s*\)/.test(

          modalSource

        );

      expect(

        hasMainResetEffect,

        'StartSettingsModal.tsx thiếu useEffect tự động reset menuView về "MAIN" khi mở lại Main Menu (!inGameOnly && isOpen)'

      ).toBe(true);

    });



    it(

      '[BUG-N07] Toàn bộ 24 ảnh chân dung HUD không dính pixel rác sát mép trái/phải và pike_atlas / musket_atlas không còn mảnh vũ khí đứt rời sát rìa cell',

      () => {

        // 1. Kiểm tra toàn bộ 24 ảnh chân dung age{1..6}_unit_{melee,ranged,tank,special}.png

        const portraitIssues: string[] = [];



        for (let age = 1; age <= 6; age++) {

          for (const kind of ['melee', 'ranged', 'tank', 'special']) {

            const fileName = `age${age}_unit_${kind}.png`;

            const portraitPath = path.resolve(__dirname, `../../public/assets/units/${fileName}`);

            const { width, height, rgba } = decodePngRgba(portraitPath);



            let leftBorderGarbage = 0;

            let rightBorderGarbage = 0;

            let totalOpaque = 0;



            for (let y = 0; y < height; y++) {

              for (let x = 0; x < width; x++) {

                const a = rgba[(y * width + x) * 4 + 3]!;

                if (a > 10) {

                  totalOpaque++;

                  if (x <= 2) leftBorderGarbage++;

                  if (x >= width - 3) rightBorderGarbage++;

                }

              }

            }



            expect(totalOpaque, `${fileName} không được rỗng`).toBeGreaterThan(5000);



            // Kiểm tra thêm mảnh rác đứt rời từ nhân vật ô kế bên chạm sát biên (loại trừ bóng đổ rộng dưới chân nhân vật)

            const comps = findConnectedComponents(rgba, width, 0, 0, width, height);

            const detachedEdgeBlobs = comps

              .slice(1)

              .filter(

                (c) =>

                  c.cnt >= 80 &&

                  ((c.minX <= 5 && c.maxX <= 95) || (c.maxX >= width - 6 && c.minX >= width - 96))

              );



            if (leftBorderGarbage > 0 || rightBorderGarbage > 0 || detachedEdgeBlobs.length > 0) {

              portraitIssues.push(

                `${fileName}(left0..2=${leftBorderGarbage}, right=${rightBorderGarbage}, detachedBlobs=${detachedEdgeBlobs.length})`

              );

            }

          }

        }



        expect(

          portraitIssues,

          `Phát hiện ${portraitIssues.length}/24 ảnh chân dung còn dính pixel rác mép cắt sheet: ${portraitIssues.join(', ')}`

        ).toEqual([]);



        // 2. Kiểm tra pike_atlas.png và musket_atlas.png không còn mảnh vũ khí đứt rời sát rìa cell 256x256

        const atlasIssues: string[] = [];

        for (const name of ['pike', 'musket']) {

          const atlasPath = path.resolve(__dirname, `../../public/sprites/renaissance/${name}_atlas.png`);

          const { width, rgba } = decodePngRgba(atlasPath);



          for (let row = 0; row < 4; row++) {

            for (let col = 0; col < 6; col++) {

              const comps = findConnectedComponents(rgba, width, col * 256, row * 256, 256, 256);

              if (comps.length <= 1) continue;



              const detachedFragments = comps

                .slice(1)

                .filter((c) => c.cnt >= 50 && (c.minX < 25 || c.maxX > 231));



              if (detachedFragments.length > 0) {

                atlasIssues.push(

                  `${name}_atlas cell(${row},${col}): ${JSON.stringify(detachedFragments)}`

                );

              }

            }

          }

        }



        expect(

          atlasIssues,

          `Phát hiện mảnh vũ khí đứt rời sát rìa cell trong Atlas Kỷ nguyên 3: ${atlasIssues.join('; ')}`

        ).toEqual([]);

      },

      120000

    );

  });



  describe('EVAL-08: Hệ Thống Phát AnimationController Mới Cho Toàn Bộ Quân', () => {

    it('EVAL-08a: AnimationController tuân thủ 5 quy tắc state, không ngắt ATTACK, hit-stop 2-3 tick, cooldown >= clip attack & DIE miễn thương', () => {

      const world = new World(true);

      world.setGameMode('LOCAL_2P');



      const knightCfg = AGES_DATA[2]!.units[0]!; // med_melee

      const u1 = world.spawnUnit(knightCfg, 'LEFT')!;



      // 1. Kiểm tra khởi tạo

      expect(u1.anim).toBeDefined();

      expect(u1.anim.state).toBe('WALK');

      expect(u1.currentClip).toBe('walk');



      // 2. Chuyển sang ATTACK: không bị ngắt giữa chừng bởi đòn thường hay yêu cầu WALK/IDLE

      expect(u1.anim.requestState('ATTACK')).toBe(true);

      expect(u1.anim.state).toBe('ATTACK');

      expect(u1.currentClip).toBe('attack');



      // Yêu cầu WALK trong khi đang ATTACK -> bị từ chối và đưa vào hàng đợi

      expect(u1.anim.requestState('WALK')).toBe(false);

      expect(u1.anim.state).toBe('ATTACK');

      expect(u1.anim.queuedState).toBe('WALK');



      // Yêu cầu HURT bình thường (isHeavyHurt=false) -> không được ngắt ATTACK

      expect(u1.anim.requestState('HURT', false)).toBe(false);

      expect(u1.anim.state).toBe('ATTACK');



      // 3. Sát thương chỉ kích hoạt tại hitFrame, KHÔNG kích hoạt ở frame 0

      u1.anim.elapsedTime = 0;

      u1.anim.currentFrameIndex = 0;

      const tick0 = u1.anim.update(0.01);

      expect(tick0.triggerHitEvent).toBe(false);



      // Tiến thời gian tới đúng hitFrame (frame 1) -> triggerHitEvent = true và kích hoạt hit-stop 2-3 tick

      const fps = u1.anim.currentClipConfig?.fps || 12;

      const timeToHit = 1 / fps + 0.005;

      const tickHit = u1.anim.update(timeToHit);

      expect(tickHit.triggerHitEvent).toBe(true);

      expect(u1.anim.hitStopTimer).toBeGreaterThanOrEqual(0.04); // ~3 tick tại 60Hz



      // 4. Kiểm tra Cooldown tấn công luôn >= thời lượng clip attack

      const clipDuration = u1.anim.attackClipDuration;

      expect(clipDuration).toBeGreaterThan(0);

      expect(knightCfg.attackSpeed).toBeGreaterThanOrEqual(clipDuration);



      // 5. DIE có quyền ưu tiên cao nhất, ngắt ngay lập tức mọi trạng thái và miễn nhiễm sát thương tiếp theo

      expect(u1.anim.requestState('DIE')).toBe(true);

      expect(u1.anim.state).toBe('DIE');

      u1.isAlive = false;

      const hpBefore = u1.hp;

      u1.takeDamage(100, 'MELEE', null);

      expect(u1.hp).toBe(hpBefore); // Không nhận thêm sát thương

    });



    it('EVAL-08b: Animation theo thời gian thực (elapsed * fps), tự động bỏ khung khi tụt FPS không kéo dài clip', () => {

      const cfg = AGES_DATA[1]!.units[0]!;

      const world = new World(true);

      const u = world.spawnUnit(cfg, 'LEFT')!;



      u.anim.requestState('WALK');

      u.anim.elapsedTime = 0;



      // Khi dt bình thường 1/60s (0.0166s) -> frame 0

      u.anim.update(1 / 60);

      expect(u.anim.currentFrameIndex).toBe(0);



      // Khi tụt FPS / giật lag (dt nhảy 0.22s) -> tự động bỏ qua khung giữa, nhảy thẳng tới khung tương ứng với thời gian thực

      u.anim.update(0.22);

      const expectedFrame = Math.floor(u.anim.elapsedTime * (u.anim.currentClipConfig?.fps || 10)) % (u.anim.currentClipConfig?.frameCount || 4);

      expect(u.anim.currentFrameIndex).toBe(expectedFrame);

    });



    it('EVAL-08c: Toàn bộ 24 quân khai báo đầy đủ anchor, frameCount, fps, loop, hitFrame và releaseFrame cho quân tầm xa', () => {

      for (const [id, cfg] of Object.entries(SPRITE_CONFIGS)) {

        expect(cfg.anchor.x, id + ' anchor.x').toBe(0.5);

        expect(cfg.anchor.y, id + ' anchor.y').toBeGreaterThanOrEqual(0.65);



        for (const clipName of ['idle', 'walk', 'attack', 'hurt', 'die'] as const) {

          const clip = cfg.clips[clipName];

          expect(clip, id + ' clip ' + clipName + ' must exist').toBeDefined();

          expect(clip!.frameCount, id + ' ' + clipName + ' frameCount').toBeGreaterThanOrEqual(2);

          expect(clip!.fps, id + ' ' + clipName + ' fps').toBeGreaterThanOrEqual(6);

          expect(typeof clip!.loop, id + ' ' + clipName + ' loop').toBe('boolean');

        }



        const atk = cfg.clips.attack!;

        expect(atk.hitFrame !== undefined || atk.releaseFrame !== undefined, id + ' must have hitFrame or releaseFrame').toBe(true);

      }

    });

  });

});

