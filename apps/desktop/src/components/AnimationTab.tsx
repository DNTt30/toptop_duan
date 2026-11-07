import React, { useEffect, useState } from 'react';
import type { CharacterItem } from './CharacterTab';

export interface AnimationItem {
  id: string;
  characterId: string;
  name: string;
  clipName: string;
  category: 'IDLE' | 'REACTION' | 'SPECIAL' | 'TRANSITION';
  durationMs: number;
  loopMode: 'ONCE' | 'LOOP' | 'REPEAT_N';
  repeatCount: number;
  blendInMs: number;
  blendOutMs: number;
  soundPath: string | null;
  soundVolume: number;
  vfxPreset: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AnimationTabProps {
  characters: CharacterItem[];
}

export function AnimationTab({ characters }: AnimationTabProps): React.ReactElement {
  const [selectedCharId, setSelectedCharId] = useState<string>(
    characters.find((c) => c.isActive)?.id || characters[0]?.id || ''
  );
  const [animations, setAnimations] = useState<AnimationItem[]>([]);
  const [availableClips, setAvailableClips] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [clipName, setClipName] = useState('');
  const [category, setCategory] = useState<'IDLE' | 'REACTION' | 'SPECIAL' | 'TRANSITION'>('REACTION');
  const [durationMs, setDurationMs] = useState(2500);
  const [loopMode, setLoopMode] = useState<'ONCE' | 'LOOP' | 'REPEAT_N'>('ONCE');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedChar = characters.find((c) => c.id === selectedCharId);

  const loadAnimations = async (charId: string) => {
    if (!charId) return;
    try {
      const list = await (window as any).buddhaDesktop.listAnimations?.(charId);
      setAnimations(list || []);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi tải danh sách hoạt ảnh: ${err.message}` });
    }
  };

  const loadAvailableClips = async (char: CharacterItem | undefined) => {
    if (!char || !char.modelPath) {
      setAvailableClips([]);
      return;
    }
    try {
      const res = await (window as any).buddhaDesktop.inspectGlbAsset?.(char.modelPath);
      if (res && res.ok && Array.isArray(res.clipNames)) {
        setAvailableClips(res.clipNames);
        if (res.clipNames.length > 0 && !clipName) {
          setClipName(res.clipNames[0]);
        }
      } else {
        setAvailableClips([]);
      }
    } catch {
      setAvailableClips([]);
    }
  };

  useEffect(() => {
    if (selectedCharId) {
      void loadAnimations(selectedCharId);
      void loadAvailableClips(characters.find((c) => c.id === selectedCharId));
    }
  }, [selectedCharId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!name.trim()) {
      setStatusMsg({ type: 'error', text: 'Tên hoạt ảnh không được để trống' });
      return;
    }
    if (!clipName.trim()) {
      setStatusMsg({ type: 'error', text: 'Clip hoạt ảnh không được để trống' });
      return;
    }

    try {
      await (window as any).buddhaDesktop.createAnimation({
        characterId: selectedCharId,
        name: name.trim(),
        clipName: clipName.trim(),
        category,
        durationMs: Number(durationMs) || 2000,
        loopMode,
      });

      setStatusMsg({ type: 'success', text: `Đã thêm hoạt ảnh "${name}" thành công!` });
      setName('');
      setShowAddForm(false);
      await loadAnimations(selectedCharId);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi thêm hoạt ảnh: ${err.message}` });
    }
  };

  const handleToggle = async (anim: AnimationItem) => {
    try {
      await (window as any).buddhaDesktop.toggleAnimation(anim.id, !anim.isEnabled);
      await loadAnimations(selectedCharId);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi chuyển trạng thái: ${err.message}` });
    }
  };

  const handleDelete = async (anim: AnimationItem) => {
    if (!confirm(`Bạn có chắc muốn xóa hoạt ảnh "${anim.name}"?`)) return;

    try {
      const res = await (window as any).buddhaDesktop.deleteAnimation(anim.id);
      if (!res.ok) {
        if (res.error === 'ANIMATION_REFERENCED_BY_GIFT_RULES') {
          setStatusMsg({
            type: 'error',
            text: `Không thể xóa hoạt ảnh "${anim.name}": Đang được gán trong ${res.referencedRulesCount} quy tắc quà tặng. Hãy sửa hoặc xóa các quy tắc này trước!`,
          });
        } else {
          setStatusMsg({ type: 'error', text: `Lỗi xóa hoạt ảnh: ${res.error}` });
        }
      } else {
        setStatusMsg({ type: 'success', text: `Đã xóa hoạt ảnh "${anim.name}" thành công!` });
        await loadAnimations(selectedCharId);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi xóa hoạt ảnh: ${err.message}` });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Quản lý Hoạt ảnh Nhân vật (Animations)
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
            Đọc danh sách AnimationClip trực tiếp từ GLB nhị phân, cấu hình thời lượng và kiểm tra ràng buộc.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={!selectedCharId}
          data-testid="btn-toggle-add-anim"
          style={{
            background: showAddForm ? '#475569' : '#0284c7',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            fontWeight: 600,
            cursor: selectedCharId ? 'pointer' : 'not-allowed',
          }}
        >
          {showAddForm ? '✕ Đóng form' : '+ Thêm Hoạt ảnh Mới'}
        </button>
      </div>

      {statusMsg && (
        <div
          data-testid="anim-status-msg"
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 16,
            background: statusMsg.type === 'success' ? '#064e3b' : '#7f1d1d',
            color: statusMsg.type === 'success' ? '#a7f3d0' : '#fecaca',
            fontSize: 13,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Character Selector */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
            Chọn nhân vật:
          </label>
          <select
            value={selectedCharId}
            onChange={(e) => setSelectedCharId(e.target.value)}
            data-testid="select-anim-char"
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug}) {c.isActive ? '★ Active' : ''}
              </option>
            ))}
          </select>
          {selectedChar && (
            <span style={{ fontSize: 12, color: '#38bdf8' }}>
              Mô hình: <code>{selectedChar.modelPath}</code> | Clips trong GLB: [{availableClips.join(', ') || 'Không có'}]
            </span>
          )}
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          data-testid="form-add-anim"
          style={{
            background: '#1e293b',
            border: '1px solid #38bdf8',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px 0', color: '#38bdf8' }}>
            Thêm hoạt ảnh mới cho nhân vật: {selectedChar?.name}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Tên hiển thị hoạt ảnh *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Chắp tay niệm Phật"
                data-testid="input-anim-name"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Tên AnimationClip thực tế từ GLB *
              </label>
              {availableClips.length > 0 ? (
                <select
                  value={clipName}
                  onChange={(e) => setClipName(e.target.value)}
                  data-testid="select-anim-clip"
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                >
                  {availableClips.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={clipName}
                  onChange={(e) => setClipName(e.target.value)}
                  placeholder="VD: Pray"
                  data-testid="input-anim-clip-custom"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Phân loại
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                data-testid="select-anim-category"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              >
                <option value="REACTION">REACTION (Phản ứng quà)</option>
                <option value="IDLE">IDLE (Nghỉ / Chờ)</option>
                <option value="SPECIAL">SPECIAL (Đặc biệt / VIP)</option>
                <option value="TRANSITION">TRANSITION (Chuyển cảnh)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Thời lượng (ms) *
              </label>
              <input
                type="number"
                step="100"
                min="500"
                max="60000"
                value={durationMs}
                onChange={(e) => setDurationMs(parseInt(e.target.value) || 2000)}
                data-testid="input-anim-duration"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Chế độ lặp
              </label>
              <select
                value={loopMode}
                onChange={(e) => setLoopMode(e.target.value as any)}
                data-testid="select-anim-loop"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              >
                <option value="ONCE">ONCE (Chạy 1 lần)</option>
                <option value="LOOP">LOOP (Lặp liên tục)</option>
                <option value="REPEAT_N">REPEAT_N (Lặp N lần)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              style={{
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              data-testid="btn-submit-anim"
              style={{
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                padding: '8px 20px',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Lưu Hoạt ảnh
            </button>
          </div>
        </form>
      )}

      {/* Animations Table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 14px' }}>Tên hoạt ảnh</th>
              <th style={{ padding: '12px 14px' }}>Clip GLB</th>
              <th style={{ padding: '12px 14px' }}>Loại</th>
              <th style={{ padding: '12px 14px' }}>Thời lượng</th>
              <th style={{ padding: '12px 14px' }}>Chế độ lặp</th>
              <th style={{ padding: '12px 14px' }}>Trạng thái</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {animations.map((anim) => (
              <tr key={anim.id} data-testid={`anim-row-${anim.clipName}`} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f8fafc' }}>
                  {anim.name}
                </td>
                <td style={{ padding: '12px 14px', color: '#38bdf8' }}>
                  <code>{anim.clipName}</code>
                </td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                  {anim.category}
                </td>
                <td style={{ padding: '12px 14px', color: '#f8fafc' }}>
                  {anim.durationMs}ms
                </td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                  {anim.loopMode}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(anim)}
                    data-testid={`btn-toggle-anim-${anim.id}`}
                    style={{
                      background: anim.isEnabled ? '#065f46' : '#334155',
                      color: anim.isEnabled ? '#34d399' : '#94a3b8',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {anim.isEnabled ? '✓ Đang bật' : '✕ Đã tắt'}
                  </button>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(anim)}
                    data-testid={`btn-delete-anim-${anim.id}`}
                    style={{
                      background: '#b91c1c',
                      color: '#fff',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
            {animations.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  Chưa có hoạt ảnh nào cho nhân vật này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
