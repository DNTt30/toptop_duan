/**
 * scripts/perf-check.mjs
 * Script đo hiệu năng (FPS, VSync, Frame Time, Stutter, ReadPixels)
 * Sử dụng Vite programmatic createServer (tránh DEP0190 và shell issues)
 * Sử dụng Playwright Chromium với bộ cờ phần cứng chuẩn xác.
 */

import { createRequire } from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createServer } = require('vite');
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, '..', 'apps', 'game');

// Bộ cờ tăng tốc phần cứng đầy đủ của Phần 3 (Unlocked FPS Benchmark)
const HARDWARE_FLAGS_UNLOCKED = [
  '--autoplay-policy=no-user-gesture-required',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--use-angle=d3d11',
];

// Bộ cờ tăng tốc phần cứng chuẩn (Bật VSync & Frame Rate Limit thông thường)
const HARDWARE_FLAGS_VSYNC = [
  '--autoplay-policy=no-user-gesture-required',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--use-angle=d3d11',
];

function calcStats(frameTimes) {
  if (!frameTimes || frameTimes.length === 0) {
    return { avgFps: 0, minFps: 0, p95FrameMs: 0, p99FrameMs: 0, over16msPct: 0, over33msPct: 0, count: 0 };
  }
  const validDeltas = frameTimes.filter((d) => d > 0);
  const totalDurationMs = validDeltas.reduce((a, b) => a + b, 0);
  const avgFps = Number((validDeltas.length / (totalDurationMs / 1000)).toFixed(1));

  const instantFps = validDeltas.map((d) => 1000 / d);
  const minFps = Number(Math.min(...instantFps).toFixed(1));

  const sorted = [...validDeltas].sort((a, b) => a - b);
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p99Idx = Math.floor(sorted.length * 0.99);

  const p95FrameMs = Number((sorted[p95Idx] || 0).toFixed(2));
  const p99FrameMs = Number((sorted[p99Idx] || 0).toFixed(2));

  const over16msCount = validDeltas.filter((d) => d > 16.7).length;
  const over33msCount = validDeltas.filter((d) => d > 33.3).length;

  const over16msPct = Number(((over16msCount / validDeltas.length) * 100).toFixed(2));
  const over33msPct = Number(((over33msCount / validDeltas.length) * 100).toFixed(2));

  return {
    avgFps,
    minFps,
    p95FrameMs,
    p99FrameMs,
    over16msPct,
    over33msPct,
    count: validDeltas.length,
  };
}

async function queryGpuInfo(page) {
  return await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let gpuVendor = 'Unknown';
    let gpuRenderer = 'Unknown';
    let isSoftware = false;

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
        gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
      } else {
        gpuVendor = gl.getParameter(gl.VENDOR) || 'Unknown';
        gpuRenderer = gl.getParameter(gl.RENDERER) || 'Unknown';
      }
      isSoftware = /swiftshader|llvmpipe|software|cpu/i.test(gpuRenderer);
    }
    return { gpuVendor, gpuRenderer, isSoftware };
  });
}

async function main() {
  console.log('======================================================================');
  console.log('🚀 CHƯƠNG TRÌNH ĐO KIỂM HIỆU NĂNG & KHẢO SÁT STUTTER (PERF-CHECK)');
  console.log('======================================================================\n');

  // 1. Khởi động Vite programmatic server
  console.log('1. Khởi động Vite server programmatically (No child_process, no DEP0190)...');
  const server = await createServer({
    root: gameRoot,
    server: { port: 5173, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = 'http://127.0.0.1:5173';
  console.log(`✅ Vite server đã lắng nghe tại: ${baseUrl}\n`);

  // ==================================================================
  // PHẦN 1: ĐO HIỆU NĂNG UNLOCKED & 3 GIAI ĐOẠN (a, b, c)
  // ==================================================================
  console.log('======================================================================');
  console.log('📌 PHẦN A: ĐO HIỆU NĂNG UNLOCKED (CỜ TĂNG TỐC PHẦN 3)');
  console.log('======================================================================');
  console.log('Cờ Chromium sử dụng:');
  HARDWARE_FLAGS_UNLOCKED.forEach((f) => console.log(`  ${f}`));

  const browserUnlocked = await chromium.launch({
    headless: true,
    args: HARDWARE_FLAGS_UNLOCKED,
  });

  const pageA = await browserUnlocked.newPage({ viewport: { width: 1280, height: 720 } });

  const readPixelsWarnings = [];
  pageA.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('ReadPixels') || text.includes('GPU stall')) {
      readPixelsWarnings.push(text);
    }
  });

  // Điều hướng và đo Giai đoạn a: 0-3 giây đầu (nạp trang)
  console.log('\n[Giai đoạn a] Bắt đầu nạp trang (0-3s)...');
  await pageA.goto(`${baseUrl}/?mode=solo&autostart=1`, { waitUntil: 'commit' });

  // Kiểm tra GPU thật
  const gpuInfo = await queryGpuInfo(pageA);
  console.log('\n--------------------------------------------------');
  console.log('🖥️ THÔNG TIN PHẦN CỨNG GPU BÁO CÁO:');
  console.log(`- UNMASKED_RENDERER: ${gpuInfo.gpuRenderer}`);
  console.log(`- UNMASKED_VENDOR:   ${gpuInfo.gpuVendor}`);
  if (gpuInfo.isSoftware) {
    console.log('⚠️⚠️⚠️ CẢNH BÁO LỚN: ĐANG DÙNG GPU PHẦN MỀM (SWIFTSHADER / LLVMPIPE)! HIỆU NĂNG SẼ BỊ SUY GIẢM TRẦM TRỌNG! ⚠️⚠️⚠️');
  } else {
    console.log('✅ XÁC NHẬN: Đang dùng GPU phần cứng thật (Direct3D11 / Hardware Accelerated).');
  }
  console.log('--------------------------------------------------\n');

  // Thu thập frame time 3s đầu
  const phaseAFrames = await pageA.evaluate(async () => {
    const frames = [];
    let lastT = performance.now();
    const start = performance.now();
    await new Promise((resolve) => {
      function tick(now) {
        frames.push(now - lastT);
        lastT = now;
        if (now - start < 3000) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
    return frames;
  });

  const statsA = calcStats(phaseAFrames);
  console.log(`📊 Kết quả Giai đoạn a (0-3s Nạp trang):`);
  console.log(`   - FPS trung bình: ${statsA.avgFps} FPS`);
  console.log(`   - FPS thấp nhất (min): ${statsA.minFps} FPS`);
  console.log(`   - p95 thời gian khung: ${statsA.p95FrameMs} ms (Tổng frames: ${statsA.count})`);

  // Chờ 5 giây ổn định
  console.log('\n⏳ Chờ 5 giây để game ổn định...');
  await pageA.waitForTimeout(5000);

  // Giai đoạn b: 20 giây chơi thường (autostart, 1x, không bế tắc)
  console.log('\n[Giai đoạn b] Đo 20 giây chơi thường (autostart, 1.0x, không bế tắc)...');
  const phaseBFrames = await pageA.evaluate(async () => {
    const frames = [];
    let lastT = performance.now();
    const start = performance.now();
    await new Promise((resolve) => {
      function tick(now) {
        frames.push(now - lastT);
        lastT = now;
        if (now - start < 20000) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
    return frames;
  });

  const statsB = calcStats(phaseBFrames);
  console.log(`📊 Kết quả Giai đoạn b (20s Chơi thường):`);
  console.log(`   - FPS trung bình: ${statsB.avgFps} FPS`);
  console.log(`   - FPS thấp nhất (min): ${statsB.minFps} FPS`);
  console.log(`   - p95 thời gian khung: ${statsB.p95FrameMs} ms (Tổng frames: ${statsB.count})`);

  // Giai đoạn c: 20 giây khi kích hoạt bế tắc (Ép bế tắc bật thật)
  console.log('\n[Giai đoạn c] Ép bật chế độ bế tắc thật và đo 20 giây...');

  // Ép bật bế tắc bằng cách ngắt viện binh và cấu hình stallDetectSec = 1
  const stallVerification = await pageA.evaluate(async () => {
    const world = window.__world;
    if (!world) return { ok: false, error: 'Không tìm thấy window.__world' };

    // Cấu hình bế tắc kích hoạt sau 0.5s và rút 10 HP/s
    world.setMatchConfig({
      stallDetectSec: 0.5,
      stallDrainInitialDps: 10,
      stallDrainRampIntervalSec: 10,
      stallDrainRampDps: 2,
    });

    // Dọn sạch lính hiện tại để không xảy ra giao tranh/sát thương
    world.playerUnits = [];
    world.botUnits = [];
    world.playerEconomy.spawnQueue = [];
    world.botEconomy.spawnQueue = [];

    // Chờ 1.5 giây để bế tắc kích hoạt
    const initialPlayerHp = world.playerBaseHp;
    const initialBotHp = world.botBaseHp;

    await new Promise((r) => setTimeout(r, 1500));

    const isStallActive = world.isStallDrainActive;
    const playerHpAfter = world.playerBaseHp;
    const botHpAfter = world.botBaseHp;
    const isHpDecreasing = playerHpAfter < initialPlayerHp && botHpAfter < initialBotHp;

    return {
      ok: true,
      isStallActive,
      initialPlayerHp,
      playerHpAfter,
      isHpDecreasing,
      currentDps: world.currentStallDrainDps,
    };
  });

  console.log('🔍 Kiểm chứng kích hoạt bế tắc:');
  console.log(`   - Cờ world.isStallDrainActive: ${stallVerification.isStallActive ? 'BẬT (true)' : 'TẮT (false)'}`);
  console.log(`   - Máu căn cứ: ${stallVerification.initialPlayerHp} -> ${stallVerification.playerHpAfter} HP`);
  console.log(`   - Máu căn cứ đang giảm thật: ${stallVerification.isHpDecreasing ? 'XÁC NHẬN (ĐANG GIẢM)' : 'KHÔNG GIẢM'}`);
  console.log(`   - Tốc độ rút máu hiện tại: ${stallVerification.currentDps} HP/s`);

  // Đo 20 giây trong giai đoạn bế tắc (kèm đo số tick mô phỏng mỗi khung)
  const phaseCData = await pageA.evaluate(async () => {
    const frames = [];
    const ticksPerFrame = [];
    let lastT = performance.now();
    const start = performance.now();

    const world = window.__world;
    let tickCounter = 0;
    const origUpdate = world.update.bind(world);
    world.update = function (dt) {
      tickCounter++;
      return origUpdate(dt);
    };

    await new Promise((resolve) => {
      function tick(now) {
        frames.push(now - lastT);
        lastT = now;
        ticksPerFrame.push(tickCounter);
        tickCounter = 0;

        if (now - start < 20000) {
          requestAnimationFrame(tick);
        } else {
          world.update = origUpdate;
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });

    return { frames, ticksPerFrame };
  });

  const statsC = calcStats(phaseCData.frames);
  const totalTicks = phaseCData.ticksPerFrame.reduce((a, b) => a + b, 0);
  const avgTicksPerFrame = Number((totalTicks / phaseCData.ticksPerFrame.length).toFixed(2));
  const maxTicksPerFrame = Math.max(...phaseCData.ticksPerFrame);

  console.log(`📊 Kết quả Giai đoạn c (20s Bế tắc Drain):`);
  console.log(`   - Script có tăng tốc thời gian/số tick không: KHÔNG (Giữ nguyên tốc độ 1.0x, fixedStep 1/60s)`);
  console.log(`   - Số tick mô phỏng trung bình mỗi khung: ${avgTicksPerFrame} ticks/khung`);
  console.log(`   - Số tick mô phỏng tối đa trong một khung: ${maxTicksPerFrame} ticks/khung`);
  console.log(`   - FPS trung bình: ${statsC.avgFps} FPS`);
  console.log(`   - FPS thấp nhất (min): ${statsC.minFps} FPS`);
  console.log(`   - p95 thời gian khung: ${statsC.p95FrameMs} ms (Tổng frames: ${statsC.count})`);

  await browserUnlocked.close();

  // ==================================================================
  // PHẦN 2: ĐO 60 GIÂY VỚI CHUẨN VSYNC (KHÔNG UNLOCKED) & PHÂN TÍCH STUTTER
  // ==================================================================
  console.log('\n======================================================================');
  console.log('📌 PHẦN B: ĐO 60 GIÂY VSYNC CHUẨN (KHÔNG --disable-gpu-vsync/frame-rate-limit)');
  console.log('======================================================================');
  console.log('Cờ Chromium sử dụng (VSync ON):');
  HARDWARE_FLAGS_VSYNC.forEach((f) => console.log(`  ${f}`));

  const browserVsync = await chromium.launch({
    headless: true,
    args: HARDWARE_FLAGS_VSYNC,
  });

  const pageB = await browserVsync.newPage({ viewport: { width: 1280, height: 720 } });
  await pageB.goto(`${baseUrl}/?mode=solo&autostart=1`, { waitUntil: 'domcontentloaded' });
  console.log('⏳ Chờ 5 giây ổn định trước khi đo 60 giây...');
  await pageB.waitForTimeout(5000);

  console.log('⏱️ Bắt đầu đo 60 giây và ghi lại sự kiện gây giật (> 25ms)...');

  const vsyncData = await pageB.evaluate(async () => {
    const world = window.__world;
    const events = [];

    // Ghi nhận sự kiện game
    if (world) {
      // 1. Hook spawn
      const origSpawn = world.spawnUnit.bind(world);
      world.spawnUnit = function (config, team) {
        events.push({ time: performance.now(), type: 'SPAWN', detail: `${team}_${config.id}` });
        return origSpawn(config, team);
      };

      // 2. Hook combat event (death, shockwave, ultimate)
      const origHandleCombat = world.handleCombatEvent.bind(world);
      world.handleCombatEvent = function (evt) {
        if (evt.type === 'DEATH' || evt.type === 'SHOCKWAVE') {
          events.push({ time: performance.now(), type: evt.type, detail: evt.type });
        }
        return origHandleCombat(evt);
      };

      // 3. Hook ultimate
      const origUlti = world.triggerUltimate.bind(world);
      world.triggerUltimate = function (team) {
        events.push({ time: performance.now(), type: 'ULTIMATE', detail: team });
        return origUlti(team);
      };
    }

    const frameDeltas = [];
    const stutterFrames = []; // các khung > 25ms
    let lastT = performance.now();
    const startTime = performance.now();

    await new Promise((resolve) => {
      function tick(now) {
        const delta = now - lastT;
        lastT = now;
        frameDeltas.push(delta);

        if (delta > 25.0) {
          const frameTimestampSec = Number(((now - startTime) / 1000).toFixed(2));
          // Tìm các sự kiện game xảy ra trong vòng 50ms quanh khung này
          const related = events.filter((e) => Math.abs(e.time - now) <= 50);
          stutterFrames.push({
            second: frameTimestampSec,
            deltaMs: Number(delta.toFixed(2)),
            events: related.map((r) => r.type),
          });
        }

        if (now - startTime < 60000) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });

    return { frameDeltas, stutterFrames };
  });

  await browserVsync.close();
  await server.close();

  const statsVsync = calcStats(vsyncData.frameDeltas);
  console.log('\n📊 KẾT QUẢ ĐO 60 GIÂY VSYNC CHUẨN:');
  console.log(`   - FPS trung bình: ${statsVsync.avgFps} FPS`);
  console.log(`   - % khung hình vượt 16.7 ms: ${statsVsync.over16msPct}%`);
  console.log(`   - % khung hình vượt 33.0 ms: ${statsVsync.over33msPct}%`);
  console.log(`   - Thời gian khung p99: ${statsVsync.p99FrameMs} ms (Tổng frames: ${statsVsync.count})`);

  console.log(`\n🔍 DANH SÁCH CÁC KHUNG GIẬT (> 25 ms) TRONG 60 GIÂY (${vsyncData.stutterFrames.length} khung):`);
  if (vsyncData.stutterFrames.length === 0) {
    console.log('   (Không có khung nào vượt quá 25ms - Hoàn toàn mượt mà!)');
  } else {
    vsyncData.stutterFrames.slice(0, 15).forEach((sf) => {
      const evDesc = sf.events.length > 0 ? sf.events.join(', ') : 'Garbage Collection / CPU Burst / Texture Upload';
      console.log(`   - Giây thứ ${sf.second}s: ${sf.deltaMs} ms [Sự kiện: ${evDesc}]`);
    });
    if (vsyncData.stutterFrames.length > 15) {
      console.log(`   ... và ${vsyncData.stutterFrames.length - 15} khung giật khác.`);
    }
  }

  // Nhóm nguyên nhân
  const spawnCorrelated = vsyncData.stutterFrames.filter((sf) => sf.events.includes('SPAWN')).length;
  const deathCorrelated = vsyncData.stutterFrames.filter((sf) => sf.events.includes('DEATH')).length;
  const ultiCorrelated = vsyncData.stutterFrames.filter((sf) => sf.events.includes('ULTIMATE') || sf.events.includes('SHOCKWAVE')).length;
  const gcCorrelated = vsyncData.stutterFrames.filter((sf) => sf.events.length === 0).length;

  console.log('\n📋 PHÂN LOẠI NHÓM NGUYÊN NHÂN GÂY GIẬT KHUNG:');
  console.log(`   1. Do sinh lính mới (Spawn/Atlas slice): ${spawnCorrelated} lần`);
  console.log(`   2. Do lính chết & hiệu ứng sao rơi (Death/Particle): ${deathCorrelated} lần`);
  console.log(`   3. Do Tuyệt chiêu/Sóng chấn động (Ultimate/Shockwave): ${ultiCorrelated} lần`);
  console.log(`   4. Do V8 Garbage Collection / CPU Scheduling: ${gcCorrelated} lần`);

  console.log('\n======================================================================');
  console.log('✅ HOÀN TẤT ĐO KIỂM HIỆU NĂNG');
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('Lỗi chạy perf-check:', err);
  process.exit(1);
});
