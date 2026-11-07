import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Kiểm tra rò rỉ biến toàn cục trên window ở Production Build', () => {
  it('Bản build production (dist/assets/*.js) không được rò rỉ window.__world, __netSync, gameSettings', () => {
    const distAssetsDir = path.resolve(__dirname, '../../dist/assets');
    if (!fs.existsSync(distAssetsDir)) {
      console.warn('Thư mục dist/assets chưa được tạo, bỏ qua kiểm tra bundle tĩnh');
      return;
    }

    const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      '__world',
      '__netSync',
      'window.gameSettings',
      '.gameSettings=',
    ];

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        const found = content.includes(pattern);
        if (found) {
          console.error(`Rò rỉ chuỗi cấm "${pattern}" trong file: ${file}`);
        }
        expect(found, `Phát hiện rò rỉ ${pattern} trong ${file}`).toBe(false);
      }
    }
  });
});
