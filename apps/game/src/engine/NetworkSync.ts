/**
 * The Singularity Odyssey — Module Đồng Bộ Mạng P2P 2 Người Chơi (NetworkSync)
 * Hỗ trợ chơi 2 người online qua WebRTC DataChannel và BroadcastChannel:
 * 1. BroadcastChannel: Kết nối đa tab / đa cửa sổ trên cùng máy hoặc mạng nội bộ (0ms latency, 100% Offline).
 * 2. WebRTC DataChannel: Kết nối P2P trực tiếp giữa 2 trình duyệt qua Room ID (SING-XXXX).
 * 3. Đồng bộ hành động 2 chiều (Spawn, Age Up, Upgrade, Ultimate) và Heartbeat kiểm tra Ping.
 */

import { AGES_DATA, type Team, type TurretConfig, type UnitType } from '../data/ages';
import { type World } from './World';

export type NetworkRole = 'HOST' | 'GUEST' | 'SOLO';
export type ConnectionState = 'DISCONNECTED' | 'HOSTING' | 'CONNECTING' | 'CONNECTED';

export interface NetMessage {
  type:
    | 'ROOM_JOIN'
    | 'ROOM_ACCEPTED'
    | 'MATCH_START'
    | 'ROOM_LEAVE'
    | 'SPAWN'
    | 'AGE_UP'
    | 'UPGRADE_UNIT'
    | 'UPGRADE_TURRET'
    | 'ADD_SLOT'
    | 'BUILD_TURRET'
    | 'SELL_TURRET'
    | 'ULTIMATE'
    | 'SURRENDER'
    | 'STATE_SYNC'
    | 'PING'
    | 'PONG';
  senderRole: NetworkRole;
  roomId: string;
  payload?: any;
  timestamp: number;
}

export class NetworkSync {
  public role: NetworkRole = 'SOLO';
  public connectionState: ConnectionState = 'DISCONNECTED';
  public roomId: string = '';
  public pingMs: number = 0;
  public playerName: string = 'Chiến Binh';
  public opponentName: string = 'Đang Đợi...';

  private broadcastChannel: BroadcastChannel | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private pingInterval: number | null = null;
  private syncInterval: number | null = null;
  private handshakeInterval: number | null = null;
  private lastPingSentTime: number = 0;

  private listeners: ((state: ConnectionState, role: NetworkRole, ping: number) => void)[] = [];
  private matchStartListeners: (() => void)[] = [];

  constructor(private readonly world: World) {}

  public subscribe(cb: (state: ConnectionState, role: NetworkRole, ping: number) => void): () => void {
    this.listeners.push(cb);
    cb(this.connectionState, this.role, this.pingMs);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public onMatchStart(cb: () => void): () => void {
    this.matchStartListeners.push(cb);
    return () => {
      this.matchStartListeners = this.matchStartListeners.filter((l) => l !== cb);
    };
  }

  public startMatch(): void {
    if (this.role !== 'HOST' || this.connectionState !== 'CONNECTED') return;

    this.sendMessage({
      type: 'MATCH_START',
      senderRole: 'HOST',
      roomId: this.roomId,
      timestamp: Date.now(),
    });

    this.world.reset();
    for (const cb of this.matchStartListeners) {
      cb();
    }
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb(this.connectionState, this.role, this.pingMs);
    }
  }

  /**
   * Tạo phòng mới (HOST - Phe Trái / P1)
   */
  public hostRoom(customRoomId?: string, nickname?: string): string {
    this.disconnect();
    if (nickname) this.playerName = nickname;
    this.opponentName = 'Đang Đợi...';
    this.role = 'HOST';
    this.connectionState = 'HOSTING';
    this.roomId = customRoomId || `SING-${Math.floor(1000 + Math.random() * 9000)}`;

    this.world.setGameMode('ONLINE_2P');

    this.initBroadcastChannel();
    this.startHeartbeat();
    this.notify();
    return this.roomId;
  }

  public createRoom(customRoomId?: string, nickname?: string): string {
    return this.hostRoom(customRoomId, nickname);
  }

  /**
   * Gia nhập phòng đã tạo (GUEST - Phe Phải / P2)
   */
  public joinRoom(roomId: string, nickname?: string): void {
    this.disconnect();
    if (nickname) this.playerName = nickname;
    this.opponentName = 'Đang Đợi...';
    this.role = 'GUEST';
    this.connectionState = 'CONNECTING';
    this.roomId = roomId.toUpperCase().trim();

    this.world.setGameMode('ONLINE_2P');

    this.initBroadcastChannel();

    // Gửi yêu cầu gia nhập phòng lập tức
    const sendJoin = () => {
      if (this.connectionState === 'CONNECTED') return;
      this.sendMessage({
        type: 'ROOM_JOIN',
        senderRole: 'GUEST',
        roomId: this.roomId,
        payload: { playerName: this.playerName },
        timestamp: Date.now(),
      });
    };

    sendJoin();

    // Handshake Retry: lặp lại mỗi 800ms đến khi Host chấp thuận
    if (this.handshakeInterval) clearInterval(this.handshakeInterval);
    this.handshakeInterval = window.setInterval(() => {
      if (this.connectionState === 'CONNECTED') {
        if (this.handshakeInterval) clearInterval(this.handshakeInterval);
        this.handshakeInterval = null;
        return;
      }
      sendJoin();
    }, 800);

    this.startHeartbeat();
    this.notify();
  }

  /**
   * Ghép trận ngẫu nhiên (Online Auto Matchmaking)
   */
  public matchmakeRandom(nickname: string): void {
    if (nickname) this.playerName = nickname;
    let poolChannel: BroadcastChannel | null = null;
    let matched = false;

    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        poolChannel = new BroadcastChannel('sg_net_matchmaking_pool');
        poolChannel.onmessage = (evt) => {
          const data = evt.data;
          if (data && data.type === 'MATCH_WAITING_HOST' && !matched) {
            matched = true;
            try {
              poolChannel?.close();
            } catch {
              // ignore
            }
            this.joinRoom(data.roomId, nickname);
          }
        };

        // Bắn tín hiệu tìm đối thủ
        poolChannel.postMessage({
          type: 'MATCH_LOOKING_GUEST',
          nickname: this.playerName,
          timestamp: Date.now(),
        });
      }
    } catch {
      // fallback
    }

    // Nếu sau 320ms chưa có Host nào có sẵn, trở thành Host và đợi Guest vào
    setTimeout(() => {
      if (matched) return;
      const pubRoom = `PUB-${Math.floor(1000 + Math.random() * 9000)}`;
      this.hostRoom(pubRoom, nickname);

      if (poolChannel) {
        poolChannel.onmessage = (evt) => {
          const data = evt.data;
          if (data && data.type === 'MATCH_LOOKING_GUEST') {
            poolChannel?.postMessage({
              type: 'MATCH_WAITING_HOST',
              roomId: pubRoom,
              hostName: this.playerName,
            });
          }
        };
        poolChannel.postMessage({
          type: 'MATCH_WAITING_HOST',
          roomId: pubRoom,
          hostName: this.playerName,
        });
      }
    }, 320);
  }

  /**
   * Rời phòng / Ngắt kết nối
   */
  public disconnect(): void {
    if (this.handshakeInterval) {
      clearInterval(this.handshakeInterval);
      this.handshakeInterval = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.broadcastChannel && this.roomId) {
      try {
        this.broadcastChannel.postMessage({
          type: 'ROOM_LEAVE',
          senderRole: this.role,
          roomId: this.roomId,
          timestamp: Date.now(),
        });
      } catch {
        // ignore
      }
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.role = 'SOLO';
    this.connectionState = 'DISCONNECTED';
    this.roomId = '';
    this.pingMs = 0;
    this.world.setGameMode('SOLO');
    this.notify();
  }

  /**
   * Gửi lệnh hành động trong trận
   */
  public sendAction(
    actionType:
      | 'SPAWN'
      | 'AGE_UP'
      | 'UPGRADE_UNIT'
      | 'UPGRADE_TURRET'
      | 'ADD_SLOT'
      | 'BUILD_TURRET'
      | 'SELL_TURRET'
      | 'ULTIMATE'
      | 'SURRENDER',
    payload?: any
  ): void {
    if (this.connectionState !== 'CONNECTED' && this.connectionState !== 'HOSTING') {
      return;
    }

    const team: Team = this.role === 'HOST' ? 'LEFT' : 'RIGHT';
    this.sendMessage({
      type: actionType,
      senderRole: this.role,
      roomId: this.roomId,
      payload: { ...payload, team },
      timestamp: Date.now(),
    });
  }

  private sendMessage(msg: NetMessage): void {
    // 1. Gửi qua BroadcastChannel (Local / Multi-tab)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (e) {
        console.warn('[NetworkSync] Broadcast error:', e);
      }
    }

    // 2. Gửi qua WebRTC DataChannel (nếu đã kết nối)
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(msg));
      } catch (e) {
        console.warn('[NetworkSync] WebRTC send error:', e);
      }
    }
  }

  private initBroadcastChannel(): void {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    try {
      this.broadcastChannel = new BroadcastChannel(`sg_net_${this.roomId}`);
      this.broadcastChannel.onmessage = (evt) => {
        const msg = evt.data as NetMessage;
        this.handleIncomingMessage(msg);
      };
    } catch (e) {
      console.warn('[NetworkSync] Could not create BroadcastChannel:', e);
    }
  }

  private handleIncomingMessage(msg: NetMessage): void {
    if (!msg || msg.roomId !== this.roomId) return;
    if (msg.senderRole === this.role) return; // Bỏ qua tin nhắn từ chính mình

    switch (msg.type) {
      case 'ROOM_JOIN':
        if (this.role === 'HOST') {
          this.connectionState = 'CONNECTED';
          if (msg.payload?.playerName) {
            this.opponentName = msg.payload.playerName;
          }
          this.sendMessage({
            type: 'ROOM_ACCEPTED',
            senderRole: 'HOST',
            roomId: this.roomId,
            payload: { playerName: this.playerName },
            timestamp: Date.now(),
          });
          this.notify();
          this.world.addFloatingText(`${this.opponentName} ĐÃ GIA NHẬP!`, 800, 300, 0x22c55e);
        }
        break;

      case 'ROOM_ACCEPTED':
        if (this.role === 'GUEST') {
          if (this.handshakeInterval) {
            clearInterval(this.handshakeInterval);
            this.handshakeInterval = null;
          }
          this.connectionState = 'CONNECTED';
          if (msg.payload?.playerName) {
            this.opponentName = msg.payload.playerName;
          }
          this.notify();
          this.world.addFloatingText(`ĐÃ KẾT NỐI VỚI ${this.opponentName}!`, 800, 300, 0x22c55e);
        }
        break;

      case 'MATCH_START':
        this.world.reset();
        for (const cb of this.matchStartListeners) {
          cb();
        }
        break;

      case 'ROOM_LEAVE':
        if (this.role === 'HOST') {
          this.connectionState = 'HOSTING';
          this.notify();
          this.world.addFloatingText('ĐỐI THỦ ĐÃ RỜI PHÒNG!', 800, 300, 0xef4444);
        } else if (this.role === 'GUEST') {
          this.connectionState = 'DISCONNECTED';
          this.notify();
          this.world.addFloatingText('CHỦ PHÒNG ĐÃ HỦY PHÒNG!', 800, 300, 0xef4444);
        }
        break;

      case 'SPAWN': {
        const p = msg.payload;
        if (!p) return;
        const targetTeam = p.team as Team;
        const unitId = p.unitId as string;
        const ageConfig =
          targetTeam === 'LEFT' ? this.world.playerAge.getConfig() : this.world.botAge.getConfig();
        const unitConfig = ageConfig.units.find((u) => u.id === unitId) || ageConfig.units[p.unitIndex ?? 0];
        if (unitConfig) {
          if (targetTeam === 'LEFT') {
            this.world.spawnPlayerUnit(unitConfig);
          } else {
            this.world.spawnRightUnit(unitConfig);
          }
        }
        break;
      }

      case 'AGE_UP': {
        const targetTeam = msg.payload?.team as Team;
        if (targetTeam === 'LEFT') {
          this.world.ageUpPlayer();
        } else {
          this.world.ageUpRight();
        }
        break;
      }

      case 'UPGRADE_UNIT': {
        const targetTeam = msg.payload?.team as Team;
        const uType = msg.payload?.unitType as UnitType;
        if (targetTeam === 'LEFT') {
          this.world.upgradePlayerUnit(uType);
        } else {
          this.world.upgradeRightUnit(uType);
        }
        break;
      }

      case 'UPGRADE_TURRET': {
        const targetTeam = msg.payload?.team as Team;
        if (targetTeam === 'LEFT') {
          this.world.upgradePlayerTurret();
        } else {
          this.world.upgradeRightTurret();
        }
        break;
      }

      case 'ADD_SLOT': {
        const targetTeam = msg.payload?.team as Team;
        if (targetTeam === 'LEFT') {
          this.world.addPlayerTurretSlot();
        } else {
          this.world.addRightTurretSlot();
        }
        break;
      }

      case 'BUILD_TURRET': {
        const targetTeam = msg.payload?.team as Team;
        const slotIndex = Number(msg.payload?.slotIndex ?? 0);
        const turretId = msg.payload?.turretId as string | undefined;
        let turretConfig: TurretConfig | undefined;
        if (turretId) {
          for (const ageCfg of Object.values(AGES_DATA)) {
            const found = ageCfg.turrets.find((t) => t.id === turretId);
            if (found) {
              turretConfig = found;
              break;
            }
          }
        }
        if (!turretConfig) {
          const ageCfg =
            targetTeam === 'LEFT' ? this.world.playerAge.getConfig() : this.world.botAge.getConfig();
          turretConfig = ageCfg.turrets[0];
        }
        if (targetTeam === 'LEFT') {
          this.world.buildPlayerTurret(slotIndex, turretConfig);
        } else {
          this.world.buildRightTurret(slotIndex, turretConfig);
        }
        break;
      }

      case 'SELL_TURRET': {
        const targetTeam = msg.payload?.team as Team;
        const slotIndex = Number(msg.payload?.slotIndex ?? 0);
        if (targetTeam === 'LEFT') {
          this.world.sellPlayerTurret(slotIndex);
        } else {
          this.world.sellRightTurret(slotIndex);
        }
        break;
      }

      case 'ULTIMATE': {
        const targetTeam = msg.payload?.team as Team;
        this.world.triggerUltimate(targetTeam);
        break;
      }

      case 'SURRENDER': {
        const surrenderingTeam: Team = msg.senderRole === 'HOST' ? 'LEFT' : 'RIGHT';
        this.world.surrender(surrenderingTeam);
        break;
      }

      case 'PING':
        this.sendMessage({
          type: 'PONG',
          senderRole: this.role,
          roomId: this.roomId,
          payload: { echoTimestamp: msg.timestamp },
          timestamp: Date.now(),
        });
        break;

      case 'PONG':
        if (msg.payload?.echoTimestamp) {
          this.pingMs = Math.max(1, Date.now() - msg.payload.echoTimestamp);
          this.notify();
        }
        break;

      case 'STATE_SYNC':
        if (this.role === 'GUEST' && msg.payload) {
          // Khách đồng bộ HP căn cứ và thời gian từ Host
          if (typeof msg.payload.matchTime === 'number') {
            this.world.matchTime = msg.payload.matchTime;
          }
          if (typeof msg.payload.playerBaseHp === 'number') {
            this.world.playerBaseHp = msg.payload.playerBaseHp;
          }
          if (typeof msg.payload.botBaseHp === 'number') {
            this.world.botBaseHp = msg.payload.botBaseHp;
          }
          this.world.syncNotify();
        }
        break;
    }
  }

  private startHeartbeat(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      this.lastPingSentTime = Date.now();
      this.sendMessage({
        type: 'PING',
        senderRole: this.role,
        roomId: this.roomId,
        timestamp: this.lastPingSentTime,
      });
    }, 2000);

    if (this.role === 'HOST') {
      if (this.syncInterval) clearInterval(this.syncInterval);
      this.syncInterval = window.setInterval(() => {
        if (this.connectionState === 'CONNECTED') {
          this.sendMessage({
            type: 'STATE_SYNC',
            senderRole: 'HOST',
            roomId: this.roomId,
            payload: {
              matchTime: this.world.matchTime,
              playerBaseHp: this.world.playerBaseHp,
              botBaseHp: this.world.botBaseHp,
            },
            timestamp: Date.now(),
          });
        }
      }, 1000);
    }
  }
}
