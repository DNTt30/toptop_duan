import * as THREE from 'three';
import { CongregationManager, type BgEnvironmentMode } from './congregation';
import { templeAudio } from './temple-audio';

export interface SacredStageConfig {
  container: HTMLElement;
}

const CAMERA_PRESETS: Record<BgEnvironmentMode, { fov: number; pos: THREE.Vector3; lookAt: THREE.Vector3 }> = {
  GOLDEN_TEMPLE: {
    fov: 42,
    pos: new THREE.Vector3(0, 2.05, 5.6),
    lookAt: new THREE.Vector3(0, 0.65, 0),
  },
  COMMUNAL_HALL: {
    fov: 48,
    pos: new THREE.Vector3(0, 3.1, 5.5),
    lookAt: new THREE.Vector3(0, 0.45, 0.2),
  },
  TEMPLE: {
    fov: 46,
    pos: new THREE.Vector3(0, 1.85, 5.2),
    lookAt: new THREE.Vector3(0, 0.75, 0),
  },
  TRANSPARENT: {
    fov: 44,
    pos: new THREE.Vector3(0, 2.15, 5.4),
    lookAt: new THREE.Vector3(0, 0.65, 0),
  },
};

export class SacredBuddhaStage {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();
  private isDestroyed = false;

  // 3D Objects
  private buddhaGroup: THREE.Group = new THREE.Group();
  private lotusGroup: THREE.Group = new THREE.Group();
  private haloGroup: THREE.Group = new THREE.Group();
  private haloLight!: THREE.PointLight;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;

  // Petals for bloom animation
  private petalMeshes: { mesh: THREE.Mesh; baseRotX: number; maxOpenRotX: number }[] = [];

  // Particle systems
  private fallingPetals: THREE.InstancedMesh | null = null;
  private petalMatrices: THREE.Matrix4[] = [];
  private petalVelocities: { x: number; y: number; z: number; rotSpeed: number; swayPhase: number }[] = [];
  private readonly petalCount = 28; // Giảm hiệu ứng hoa rơi để không che khuất sảnh và người (Yêu cầu người dùng)

  private starlightPoints: THREE.Points | null = null;
  private readonly starlightCount = 100;
  private starlightPositions!: Float32Array;

  // Animation state
  private bloomProgress = 1.0; // 0 = closed, 1 = bloomed
  private targetBloom = 1.0;
  private haloRotationSpeed = 0.35;
  private targetHaloSpeed = 0.35;
  private lightBurstIntensity = 0.0;

  // Quản lý Đạo Tràng & Bồ Đoàn Tọa Thiền
  private congregationManager!: CongregationManager;

  constructor(private readonly container: HTMLElement) {
    this.scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth || 1280;
    const height = container.clientHeight || window.innerHeight || 720;

    // Góc nhìn phối cảnh 16:9 bao quát toàn cảnh đại điện, trọn vẹn toàn bộ nhân vật và bồ đoàn
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(0, 2.05, 5.6);
    this.camera.lookAt(0, 0.65, 0);

    try {
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(this.renderer.domElement);
    } catch {
      this.renderer = null;
    }

    this.setupLighting();
    this.buildSacredBuddha();
    this.buildLotusPedestal();
    this.buildSacredHalo();
    this.buildFallingPetalParticles();
    this.buildStarlightParticles();

    // Khởi tạo Đạo Tràng & 28 Đài Sen Hồng Tọa Thiền với nhiều đồng tu tham gia
    this.congregationManager = new CongregationManager(this.scene);

    // Mặc định ẩn mô hình procedural khi có hình nền chính điện chùa vàng lộng lẫy (chuẩn livestream Zuno Live)
    this.setVisualMode(true);

    this.startRenderLoop();
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Chuyển đổi hiển thị giữa chế độ có ảnh nền chùa lộng lẫy và chế độ trong suốt OBS
   */
  public setVisualMode(hasBackground: boolean): void {
    this.setEnvironmentMode(hasBackground ? 'GOLDEN_TEMPLE' : 'TRANSPARENT');
  }

  /**
   * Chuyển đổi bối cảnh linh thiêng toàn diện: Camera phối cảnh, độ nghiêng sàn, bồ đoàn, âm thanh
   */
  public setEnvironmentMode(mode: BgEnvironmentMode): void {
    const cam = CAMERA_PRESETS[mode] || CAMERA_PRESETS.GOLDEN_TEMPLE;
    this.camera.fov = cam.fov;
    this.camera.position.copy(cam.pos);
    this.camera.lookAt(cam.lookAt);
    this.camera.updateProjectionMatrix();

    const hasBg = mode !== 'TRANSPARENT';
    this.buddhaGroup.visible = !hasBg;
    this.lotusGroup.visible = !hasBg;
    this.haloGroup.visible = !hasBg;

    this.congregationManager?.setEnvironment(mode);
  }

  private setupLighting(): void {
    // Ánh sáng môi trường vàng dịu
    this.ambientLight = new THREE.AmbientLight(0xfff7ed, 1.4);
    this.scene.add(this.ambientLight);

    // Ánh hào quang chính diện tỏa rạng
    this.dirLight = new THREE.DirectionalLight(0xfef08a, 2.2);
    this.dirLight.position.set(1.5, 3.5, 3.0);
    this.scene.add(this.dirLight);

    // Đèn phụ từ dưới hắt lên đài sen
    const underLight = new THREE.PointLight(0xf43f5e, 1.5, 4.0);
    underLight.position.set(0, -0.6, 0.8);
    this.scene.add(underLight);

    // Đèn sau lưng tạo viền sáng hào quang (Rim light)
    const rimLight = new THREE.DirectionalLight(0xfbbf24, 2.0);
    rimLight.position.set(-1.5, 2.0, -2.0);
    this.scene.add(rimLight);
  }

  /**
   * Tạo Tượng Phật Thích Ca Mạ Vàng Trang Nghiêm
   */
  private buildSacredBuddha(): void {
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.22,
      metalness: 0.88,
      emissive: 0x78350f,
      emissiveIntensity: 0.15,
    });

    const robeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.35,
      metalness: 0.75,
      emissive: 0x451a03,
      emissiveIntensity: 0.1,
    });

    // 1. Đầu tượng Phật
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 32), goldMaterial);
    head.position.set(0, 0.72, 0);
    this.buddhaGroup.add(head);

    // Nhục kế (Ushnisha - Đảnh kế trí tuệ trên đỉnh đầu)
    const ushnisha = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), goldMaterial);
    ushnisha.position.set(0, 0.94, 0);
    this.buddhaGroup.add(ushnisha);

    // Viên ngọc trí tuệ (Chintamani) trên đỉnh đảnh kế
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfde047,
        emissiveIntensity: 1.2,
        roughness: 0.1,
        metalness: 0.9,
      })
    );
    jewel.position.set(0, 1.04, 0);
    this.buddhaGroup.add(jewel);

    // Tai Phật (Tai dài biểu thị từ bi lắng nghe thế gian)
    const earGeo = new THREE.CylinderGeometry(0.025, 0.02, 0.18, 12);
    const earL = new THREE.Mesh(earGeo, goldMaterial);
    earL.position.set(-0.25, 0.68, 0);
    earL.rotation.z = 0.15;
    this.buddhaGroup.add(earL);

    const earR = new THREE.Mesh(earGeo, goldMaterial);
    earR.position.set(0.25, 0.68, 0);
    earR.rotation.z = -0.15;
    this.buddhaGroup.add(earR);

    // 2. Thân Phật & Pháp y trang nghiêm
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.58, 32), robeMaterial);
    torso.position.set(0, 0.32, 0);
    this.buddhaGroup.add(torso);

    // Vạt áo cà sa vắt chéo qua vai trái (Tăng già lê)
    const robeFold = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 16, 32, Math.PI), robeMaterial);
    robeFold.position.set(0, 0.45, 0.05);
    robeFold.rotation.x = 0.4;
    robeFold.rotation.z = -0.5;
    this.buddhaGroup.add(robeFold);

    // 3. Cánh tay & Thủ ấn (Mudra)
    // Cánh tay trái: Đặt ngang đùi trong tư thế Thiền Định (Dhyana Mudra)
    const armGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.38, 16);
    const upperArmL = new THREE.Mesh(armGeo, goldMaterial);
    upperArmL.position.set(-0.32, 0.34, 0);
    upperArmL.rotation.z = 0.35;
    this.buddhaGroup.add(upperArmL);

    const foreArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.34, 16), goldMaterial);
    foreArmL.position.set(-0.16, 0.12, 0.15);
    foreArmL.rotation.x = 1.3;
    foreArmL.rotation.z = -0.7;
    this.buddhaGroup.add(foreArmL);

    // Bàn tay trái ngửa trong lòng bàn chân
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), goldMaterial);
    handL.scale.set(1.2, 0.4, 1.5);
    handL.position.set(0, 0.08, 0.22);
    this.buddhaGroup.add(handL);

    // Cánh tay phải: Xúc Địa Ấn (Bhumisparsha Mudra - Chạm đất chứng minh)
    const upperArmR = new THREE.Mesh(armGeo, goldMaterial);
    upperArmR.position.set(0.32, 0.34, 0);
    upperArmR.rotation.z = -0.35;
    this.buddhaGroup.add(upperArmR);

    const foreArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.38, 16), goldMaterial);
    foreArmR.position.set(0.26, 0.12, 0.14);
    foreArmR.rotation.x = 0.8;
    foreArmR.rotation.z = 0.4;
    this.buddhaGroup.add(foreArmR);

    // Bàn tay phải úp chạm gối phải
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), goldMaterial);
    handR.scale.set(1.1, 0.4, 1.4);
    handR.position.set(0.34, -0.04, 0.26);
    handR.rotation.x = 0.5;
    this.buddhaGroup.add(handR);

    // 4. Tư thế Kiết Già Toàn Phần (Padmasana)
    const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.62, 20);
    const legL = new THREE.Mesh(legGeo, robeMaterial);
    legL.position.set(-0.24, -0.02, 0.12);
    legL.rotation.z = 1.35;
    legL.rotation.y = 0.45;
    this.buddhaGroup.add(legL);

    const legR = new THREE.Mesh(legGeo, robeMaterial);
    legR.position.set(0.24, -0.02, 0.12);
    legR.rotation.z = -1.35;
    legR.rotation.y = -0.45;
    this.buddhaGroup.add(legR);

    // Hai bàn chân ngửa lên trời (Kim Cang Tọa)
    const footL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), goldMaterial);
    footL.scale.set(1.4, 0.4, 0.8);
    footL.position.set(0.22, 0.06, 0.18);
    footL.rotation.y = 0.3;
    this.buddhaGroup.add(footL);

    this.scene.add(this.buddhaGroup);
  }

  /**
   * Tạo Đài Sen Tam Tầng Nở Rộ Đa Sắc (Blooming Lotus Pedestal)
   */
  private buildLotusPedestal(): void {
    const goldPedestalMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.8,
    });

    // Đế tháp sen bằng vàng
    const baseCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.82, 0.18, 36),
      goldPedestalMat
    );
    baseCylinder.position.set(0, -0.22, 0);
    this.lotusGroup.add(baseCylinder);

    // Nhụy sen trung tâm
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.52, 0.12, 32),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.4,
        metalness: 0.5,
        emissive: 0xb45309,
        emissiveIntensity: 0.3,
      })
    );
    pod.position.set(0, -0.08, 0);
    this.lotusGroup.add(pod);

    // Tạo hình dáng cánh sen nở (Curved Lotus Petal Shape)
    const petalShape = new THREE.Shape();
    petalShape.moveTo(0, 0);
    petalShape.quadraticCurveTo(0.14, 0.18, 0.16, 0.38);
    petalShape.quadraticCurveTo(0.12, 0.55, 0, 0.65);
    petalShape.quadraticCurveTo(-0.12, 0.55, -0.16, 0.38);
    petalShape.quadraticCurveTo(-0.14, 0.18, 0, 0);

    const petalGeo = new THREE.ExtrudeGeometry(petalShape, {
      depth: 0.02,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
    });
    petalGeo.center();

    // 3 Tầng cánh sen (Tầng ngoài cùng, Tầng giữa, Tầng trong cùng)
    const tiers = [
      { count: 14, radius: 0.62, y: -0.14, baseTilt: 0.72, openTilt: 1.15, scale: 1.1, color: 0xf43f5e },
      { count: 12, radius: 0.52, y: -0.10, baseTilt: 0.48, openTilt: 0.85, scale: 0.95, color: 0xfb7185 },
      { count: 10, radius: 0.42, y: -0.06, baseTilt: 0.25, openTilt: 0.55, scale: 0.8, color: 0xfda4af },
    ];

    tiers.forEach((tier) => {
      const tierMat = new THREE.MeshStandardMaterial({
        color: tier.color,
        roughness: 0.3,
        metalness: 0.4,
        emissive: 0x9f1239,
        emissiveIntensity: 0.25,
        side: THREE.DoubleSide,
      });

      for (let i = 0; i < tier.count; i++) {
        const angle = (i / tier.count) * Math.PI * 2;
        const petal = new THREE.Mesh(petalGeo, tierMat);

        petal.scale.setScalar(tier.scale);
        petal.position.set(
          Math.sin(angle) * tier.radius,
          tier.y,
          Math.cos(angle) * tier.radius
        );

        // Xoay cánh sen hướng ra ngoài
        petal.rotation.y = angle;
        petal.rotation.x = tier.baseTilt;

        this.petalMeshes.push({
          mesh: petal,
          baseRotX: tier.baseTilt,
          maxOpenRotX: tier.openTilt,
        });

        this.lotusGroup.add(petal);
      }
    });

    this.scene.add(this.lotusGroup);
  }

  /**
   * Tạo Vòng Hào Quang Kim Quang Chiếu Diệu (Sacred Rotating Halo)
   */
  private buildSacredHalo(): void {
    // 1. Đèn điểm phát sáng hào quang từ sau đầu Phật
    this.haloLight = new THREE.PointLight(0xfef08a, 2.5, 4.0);
    this.haloLight.position.set(0, 0.75, -0.15);
    this.scene.add(this.haloLight);

    // Vị trí tâm hào quang
    this.haloGroup.position.set(0, 0.76, -0.18);

    // 2. Vòng tròn kim loại vàng ngoài cùng
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.022, 16, 64),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.1,
        metalness: 0.95,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.8,
      })
    );
    this.haloGroup.add(outerRing);

    // 3. Đĩa hào quang rạng rỡ (Radiant Disc) với 16 tia sáng kim quang
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.016, 16, 48),
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        roughness: 0.15,
        metalness: 0.9,
        emissive: 0xd97706,
        emissiveIntensity: 0.6,
      })
    );
    this.haloGroup.add(innerRing);

    // 16 Tia hào quang (God Rays / Sun Rays) tỏa đều 360 độ
    const rayGeo = new THREE.ConeGeometry(0.035, 0.22, 4);
    rayGeo.rotateX(Math.PI);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.85,
    });

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(Math.sin(angle) * 0.46, Math.cos(angle) * 0.46, 0);
      ray.rotation.z = -angle;
      this.haloGroup.add(ray);
    }

    this.scene.add(this.haloGroup);
  }

  /**
   * Tạo Mưa Cánh Hoa Sen Hồng Kim Bay Lượn (Falling Lotus Petals)
   */
  private buildFallingPetalParticles(): void {
    const petalShape = new THREE.Shape();
    petalShape.moveTo(0, 0);
    petalShape.quadraticCurveTo(0.04, 0.06, 0.05, 0.12);
    petalShape.quadraticCurveTo(0, 0.16, -0.05, 0.12);
    petalShape.quadraticCurveTo(-0.04, 0.06, 0, 0);

    const geo = new THREE.ShapeGeometry(petalShape);
    geo.center();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.45,
      metalness: 0.15,
      emissive: 0xfb7185,
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55, // Giảm độ đậm, nhẹ nhàng thanh thoát
    });

    this.fallingPetals = new THREE.InstancedMesh(geo, mat, this.petalCount);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.petalCount; i++) {
      const x = (Math.random() - 0.5) * 4.8;
      const y = Math.random() * 4.0 - 0.5;
      const z = (Math.random() - 0.5) * 3.5;

      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const scale = 0.38 + Math.random() * 0.30; // Cánh sen nhỏ gọn thanh thoát hơn
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();

      this.fallingPetals.setMatrixAt(i, dummy.matrix);
      this.petalMatrices.push(dummy.matrix.clone());

      this.petalVelocities.push({
        x: (Math.random() - 0.5) * 0.08,
        y: 0.14 + Math.random() * 0.20, // Rơi chậm nhẹ nhàng
        z: (Math.random() - 0.5) * 0.08,
        rotSpeed: (Math.random() - 0.5) * 0.8,
        swayPhase: Math.random() * Math.PI * 2,
      });
    }

    this.fallingPetals.instanceMatrix.needsUpdate = true;
    this.scene.add(this.fallingPetals);
  }

  /**
   * Tạo Bụi Tinh Tú Kim Quang Bốc Lên Từ Đài Sen (Golden Starlight)
   */
  private buildStarlightParticles(): void {
    const geo = new THREE.BufferGeometry();
    this.starlightPositions = new Float32Array(this.starlightCount * 3);

    for (let i = 0; i < this.starlightCount; i++) {
      const idx = i * 3;
      // Tinh tú bay lên từ quanh đài sen
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.2;
      this.starlightPositions[idx] = Math.sin(angle) * r;
      this.starlightPositions[idx + 1] = -0.3 + Math.random() * 2.2;
      this.starlightPositions[idx + 2] = Math.cos(angle) * r;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.starlightPositions, 3));

    // Shader tạo hạt tròn sáng vàng
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255, 255, 230, 1)');
      grad.addColorStop(0.4, 'rgba(254, 240, 138, 0.8)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.09,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starlightPoints = new THREE.Points(geo, mat);
    this.scene.add(this.starlightPoints);
  }

  /**
   * Kích Hoạt Hiệu Ứng Đại Lễ Cúng Dường Hoa Sen & Thắp Hương (Gift Interaction)
   */
  public triggerGiftCelebration(count: number = 1, username?: string, giftName: string = ''): void {
    const isLotusGift = giftName.toLowerCase().includes('sen') || count >= 5;
    const isLanternGift = giftName.toLowerCase().includes('đèn') || giftName.toLowerCase().includes('hoa đăng');

    // 1. Đài sen nở rộ
    this.targetBloom = isLotusGift ? 1.8 : 1.4;
    this.targetHaloSpeed = isLotusGift ? 2.8 : 2.0;
    this.lightBurstIntensity = isLotusGift ? 4.0 : 2.5;

    // 2. Kích hoạt kịch bản nhân vật tương ứng
    const sender = username || 'Minh Anh';
    if (isLotusGift) {
      // Kịch bản 3: Dâng sen vàng & Lạy ngũ thể đầu địa
      this.congregationManager.triggerOfferLotusForUser(sender);
    } else if (isLanternGift) {
      // Kịch bản 4: Thả đèn hoa đăng cầu nguyện
      this.congregationManager.triggerReleaseLantern(sender);
    } else {
      // Kịch bản 2: Dâng nén tâm hương vái 3 vái
      this.congregationManager.triggerGiftForUser(sender);
    }

    // 3. Ngân Đại Hồng Chung thanh tịnh (Web Audio API)
    templeAudio.playTempleBell(isLotusGift ? 0.85 : 0.65);

    // 4. Sau thời gian cử hành đưa trạng thái về thanh tịnh an nhiên
    const resetDelay = isLotusGift ? 5800 : 3800;
    setTimeout(() => {
      this.targetBloom = 1.0;
      this.targetHaloSpeed = 0.35;
      this.lightBurstIntensity = 0.0;
    }, resetDelay);
  }

  /**
   * Kịch Bản 5: Trợ Niệm Đồng Tu (Khi Comment "A Di Đà Phật")
   */
  public triggerChanting(username?: string): void {
    this.congregationManager.triggerChantingForUser(username);
  }

  /**
   * Kịch Bản 4: Thả Hoa Đăng Cầu Nguyện
   */
  public triggerReleaseLantern(username?: string): void {
    this.congregationManager.triggerReleaseLantern(username);
  }

  /**
   * Kịch Bản 6: Đại Lễ Nhiễu Phật (Kinh Hành Tập Thể)
   */
  public triggerCircumambulation(): void {
    this.congregationManager.triggerCircumambulation();
  }

  /**
   * Kích Hoạt Hiệu Ứng Chào Đón Phật Tử Vào Live (User Join / Follow)
   */
  public triggerWelcomeArrival(username?: string): void {
    this.targetHaloSpeed = 1.2;
    this.lightBurstIntensity = 1.8;

    // Sinh nhân vật bước vào bồ đoàn tọa thiền
    this.congregationManager.addMember(username || 'Đạo Hữu');

    // Chuông gió chào mừng hoan hỷ
    templeAudio.playWelcomeChime(0.5);

    setTimeout(() => {
      this.targetHaloSpeed = 0.35;
      this.lightBurstIntensity = 0.0;
    }, 2200);
  }

  private onResize = (): void => {
    if (!this.renderer || this.isDestroyed) return;
    const width = this.container.clientWidth || window.innerWidth || 1280;
    const height = this.container.clientHeight || window.innerHeight || 720;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  };

  private startRenderLoop = (): void => {
    const dummy = new THREE.Object3D();

    const animate = (): void => {
      if (this.isDestroyed) return;
      this.animationFrameId = requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      const time = this.clock.getElapsedTime();

      // 1. Đài sen nở nhịp nhàng (Bloom Animation)
      this.bloomProgress += (this.targetBloom - this.bloomProgress) * (delta * 2.5);
      this.petalMeshes.forEach(({ mesh, baseRotX, maxOpenRotX }) => {
        mesh.rotation.x = baseRotX + (maxOpenRotX - baseRotX) * (this.bloomProgress - 1.0);
      });

      // 2. Hào quang xoay & phát sáng (Rotating Halo & Light Pulse)
      this.haloRotationSpeed += (this.targetHaloSpeed - this.haloRotationSpeed) * (delta * 2.0);
      this.haloGroup.rotation.z -= this.haloRotationSpeed * delta;

      // Ánh sáng hào quang nhấp nháy thanh tịnh
      const pulse = Math.sin(time * 2.5) * 0.35;
      this.haloLight.intensity = 2.4 + pulse + this.lightBurstIntensity;
      this.dirLight.intensity = 2.2 + this.lightBurstIntensity * 0.6;

      // 3. Tượng Phật an nhiên hơi nâng nhẹ (Breathing float)
      const floatY = Math.sin(time * 1.4) * 0.035;
      this.buddhaGroup.position.y = floatY;
      this.lotusGroup.position.y = floatY;
      this.haloGroup.position.y = 0.76 + floatY;
      this.haloLight.position.y = 0.75 + floatY;

      // 4. Mưa cánh hoa sen rơi lượn
      if (this.fallingPetals) {
        for (let i = 0; i < this.petalCount; i++) {
          const vel = this.petalVelocities[i];
          const matrix = this.petalMatrices[i];
          if (!vel || !matrix) continue;

          dummy.matrix.copy(matrix);
          dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

          // Rơi xuống
          dummy.position.y -= vel.y * delta;
          // Lượn sóng theo gió
          dummy.position.x += Math.sin(time * 1.5 + vel.swayPhase) * (delta * 0.12);
          // Xoay nhẹ cánh hoa
          dummy.rotation.x += vel.rotSpeed * delta;
          dummy.rotation.z += vel.rotSpeed * 0.5 * delta;

          // Khi rơi xuống đáy màn hình, cuốn bay lại lên đỉnh
          if (dummy.position.y < -1.8) {
            dummy.position.y = 3.2 + Math.random() * 0.8;
            dummy.position.x = (Math.random() - 0.5) * 4.5;
            dummy.position.z = (Math.random() - 0.5) * 3.0;
          }

          dummy.updateMatrix();
          matrix.copy(dummy.matrix);
          this.fallingPetals.setMatrixAt(i, dummy.matrix);
        }
        this.fallingPetals.instanceMatrix.needsUpdate = true;
      }

      // 5. Bụi tinh tú bốc lên trời
      if (this.starlightPoints && this.starlightPositions) {
        const pos = this.starlightPositions;
        for (let i = 0; i < this.starlightCount; i++) {
          const idx = i * 3;
          if (idx + 1 < pos.length) {
            const currentY = pos[idx + 1] ?? 0;
            const nextY = currentY + delta * 0.35;
            pos[idx + 1] = nextY > 2.6 ? -0.3 : nextY;
          }
        }
        const attr = this.starlightPoints.geometry.attributes.position;
        if (attr) {
          attr.needsUpdate = true;
        }
      }

      // 6. Cập nhật Đạo Tràng & Chuyển động từng Phật tử
      this.congregationManager.update(delta, time);

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
  };

  public destroy(): void {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.onResize);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.congregationManager.destroy();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
  }
}
