import { getUnitFrameOverride, saveUnitFrameOverride, resetUnitFrameOverride, type FrameBox, type UnitFrameConfig, DEFAULT_FRAME_PRESETS } from '../data/frameOverrides';
import React, { useEffect, useRef, useState } from 'react';
import { AGES_DATA, type UnitConfig } from '../data/ages';
import { BACKGROUNDS_DATA } from '../data/backgrounds';
import { calculateSyncedWalkSpeed, getSpriteConfig, SPRITE_CONFIGS, type AnimationClipConfig, type SpriteConfig } from '../data/sprites';
import { spriteLoader } from '../engine/SpriteLoader';

interface PreviewGalleryProps {
  onBackToGame: () => void;
}

const AGE_FOLDER_MAP: Record<number, string> = {
  1: 'prehistoric',
  2: 'medieval',
  3: 'renaissance',
  4: 'modern',
  5: 'futuristic',
  6: 'ai',
};


const SHEET_NAME_MAP: Record<number, string> = {
  1: 'prehistoric',
  2: 'medieval',
  3: 'renaissance',
  4: 'modern',
  5: 'futuristic',
  6: 'ai_singularity',
};

const TYPE_INDEX_MAP: Record<string, number> = {
  MELEE: 0,
  RANGED: 1,
  TANK: 2,
  SPECIAL: 3,
};

const TYPE_FILE_MAP: Record<number, Record<string, string>> = {
  1: { MELEE: 'caveman', RANGED: 'hunter', TANK: 'dino', SPECIAL: 'shaman' },
  2: { MELEE: 'knight', RANGED: 'archer', TANK: 'cavalry', SPECIAL: 'priest' },
  3: { MELEE: 'pike', RANGED: 'musket', TANK: 'cannon_cart', SPECIAL: 'glider' },
  4: { MELEE: 'specops', RANGED: 'sniper', TANK: 'tank', SPECIAL: 'apache' },
  5: { MELEE: 'plasma_sword', RANGED: 'railgun', TANK: 'titan_mech', SPECIAL: 'carrier' },
  6: { MELEE: 'drone_swarm', RANGED: 'hacker', TANK: 'synth_mech', SPECIAL: 'avatar' },
};

export const PreviewGallery: React.FC<PreviewGalleryProps> = ({ onBackToGame }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SPRITE_PLAYER' | 'MANUAL_STUDIO'>('SPRITE_PLAYER');
  const [selectedAge, setSelectedAge] = useState<number>(1);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('stone_melee');
  const [selectedClip, setSelectedClip] = useState<'idle' | 'walk' | 'attack' | 'hurt' | 'die'>('walk');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [scrubbedFrame, setScrubbedFrame] = useState<number | null>(null);
  const [liveFrame, setLiveFrame] = useState<number>(0);
  const lastReportedFrameRef = useRef<number>(-1);

  // Debug toggles
  const [showHitbox, setShowHitbox] = useState<boolean>(true);
  const [showAnchor, setShowAnchor] = useState<boolean>(true);
  const [showHitFrameMarker, setShowHitFrameMarker] = useState<boolean>(true);
  const [showSlashFx, setShowSlashFx] = useState<boolean>(true);

  // Stress test 60 quân
  const [isStressTesting, setIsStressTesting] = useState<boolean>(false);
  const [fpsReadout, setFpsReadout] = useState<number>(60);
  const [vramReadout, setVramReadout] = useState<number>(6.0);

  // Canvas refs
  
  // State dành riêng cho Studio Tinh Chỉnh Bằng Tay
  const [studioClip, setStudioClip] = useState<'walk' | 'attack'>('walk');
  const [selectedStudioFrameIdx, setSelectedStudioFrameIdx] = useState<number>(0);
  const [studioUnitConfig, setStudioUnitConfig] = useState<UnitFrameConfig>(() => {
    return getUnitFrameOverride('stone_melee') || {
      unitId: 'stone_melee',
      unitName: 'Người Vượn Đập Gậy',
      age: 1,
      groundBaselineY: 88,
      scale: 2.0,
      walkFrames: [
        { x: 44, y: 0, w: 82, h: 90, dx: 0, dy: 0 },
        { x: 122, y: 0, w: 78, h: 90, dx: 0, dy: 0 },
        { x: 196, y: 0, w: 76, h: 90, dx: 0, dy: 0 },
        { x: 264, y: 0, w: 80, h: 90, dx: 0, dy: 0 },
      ],
      attackFrames: [
        { x: 38, y: 106, w: 94, h: 100, dx: 0, dy: 0 },
        { x: 138, y: 106, w: 110, h: 105, dx: 0, dy: 0 },
        { x: 248, y: 106, w: 96, h: 100, dx: 0, dy: 0 },
      ],
    };
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [jsonExportOpen, setJsonExportOpen] = useState<boolean>(false);

  type StudioDragMode =
    | 'NONE'
    | 'MOVE_BOX'
    | 'RESIZE_RIGHT'
    | 'RESIZE_LEFT'
    | 'RESIZE_TOP'
    | 'RESIZE_BOTTOM'
    | 'RESIZE_NW'
    | 'RESIZE_NE'
    | 'RESIZE_SW'
    | 'RESIZE_SE'
    | 'DRAG_BASELINE'
    | 'DRAG_LIVE_DY';

  interface StudioDragOp {
    mode: StudioDragMode;
    startX: number;
    startY: number;
    frameIdx: number;
    initialBox: FrameBox;
    initialBaseline: number;
  }

  const studioDragRef = useRef<StudioDragOp>({
    mode: 'NONE',
    startX: 0,
    startY: 0,
    frameIdx: 0,
    initialBox: { x: 0, y: 0, w: 0, h: 0, dx: 0, dy: 0 },
    initialBaseline: 84,
  });

  const [mouseTip, setMouseTip] = useState<string>('Rê chuột vào khung để di chuyển hoặc kéo 2 mép để co giãn');
  const [studioLiveFreeze, setStudioLiveFreeze] = useState<boolean>(false);

  const studioStripCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const studioLiveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const singlePlayerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stressCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Image cache
  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [, setForceRender] = useState<number>(0);

  const ageConfig = AGES_DATA[selectedAge] || AGES_DATA[1]!;
  const bgConfig = BACKGROUNDS_DATA[selectedAge] || BACKGROUNDS_DATA[1]!;
  const currentUnitConfig = ageConfig.units.find((u) => u.id === selectedUnitId) || ageConfig.units[0]!;
  const currentSpriteConfig = getSpriteConfig(selectedUnitId) || SPRITE_CONFIGS[selectedUnitId] || SPRITE_CONFIGS.stone_melee!;

  // Đường dẫn tài nguyên hình ảnh thực tế
  const folder = AGE_FOLDER_MAP[selectedAge] || 'prehistoric';
  const fname = TYPE_FILE_MAP[selectedAge]?.[currentUnitConfig.type] || 'caveman';
  const atlasSrc = `/sprites/${folder}/${fname}_atlas.png`;
  const directUnitSrc = `/assets/units/age${selectedAge}_unit_${currentUnitConfig.type.toLowerCase()}.png`;

  // Tải trước hình ảnh thực
  useEffect(() => {
    const conceptSheetSrc = `/concepts/${SHEET_NAME_MAP[selectedAge] || 'prehistoric'}_concept_sheet.jpg`;
    const urls = [atlasSrc, directUnitSrc, conceptSheetSrc];
    let isCancelled = false;

    urls.forEach((url) => {
      if (!loadedImagesRef.current.has(url)) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          if (!isCancelled) {
            loadedImagesRef.current.set(url, img);
            setForceRender((v) => v + 1);
          }
        };
      }
    });

    void spriteLoader.loadSprite(currentSpriteConfig).then(() => {
      setVramReadout(spriteLoader.getTotalVramUsageMb() || 6.0);
    });

    return () => {
      isCancelled = true;
    };
  }, [atlasSrc, directUnitSrc, currentSpriteConfig]);

  // Vòng lặp phát animation của 1 Sprite trên Single Player Canvas
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameTimer = 0;
    let currentFrame = scrubbedFrame !== null ? scrubbedFrame : 0;
    let flyingTime = 0;
    let dustParticles: Array<{ x: number; y: number; alpha: number; size: number }> = [];
    let slashEffectTimer = 0;

    const canvas = singlePlayerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderSingle = (time: number) => {
      const dt = Math.min(0.08, (time - lastTime) / 1000);
      lastTime = time;

      const clipCfg: AnimationClipConfig = currentSpriteConfig.clips[selectedClip] || currentSpriteConfig.clips.idle || {
        name: 'idle',
        startFrame: 0,
        frameCount: 4,
        fps: 8,
        loop: true,
      };

      const fps = (clipCfg.fps || 10) * playbackSpeed;
      const frameCount = Math.max(1, clipCfg.frameCount || 4);
      const hitFrame = clipCfg.hitFrame ?? Math.floor(frameCount / 2);

      if (isPlaying && scrubbedFrame === null) {
        frameTimer += dt;
        flyingTime += dt;
        // Animation thời gian thực: tính khung bằng elapsed * fps, drop frame khi tụt FPS
        if (clipCfg.loop) {
          currentFrame = Math.floor(frameTimer * fps) % frameCount;
        } else {
          currentFrame = Math.min(frameCount - 1, Math.floor(frameTimer * fps));
        }
      } else if (scrubbedFrame !== null) {
        currentFrame = scrubbedFrame % frameCount;
      }

      if (lastReportedFrameRef.current !== currentFrame) {
        lastReportedFrameRef.current = currentFrame;
        setLiveFrame(currentFrame);
      }

      // Xóa khung vẽ
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Vẽ nền Grid Phòng Lab Thiết Kế
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Mặt sàn Ground Line
      const groundY = 320;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(canvas.width, groundY);
      ctx.stroke();

      // Vạch phát quang dưới chân
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(canvas.width, groundY);
      ctx.stroke();

      const centerX = canvas.width / 2;
      const isFlying = !!currentSpriteConfig.flying || currentUnitConfig.flying;
      const flyingOffset = isFlying ? Math.sin(flyingTime * 3.5) * 14 - 50 : 0;
      const anchorY = groundY + flyingOffset;

      // 2. Bóng đổ mờ dưới chân
      const shadowScale = isFlying ? 0.6 : 1.0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(centerX, groundY + 4, 55 * shadowScale, 12 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bụi bước chân khi Walk
      if (selectedClip === 'walk' && isPlaying && !isFlying && Math.random() < 0.25) {
        dustParticles.push({
          x: centerX - 15 + Math.random() * 30,
          y: groundY - 2,
          alpha: 0.8,
          size: 4 + Math.random() * 5,
        });
      }

      for (let i = dustParticles.length - 1; i >= 0; i--) {
        const p = dustParticles[i]!;
        p.alpha -= dt * 1.5;
        p.size += dt * 8;
        p.x -= dt * 25;
        if (p.alpha <= 0) {
          dustParticles.splice(i, 1);
        } else {
          ctx.fillStyle = `rgba(148, 163, 184, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. TÍNH TOÁN VÀ VẼ HÌNH ẢNH THỰC TẾ (REAL ARTWORK)
      const atlasImg = loadedImagesRef.current.get(atlasSrc);
      const directImg = loadedImagesRef.current.get(directUnitSrc);

      const targetH = currentSpriteConfig.targetHeight || 200;
      const cellW = 256;
      const cellH = 256;
      const scale = targetH / cellH;

      const drawW = cellW * scale;
      const drawH = cellH * scale;

      // Tính biến dạng hành động (Action Transforms)
      let lungeX = 0;
      let rotDeg = 0;
      let scaleYMod = 1.0;
      let fadeAlpha = 1.0;
      let flashHurt = false;

      if (selectedClip === 'idle') {
        scaleYMod = 1.0 + Math.sin(flyingTime * 2.5) * 0.02;
      } else if (selectedClip === 'walk') {
        lungeX = Math.sin(currentFrame / frameCount * Math.PI * 2) * 8;
        rotDeg = Math.sin(currentFrame / frameCount * Math.PI * 2) * 4;
      } else if (selectedClip === 'attack') {
        const isHitFrame = currentFrame === hitFrame;
        if (currentFrame < hitFrame) {
          // Giai đoạn tích lực vung vũ khí
          rotDeg = -12 * ((currentFrame + 1) / (hitFrame + 1));
          lungeX = -8;
        } else if (isHitFrame) {
          // Giai đoạn ĐẬP TRÚNG ĐÍCH (HIT FRAME)
          lungeX = 26;
          rotDeg = 18;
          slashEffectTimer = 0.25;
        } else {
          // Giai đoạn thu hồi vũ khí
          lungeX = 10 * (1 - (currentFrame - hitFrame) / (frameCount - hitFrame));
          rotDeg = 5;
        }
      } else if (selectedClip === 'hurt') {
        lungeX = -18;
        rotDeg = -15;
        flashHurt = true;
      } else if (selectedClip === 'die') {
        rotDeg = -75 * Math.min(1.0, (currentFrame + 1) / frameCount);
        fadeAlpha = Math.max(0.15, 1.0 - (currentFrame / frameCount) * 0.85);
        lungeX = -20 * (currentFrame / frameCount);
      }

      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      ctx.translate(centerX + lungeX, anchorY);
      ctx.rotate((rotDeg * Math.PI) / 180);

      // Điểm vẽ căn cứ theo Anchor [0.5, 0.92]
      const anchorOffsetX = -drawW * currentSpriteConfig.anchor.x;
      const anchorOffsetY = -drawH * currentSpriteConfig.anchor.y;

      let imageDrawn = false;

      // Ưu tiên 1: Vẽ từ Atlas thực tế 6x4 (24 frames)
      if (atlasImg && atlasImg.complete && atlasImg.naturalWidth > 0) {
        const globalFrameIndex = (clipCfg.startFrame + currentFrame) % 24;
        const col = globalFrameIndex % 6;
        const row = Math.floor(globalFrameIndex / 6);
        const sx = col * cellW;
        const sy = row * cellH;

        try {
          ctx.drawImage(
            atlasImg,
            sx,
            sy,
            cellW,
            cellH,
            anchorOffsetX,
            anchorOffsetY,
            drawW,
            drawH * scaleYMod
          );
          imageDrawn = true;
        } catch {
          imageDrawn = false;
        }
      }

      // Ưu tiên 2: Vẽ từ ảnh Master Nhân Vật gốc (Direct Cutout PNG)
      if (!imageDrawn && directImg && directImg.complete && directImg.naturalWidth > 0) {
        const aspect = directImg.naturalWidth / directImg.naturalHeight;
        const directH = targetH;
        const directW = directH * aspect;
        const dx = -directW * currentSpriteConfig.anchor.x;
        const dy = -directH * currentSpriteConfig.anchor.y;

        try {
          ctx.drawImage(directImg, dx, dy, directW, directH * scaleYMod);
          imageDrawn = true;
        } catch {
          imageDrawn = false;
        }
      }

      // Hiệu ứng chớp đỏ khi bị đánh (Hurt Flash)
      if (flashHurt && imageDrawn) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.fillRect(anchorOffsetX, anchorOffsetY, drawW, drawH);
      }

      ctx.restore();

      // 4. HIỆU ỨNG CHIÊU THỨC / ĐÒN ĐÁNH (SLASH FX KHI CHẠM HIT FRAME)
      if (showSlashFx && (selectedClip === 'attack' && currentFrame === hitFrame || slashEffectTimer > 0)) {
        slashEffectTimer -= dt;
        const fxX = centerX + 40;
        const fxY = anchorY - targetH * 0.55;

        // Vệt chém bán nguyệt ánh kim vàng / đỏ
        ctx.save();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(fxX, fxY, 55, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fxX + 4, fxY, 52, -Math.PI * 0.35, Math.PI * 0.35);
        ctx.stroke();
        ctx.restore();

        // Tia lửa nổ
        for (let s = 0; s < 5; s++) {
          const sparkAngle = (Math.random() - 0.5) * Math.PI;
          const sparkDist = 30 + Math.random() * 40;
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fxX, fxY);
          ctx.lineTo(fxX + Math.cos(sparkAngle) * sparkDist, fxY + Math.sin(sparkAngle) * sparkDist);
          ctx.stroke();
        }
      }

      // 5. HIỂN THỊ HITBOX & FOOT ANCHOR
      if (showHitbox && currentSpriteConfig.hitbox) {
        const hb = currentSpriteConfig.hitbox;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(centerX + hb.x + lungeX, anchorY + hb.y, hb.width, hb.height);
        ctx.setLineDash([]);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px system-ui';
        ctx.fillText(`HITBOX [${hb.width}x${hb.height}]`, centerX + hb.x + lungeX + 4, anchorY + hb.y - 6);
      }

      if (showAnchor) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(centerX - 14, anchorY);
        ctx.lineTo(centerX + 14, anchorY);
        ctx.moveTo(centerX, anchorY - 14);
        ctx.lineTo(centerX, anchorY + 14);
        ctx.stroke();

        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(centerX, anchorY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px system-ui';
        ctx.fillText(`FOOT ANCHOR [${currentSpriteConfig.anchor.x}, ${currentSpriteConfig.anchor.y}]`, centerX + 16, anchorY + 16);
      }

      // 6. CHỈ BÁO KHUNG GHI SỰ KIỆN TRÚNG ĐÒN (HIT FRAME BADGE)
      if (showHitFrameMarker && selectedClip === 'attack') {
        const isHitNow = currentFrame === hitFrame;
        ctx.fillStyle = isHitNow ? 'rgba(239, 68, 68, 0.95)' : 'rgba(234, 179, 8, 0.85)';
        ctx.font = 'bold 14px system-ui';
        ctx.fillText(
          `⚔️ KHUNG HÌNH RA ĐÒN: ${currentFrame + 1}/${frameCount} ${
            isHitNow ? '💥 [HIT EVENT FIRED! SÁT THƯƠNG TÍNH TẠI ĐÂY]' : `(Khung ghim sát thương: ${hitFrame + 1})`
          }`,
          20,
          32
        );
      }

      animationFrameId = requestAnimationFrame(renderSingle);
    };

    animationFrameId = requestAnimationFrame(renderSingle);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    selectedUnitId,
    selectedClip,
    isPlaying,
    playbackSpeed,
    scrubbedFrame,
    showHitbox,
    showAnchor,
    showHitFrameMarker,
    showSlashFx,
    currentSpriteConfig,
    currentUnitConfig,
    atlasSrc,
    directUnitSrc,
  ]);

  // Vòng lặp đo đạc Stress Test 60 Quân Đồng Thời trên Stress Canvas
  useEffect(() => {
    if (!isStressTesting) return;

    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsAccumulator = 0;

    const canvas = stressCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Danh sách 60 quân với texture thực tế
    const allUnitImages = ageConfig.units.map((u) => {
      const src = `/assets/units/age${selectedAge}_unit_${u.type.toLowerCase()}.png`;
      return loadedImagesRef.current.get(src) || null;
    });

    const stressUnits = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: 30 + Math.random() * (canvas.width - 60),
      y: 60 + Math.random() * (canvas.height - 100),
      speed: 45 + Math.random() * 60,
      dir: Math.random() > 0.5 ? 1 : -1,
      frame: Math.floor(Math.random() * 8),
      unitIdx: i % ageConfig.units.length,
      bobPhase: Math.random() * Math.PI * 2,
    }));

    const renderStress = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      frameCount++;
      fpsAccumulator += dt;
      if (fpsAccumulator >= 0.5) {
        setFpsReadout(Math.round(frameCount / fpsAccumulator));
        frameCount = 0;
        fpsAccumulator = 0;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Y-sorting
      stressUnits.sort((a, b) => a.y - b.y);

      for (const u of stressUnits) {
        u.x += u.speed * u.dir * dt;
        if (u.x > canvas.width - 25) {
          u.x = canvas.width - 25;
          u.dir = -1;
        } else if (u.x < 25) {
          u.x = 25;
          u.dir = 1;
        }

        u.bobPhase += dt * 8;
        const bob = Math.abs(Math.sin(u.bobPhase)) * 4;

        // Bóng
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(u.x, u.y + 4, 16, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Vẽ ảnh thực tế của nhân vật
        const img = allUnitImages[u.unitIdx];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.translate(u.x, u.y - bob);
          ctx.scale(u.dir * 0.22, 0.22);
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight);
          ctx.restore();
        } else {
          // Fallback vector
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(u.x, u.y - 20 - bob, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(renderStress);
    };

    animId = requestAnimationFrame(renderStress);
    return () => cancelAnimationFrame(animId);
  }, [isStressTesting, selectedAge, ageConfig]);

  // Chọn Kỷ Nguyên
  
  // =========================================================================
  // STUDIO: MOUSE DRAG & RESIZE ENGINE CHO DẢI STRIP VÀ SÂN KHẤU LIVE
  // =========================================================================
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (studioDragRef.current.mode === 'NONE') return;

      const op = studioDragRef.current;
      const clipKey = studioClip === 'walk' ? 'walkFrames' : 'attackFrames';
      const rowOffset = 0;

      if (op.mode === 'DRAG_BASELINE') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaY = (cy - op.startY) / 2;
        const newBaseline = Math.round(Math.max(50, Math.min(115, op.initialBaseline + deltaY)));
        setStudioUnitConfig((prev) => ({
          ...prev,
          groundBaselineY: newBaseline,
        }));
      } else if (op.mode === 'MOVE_BOX') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const newX = Math.round(Math.max(0, Math.min(344 - init.w, init.x + deltaX)));
        const newY = Math.round(Math.max(rowOffset, Math.min(rowOffset + 115 - init.h, init.y + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, y: newY };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_RIGHT') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const newW = Math.round(Math.max(15, Math.min(344 - init.x, init.w + deltaX)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_LEFT') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const deltaX = (cx - op.startX) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const newX = Math.max(0, Math.min(rightAnchor - 15, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_BOTTOM') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const newH = Math.round(Math.max(15, Math.min(115, init.h + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_TOP') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const bottomAnchor = init.y + init.h;
        const newY = Math.max(rowOffset, Math.min(bottomAnchor - 15, Math.round(init.y + deltaY)));
        const newH = bottomAnchor - newY;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, y: newY, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_SE') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const newW = Math.round(Math.max(15, Math.min(344 - init.x, init.w + deltaX)));
        const newH = Math.round(Math.max(15, Math.min(115, init.h + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, w: newW, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_SW') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const newX = Math.max(0, Math.min(rightAnchor - 15, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        const newH = Math.round(Math.max(15, Math.min(115, init.h + deltaY)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_NE') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const bottomAnchor = init.y + init.h;
        const newY = Math.max(rowOffset, Math.min(bottomAnchor - 15, Math.round(init.y + deltaY)));
        const newH = bottomAnchor - newY;
        const newW = Math.round(Math.max(15, Math.min(344 - init.x, init.w + deltaX)));
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, y: newY, h: newH, w: newW };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'RESIZE_NW') {
        const canvas = studioStripCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * (688 / rect.width);
        const cy = (e.clientY - rect.top) * (220 / rect.height);
        const deltaX = (cx - op.startX) / 2;
        const deltaY = (cy - op.startY) / 2;
        const init = op.initialBox;
        const rightAnchor = init.x + init.w;
        const bottomAnchor = init.y + init.h;
        const newX = Math.max(0, Math.min(rightAnchor - 15, Math.round(init.x + deltaX)));
        const newW = rightAnchor - newX;
        const newY = Math.max(rowOffset, Math.min(bottomAnchor - 15, Math.round(init.y + deltaY)));
        const newH = bottomAnchor - newY;
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, x: newX, w: newW, y: newY, h: newH };
          }
          return { ...prev, [clipKey]: updated };
        });
      } else if (op.mode === 'DRAG_LIVE_DY') {
        const canvas = studioLiveCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cy = (e.clientY - rect.top) * (320 / rect.height);
        const deltaY = cy - op.startY;
        const init = op.initialBox;
        const newDy = Math.round((init.dy || 0) + deltaY);
        setStudioUnitConfig((prev) => {
          const updated = [...prev[clipKey]];
          if (updated[op.frameIdx]) {
            updated[op.frameIdx] = { ...updated[op.frameIdx]!, dy: newDy };
          }
          return { ...prev, [clipKey]: updated };
        });
      }
    };

    const handleWindowMouseUp = () => {
      if (studioDragRef.current.mode !== 'NONE') {
        studioDragRef.current.mode = 'NONE';
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [activeTab, studioClip]);

  const handleStripMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = studioStripCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (688 / rect.width);
    const cy = (e.clientY - rect.top) * (220 / rect.height);

    const baselineScreenY = (studioUnitConfig?.groundBaselineY ?? 84) * 2;
    // 1. Kiểm tra trúng đường sàn
    if (Math.abs(cy - baselineScreenY) <= 8) {
      studioDragRef.current = {
        mode: 'DRAG_BASELINE',
        startX: cx,
        startY: cy,
        frameIdx: selectedStudioFrameIdx,
        initialBox: { x: 0, y: 0, w: 0, h: 0, dx: 0, dy: 0 },
        initialBaseline: studioUnitConfig.groundBaselineY,
      };
      return;
    }

    const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
    const rowOffset = 0;

    // Kiểm tra active frame trước, sau đó các frame khác
    const checkOrder = [
      selectedStudioFrameIdx,
      ...frames.map((_, i) => i).filter((i) => i !== selectedStudioFrameIdx),
    ];

    const tol = 8;
    for (const i of checkOrder) {
      const fb = frames[i];
      if (!fb) continue;
      const bx = fb.x * 2;
      const by = (fb.y - rowOffset) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      // 4 góc
      if (Math.abs(cx - bx) <= tol && Math.abs(cy - by) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_NW', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - by) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_NE', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - bx) <= tol && Math.abs(cy - (by + bh)) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_SW', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - (by + bh)) <= tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_SE', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }

      // 4 mép
      if (Math.abs(cy - by) <= tol && cx >= bx - tol && cx <= bx + bw + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_TOP', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cy - (by + bh)) <= tol && cx >= bx - tol && cx <= bx + bw + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_BOTTOM', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - bx) <= tol && cy >= by - tol && cy <= by + bh + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_LEFT', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
      if (Math.abs(cx - (bx + bw)) <= tol && cy >= by - tol && cy <= by + bh + tol) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'RESIZE_RIGHT', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }

      // Thân frame
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        setSelectedStudioFrameIdx(i);
        studioDragRef.current = { mode: 'MOVE_BOX', startX: cx, startY: cy, frameIdx: i, initialBox: { ...fb }, initialBaseline: studioUnitConfig.groundBaselineY };
        return;
      }
    }
  };

  const handleStripMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (studioDragRef.current.mode !== 'NONE') return;
    const canvas = studioStripCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (688 / rect.width);
    const cy = (e.clientY - rect.top) * (220 / rect.height);

    const baselineScreenY = (studioUnitConfig?.groundBaselineY ?? 84) * 2;
    if (Math.abs(cy - baselineScreenY) <= 6) {
      canvas.style.cursor = 'ns-resize';
      return;
    }

    const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
    const rowOffset = 0;
    const tol = 8;

    for (let i = 0; i < frames.length; i++) {
      const fb = frames[i]!;
      const bx = fb.x * 2;
      const by = (fb.y - rowOffset) * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      // 4 góc
      if ((Math.abs(cx - bx) <= tol && Math.abs(cy - by) <= tol) || (Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - (by + bh)) <= tol)) {
        canvas.style.cursor = 'nwse-resize';
        return;
      }
      if ((Math.abs(cx - (bx + bw)) <= tol && Math.abs(cy - by) <= tol) || (Math.abs(cx - bx) <= tol && Math.abs(cy - (by + bh)) <= tol)) {
        canvas.style.cursor = 'nesw-resize';
        return;
      }

      // 4 mép
      if (Math.abs(cy - by) <= tol || Math.abs(cy - (by + bh)) <= tol) {
        if (cx >= bx - tol && cx <= bx + bw + tol) {
          canvas.style.cursor = 'ns-resize';
          return;
        }
      }
      if (Math.abs(cx - bx) <= tol || Math.abs(cx - (bx + bw)) <= tol) {
        if (cy >= by - tol && cy <= by + bh + tol) {
          canvas.style.cursor = 'ew-resize';
          return;
        }
      }

      // Thân frame
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        canvas.style.cursor = 'move';
        return;
      }
    }

    canvas.style.cursor = 'crosshair';
  };

  const handleLiveMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cy = (e.clientY - rect.top) * (320 / rect.height);
    const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
    const cur = frames[selectedStudioFrameIdx] || frames[0];
    if (!cur) return;

    setStudioLiveFreeze(true);
    studioDragRef.current = {
      mode: 'DRAG_LIVE_DY',
      startX: 0,
      startY: cy,
      frameIdx: selectedStudioFrameIdx,
      initialBox: { ...cur },
      initialBaseline: studioUnitConfig.groundBaselineY,
    };
  };

  const handleLiveMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (studioDragRef.current.mode !== 'NONE') return;
    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = 'ns-resize';
  };

  // Vòng lặp vẽ dải Strip gốc và các Bounding Box trên Studio (Gọn gàng, không che khuất hình)
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    const canvas = studioStripCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheetSrc = `/concepts/${SHEET_NAME_MAP[selectedAge] || 'prehistoric'}_concept_sheet.jpg`;
    const sheetImg = loadedImagesRef.current.get(sheetSrc);
    if (!sheetImg || !sheetImg.complete) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
    const stripX = colIdx * 344;
    const rowBaseY = studioClip === 'walk' ? 544 : 620;
    const stripH = studioClip === 'walk' ? 90 : 120;

    // 1. Vẽ dải ảnh gốc (phóng to 2x: 344x120 -> 688x240, lấy trọn vẹn chi tiết vũ khí và chùy vung)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheetImg, stripX, rowBaseY, 344, stripH, 0, 0, 688, stripH * 2);

    // 2. Đường sàn đất Ground Baseline Y (Thanh mảnh, nhãn góc phải, không che art)
    const baselineScreenY = (studioUnitConfig?.groundBaselineY ?? 84) * 2;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, baselineScreenY);
    ctx.lineTo(688, baselineScreenY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SÀN: ' + (studioUnitConfig?.groundBaselineY ?? 84) + 'px', 680, baselineScreenY - 3);
    ctx.textAlign = 'left';

    // 3. Khung cắt Frame (Bounding Boxes với 8 tay cầm nhỏ gọn kiểu Figma/Photoshop)
    const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
    frames.forEach((fb, idx) => {
      const isSel = idx === selectedStudioFrameIdx;
      const bx = fb.x * 2;
      const by = fb.y * 2;
      const bw = fb.w * 2;
      const bh = fb.h * 2;

      if (isSel) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
        ctx.fillRect(bx, by, bw, bh);

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        // 8 tay cầm nhỏ gọn (6x6 px) ở 4 góc và 4 mép
        const sz = 6;
        const hsz = 3;
        const drawHandle = (hx: number, hy: number) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx - hsz, hy - hsz, sz, sz);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1;
          ctx.strokeRect(hx - hsz, hy - hsz, sz, sz);
        };

        // 4 góc
        drawHandle(bx, by);
        drawHandle(bx + bw, by);
        drawHandle(bx, by + bh);
        drawHandle(bx + bw, by + bh);

        // 4 mép
        drawHandle(bx + bw / 2, by);
        drawHandle(bx + bw / 2, by + bh);
        drawHandle(bx, by + bh / 2);
        drawHandle(bx + bw, by + bh / 2);

        // Nhãn kích thước nhỏ gọn góc trên (không che art)
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('F' + (idx + 1) + ' [' + fb.w + '×' + fb.h + ']', bx + 2, Math.max(10, by - 4));
      } else {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.font = '9px monospace';
        ctx.fillText('F' + (idx + 1), bx + 2, by + 10);
      }
    });
  }, [activeTab, selectedAge, currentUnitConfig.type, studioClip, studioUnitConfig, selectedStudioFrameIdx]);

  // Vòng lặp phát animation trực tiếp trên Live Stage Studio (Gọn gàng)
  useEffect(() => {
    if (activeTab !== 'MANUAL_STUDIO') return;

    let animId: number;
    let lastTime = performance.now();
    let timer = 0;
    let frameIdx = 0;

    const canvas = studioLiveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheetSrc = `/concepts/${SHEET_NAME_MAP[selectedAge] || 'prehistoric'}_concept_sheet.jpg`;
    const sheetImg = loadedImagesRef.current.get(sheetSrc);

    const renderLive = (time: number) => {
      const dt = Math.min(0.08, (time - lastTime) / 1000);
      lastTime = time;

      const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
      const fps = 10 * playbackSpeed;

      if (frames.length > 0 && !studioLiveFreeze) {
        timer += dt;
        if (timer >= 1 / fps) {
          timer -= 1 / fps;
          frameIdx = (frameIdx + 1) % frames.length;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Nền Grid
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Vạch sàn đất chuẩn
      const groundLineY = 250;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundLineY);
      ctx.lineTo(canvas.width, groundLineY);
      ctx.stroke();

      // Bóng đổ
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, groundLineY + 3, 50, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Vẽ Frame hiện tại từ Concept Sheet
      if (sheetImg && sheetImg.complete && frames.length > 0) {
        const activeIdx = studioLiveFreeze
          ? Math.min(frames.length - 1, Math.max(0, selectedStudioFrameIdx))
          : (frameIdx % frames.length);
        const curBox = frames[activeIdx]!;
        const colIdx = TYPE_INDEX_MAP[currentUnitConfig.type] || 0;
        const rowBaseY = studioClip === 'walk' ? 544 : 620;
        const sx = colIdx * 344 + curBox.x;
        const sy = rowBaseY + curBox.y;
        const sw = curBox.w;
        const sh = curBox.h;

        const dw = sw * studioUnitConfig.scale;
        const dh = sh * studioUnitConfig.scale;

        const centerX = canvas.width / 2;
        const drawX = centerX - dw / 2 + (curBox.dx || 0);
        const footYFromTop = (studioClip === 'walk' ? 81 : 115) - curBox.y;
        const drawY = groundLineY - footYFromTop * studioUnitConfig.scale + (curBox.dy || 0);

        try {
          ctx.drawImage(sheetImg, sx, sy, sw, sh, drawX, drawY, dw, dh);
        } catch {
          // ignore
        }

        // Nhãn góc nhỏ gọn
        ctx.fillStyle = studioLiveFreeze ? '#facc15' : '#38bdf8';
        ctx.font = 'bold 11px monospace';
        const statusText = 'F' + (activeIdx + 1) + ' [' + curBox.w + '×' + curBox.h + ']' + (studioLiveFreeze ? ' (dy=' + (curBox.dy || 0) + ')' : '');
        ctx.fillText(statusText, 12, 20);
      }

      animId = requestAnimationFrame(renderLive);
    };

    animId = requestAnimationFrame(renderLive);
    return () => cancelAnimationFrame(animId);
  }, [activeTab, selectedAge, currentUnitConfig.type, studioClip, studioUnitConfig, playbackSpeed, studioLiveFreeze, selectedStudioFrameIdx]);


  const handleSelectAge = (ageId: number) => {
    setSelectedAge(ageId);
    const cfg = AGES_DATA[ageId];
    if (cfg && cfg.units[0]) {
      setSelectedUnitId(cfg.units[0].id);
    }
    setScrubbedFrame(null);
  };

  // Chọn Quân
  
  // Đồng bộ cấu hình Studio khi đổi quân hoặc kỷ nguyên
  useEffect(() => {
    const existing = getUnitFrameOverride(selectedUnitId);
    if (existing) {
      setStudioUnitConfig(existing);
    } else {
      const isModern = selectedAge === 4;
      const initialWalk: FrameBox[] = isModern
        ? [
            { x: 14, y: 0, w: 76, h: 100, dx: 0, dy: 0 },
            { x: 92, y: 0, w: 76, h: 100, dx: 0, dy: 0 },
            { x: 170, y: 0, w: 76, h: 100, dx: 0, dy: 0 },
            { x: 248, y: 0, w: 76, h: 100, dx: 0, dy: 0 },
          ]
        : [
            { x: 44, y: 0, w: 80, h: 92, dx: 0, dy: 0 },
            { x: 124, y: 0, w: 78, h: 92, dx: 0, dy: 0 },
            { x: 196, y: 0, w: 76, h: 92, dx: 0, dy: 0 },
            { x: 264, y: 0, w: 78, h: 92, dx: 0, dy: 0 },
          ];
      const initialAttack: FrameBox[] = [
        { x: 38, y: 106, w: 92, h: 102, dx: 0, dy: 0 },
        { x: 135, y: 106, w: 108, h: 102, dx: 0, dy: 0 },
        { x: 248, y: 106, w: 94, h: 102, dx: 0, dy: 0 },
      ];
      setStudioUnitConfig({
        unitId: selectedUnitId,
        unitName: currentUnitConfig.name,
        age: selectedAge,
        groundBaselineY: isModern ? 96 : 88,
        scale: 2.0,
        walkFrames: initialWalk,
        attackFrames: initialAttack,
      });
    }
    setSelectedStudioFrameIdx(0);
  }, [selectedUnitId, selectedAge, currentUnitConfig.name]);

  const handleSelectUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    setScrubbedFrame(null);
  };

  // Chọn Clip Hành Động
  const handleSelectClip = (clip: 'idle' | 'walk' | 'attack' | 'hurt' | 'die') => {
    setSelectedClip(clip);
    setScrubbedFrame(null);
  };

  const clipCfg = currentSpriteConfig.clips[selectedClip] || currentSpriteConfig.clips.idle;
  const currentTotalFrames = clipCfg?.frameCount || 4;
  const currentHitFrame = clipCfg?.hitFrame !== undefined ? clipCfg.hitFrame + 1 : 4;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#090d16',
        color: '#ffffff',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
        boxSizing: 'border-box',
        zIndex: 9999,
      }}
    >
      {/* HEADER & TAB SELECTOR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#38bdf8', margin: 0 }}>
              🛠️ AGENT-SPRITE-FORGE 3.0 & SHOWCASE GALLERY
            </h1>
            <span
              style={{
                background: '#0284c7',
                color: '#f0f9ff',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              24 QUÂN THẬT 100% ARTWORK
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>
            Kiểm thử chuyển động nhân vật thật, ghim sự kiện trúng đòn (hitFrame), sải chân khớp bước và đo FPS 60 quân.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ background: '#1e293b', padding: '4px', borderRadius: '12px', display: 'flex' }}>
            <button
              type="button"
              onClick={() => setActiveTab('SPRITE_PLAYER')}
              style={{
                background: activeTab === 'SPRITE_PLAYER' ? '#0284c7' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🎬 BỘ NẠP & PHÁT SPRITE
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('OVERVIEW')}
              style={{
                background: activeTab === 'OVERVIEW' ? '#0284c7' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🏛️ TỔNG QUAN 6 KỶ NGUYÊN
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('MANUAL_STUDIO')}
              style={{
                background: activeTab === 'MANUAL_STUDIO' ? '#0284c7' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🛠️ STUDIO CHỈNH TAY (FRAME & SÀN ĐẤT)
            </button>

          </div>

          <button
            type="button"
            onClick={onBackToGame}
            style={{
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '10px 20px',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            }}
          >
            ⚔️ Vào Chơi Game
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: BỘ NẠP SPRITE & TRÌNH PHÁT HOẠT HỌA                     */}
      {/* ============================================================== */}
      {activeTab === 'SPRITE_PLAYER' && (
        <div>
          {/* BƯỚC 1: CHỌN KỶ NGUYÊN (1 ĐẾN 6) */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6].map((ageId) => {
              const cfg = AGES_DATA[ageId]!;
              const isSelected = selectedAge === ageId;
              return (
                <button
                  key={ageId}
                  type="button"
                  onClick={() => handleSelectAge(ageId)}
                  style={{
                    background: isSelected ? 'linear-gradient(135deg, #eab308, #ca8a04)' : '#1e293b',
                    color: isSelected ? '#000000' : '#e2e8f0',
                    border: isSelected ? '2px solid #fef08a' : '1px solid #475569',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 16px rgba(234, 179, 8, 0.35)' : 'none',
                  }}
                >
                  Kỷ Nguyên {ageId}: {cfg.name}
                </button>
              );
            })}
          </div>

          {/* BƯỚC 2: CHỌN QUÂN TRONG 4 QUÂN CỦA KỶ NGUYÊN (HIỂN THỊ THUMBNAIL THẬT) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {ageConfig.units.map((unit) => {
              const isSelected = selectedUnitId === unit.id;
              const thumbSrc = `/assets/units/age${selectedAge}_unit_${unit.type.toLowerCase()}.png`;

              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => handleSelectUnit(unit.id)}
                  style={{
                    background: isSelected ? '#0369a1' : '#131d31',
                    color: isSelected ? '#ffffff' : '#cbd5e1',
                    border: isSelected ? '2.5px solid #38bdf8' : '1.5px solid #334155',
                    borderRadius: '14px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 18px rgba(56, 189, 248, 0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Thumbnail Avatar thật của nhân vật */}
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      background: '#090d16',
                      border: '1px solid #334155',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={thumbSrc}
                      alt={unit.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: isSelected ? '#fef08a' : '#94a3b8',
                          background: 'rgba(0,0,0,0.3)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {unit.type}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#facc15' }}>
                        💰 {unit.cost}G
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 900,
                        marginTop: '4px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {unit.name}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* MAIN PLAYER VIEW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', marginBottom: '24px' }}>
            {/* CỘT TRÁI: CANVAS PHÁT HOẠT HỌA SPRITE */}
            <div
              style={{
                background: '#020617',
                borderRadius: '16px',
                border: '1.5px solid #334155',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 900, color: '#38bdf8' }}>
                    📺 SÂN KHẤU HOẠT HỌA 256x256
                  </span>
                  <span style={{ background: '#1e293b', color: '#facc15', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                    {currentUnitConfig.name}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {atlasSrc}
                </span>
              </div>

              {/* Khung Canvas Viewport */}
              <div style={{ background: '#090d16', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b' }}>
                <canvas
                  ref={singlePlayerCanvasRef}
                  width={640}
                  height={380}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>

              {/* THANH ĐIỀU KHIỂN CLIPS HÀNH ĐỘNG */}
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 5 Nút Hành Động Rõ Ràng */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(
                    [
                      { key: 'idle', label: '🧍 IDLE (Đứng thở)', icon: '🧍' },
                      { key: 'walk', label: '🚶 WALK (Bước đi)', icon: '🚶' },
                      { key: 'attack', label: '⚔️ ATTACK (Ra đòn)', icon: '⚔️' },
                      { key: 'hurt', label: '💢 HURT (Bị trúng đòn)', icon: '💢' },
                      { key: 'die', label: '☠️ DIE (Tử trận)', icon: '☠️' },
                    ] as const
                  ).map((btn) => {
                    const isSel = selectedClip === btn.key;
                    return (
                      <button
                        key={btn.key}
                        type="button"
                        onClick={() => handleSelectClip(btn.key)}
                        style={{
                          flex: 1,
                          background: isSel
                            ? btn.key === 'attack'
                              ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                              : 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                            : '#1e293b',
                          color: isSel ? '#ffffff' : '#cbd5e1',
                          border: isSel ? '2px solid #93c5fd' : '1px solid #334155',
                          borderRadius: '10px',
                          padding: '10px 4px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: isSel ? '0 4px 12px rgba(37, 99, 235, 0.4)' : 'none',
                        }}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tua từng Frame & Tốc độ */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#0f172a',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #1e293b',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIsPlaying(!isPlaying)}
                      style={{
                        background: isPlaying ? '#dc2626' : '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {isPlaying ? '⏸ Tạm Dừng' : '▶ Phát Tiếp'}
                    </button>

                    {/* Điều khiển lùi/tiến từng frame */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setScrubbedFrame((f) => Math.max(0, (f ?? 0) - 1));
                      }}
                      style={{
                        background: '#334155',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                      title="Lùi 1 Frame"
                    >
                      ◀ Frame
                    </button>

                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#facc15' }}>
                      Frame: {scrubbedFrame !== null ? scrubbedFrame + 1 : liveFrame + 1}/{currentTotalFrames}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setScrubbedFrame((f) => ((f ?? 0) + 1) % currentTotalFrames);
                      }}
                      style={{
                        background: '#334155',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                      title="Tiến 1 Frame"
                    >
                      Frame ▶
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Tốc độ:</span>
                    {[0.25, 0.5, 1.0, 1.5, 2.0].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackSpeed(spd)}
                        style={{
                          background: playbackSpeed === spd ? '#2563eb' : '#1e293b',
                          color: playbackSpeed === spd ? '#fff' : '#94a3b8',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tùy chọn Hiển Thị Debug */}
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', paddingLeft: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#f87171' }}>
                    <input type="checkbox" checked={showHitbox} onChange={(e) => setShowHitbox(e.target.checked)} />
                    Hộp Va Chạm (Hitbox)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#38bdf8' }}>
                    <input type="checkbox" checked={showAnchor} onChange={(e) => setShowAnchor(e.target.checked)} />
                    Điểm Neo Chân (Foot Anchor)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#facc15' }}>
                    <input type="checkbox" checked={showHitFrameMarker} onChange={(e) => setShowHitFrameMarker(e.target.checked)} />
                    Khung Ghim Sát Thương (Hit Frame)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#ec4899' }}>
                    <input type="checkbox" checked={showSlashFx} onChange={(e) => setShowSlashFx(e.target.checked)} />
                    Vệt Chém & Tia Lửa (Slash FX)
                  </label>
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: CHI TIẾT THÔNG SỐ METADATA VÀ CHIẾN ĐẤU */}
            <div
              style={{
                background: '#131d31',
                borderRadius: '16px',
                border: '1.5px solid #334155',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header chi tiết nhân vật */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', borderBottom: '1px solid #1e293b', paddingBottom: '14px' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '12px',
                      background: '#090d16',
                      border: '2px solid #38bdf8',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={directUnitSrc}
                      alt={currentUnitConfig.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#facc15', background: '#334155', padding: '2px 8px', borderRadius: '4px' }}>
                      {currentUnitConfig.type}
                    </span>
                    <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#f8fafc', margin: '4px 0 0 0' }}>
                      {currentUnitConfig.name}
                    </h2>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                      Kỷ Nguyên {selectedAge}: {ageConfig.name}
                    </div>
                  </div>
                </div>

                {/* Bảng thông số kỹ thuật SpriteConfig */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Định dạng gói xuất:</span>
                    <strong style={{ color: '#38bdf8' }}>agent-sprite-forge 3.0 (JSON + Atlas)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Kích thước khung ô (Cell):</span>
                    <strong>256 x 256 px</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Khung hiện tại (Frame Index):</span>
                    <strong style={{ color: '#facc15' }}>Frame {scrubbedFrame !== null ? scrubbedFrame + 1 : liveFrame + 1} / {currentTotalFrames}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Điểm neo chân (Anchor):</span>
                    <strong style={{ color: '#06b6d4' }}>[{currentSpriteConfig.anchor.x}, {currentSpriteConfig.anchor.y}]</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Hộp trúng đòn (Hitbox):</span>
                    <strong style={{ color: '#ef4444' }}>
                      [{currentSpriteConfig.hitbox.width} x {currentSpriteConfig.hitbox.height} px]
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Khung ghim trúng đòn (hitFrame):</span>
                    <strong style={{ color: '#facc15' }}>
                      Khung thứ {currentHitFrame} / {clipCfg?.frameCount || 6}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Sải chân chu kỳ bước:</span>
                    <strong style={{ color: '#10b981' }}>{currentSpriteConfig.stridePx || 64} px</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Tốc độ khớp bước chân (Zero Slip):</span>
                    <strong style={{ color: '#10b981' }}>
                      {calculateSyncedWalkSpeed(
                        currentSpriteConfig.stridePx || 64,
                        currentSpriteConfig.clips.walk?.fps || 12,
                        currentSpriteConfig.clips.walk?.frameCount || 8
                      )} px/s
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Quân bay / Drone:</span>
                    <strong style={{ color: currentUnitConfig.flying || currentSpriteConfig.flying ? '#a855f7' : '#94a3b8' }}>
                      {currentUnitConfig.flying || currentSpriteConfig.flying ? 'Có (Dao động Code Sine Wave)' : 'Không (Đi bộ)'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                    <span>Thiếu clip "die" xử lý:</span>
                    <strong style={{ color: currentSpriteConfig.clips.die ? '#38bdf8' : '#eab308' }}>
                      {currentSpriteConfig.clips.die ? 'Atlas Frame' : 'Code Fallback (Mờ dần + Bay sao)'}
                    </strong>
                  </div>
                </div>

                {/* Chỉ số chiến đấu của quân */}
                <div
                  style={{
                    background: '#090d16',
                    borderRadius: '12px',
                    padding: '12px',
                    border: '1px solid #1e293b',
                    marginTop: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div>❤️ Máu: <strong style={{ color: '#22c55e' }}>{currentUnitConfig.hp}</strong></div>
                  <div>⚔️ Sát thương: <strong style={{ color: '#ef4444' }}>{currentUnitConfig.damage}</strong></div>
                  <div>🎯 Tầm đánh: <strong style={{ color: '#38bdf8' }}>{currentUnitConfig.range}px</strong></div>
                  <div>⚡ Tốc độ đi: <strong>{currentUnitConfig.speed}</strong></div>
                  <div>⏱️ Tốc đánh: <strong>{currentUnitConfig.attackSpeed}s</strong></div>
                  <div>🏆 Thưởng vàng: <strong style={{ color: '#facc15' }}>+{currentUnitConfig.bountyGold}G</strong></div>
                </div>

                {/* Báo cáo Đối chiếu Thời lượng Clip Attack vs Cooldown */}
                {(() => {
                  const atkClip = currentSpriteConfig.clips.attack;
                  const atkFps = atkClip?.fps || 10;
                  const atkFrames = atkClip?.frameCount || 4;
                  const atkDuration = atkFrames / atkFps;
                  const cd = currentUnitConfig.attackSpeed;
                  const isOk = cd >= atkDuration;
                  return (
                    <div
                      style={{
                        background: isOk ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        border: isOk ? '1px solid #16a34a' : '1px solid #dc2626',
                        marginTop: '14px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: isOk ? '#4ade80' : '#f87171', marginBottom: '4px' }}>
                        {isOk ? '✅ HỢP LỆ: Cooldown ≥ Độ Dài Clip Attack' : '⚠️ CẢNH BÁO: Clip Attack dài hơn Cooldown!'}
                      </div>
                      <div style={{ color: '#cbd5e1', lineHeight: '1.5' }}>
                        Thời lượng clip attack: <strong style={{ color: '#38bdf8' }}>{atkDuration.toFixed(2)}s</strong> ({atkFrames} frames @ {atkFps}fps) | Cooldown đòn đánh: <strong style={{ color: '#facc15' }}>{cd.toFixed(2)}s</strong>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {isOk
                          ? 'Đòn đánh hoàn tất trọn vẹn 100% trước khi đòn đánh kế tiếp diễn ra (chuẩn AnimationController).'
                          : 'AnimationController tự động bảo vệ: đòn đánh không bao giờ bị ngắt, tự động giữ cooldown >= thời lượng clip.'}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* BÁO DUNG LƯỢNG TEXTURE VRAM */}
              <div
                style={{
                  background: '#090d16',
                  borderRadius: '12px',
                  padding: '12px',
                  border: '1px solid #1e293b',
                  marginTop: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Dung lượng Texture VRAM:</span>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#38bdf8' }}>
                    💾 {vramReadout} MB
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Atlas gộp 1536x1024 RGBA8888. Nạp trước khi vào trận và giải phóng theo Kỷ nguyên.
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* MỤC KIỂM TRA HIỆU NĂNG 60 QUÂN THẬT ĐỒNG THỜI GIỮ 60 FPS       */}
          {/* ============================================================== */}
          <div
            style={{
              background: '#131d31',
              borderRadius: '16px',
              border: '1.5px solid #334155',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#10b981', margin: 0 }}>
                  🚀 STRESS TEST: 60 QUÂN THẬT HOẠT HỌA ĐỒNG THỜI (BENCHMARK 60 FPS)
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Đo đạc hiệu năng GPU/CPU khi 60 quân với texture đồ họa thật đồng thời di chuyển và ra đòn.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    background: '#020617',
                    padding: '8px 18px',
                    borderRadius: '10px',
                    border: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Tốc độ khung hình:</span>
                  <span
                    style={{
                      fontSize: '22px',
                      fontWeight: 900,
                      color: fpsReadout >= 58 ? '#22c55e' : fpsReadout >= 45 ? '#eab308' : '#ef4444',
                    }}
                  >
                    ⚡ {fpsReadout} FPS
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStressTesting(!isStressTesting)}
                  style={{
                    background: isStressTesting ? '#dc2626' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 22px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                  }}
                >
                  {isStressTesting ? '⏹ Dừng Stress Test' : '▶ Bắt Đầu Test 60 Quân Thật'}
                </button>
              </div>
            </div>

            {/* Canvas Stress Test */}
            <div
              style={{
                background: '#090d16',
                borderRadius: '12px',
                height: isStressTesting ? '230px' : '60px',
                transition: 'height 0.3s ease',
                overflow: 'hidden',
                border: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isStressTesting ? (
                <canvas ref={stressCanvasRef} width={1200} height={230} style={{ width: '100%', height: '100%' }} />
              ) : (
                <div style={{ color: '#64748b', fontSize: '14px' }}>
                  Nhấn "Bắt Đầu Test 60 Quân Thật" để kiểm thử tải GPU với 60 nhân vật hoạt họa.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: STUDIO TINH CHỈNH TAY (MANUAL FRAME & ANCHOR STUDIO)   */}
      {/* ============================================================== */}
      {activeTab === 'MANUAL_STUDIO' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Thanh Chọn Kỷ Nguyên & Loại Quân */}
          <div style={{ background: '#131d31', borderRadius: '16px', padding: '16px', border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#facc15' }}>
                  🛠️ BỘ TINH CHỈNH SPRITE BẰNG TAY (MANUAL STUDIO)
                </span>
                
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    saveUnitFrameOverride(studioUnitConfig);
                    spriteLoader.reloadSprite(studioUnitConfig.unitId);
                    setToastMsg('✅ Đã lưu cấu hình vào Game! Frame đã được căn chỉnh chuẩn xác.');
                    setTimeout(() => setToastMsg(null), 3000);
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.4)',
                  }}
                >
                  💾 Lưu Cấu Hình Vào Game
                </button>
                <button
                  type="button"
                  onClick={() => setJsonExportOpen(true)}
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📋 Xuất Mã JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetUnitFrameOverride(selectedUnitId);
                    setToastMsg('🔄 Đã khôi phục cấu hình mặc định.');
                    setTimeout(() => setToastMsg(null), 3000);
                  }}
                  style={{
                    background: '#1e293b',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Khôi Phục Gốc
                </button>
              </div>
            </div>

            {/* Selector Kỷ nguyên */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
              {[1, 2, 3, 4, 5, 6].map((ageId) => (
                <button
                  key={ageId}
                  type="button"
                  onClick={() => handleSelectAge(ageId)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: 'none',
                    background: selectedAge === ageId ? '#0284c7' : '#1e293b',
                    color: '#fff',
                  }}
                >
                  Kỷ Nguyên {ageId}
                </button>
              ))}
            </div>

            {/* Selector Quân */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              {ageConfig.units.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectUnit(u.id)}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: selectedUnitId === u.id ? '2px solid #38bdf8' : '1px solid #334155',
                    background: selectedUnitId === u.id ? '#1e3a5f' : '#1e293b',
                    color: '#fff',
                  }}
                >
                  {u.type}: {u.name}
                </button>
              ))}
            </div>
          </div>

          {/* Toast thông báo */}
          {toastMsg && (
            <div style={{ background: '#16a34a', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontWeight: 800, textAlign: 'center' }}>
              {toastMsg}
            </div>
          )}

          {/* PHẦN CHÍNH: CỘT TRÁI (DẢI CẮT) + CỘT PHẢI (LIVE PREVIEW) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
            {/* CỘT TRÁI: DẢI CONCEPT VÀ ĐIỀU KHIỂN CẮT FRAME */}
            <div style={{ background: '#131d31', borderRadius: '16px', padding: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Header điều khiển dải & thông số gọn gàng */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => { setStudioClip('walk'); setSelectedStudioFrameIdx(0); }}
                    style={{
                      background: studioClip === 'walk' ? '#0284c7' : '#1e293b',
                      color: '#fff',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Walk ({(studioUnitConfig?.walkFrames ?? []).length}F)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStudioClip('attack'); setSelectedStudioFrameIdx(0); }}
                    style={{
                      background: studioClip === 'attack' ? '#ef4444' : '#1e293b',
                      color: '#fff',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Attack ({(studioUnitConfig?.attackFrames ?? []).length}F)
                  </button>
                </div>

                {/* Thông số gọn gàng của Frame đang chọn */}
                {(() => {
                  const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
                  const cur = frames[selectedStudioFrameIdx] || frames[0];
                  if (!cur) return null;
                  return (
                    <div style={{ background: '#090d16', border: '1px solid #334155', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#facc15' }}>
                      F{selectedStudioFrameIdx + 1}: X={cur.x} Y={cur.y} W={cur.w} H={cur.h} | Sàn={studioUnitConfig?.groundBaselineY ?? 84} | dy={cur.dy || 0}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const frames = studioClip === 'walk' ? [...studioUnitConfig.walkFrames] : [...studioUnitConfig.attackFrames];
                      const last = frames[frames.length - 1] || { x: 10, y: studioClip === 'walk' ? 0 : 106, w: 80, h: 90 };
                      frames.push({ x: Math.min(260, last.x + last.w + 6), y: last.y, w: last.w, h: last.h, dx: 0, dy: 0 });
                      setStudioUnitConfig({
                        ...studioUnitConfig,
                        [studioClip === 'walk' ? 'walkFrames' : 'attackFrames']: frames,
                      });
                      setSelectedStudioFrameIdx(frames.length - 1);
                    }}
                    style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Thêm Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const frames = studioClip === 'walk' ? [...studioUnitConfig.walkFrames] : [...studioUnitConfig.attackFrames];
                      if (frames.length <= 1) return;
                      frames.splice(selectedStudioFrameIdx, 1);
                      setStudioUnitConfig({
                        ...studioUnitConfig,
                        [studioClip === 'walk' ? 'walkFrames' : 'attackFrames']: frames,
                      });
                      setSelectedStudioFrameIdx(Math.max(0, selectedStudioFrameIdx - 1));
                    }}
                    style={{ background: '#1e293b', color: '#f87171', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Xóa
                  </button>
                </div>
              </div>

              {/* Dải Concept Canvas (688 x 220) */}
              <div style={{ background: '#090d16', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155', padding: '4px' }}>
                <canvas
                  ref={studioStripCanvasRef}
                  width={688}
                  height={240}
                  style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair', userSelect: 'none' }}
                  onMouseDown={handleStripMouseDown}
                  onMouseMove={handleStripMouseMove}
                />
              </div>

              {/* Chọn Frame nhanh */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {(studioClip === 'walk' ? studioUnitConfig.walkFrames : studioUnitConfig.attackFrames).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedStudioFrameIdx(i)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedStudioFrameIdx === i ? '2px solid #facc15' : '1px solid #334155',
                      background: selectedStudioFrameIdx === i ? '#854d0e' : '#1e293b',
                      color: '#fff',
                    }}
                  >
                    F{i + 1}
                  </button>
                ))}
              </div>

              {/* BẢNG ĐIỀU KHIỂN NUDGE 5 THÔNG SỐ (X, W, H, SÀN, DY) */}
              {(() => {
                const frames = studioClip === 'walk' ? (studioUnitConfig?.walkFrames ?? []) : (studioUnitConfig?.attackFrames ?? []);
                const cur = frames[selectedStudioFrameIdx] || frames[0];
                if (!cur) return null;

                const updateCur = (delta: Partial<FrameBox>) => {
                  const updated = [...frames];
                  updated[selectedStudioFrameIdx] = { ...cur, ...delta };
                  setStudioUnitConfig({
                    ...studioUnitConfig,
                    [studioClip === 'walk' ? 'walkFrames' : 'attackFrames']: updated,
                  });
                };

                return (
                  <div style={{ background: '#090d16', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {/* 1. X */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Vị trí X ({cur.x}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ x: Math.max(0, cur.x - 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-5</button>
                        <button type="button" onClick={() => updateCur({ x: Math.max(0, cur.x - 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-1</button>
                        <button type="button" onClick={() => updateCur({ x: Math.min(344 - cur.w, cur.x + 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+1</button>
                        <button type="button" onClick={() => updateCur({ x: Math.min(344 - cur.w, cur.x + 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+5</button>
                      </div>
                    </div>

                    {/* 2. W (Chiều rộng) */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>Rộng W ({cur.w}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ w: Math.max(15, cur.w - 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-5</button>
                        <button type="button" onClick={() => updateCur({ w: Math.max(15, cur.w - 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-1</button>
                        <button type="button" onClick={() => updateCur({ w: Math.min(180, cur.w + 1) })} style={{ flex: 1, padding: '4px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+1</button>
                        <button type="button" onClick={() => updateCur({ w: Math.min(180, cur.w + 5) })} style={{ flex: 1, padding: '4px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+5</button>
                      </div>
                    </div>

                    {/* 3. H (Chiều cao) */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#facc15', fontWeight: 700 }}>Cao H ({cur.h}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ h: Math.max(15, cur.h - 5) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-5</button>
                        <button type="button" onClick={() => updateCur({ h: Math.max(15, cur.h - 1) })} style={{ flex: 1, padding: '4px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>-1</button>
                        <button type="button" onClick={() => updateCur({ h: Math.min(120, cur.h + 1) })} style={{ flex: 1, padding: '4px', background: '#854d0e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+1</button>
                        <button type="button" onClick={() => updateCur({ h: Math.min(120, cur.h + 5) })} style={{ flex: 1, padding: '4px', background: '#854d0e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+5</button>
                      </div>
                    </div>

                    {/* 4. Ground Baseline Y */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 700 }}>Sàn ({studioUnitConfig?.groundBaselineY ?? 84}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => setStudioUnitConfig({ ...studioUnitConfig, groundBaselineY: Math.max(50, studioUnitConfig.groundBaselineY - 2) })} style={{ flex: 1, padding: '4px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▲ Nâng</button>
                        <button type="button" onClick={() => setStudioUnitConfig({ ...studioUnitConfig, groundBaselineY: Math.min(115, studioUnitConfig.groundBaselineY + 2) })} style={{ flex: 1, padding: '4px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▼ Hạ</button>
                      </div>
                    </div>

                    {/* 5. dy bù chân */}
                    <div style={{ background: '#1e293b', padding: '8px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>Bù Chân dy ({cur.dy || 0}px)</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => updateCur({ dy: (cur.dy || 0) - 2 })} style={{ flex: 1, padding: '4px', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▲ Nâng</button>
                        <button type="button" onClick={() => updateCur({ dy: (cur.dy || 0) + 2 })} style={{ flex: 1, padding: '4px', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>▼ Chạm Sàn</button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CỘT PHẢI: SÂN KHẤU HOẠT HỌA TRỰC TIẾP (LIVE PREVIEW) */}
            <div style={{ background: '#131d31', borderRadius: '16px', padding: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>
                  📺 LIVE PREVIEW (60 FPS)
                </span>
                <button
                  type="button"
                  onClick={() => setStudioLiveFreeze(!studioLiveFreeze)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: studioLiveFreeze ? '1.5px solid #facc15' : '1px solid #475569',
                    background: studioLiveFreeze ? '#854d0e' : '#1e293b',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {studioLiveFreeze ? '⏸️ Tạm Dừng (Kéo Chân)' : '▶️ Hoạt Ảnh (Click Tạm Dừng)'}
                </button>
              </div>

              <div style={{ background: '#090d16', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
                <canvas
                  ref={studioLiveCanvasRef}
                  width={400}
                  height={320}
                  style={{ width: '100%', height: 'auto', display: 'block', cursor: 'ns-resize', userSelect: 'none' }}
                  onMouseDown={handleLiveMouseDown}
                  onMouseMove={handleLiveMouseMove}
                />
              </div>

              {/* Tốc độ phát */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#090d16', padding: '8px 12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Tốc độ:</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => { setPlaybackSpeed(spd); setStudioLiveFreeze(false); }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: (!studioLiveFreeze && playbackSpeed === spd) ? '1px solid #38bdf8' : '1px solid #334155',
                        background: (!studioLiveFreeze && playbackSpeed === spd) ? '#0284c7' : '#1e293b',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Modal Xuất JSON */}
          {jsonExportOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#0f172a', padding: '24px', borderRadius: '16px', border: '1.5px solid #38bdf8', maxWidth: '600px', width: '90%' }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8' }}>📋 Mã Cấu Hình JSON Cho {studioUnitConfig.unitName}</h3>
                <textarea
                  readOnly
                  value={JSON.stringify(studioUnitConfig, null, 2)}
                  style={{ width: '100%', height: '260px', background: '#090d16', color: '#22c55e', fontFamily: 'monospace', padding: '10px', borderRadius: '8px', border: '1px solid #334155', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(studioUnitConfig, null, 2));
                      setToastMsg('📋 Đã sao chép mã JSON vào clipboard!');
                      setJsonExportOpen(false);
                      setTimeout(() => setToastMsg(null), 3000);
                    }}
                    style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Sao Chép JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setJsonExportOpen(false)}
                    style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: OVERVIEW BỐI CẢNH 6 KỶ NGUYÊN (SHOWCASE ĐẦY ĐỦ)         */}
      {/* ============================================================== */}
      {activeTab === 'OVERVIEW' && (
        <div>
          {/* CHỌN KỶ NGUYÊN */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6].map((ageId) => {
              const cfg = AGES_DATA[ageId]!;
              const isSelected = selectedAge === ageId;
              return (
                <button
                  key={ageId}
                  type="button"
                  onClick={() => handleSelectAge(ageId)}
                  style={{
                    background: isSelected ? 'linear-gradient(135deg, #eab308, #ca8a04)' : '#1e293b',
                    color: isSelected ? '#000000' : '#e2e8f0',
                    border: isSelected ? '2px solid #fef08a' : '1px solid #475569',
                    borderRadius: '12px',
                    padding: '10px 18px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 20px rgba(234, 179, 8, 0.4)' : 'none',
                  }}
                >
                  Kỷ Nguyên {ageId}: {cfg.name}
                </button>
              );
            })}
          </div>

          {/* THÔNG TIN BỐI CẢNH NỀN & CĂN CỨ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
            <div style={{ background: '#131d31', borderRadius: '16px', padding: '18px', border: '1.5px solid #334155' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#facc15', marginBottom: '10px' }}>
                🌄 Bối Cảnh Parallax 4 Lớp: {bgConfig.name}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', color: '#cbd5e1' }}>
                <div><strong>Lớp 1 (Trời):</strong> Gradient Hex #{bgConfig.palette.skyGradient[0].toString(16)} ➔ #{bgConfig.palette.skyGradient[1].toString(16)}</div>
                <div><strong>Lớp 2 (Xa):</strong> Núi / Skyline màu #{bgConfig.palette.farMountainColor.toString(16)}</div>
                <div><strong>Lớp 3 (Gần):</strong> Vật thể đặc thù ({bgConfig.landmarks.type})</div>
                <div><strong>Lớp 4 (Mặt đất):</strong> Mặt lane chiến đấu #{bgConfig.palette.groundSurfaceColor.toString(16)}</div>
              </div>
            </div>

            <div style={{ background: '#131d31', borderRadius: '16px', padding: '18px', border: '1.5px solid #334155' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#f43f5e', marginBottom: '10px' }}>
                ⚡ Tuyệt Chiêu & Tháp Canh
              </h2>
              <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
                <div><strong>Tuyệt Chiêu:</strong> {ageConfig.ultimate.name} (Hồi chiêu {ageConfig.ultimate.cooldown}s)</div>
                <div style={{ color: '#94a3b8', fontStyle: 'italic', marginBottom: '8px' }}>{ageConfig.ultimate.description}</div>
                <div><strong>Tháp Canh Slot:</strong> {ageConfig.turrets[0]?.name || 'Không có'} (Giá {ageConfig.turrets[0]?.cost || 0}G, Sát thương {ageConfig.turrets[0]?.damage || 0})</div>
              </div>
            </div>
          </div>

          {/* LƯỚI 4 QUÂN LÍNH CHIBI */}
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#38bdf8', marginBottom: '16px' }}>
            ⚔️ 4 ĐƠN VỊ LÍNH THỜI {ageConfig.name.toUpperCase()} (TỶ LỆ CHIBI 90-110PX)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
            {ageConfig.units.map((unit) => {
              const unitImgSrc = `/assets/units/age${selectedAge}_unit_${unit.type.toLowerCase()}.png`;

              return (
                <div
                  key={unit.id}
                  style={{
                    background: '#0f172a',
                    border: `2px solid #${unit.color.toString(16).padStart(6, '0')}`,
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ background: '#334155', color: '#facc15', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>
                        {unit.type}
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: '#facc15' }}>
                        💰 {unit.cost}G
                      </span>
                    </div>

                    {/* Artwork Preview */}
                    <div
                      style={{
                        height: '130px',
                        background: '#020617',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '12px',
                        border: '1px solid #1e293b',
                        padding: '8px',
                      }}
                    >
                      <img
                        src={unitImgSrc}
                        alt={unit.name}
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    </div>

                    <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 6px 0', color: '#f8fafc' }}>
                      {unit.name}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#94a3b8', minHeight: '40px', lineHeight: '1.4' }}>
                      {unit.description}
                    </p>
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid #334155',
                      paddingTop: '10px',
                      marginTop: '10px',
                      fontSize: '13px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      color: '#cbd5e1',
                    }}
                  >
                    <div>❤️ Máu: <strong>{unit.hp}</strong></div>
                    <div>⚔️ ST: <strong>{unit.damage}</strong></div>
                    <div>🎯 Tầm: <strong>{unit.range}px</strong></div>
                    <div>⚡ Tốc: <strong>{unit.speed}</strong></div>
                    <div>⏳ Ra quân: <strong>{unit.spawnTime}s</strong></div>
                    <div>🏆 Thưởng: <strong>+{unit.bountyGold}G</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
