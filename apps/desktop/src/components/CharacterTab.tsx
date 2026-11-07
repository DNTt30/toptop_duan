import React, { useState } from 'react';

export interface CharacterItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  modelPath: string;
  thumbnailPath: string | null;
  visibilityMode: 'APPEAR_ON_EVENT' | 'PERSISTENT_IDLE';
  scale: number;
  positionJson: string;
  rotationJson: string;
  defaultIdleAnimationId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CharacterTabProps {
  characters: CharacterItem[];
  onRefresh: () => Promise<void>;
}

export function CharacterTab({ characters, onRefresh }: CharacterTabProps): React.ReactElement {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [modelPath, setModelPath] = useState('sample-character.glb');
  const [scale, setScale] = useState(1.0);
  const [isActive, setIsActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [extractedClips, setExtractedClips] = useState<string[]>([]);

  const handlePickGlb = async () => {
    try {
      const res = await (window as any).buddhaDesktop.pickGlbFile?.();
      if (res && res.ok && res.fileName) {
        setModelPath(res.fileName);
        setExtractedClips(res.clipNames || []);
        setStatusMsg({
          type: 'success',
          text: `Đã chọn tệp GLB ${res.fileName} (${(res.fileSizeBytes / 1024).toFixed(1)} KB) - Đọc được ${res.clipNames.length} AnimationClip: [${res.clipNames.join(', ')}]`,
        });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi đọc tệp GLB: ${err.message}` });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!name.trim()) {
      setStatusMsg({ type: 'error', text: 'Tên nhân vật không được để trống' });
      return;
    }
    if (!slug.trim()) {
      setStatusMsg({ type: 'error', text: 'Slug không được để trống' });
      return;
    }

    try {
      await (window as any).buddhaDesktop.createCharacter({
        name: name.trim(),
        slug: slug.trim(),
        modelPath: modelPath.trim(),
        scale: Number(scale) || 1.0,
        isActive,
      });

      setStatusMsg({ type: 'success', text: `Đã tạo nhân vật "${name}" thành công!` });
      setName('');
      setSlug('');
      setShowAddForm(false);
      await onRefresh();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi tạo nhân vật: ${err.message}` });
    }
  };

  const handleSetActive = async (char: CharacterItem) => {
    try {
      await (window as any).buddhaDesktop.setActiveCharacter(char.id);
      setStatusMsg({ type: 'success', text: `Đã kích hoạt nhân vật "${char.name}" làm nhân vật chính!` });
      await onRefresh();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi kích hoạt: ${err.message}` });
    }
  };

  const handleDelete = async (char: CharacterItem) => {
    if (char.isActive) {
      setStatusMsg({ type: 'error', text: 'Không thể xóa nhân vật đang được kích hoạt!' });
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa nhân vật "${char.name}"? Mọi hoạt ảnh và quy tắc liên quan sẽ bị xóa theo.`)) {
      return;
    }

    try {
      const res = await (window as any).buddhaDesktop.deleteCharacter(char.id);
      if (!res.ok) {
        setStatusMsg({ type: 'error', text: `Không thể xóa: ${res.error}` });
      } else {
        setStatusMsg({ type: 'success', text: `Đã xóa nhân vật "${char.name}"` });
        await onRefresh();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi xóa nhân vật: ${err.message}` });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Quản lý Nhân vật 3D ({characters.length})
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
            Quản lý các nhân vật GLB, kích hoạt nhân vật biểu diễn chính và cấu hình tỷ lệ hiển thị.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          data-testid="btn-toggle-add-char"
          style={{
            background: showAddForm ? '#475569' : '#0284c7',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showAddForm ? '✕ Đóng form' : '+ Thêm Nhân vật Mới'}
        </button>
      </div>

      {statusMsg && (
        <div
          data-testid="char-status-msg"
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

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          data-testid="form-add-character"
          style={{
            background: '#1e293b',
            border: '1px solid #38bdf8',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px 0', color: '#38bdf8' }}>
            Thông tin nhân vật mới
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Tên nhân vật *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Đức Phật Thích Ca"
                data-testid="input-char-name"
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
                Slug (mã định danh duy nhất) *
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder="VD: buddha-shakyamuni"
                data-testid="input-char-slug"
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Tệp GLB (mô hình 3D trong assets) *
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={modelPath}
                  onChange={(e) => setModelPath(e.target.value)}
                  data-testid="input-char-model"
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                />
                <button
                  type="button"
                  onClick={handlePickGlb}
                  data-testid="btn-pick-glb"
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  📁 Chọn tệp...
                </button>
              </div>
              {extractedClips.length > 0 && (
                <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 4 }}>
                  Clips trích xuất từ GLB: {extractedClips.join(', ')}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Scale (Tỷ lệ)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value) || 1.0)}
                data-testid="input-char-scale"
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                data-testid="checkbox-char-active"
              />
              Kích hoạt làm nhân vật chính ngay sau khi tạo
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
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
                data-testid="btn-submit-char"
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
                Lưu Nhân vật
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Characters Table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 14px' }}>Tên nhân vật</th>
              <th style={{ padding: '12px 14px' }}>Slug</th>
              <th style={{ padding: '12px 14px' }}>Mô hình 3D</th>
              <th style={{ padding: '12px 14px' }}>Tỷ lệ (Scale)</th>
              <th style={{ padding: '12px 14px' }}>Trạng thái</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {characters.map((char) => (
              <tr
                key={char.id}
                data-testid={`char-row-${char.slug}`}
                style={{
                  borderBottom: '1px solid #334155',
                  background: char.isActive ? 'rgba(34, 197, 94, 0.05)' : 'transparent',
                }}
              >
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f8fafc' }}>
                  {char.name}
                </td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                  <code>{char.slug}</code>
                </td>
                <td style={{ padding: '12px 14px', color: '#38bdf8' }}>
                  <code>{char.modelPath}</code>
                </td>
                <td style={{ padding: '12px 14px', color: '#f8fafc' }}>
                  {char.scale}x
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {char.isActive ? (
                    <span
                      data-testid={`badge-active-${char.slug}`}
                      style={{
                        background: '#065f46',
                        color: '#34d399',
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      ★ ĐANG HOẠT ĐỘNG
                    </span>
                  ) : (
                    <span style={{ color: '#64748b', fontSize: 11 }}>Chưa kích hoạt</span>
                  )}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {!char.isActive && (
                      <button
                        type="button"
                        onClick={() => handleSetActive(char)}
                        data-testid={`btn-activate-${char.slug}`}
                        style={{
                          background: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Kích hoạt
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(char)}
                      disabled={char.isActive}
                      data-testid={`btn-delete-${char.slug}`}
                      style={{
                        background: char.isActive ? '#334155' : '#b91c1c',
                        color: char.isActive ? '#64748b' : '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: char.isActive ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {characters.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  Chưa có nhân vật nào trong hệ thống.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
