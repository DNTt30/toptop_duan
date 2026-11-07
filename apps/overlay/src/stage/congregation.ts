import * as THREE from 'three';
import { templeAudio } from './temple-audio';

export type MemberActionState =
  | 'ENTERING'
  | 'SEATED'
  | 'WALKING_TO_ALTAR'
  | 'BOWING_AND_OFFERING'
  | 'WALKING_OFFER_LOTUS'
  | 'PROSTRATING_LOTUS'
  | 'CHANTING_AURA'
  | 'CIRCUMAMBULATING'
  | 'RETURNING';

export type BgEnvironmentMode = 'GOLDEN_TEMPLE' | 'COMMUNAL_HALL' | 'TEMPLE' | 'TRANSPARENT';

export interface CushionSlot {
  id: number;
  position: THREE.Vector3;
  rotationY: number;
  isOccupied: boolean;
  occupantId: string | null;
}

export interface EnvironmentPreset {
  floorY: number;
  altarPoint: THREE.Vector3;
  smokeOrigin: THREE.Vector3;
  positions: { x: number; z: number; rotY: number }[];
}

export const SEATING_PRESETS: Record<BgEnvironmentMode, EnvironmentPreset> = {
  // 1. Điện Phật Vàng (golden_temple_grand_hall.jpg)
  // Sàn gỗ phẳng y = -0.40, 18 bồ đoàn xếp chuẩn hàng lối 2 bên thảm đỏ chính điện
  GOLDEN_TEMPLE: {
    floorY: -0.40,
    altarPoint: new THREE.Vector3(0, -0.38, 0.28),
    smokeOrigin: new THREE.Vector3(0, 0.0, 0.10),
    positions: [
      { x: -0.62, z: 0.18, rotY: 0.10 },
      { x: 0.62, z: 0.18, rotY: -0.10 },
      { x: -1.05, z: 0.45, rotY: 0.16 },
      { x: 1.05, z: 0.45, rotY: -0.16 },
      { x: -1.68, z: 0.65, rotY: 0.22 },
      { x: 1.68, z: 0.65, rotY: -0.22 },
      { x: -1.38, z: 0.85, rotY: 0.16 },
      { x: 1.38, z: 0.85, rotY: -0.16 },
      { x: -2.10, z: 1.02, rotY: 0.22 },
      { x: 2.10, z: 1.02, rotY: -0.22 },
      { x: -1.72, z: 1.25, rotY: 0.16 },
      { x: 1.72, z: 1.25, rotY: -0.16 },
      { x: -2.52, z: 1.40, rotY: 0.22 },
      { x: 2.52, z: 1.40, rotY: -0.22 },
      { x: -2.08, z: 1.60, rotY: 0.16 },
      { x: 2.08, z: 1.60, rotY: -0.16 },
      { x: -2.95, z: 1.72, rotY: 0.22 },
      { x: 2.95, z: 1.72, rotY: -0.22 },
    ],
  },

  // 2. Sảnh Đình Làng (communal_house_hall.jpg)
  // Góc nhìn từ cao xuống sân gạch Bát Tràng giữa các cột gỗ lim cổ kính, y = -0.45
  COMMUNAL_HALL: {
    floorY: -0.45,
    altarPoint: new THREE.Vector3(0, -0.45, -0.30),
    smokeOrigin: new THREE.Vector3(0, -0.15, -0.30),
    positions: [
      { x: -0.75, z: 0.10, rotY: 0.12 },
      { x: 0.75, z: 0.10, rotY: -0.12 },
      { x: -1.25, z: 0.35, rotY: 0.16 },
      { x: 1.25, z: 0.35, rotY: -0.16 },
      { x: -0.85, z: 0.65, rotY: 0.14 },
      { x: 0.85, z: 0.65, rotY: -0.14 },
      { x: -1.45, z: 0.95, rotY: 0.18 },
      { x: 1.45, z: 0.95, rotY: -0.18 },
      { x: -1.05, z: 1.30, rotY: 0.15 },
      { x: 1.05, z: 1.30, rotY: -0.15 },
      { x: -1.75, z: 1.60, rotY: 0.20 },
      { x: 1.75, z: 1.60, rotY: -0.20 },
      { x: -1.25, z: 1.90, rotY: 0.16 },
      { x: 1.25, z: 1.90, rotY: -0.16 },
      { x: -2.10, z: 2.15, rotY: 0.22 },
      { x: 2.10, z: 2.15, rotY: -0.22 },
      { x: -1.55, z: 2.45, rotY: 0.18 },
      { x: 1.55, z: 2.45, rotY: -0.18 },
    ],
  },

  // 3. Chùa Hoàng Hôn Hồ Sen (temple_golden_hour.jpg)
  // Các đài sen bồng bềnh trên mặt nước hồ sen hoàng hôn thanh tịnh, y = -0.58
  TEMPLE: {
    floorY: -0.58,
    altarPoint: new THREE.Vector3(0, -0.25, 0.45),
    smokeOrigin: new THREE.Vector3(0, 0.05, 0.45),
    positions: [
      { x: -0.55, z: 0.35, rotY: 0.12 },
      { x: 0.55, z: 0.35, rotY: -0.12 },
      { x: -1.05, z: 0.50, rotY: 0.16 },
      { x: 1.05, z: 0.50, rotY: -0.16 },
      { x: -0.65, z: 0.68, rotY: 0.10 },
      { x: 0.65, z: 0.68, rotY: -0.10 },
      { x: -1.45, z: 0.85, rotY: 0.20 },
      { x: 1.45, z: 0.85, rotY: -0.20 },
      { x: -0.85, z: 1.05, rotY: 0.14 },
      { x: 0.85, z: 1.05, rotY: -0.14 },
      { x: -1.75, z: 1.20, rotY: 0.22 },
      { x: 1.75, z: 1.20, rotY: -0.22 },
      { x: -1.15, z: 1.35, rotY: 0.16 },
      { x: 1.15, z: 1.35, rotY: -0.16 },
      { x: -1.95, z: 1.48, rotY: 0.24 },
      { x: 1.95, z: 1.48, rotY: -0.24 },
      { x: -0.50, z: 1.42, rotY: 0.08 },
      { x: 0.50, z: 1.42, rotY: -0.08 },
    ],
  },

  // 4. Nền Trong Suốt OBS (Tượng Phật Procedural 3D)
  TRANSPARENT: {
    floorY: -0.40,
    altarPoint: new THREE.Vector3(0, -0.38, 0.28),
    smokeOrigin: new THREE.Vector3(0, 0.0, 0.10),
    positions: [
      { x: -0.85, z: 0.55, rotY: 0.35 },
      { x: 0.85, z: 0.55, rotY: -0.35 },
      { x: -1.35, z: 0.85, rotY: 0.40 },
      { x: 1.35, z: 0.85, rotY: -0.40 },
      { x: -0.50, z: 0.95, rotY: 0.18 },
      { x: 0.50, z: 0.95, rotY: -0.18 },
      { x: -1.15, z: 1.25, rotY: 0.28 },
      { x: 1.15, z: 1.25, rotY: -0.28 },
      { x: -1.85, z: 1.35, rotY: 0.42 },
      { x: 1.85, z: 1.35, rotY: -0.42 },
      { x: -0.65, z: 1.50, rotY: 0.15 },
      { x: 0.65, z: 1.50, rotY: -0.15 },
      { x: -1.45, z: 1.75, rotY: 0.26 },
      { x: 1.45, z: 1.75, rotY: -0.26 },
      { x: -2.35, z: 1.85, rotY: 0.45 },
      { x: 2.35, z: 1.85, rotY: -0.45 },
      { x: -0.75, z: 2.05, rotY: 0.12 },
      { x: 0.75, z: 2.05, rotY: -0.12 },
    ],
  },
};

/**
 * Đèn Hoa Đăng Thả Hồ Sen (Floating Water Lantern) — Kịch Bản 4
 */
export class FloatingWaterLantern {
  public readonly group = new THREE.Group();
  private life: number = 0;
  private readonly maxLife: number = 22.0;
  private readonly startY: number;
  private readonly flame: THREE.Mesh;

  constructor(startPos: THREE.Vector3) {
    this.startY = startPos.y;
    this.group.position.copy(startPos);

    // Đế hoa sen đồng mạ vàng
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.3,
      metalness: 0.85,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.02, 16), goldMat);
    this.group.add(base);

    // Tám cánh hoa sen hồng nở quanh đèn
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.4,
      metalness: 0.2,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 6), petalMat);
      petal.scale.set(1.1, 1.0, 0.4);
      petal.position.set(Math.sin(angle) * 0.06, 0.025, Math.cos(angle) * 0.06);
      petal.rotation.set(0.48 * Math.cos(angle), angle, 0.48 * Math.sin(angle));
      this.group.add(petal);
    }

    // Thân nến trắng sáp ngọc
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    candle.position.set(0, 0.035, 0);
    this.group.add(candle);

    // Ngọn lửa nến tỏa sáng lung linh
    this.flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    this.flame.position.set(0, 0.072, 0);
    this.group.add(this.flame);

    const innerFlame = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    innerFlame.position.set(0, 0.068, 0);
    this.group.add(innerFlame);
  }

  public update(delta: number, time: number): boolean {
    this.life += delta;
    if (this.life >= this.maxLife) return false;

    // Trôi êm đềm từ trái sang phải
    this.group.position.x += delta * 0.075;
    this.group.position.z += Math.sin(time * 0.8 + this.group.position.x) * (delta * 0.025);

    // Nhấp nhô sóng nước thanh tịnh
    this.group.position.y = this.startY + Math.sin(time * 2.2 + this.group.position.x * 2) * 0.012;

    const flicker = 0.85 + Math.sin(time * 12 + this.life * 5) * 0.25;
    this.flame.scale.set(flicker, flicker * 1.2, flicker);

    if (this.life > this.maxLife - 3.0) {
      const fade = (this.maxLife - this.life) / 3.0;
      this.group.scale.setScalar(Math.max(0.01, fade));
    }

    return true;
  }
}

/**
 * Nhân Vật Chú Tiểu Sa Di / Đồng Tu Tọa Thiền 3D Trong Đại Điện
 */
export class SanghaMember {
  public readonly id: string;
  public readonly username: string;
  public state: MemberActionState = 'ENTERING';

  public readonly group: THREE.Group = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly body: THREE.Mesh;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly handsMudra: THREE.Group;

  // Đạo cụ & Hiệu ứng tương tác
  private readonly incenseStick: THREE.Group;
  private readonly goldenLotus: THREE.Group;
  private readonly auraMesh: THREE.Mesh;
  private readonly chantingSprite: THREE.Sprite;
  private readonly nameTag: THREE.Sprite;

  public assignedCushion: CushionSlot | null = null;
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private stateTimer: number = 0;
  private breathPhase: number = Math.random() * Math.PI * 2;
  private circumambulateAngle: number = 0;

  // Tọa độ dâng hương trước bàn thờ điện Phật (thay đổi linh hoạt theo bối cảnh)
  private readonly altarPoint = new THREE.Vector3(0, -0.38, 0.28);

  constructor(
    id: string,
    username: string,
    startPos: THREE.Vector3,
    isInitiallySeated: boolean = false
  ) {
    this.id = id;
    this.username = username;

    const robeColors = [0xd97706, 0xb45309, 0xc2410c, 0x9a3412, 0x78350f];
    const robeColor = robeColors[Math.floor(Math.random() * robeColors.length)];

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xfde2d0,
      roughness: 0.5,
      metalness: 0.05,
    });

    const robeMat = new THREE.MeshStandardMaterial({
      color: robeColor,
      roughness: 0.65,
      metalness: 0.1,
    });

    // 1. Đầu chú tiểu sa di hiền từ
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.088, 24, 24), skinMat);
    this.head.position.set(0, 0.36, 0);
    this.head.rotation.x = -0.18;
    this.group.add(this.head);

    // Mắt khép thiền định hiền hòa & an nhiên
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x451a03 });
    const eyeGeo = new THREE.TorusGeometry(0.020, 0.004, 8, 16, Math.PI);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.034, 0.365, 0.082);
    eyeL.rotation.set(-0.15, 0, Math.PI);
    this.group.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.034, 0.365, 0.082);
    eyeR.rotation.set(-0.15, 0, Math.PI);
    this.group.add(eyeR);

    // Đôi má hồng hào phúc hậu
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.65 });
    const cheekGeo = new THREE.CircleGeometry(0.016, 12);
    const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
    cheekL.position.set(-0.046, 0.338, 0.082);
    cheekL.rotation.y = -0.15;
    this.group.add(cheekL);

    const cheekR = new THREE.Mesh(cheekGeo, cheekMat);
    cheekR.position.set(0.046, 0.338, 0.082);
    cheekR.rotation.y = 0.15;
    this.group.add(cheekR);

    // Nụ cười mỉm thanh tịnh
    const mouthGeo = new THREE.TorusGeometry(0.014, 0.003, 6, 12, Math.PI * 0.7);
    const mouth = new THREE.Mesh(mouthGeo, eyeMat);
    mouth.position.set(0, 0.328, 0.086);
    mouth.rotation.set(-0.25, 0, Math.PI);
    this.group.add(mouth);

    // Búi tóc chú tiểu trên đỉnh đầu
    const topknot = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    topknot.position.set(0, 0.455, 0);
    this.group.add(topknot);

    // 2. Thân áo vạt hò trang nghiêm
    this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.25, 18), robeMat);
    this.body.position.set(0, 0.19, 0);
    this.group.add(this.body);

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.35,
      metalness: 0.75,
    });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 8, 24, Math.PI), trimMat);
    collar.position.set(0, 0.27, 0.03);
    collar.rotation.set(0.55, 0, 0);
    this.group.add(collar);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.022, 18), trimMat);
    belt.position.set(0, 0.13, 0);
    this.group.add(belt);

    // Tràng hạt gỗ hương 108 hạt
    const malaGroup = new THREE.Group();
    const beadMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.35,
      metalness: 0.3,
    });
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), beadMat);
      bead.position.set(
        Math.cos(angle) * 0.08,
        0.28 - Math.sin(angle) * 0.115,
        0.03 + Math.sin(angle) * 0.045
      );
      malaGroup.add(bead);
    }
    const guruBead = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.2 })
    );
    guruBead.position.set(0, 0.165, 0.08);
    malaGroup.add(guruBead);
    this.group.add(malaGroup);

    // 3. Hai tay
    const armGeo = new THREE.CylinderGeometry(0.024, 0.02, 0.15, 12);
    this.armL = new THREE.Mesh(armGeo, robeMat);
    this.armL.position.set(-0.080, 0.20, 0.035);
    this.armL.rotation.set(0.95, 0, 0.38);
    this.group.add(this.armL);

    this.armR = new THREE.Mesh(armGeo, robeMat);
    this.armR.position.set(0.080, 0.20, 0.035);
    this.armR.rotation.set(0.95, 0, -0.38);
    this.group.add(this.armR);

    // Bàn tay chắp búp sen (Anjali Mudra) trang nghiêm trước ngực
    this.handsMudra = new THREE.Group();
    const handMat = skinMat;
    const palmL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.042, 0.026), handMat);
    palmL.position.set(-0.007, 0, 0);
    palmL.rotation.z = -0.12;
    const palmR = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.042, 0.026), handMat);
    palmR.position.set(0.007, 0, 0);
    palmR.rotation.z = 0.12;
    this.handsMudra.add(palmL);
    this.handsMudra.add(palmR);
    this.handsMudra.position.set(0, 0.19, 0.095);
    this.group.add(this.handsMudra);

    // 4. Hai chân ngồi xếp bằng kiết già (Padmasana)
    const legGeo = new THREE.CylinderGeometry(0.034, 0.028, 0.18, 12);
    this.legL = new THREE.Mesh(legGeo, robeMat);
    this.legL.position.set(-0.05, 0.03, 0);
    this.group.add(this.legL);

    this.legR = new THREE.Mesh(legGeo, robeMat);
    this.legR.position.set(0.05, 0.03, 0);
    this.group.add(this.legR);

    // 5. Nén hương dâng Phật (Kịch bản 2)
    this.incenseStick = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0xb45309 })
    );
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    ember.position.set(0, 0.08, 0);
    this.incenseStick.add(stick);
    this.incenseStick.add(ember);
    this.incenseStick.position.set(0, 0.26, 0.11);
    this.incenseStick.rotation.x = -0.3;
    this.incenseStick.visible = false;
    this.group.add(this.incenseStick);

    // 6. Đóa Sen Vàng Dâng Phật (Kịch bản 3: Đại Lễ Dâng Sen)
    this.goldenLotus = this.buildGoldenLotus();
    this.goldenLotus.position.set(0, 0.24, 0.13);
    this.goldenLotus.visible = false;
    this.group.add(this.goldenLotus);

    // 7. Vầng Hào Quang Trợ Niệm Hộ Thân (Kịch bản 5)
    this.auraMesh = this.buildAuraMesh();
    this.group.add(this.auraMesh);

    // 8. Dòng Chữ Niệm Phật Bay Lên (Kịch bản 5)
    this.chantingSprite = this.createChantingSprite();
    this.group.add(this.chantingSprite);

    // 9. Thẻ tên 3D Billboard hiển thị tên người xem tinh tế, rõ nét
    this.nameTag = this.createNameTagSprite(username);
    this.nameTag.position.set(0, 0.58, 0);
    this.group.add(this.nameTag);

    this.group.position.copy(startPos);
    this.group.scale.setScalar(0.46);

    if (isInitiallySeated) {
      this.state = 'SEATED';
      this.setSeatedPose();
    } else {
      this.state = 'ENTERING';
    }
  }

  public setAltarPoint(pos: THREE.Vector3): void {
    this.altarPoint.copy(pos);
  }

  private buildGoldenLotus(): THREE.Group {
    const lotus = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.9,
    });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), coreMat);
    lotus.add(core);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), goldMat);
      petal.position.set(Math.sin(angle) * 0.032, 0.012, Math.cos(angle) * 0.032);
      petal.rotation.set(0.45 * Math.cos(angle), angle, 0.45 * Math.sin(angle));
      lotus.add(petal);
    }
    return lotus;
  }

  private buildAuraMesh(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.38, 20, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.25, 0);
    return mesh;
  }

  private createChantingSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 340;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
      ctx.roundRect(8, 8, 324, 56, 28);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = 'bold 20px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪷 Nam Mô A Di Đà Phật 📿', 170, 36);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.55, 0.12, 1);
    sprite.position.set(0, 0.70, 0);
    sprite.visible = false;
    return sprite;
  }

  private createNameTagSprite(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 1024, 256);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      gradient.addColorStop(0.5, 'rgba(32, 18, 10, 0.96)');
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(24, 28, 976, 200, 100);
      ctx.fill();

      ctx.lineWidth = 10;
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fef08a';
      ctx.stroke();

      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;

      ctx.font = 'bold 76px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🪷 ${name}`, 512, 130);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.15, 0.29, 1);
    return sprite;
  }

  public assignCushion(cushion: CushionSlot): void {
    this.assignedCushion = cushion;
    this.targetPosition.copy(cushion.position);
    if (this.state !== 'SEATED') {
      this.state = 'ENTERING';
      this.stateTimer = 0;
    } else {
      this.group.position.copy(cushion.position);
      this.group.rotation.set(0, cushion.rotationY, 0);
    }
  }

  public triggerOfferIncense(): void {
    if (this.state === 'SEATED') {
      this.state = 'WALKING_TO_ALTAR';
      this.targetPosition.copy(this.altarPoint);
      this.incenseStick.visible = true;
      this.goldenLotus.visible = false;
      this.stateTimer = 0;
    }
  }

  public triggerOfferLotus(): void {
    if (this.state === 'SEATED') {
      this.state = 'WALKING_OFFER_LOTUS';
      this.targetPosition.copy(this.altarPoint);
      this.goldenLotus.visible = true;
      this.incenseStick.visible = false;
      this.stateTimer = 0;
    }
  }

  public triggerChantingAura(): void {
    if (this.state === 'SEATED') {
      this.state = 'CHANTING_AURA';
      this.stateTimer = 0;
      this.chantingSprite.visible = true;
      this.chantingSprite.position.set(0, 0.70, 0);
      (this.chantingSprite.material as THREE.SpriteMaterial).opacity = 1.0;
      (this.auraMesh.material as THREE.MeshBasicMaterial).opacity = 0.55;

      templeAudio.playChantingWoodfish(0.55);
    }
  }

  public triggerCircumambulate(initialAngle: number): void {
    if (this.state === 'SEATED') {
      this.state = 'CIRCUMAMBULATING';
      this.circumambulateAngle = initialAngle;
      this.stateTimer = 0;
      this.setStandingPose();
    }
  }

  public update(delta: number, time: number): void {
    this.stateTimer += delta;

    switch (this.state) {
      case 'ENTERING': {
        const dist = this.group.position.distanceTo(this.targetPosition);
        if (dist > 0.08) {
          const dir = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
          this.group.position.addScaledVector(dir, delta * 0.85);
          this.group.lookAt(this.targetPosition.x, this.group.position.y, this.targetPosition.z);

          this.legL.rotation.x = Math.sin(time * 8) * 0.45;
          this.legR.rotation.x = -Math.sin(time * 8) * 0.45;
        } else {
          this.group.position.copy(this.targetPosition);
          if (this.assignedCushion) {
            this.group.rotation.set(0, this.assignedCushion.rotationY, 0);
          }
          this.setSeatedPose();
          this.state = 'SEATED';
          templeAudio.playWoodfish(0.35);
        }
        break;
      }

      case 'SEATED': {
        const breath = Math.sin(time * 1.5 + this.breathPhase) * 0.012;
        const baseY = this.assignedCushion ? this.assignedCushion.position.y : -0.40;
        this.group.position.y = baseY + breath;
        this.head.rotation.x = Math.sin(time * 0.8) * 0.03;
        break;
      }

      case 'WALKING_TO_ALTAR': {
        this.setStandingPose();
        const dist = this.group.position.distanceTo(this.altarPoint);
        if (dist > 0.1) {
          const dir = new THREE.Vector3().subVectors(this.altarPoint, this.group.position).normalize();
          this.group.position.addScaledVector(dir, delta * 0.7);
          this.group.lookAt(this.altarPoint.x, this.group.position.y, this.altarPoint.z);

          this.legL.rotation.x = Math.sin(time * 7) * 0.4;
          this.legR.rotation.x = -Math.sin(time * 7) * 0.4;
        } else {
          this.group.position.copy(this.altarPoint);
          this.group.rotation.set(0, Math.PI, 0);
          this.state = 'BOWING_AND_OFFERING';
          this.stateTimer = 0;
        }
        break;
      }

      case 'BOWING_AND_OFFERING': {
        const bowCycle = Math.sin(this.stateTimer * 3.5);
        this.group.rotation.x = Math.max(0, bowCycle * 0.55);

        if (this.stateTimer > 3.0) {
          this.incenseStick.visible = false;
          templeAudio.playTempleBell(0.65);
          this.state = 'RETURNING';
          if (this.assignedCushion) {
            this.targetPosition.copy(this.assignedCushion.position);
          }
          this.stateTimer = 0;
        }
        break;
      }

      case 'WALKING_OFFER_LOTUS': {
        this.setStandingPose();
        this.armL.rotation.set(1.2, 0, 0.4);
        this.armR.rotation.set(1.2, 0, -0.4);

        const dist = this.group.position.distanceTo(this.altarPoint);
        if (dist > 0.1) {
          const dir = new THREE.Vector3().subVectors(this.altarPoint, this.group.position).normalize();
          this.group.position.addScaledVector(dir, delta * 0.75);
          this.group.lookAt(this.altarPoint.x, this.group.position.y, this.altarPoint.z);

          this.legL.rotation.x = Math.sin(time * 7) * 0.4;
          this.legR.rotation.x = -Math.sin(time * 7) * 0.4;
        } else {
          this.group.position.copy(this.altarPoint);
          this.group.rotation.set(0, Math.PI, 0);
          this.state = 'PROSTRATING_LOTUS';
          this.stateTimer = 0;
        }
        break;
      }

      case 'PROSTRATING_LOTUS': {
        const prostrationCycle = (this.stateTimer % 1.8) / 1.8;
        if (prostrationCycle < 0.5) {
          const t = prostrationCycle / 0.5;
          this.group.rotation.x = t * 1.1;
          this.group.position.y = this.altarPoint.y - t * 0.08;
          this.armL.rotation.set(1.5, 0, 0.2);
          this.armR.rotation.set(1.5, 0, -0.2);
        } else {
          const t = (prostrationCycle - 0.5) / 0.5;
          this.group.rotation.x = (1.0 - t) * 1.1;
          this.group.position.y = this.altarPoint.y - (1.0 - t) * 0.08;
          this.armL.rotation.set(0.8, 0, 0.5);
          this.armR.rotation.set(0.8, 0, -0.5);
        }

        if (this.stateTimer > 5.4) {
          this.goldenLotus.visible = false;
          templeAudio.playTempleBell(0.8);
          this.group.rotation.x = 0;
          this.state = 'RETURNING';
          if (this.assignedCushion) {
            this.targetPosition.copy(this.assignedCushion.position);
          }
          this.stateTimer = 0;
        }
        break;
      }

      case 'CHANTING_AURA': {
        const pulse = Math.sin(this.stateTimer * 6.0) * 0.15;
        const auraMat = this.auraMesh.material as THREE.MeshBasicMaterial;
        auraMat.opacity = Math.max(0, 0.45 + pulse - (this.stateTimer / 4.0) * 0.4);

        this.chantingSprite.position.y = 0.70 + this.stateTimer * 0.14;
        const chantMat = this.chantingSprite.material as THREE.SpriteMaterial;
        if (this.stateTimer > 2.5) {
          chantMat.opacity = Math.max(0, 1.0 - (this.stateTimer - 2.5) / 1.2);
        }

        this.head.rotation.x = 0.12;
        this.armL.rotation.set(0.9, 0, 0.35);
        this.armR.rotation.set(0.9, 0, -0.35);

        if (this.stateTimer > 3.8) {
          auraMat.opacity = 0;
          chantMat.opacity = 0;
          this.chantingSprite.visible = false;
          this.setSeatedPose();
          this.state = 'SEATED';
        }
        break;
      }

      case 'CIRCUMAMBULATING': {
        this.circumambulateAngle += delta * 0.45;
        const radius = 1.65;
        const targetX = Math.sin(this.circumambulateAngle) * radius;
        const targetZ = 0.95 + Math.cos(this.circumambulateAngle) * radius * 0.8;

        this.group.position.x = targetX;
        this.group.position.z = targetZ;
        this.group.position.y = this.assignedCushion ? this.assignedCushion.position.y : -0.40;

        const nextX = Math.sin(this.circumambulateAngle + 0.1) * radius;
        const nextZ = 0.95 + Math.cos(this.circumambulateAngle + 0.1) * radius * 0.8;
        this.group.lookAt(nextX, this.group.position.y, nextZ);

        this.legL.rotation.x = Math.sin(time * 6) * 0.4;
        this.legR.rotation.x = -Math.sin(time * 6) * 0.4;

        if (this.stateTimer > 14.0) {
          this.state = 'RETURNING';
          if (this.assignedCushion) {
            this.targetPosition.copy(this.assignedCushion.position);
          }
          this.stateTimer = 0;
        }
        break;
      }

      case 'RETURNING': {
        const dist = this.group.position.distanceTo(this.targetPosition);
        if (dist > 0.08) {
          const dir = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
          this.group.position.addScaledVector(dir, delta * 0.75);
          this.group.lookAt(this.targetPosition.x, this.group.position.y, this.targetPosition.z);

          this.legL.rotation.x = Math.sin(time * 7) * 0.4;
          this.legR.rotation.x = -Math.sin(time * 7) * 0.4;
        } else {
          this.group.position.copy(this.targetPosition);
          if (this.assignedCushion) {
            this.group.rotation.set(0, this.assignedCushion.rotationY, 0);
          }
          this.setSeatedPose();
          this.state = 'SEATED';
          templeAudio.playWoodfish(0.35);
        }
        break;
      }
    }
  }

  private setSeatedPose(): void {
    this.legL.rotation.set(1.4, 0, 0.45);
    this.legR.rotation.set(1.4, 0, -0.45);
    this.legL.position.set(-0.05, 0.02, 0.05);
    this.legR.position.set(0.05, 0.02, 0.05);

    this.armL.rotation.set(0.65, 0, 0.35);
    this.armR.rotation.set(0.65, 0, -0.35);
    this.handsMudra.visible = true;
  }

  private setStandingPose(): void {
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.legL.position.set(-0.05, 0.04, 0);
    this.legR.position.set(0.05, 0.04, 0);

    this.armL.rotation.set(0.8, 0, 0.5);
    this.armR.rotation.set(0.8, 0, -0.5);
    this.handsMudra.visible = false;
  }
}

/**
 * Quản Lý Toàn Bộ Đạo Tràng & Bồ Đoàn Tọa Thiền Đa Bối Cảnh
 */
export class CongregationManager {
  private readonly cushions: CushionSlot[] = [];
  private readonly thrones: THREE.Group[] = [];
  private readonly members = new Map<string, SanghaMember>();
  private readonly lanterns: FloatingWaterLantern[] = [];
  private readonly incenseBurner: THREE.Group = new THREE.Group();
  private readonly smokeParticles: THREE.Points;
  private readonly smokeCount = 48;
  private readonly smokePositions!: Float32Array;
  private smokeBasePos = new THREE.Vector3(0, 0.0, 0.10);

  private lastLanternTime: number = 0;
  private readonly maxLanterns: number = 10;
  private currentMode: BgEnvironmentMode = 'GOLDEN_TEMPLE';

  constructor(private readonly scene: THREE.Scene) {
    this.setupLotusThrones();
    this.buildIncenseBurner();
    this.smokeParticles = this.buildSmokeParticles();
    this.scene.add(this.smokeParticles);

    // Khởi tạo ngay 10 đồng tu tọa thiền thanh tịnh an nhiên từ đầu
    const initialMembers = [
      'Tuệ Quang',
      'Diệu Âm',
      'Tâm An',
      'Thiện Nhân',
      'Quang Linh',
      'Minh Anh',
      'Bảo Ngọc',
      'Huyền Trang',
      'Trí Dũng',
      'Phúc Lâm',
    ];
    initialMembers.forEach((name) => {
      this.addMember(name, true);
    });
  }

  /**
   * Thiết lập 18 Đài Sen Hồng Nở Rộ xếp theo ma trận phối cảnh
   */
  private setupLotusThrones(): void {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      metalness: 0.85,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.5,
      metalness: 0.2,
    });
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.38,
      metalness: 0.15,
      emissive: 0x881337,
      emissiveIntensity: 0.15,
    });
    const innerPetalMat = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      roughness: 0.35,
      metalness: 0.2,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const baseGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.03, 24);
    const cushionGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.04, 24);
    const petalGeo = new THREE.ConeGeometry(0.042, 0.11, 6);
    const ringGeo = new THREE.RingGeometry(0.20, 0.28, 32);
    ringGeo.rotateX(Math.PI / 2);

    const preset = SEATING_PRESETS.GOLDEN_TEMPLE;

    preset.positions.forEach((p, idx) => {
      const throne = new THREE.Group();

      // 1. Vầng hào quang gợn sóng dưới sàn điện
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.005;
      throne.add(ringMesh);

      // 2. Chân đế sen mạ vàng tam cấp
      const baseMesh = new THREE.Mesh(baseGeo, goldMat);
      baseMesh.position.y = 0.02;
      throne.add(baseMesh);

      // 3. Đệm tọa thiền gấm vàng hoàng gia
      const cushionMesh = new THREE.Mesh(cushionGeo, cushionMat);
      cushionMesh.position.y = 0.045;
      throne.add(cushionMesh);

      // 4. Vòng cánh sen ngoài (12 cánh sen hồng)
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.scale.set(1.2, 1.0, 0.38);
        petal.position.set(Math.sin(angle) * 0.14, 0.055, Math.cos(angle) * 0.14);
        petal.rotation.set(0.38 * Math.cos(angle), angle, 0.38 * Math.sin(angle));
        throne.add(petal);
      }

      // 5. Vòng cánh sen trong (8 cánh nhỏ điểm xuyết)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + 0.26;
        const petal = new THREE.Mesh(petalGeo, innerPetalMat);
        petal.scale.set(0.9, 0.8, 0.32);
        petal.position.set(Math.sin(angle) * 0.10, 0.065, Math.cos(angle) * 0.10);
        petal.rotation.set(0.28 * Math.cos(angle), angle, 0.28 * Math.sin(angle));
        throne.add(petal);
      }

      const pos = new THREE.Vector3(p.x, preset.floorY, p.z);
      throne.position.copy(pos);
      throne.rotation.y = p.rotY;

      this.scene.add(throne);
      this.thrones.push(throne);

      this.cushions.push({
        id: idx,
        position: pos,
        rotationY: p.rotY,
        isOccupied: false,
        occupantId: null,
      });
    });
  }

  /**
   * Chuyển đổi môi trường bối cảnh: vị trí bồ đoàn, độ nghiêng sàn, lư hương và khói
   */
  public setEnvironment(mode: BgEnvironmentMode): void {
    this.currentMode = mode;
    const preset = SEATING_PRESETS[mode] || SEATING_PRESETS.GOLDEN_TEMPLE;

    // 1. Cập nhật vị trí các đài sen/bồ đoàn
    preset.positions.forEach((p, idx) => {
      if (idx < this.thrones.length) {
        const throne = this.thrones[idx];
        if (throne) {
          throne.position.set(p.x, preset.floorY, p.z);
          throne.rotation.y = p.rotY;
        }
      }
      if (idx < this.cushions.length) {
        const c = this.cushions[idx];
        if (c) {
          c.position.set(p.x, preset.floorY, p.z);
          c.rotationY = p.rotY;
        }
      }
    });

    // 2. Cập nhật vị trí nhân vật đang ngồi hoặc đang dâng hương
    for (const member of this.members.values()) {
      member.setAltarPoint(preset.altarPoint);
      if (member.assignedCushion) {
        if (member.state === 'SEATED') {
          member.group.position.copy(member.assignedCushion.position);
          member.group.rotation.set(0, member.assignedCushion.rotationY, 0);
        }
      }
    }

    // 3. Cập nhật tọa độ khói hương và lư đồng
    this.smokeBasePos.copy(preset.smokeOrigin);
    this.incenseBurner.position.set(
      preset.smokeOrigin.x,
      preset.smokeOrigin.y - 0.18,
      preset.smokeOrigin.z + 0.18
    );
    this.incenseBurner.visible = (mode === 'TRANSPARENT');
  }

  private buildIncenseBurner(): void {
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.28,
      metalness: 0.85,
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.11, 24), bronzeMat);
    body.position.set(0, -0.18, 0.28);
    this.incenseBurner.add(body);

    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08, 12), bronzeMat);
      leg.position.set(Math.sin(angle) * 0.08, -0.25, 0.28 + Math.cos(angle) * 0.08);
      this.incenseBurner.add(leg);
    }

    const handleGeo = new THREE.TorusGeometry(0.04, 0.01, 12, 20);
    const handleL = new THREE.Mesh(handleGeo, bronzeMat);
    handleL.position.set(-0.13, -0.15, 0.28);
    handleL.rotation.y = Math.PI / 2;
    this.incenseBurner.add(handleL);

    const handleR = new THREE.Mesh(handleGeo, bronzeMat);
    handleR.position.set(0.13, -0.15, 0.28);
    handleR.rotation.y = Math.PI / 2;
    this.incenseBurner.add(handleR);

    this.scene.add(this.incenseBurner);
  }

  public setVisualMode(hasBackground: boolean): void {
    this.incenseBurner.visible = !hasBackground;
  }

  /**
   * Hạt khói trầm hương bốc lên uyển chuyển từ miệng bát hương trên bàn thờ
   */
  private buildSmokeParticles(): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.smokeCount * 3);

    for (let i = 0; i < this.smokeCount; i++) {
      const idx = i * 3;
      positions[idx] = this.smokeBasePos.x + (Math.random() - 0.5) * 0.05;
      positions[idx + 1] = this.smokeBasePos.y + Math.random() * 0.75;
      positions[idx + 2] = this.smokeBasePos.z + (Math.random() - 0.5) * 0.04;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    (this as any).smokePositions = positions;

    const mat = new THREE.PointsMaterial({
      color: 0xffedd5,
      size: 0.06,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return new THREE.Points(geo, mat);
  }

  public addMember(username: string, isInitiallySeated: boolean = false): SanghaMember | null {
    let slot = this.cushions.find((c) => !c.isOccupied);
    if (!slot) {
      slot = this.cushions[Math.floor(Math.random() * this.cushions.length)];
      if (slot && slot.occupantId) {
        this.removeMember(slot.occupantId);
      }
    }

    if (!slot) return null;

    const preset = SEATING_PRESETS[this.currentMode] || SEATING_PRESETS.GOLDEN_TEMPLE;
    const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const startPos = isInitiallySeated
      ? slot.position.clone()
      : new THREE.Vector3(slot.position.x > 0 ? 2.5 : -2.5, slot.position.y + 0.08, 3.8);

    const member = new SanghaMember(memberId, username, startPos, isInitiallySeated);
    member.setAltarPoint(preset.altarPoint);
    member.assignCushion(slot);

    slot.isOccupied = true;
    slot.occupantId = memberId;

    this.members.set(memberId, member);
    this.scene.add(member.group);

    return member;
  }

  public triggerGiftForUser(username: string): void {
    let target = this.findMember(username);
    if (!target) {
      target = this.addMember(username, false) ?? undefined;
    }
    if (target) {
      target.triggerOfferIncense();
    }
  }

  public triggerOfferLotusForUser(username: string): void {
    let target = this.findMember(username);
    if (!target) {
      target = this.addMember(username, false) ?? undefined;
    }
    if (target) {
      target.triggerOfferLotus();
    }
  }

  public triggerReleaseLantern(username?: string): void {
    const now = Date.now();
    if (now - this.lastLanternTime < 300) return;
    this.lastLanternTime = now;

    if (this.lanterns.length >= this.maxLanterns) {
      const oldest = this.lanterns.shift();
      if (oldest) {
        this.scene.remove(oldest.group);
      }
    }

    const preset = SEATING_PRESETS[this.currentMode] || SEATING_PRESETS.GOLDEN_TEMPLE;
    const startPos = new THREE.Vector3(
      -1.7 + (Math.random() - 0.5) * 0.35,
      preset.floorY,
      1.1 + Math.random() * 0.5
    );
    const lantern = new FloatingWaterLantern(startPos);
    this.lanterns.push(lantern);
    this.scene.add(lantern.group);

    templeAudio.playWelcomeChime(0.45);
  }

  public triggerChantingForUser(username?: string): void {
    let target: SanghaMember | undefined;
    if (username) {
      target = this.findMember(username);
    }
    if (!target) {
      const seated = Array.from(this.members.values()).filter((m) => m.state === 'SEATED');
      target = seated[Math.floor(Math.random() * seated.length)];
    }
    if (target) {
      target.triggerChantingAura();
    }
  }

  public triggerCircumambulation(): void {
    const seated = Array.from(this.members.values()).filter((m) => m.state === 'SEATED');
    if (seated.length === 0) return;

    templeAudio.playTempleBell(0.85);

    seated.forEach((member, index) => {
      const angleOffset = (index / seated.length) * Math.PI * 2;
      member.triggerCircumambulate(angleOffset);
    });
  }

  private findMember(username: string): SanghaMember | undefined {
    for (const member of this.members.values()) {
      if (member.username.toLowerCase() === username.toLowerCase()) {
        return member;
      }
    }
    return undefined;
  }

  public removeMember(id: string): void {
    const member = this.members.get(id);
    if (member) {
      if (member.assignedCushion) {
        member.assignedCushion.isOccupied = false;
        member.assignedCushion.occupantId = null;
      }
      this.scene.remove(member.group);
      this.members.delete(id);
    }
  }

  public update(delta: number, time: number): void {
    for (const member of this.members.values()) {
      member.update(delta, time);
    }

    for (let i = this.lanterns.length - 1; i >= 0; i--) {
      const lantern = this.lanterns[i];
      if (lantern && !lantern.update(delta, time)) {
        this.scene.remove(lantern.group);
        this.lanterns.splice(i, 1);
      }
    }

    if ((this as any).smokePositions) {
      const pos = (this as any).smokePositions as Float32Array;
      const base = this.smokeBasePos;
      for (let i = 0; i < this.smokeCount; i++) {
        const idx = i * 3;
        if (idx + 2 < pos.length) {
          const currentY = pos[idx + 1] ?? base.y;
          const nextY = currentY + delta * 0.16;
          const maxH = base.y + 0.85;
          pos[idx + 1] = nextY > maxH ? base.y : nextY;

          pos[idx] = base.x + Math.sin(time * 1.5 + i * 0.4) * 0.04;
          pos[idx + 2] = base.z + Math.cos(time * 1.2 + i * 0.3) * 0.025;

          if (nextY > maxH) {
            pos[idx] = base.x + (Math.random() - 0.5) * 0.04;
            pos[idx + 2] = base.z + (Math.random() - 0.5) * 0.03;
          }
        }
      }
      const attr = this.smokeParticles.geometry.attributes.position;
      if (attr) {
        attr.needsUpdate = true;
      }
    }
  }

  public destroy(): void {
    for (const member of this.members.values()) {
      this.scene.remove(member.group);
    }
    this.members.clear();
    for (const lantern of this.lanterns) {
      this.scene.remove(lantern.group);
    }
    this.lanterns.length = 0;
    this.scene.remove(this.incenseBurner);
    this.scene.remove(this.smokeParticles);
  }
}
