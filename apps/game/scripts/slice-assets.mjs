import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, '..');
const conceptsDir = path.resolve(gameRoot, 'public', 'concepts');
const assetsDir = path.resolve(gameRoot, 'public', 'assets');
const distAssetsDir = path.resolve(gameRoot, 'dist', 'assets');

// Đảm bảo các thư mục đích tồn tại
for (const sub of ['bases', 'turrets', 'backgrounds', 'units']) {
  fs.mkdirSync(path.join(assetsDir, sub), { recursive: true });
}

async function run() {
  console.log('✂️ Tách nền trong suốt tự động (Alpha Chroma Keying) & Trích xuất Sprite...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function slice(inputFile, regions, makeTransparent = true) {
    const filePath = path.join(conceptsDir, inputFile);
    if (!fs.existsSync(filePath)) {
      console.warn('Không tìm thấy tệp:', filePath);
      return;
    }
    const b64 = fs.readFileSync(filePath).toString('base64');
    for (const r of regions) {
      const dataUrl = await page.evaluate(({ b64, r, makeTransparent }) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = r.w;
            canvas.height = r.h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);

            // Tự động khử nền trắng tinh/trắng xám sang trong suốt (Alpha = 0)
            if (makeTransparent) {
              const imgData = ctx.getImageData(0, 0, r.w, r.h);
              const d = imgData.data;
              for (let i = 0; i < d.length; i += 4) {
                const red = d[i];
                const green = d[i + 1];
                const blue = d[i + 2];
                // Nếu là màu trắng hoặc gần trắng của nền giấy
                if (red > 240 && green > 240 && blue > 240) {
                  d[i + 3] = 0;
                }
              }
              ctx.putImageData(imgData, 0, 0);
            }

            resolve(canvas.toDataURL('image/png'));
          };
          img.src = 'data:image/jpeg;base64,' + b64;
        });
      }, { b64, r, makeTransparent });

      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const outPath = path.join(assetsDir, r.category, r.name + '.png');
      fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
    }
  }

  // 1. CĂN CỨ VÀ THÁP TIỀN SỬ (Tách nền trắng thành trong suốt)
  await slice('prehistoric_bases_sheet.jpg', [
    { name: 'prehistoric_base_left', category: 'bases', x: 35, y: 0, w: 620, h: 480 },
    { name: 'prehistoric_base_right', category: 'bases', x: 710, y: 0, w: 620, h: 480 },
    { name: 'prehistoric_turret_1', category: 'turrets', x: 90, y: 550, w: 350, h: 210 },
    { name: 'prehistoric_turret_2', category: 'turrets', x: 500, y: 550, w: 350, h: 210 },
    { name: 'prehistoric_turret_3', category: 'turrets', x: 880, y: 540, w: 420, h: 220 },
  ], true);

  // 2. CĂN CỨ VÀ THÁP TRUNG CỔ (Tách nền trắng thành trong suốt)
  await slice('medieval_bases_sheet.jpg', [
    { name: 'medieval_base_left', category: 'bases', x: 0, y: 0, w: 610, h: 420 },
    { name: 'medieval_base_right', category: 'bases', x: 800, y: 0, w: 576, h: 410 },
    { name: 'medieval_turret_1', category: 'turrets', x: 360, y: 540, w: 230, h: 180 },
    { name: 'medieval_turret_2', category: 'turrets', x: 600, y: 530, w: 240, h: 190 },
    { name: 'medieval_turret_3', category: 'turrets', x: 840, y: 510, w: 270, h: 210 },
  ], true);

  // 3. NỀN TOÀN CẢNH PARALLAX TIỀN SỬ (Giữ nguyên nền bầu trời rực lửa)
  await slice('prehistoric_environment_sheet.jpg', [
    { name: 'prehistoric_bg_panorama', category: 'backgrounds', x: 20, y: 470, w: 1336, h: 285 },
  ], false);

  // 4. NỀN TOÀN CẢNH PARALLAX TRUNG CỔ (Giữ nguyên nền bầu trời, cắt bỏ nhãn gỗ)
  await slice('medieval_environment_sheet.jpg', [
    { name: 'medieval_bg_panorama', category: 'backgrounds', x: 35, y: 865, w: 826, h: 300 },
  ], false);

  // 5. NHÂN VẬT CHIBI CHÍNH 6 KỶ NGUYÊN (Tách nền trắng thành trong suốt để lính chạy trên nền game)
  const ages = [
    { file: 'prehistoric_concept_sheet.jpg', prefix: 'age1' },
    { file: 'medieval_concept_sheet.jpg', prefix: 'age2' },
    { file: 'renaissance_concept_sheet.jpg', prefix: 'age3' },
    { file: 'modern_concept_sheet.jpg', prefix: 'age4' },
    { file: 'futuristic_concept_sheet.jpg', prefix: 'age5' },
    { file: 'ai_singularity_concept_sheet.jpg', prefix: 'age6' },
  ];

  for (const a of ages) {
    await slice(a.file, [
      { name: `${a.prefix}_unit_melee`, category: 'units', x: 30, y: 20, w: 330, h: 400 },
      { name: `${a.prefix}_unit_ranged`, category: 'units', x: 370, y: 20, w: 330, h: 400 },
      { name: `${a.prefix}_unit_tank`, category: 'units', x: 700, y: 20, w: 360, h: 400 },
      { name: `${a.prefix}_unit_special`, category: 'units', x: 1060, y: 20, w: 310, h: 400 },
    ], true);
  }

  await browser.close();
  console.log('✓ Hoàn tất trích xuất và khử nền trong suốt (Transparent Sprites)!');
}

run().catch(console.error);
