import React, { useEffect, useState } from 'react';
import type { CharacterItem } from './CharacterTab';
import type { AnimationItem } from './AnimationTab';

export interface GiftRuleItem {
  id: string;
  name: string;
  characterId: string;
  animationId: string;
  triggerGiftId: string | null;
  minGiftCount: number;
  minCoinValue: number;
  comboTriggerMode: 'COMBO_MERGE' | 'THRESHOLD_STEP' | 'EACH_EVENT';
  priority: number;
  interruptPolicy: 'QUEUE' | 'PREEMPT_LOWER' | 'DROP_IF_BUSY';
  cooldownMs: number;
  maxQueuePerRule: number;
  overlayTextTemplate: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GiftRuleTabProps {
  characters: CharacterItem[];
}

export function GiftRuleTab({ characters }: GiftRuleTabProps): React.ReactElement {
  const [filterCharId, setFilterCharId] = useState<string>('ALL');
  const [rules, setRules] = useState<GiftRuleItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [formCharId, setFormCharId] = useState<string>(
    characters.find((c) => c.isActive)?.id || characters[0]?.id || ''
  );
  const [characterAnimations, setCharacterAnimations] = useState<AnimationItem[]>([]);
  const [formAnimId, setFormAnimId] = useState<string>('');
  const [name, setName] = useState('');
  const [triggerGiftId, setTriggerGiftId] = useState('');
  const [minGiftCount, setMinGiftCount] = useState(1);
  const [minCoinValue, setMinCoinValue] = useState(0);
  const [comboTriggerMode, setComboTriggerMode] = useState<'COMBO_MERGE' | 'THRESHOLD_STEP' | 'EACH_EVENT'>('COMBO_MERGE');
  const [priority, setPriority] = useState(10);
  const [overlayTextTemplate, setOverlayTextTemplate] = useState('{senderName} đã tặng {giftCount}x {giftName}');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadRules = async () => {
    try {
      const list = await (window as any).buddhaDesktop.listGiftRules?.(
        filterCharId === 'ALL' ? undefined : filterCharId
      );
      setRules(list || []);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi tải danh sách quy tắc quà: ${err.message}` });
    }
  };

  const loadAnimationsForForm = async (charId: string) => {
    if (!charId) {
      setCharacterAnimations([]);
      return;
    }
    try {
      const list = await (window as any).buddhaDesktop.listAnimations?.(charId);
      setCharacterAnimations(list || []);
      if (list && list.length > 0 && !formAnimId) {
        setFormAnimId(list[0].id);
      }
    } catch {
      setCharacterAnimations([]);
    }
  };

  useEffect(() => {
    void loadRules();
  }, [filterCharId]);

  useEffect(() => {
    if (formCharId) {
      void loadAnimationsForForm(formCharId);
    }
  }, [formCharId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!name.trim()) {
      setStatusMsg({ type: 'error', text: 'Tên quy tắc không được để trống' });
      return;
    }
    if (!formCharId) {
      setStatusMsg({ type: 'error', text: 'Vui lòng chọn nhân vật' });
      return;
    }
    if (!formAnimId) {
      setStatusMsg({ type: 'error', text: 'Vui lòng chọn hoạt ảnh tương ứng' });
      return;
    }

    try {
      await (window as any).buddhaDesktop.createGiftRule({
        name: name.trim(),
        characterId: formCharId,
        animationId: formAnimId,
        triggerGiftId: triggerGiftId.trim() || null,
        minGiftCount: Number(minGiftCount) || 1,
        minCoinValue: Number(minCoinValue) || 0,
        comboTriggerMode,
        priority: Number(priority) || 10,
        overlayTextTemplate: overlayTextTemplate.trim() || '{senderName} đã tặng {giftCount}x {giftName}',
      });

      setStatusMsg({ type: 'success', text: `Đã tạo quy tắc quà tặng "${name}" thành công!` });
      setName('');
      setShowAddForm(false);
      await loadRules();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi tạo quy tắc quà: ${err.message}` });
    }
  };

  const handleToggle = async (rule: GiftRuleItem) => {
    try {
      await (window as any).buddhaDesktop.toggleGiftRule(rule.id, !rule.isEnabled);
      await loadRules();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi chuyển trạng thái: ${err.message}` });
    }
  };

  const handleDelete = async (rule: GiftRuleItem) => {
    if (!confirm(`Bạn có chắc muốn xóa quy tắc quà "${rule.name}"?`)) return;

    try {
      const res = await (window as any).buddhaDesktop.deleteGiftRule(rule.id);
      if (res && res.ok) {
        setStatusMsg({ type: 'success', text: `Đã xóa quy tắc quà "${rule.name}"!` });
        await loadRules();
      } else {
        setStatusMsg({ type: 'error', text: 'Không thể xóa quy tắc quà' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi xóa quy tắc quà: ${err.message}` });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Quản lý Quy tắc Quà tặng (Gift Rules)
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
            Khớp quà tặng với hoạt ảnh nhân vật theo điều kiện số lượng, giá trị xu, độ ưu tiên và combo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          data-testid="btn-toggle-add-rule"
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
          {showAddForm ? '✕ Đóng form' : '+ Thêm Quy tắc Quà Mới'}
        </button>
      </div>

      {statusMsg && (
        <div
          data-testid="rule-status-msg"
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

      {/* Filter Bar */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
            Lọc theo nhân vật:
          </label>
          <select
            value={filterCharId}
            onChange={(e) => setFilterCharId(e.target.value)}
            data-testid="select-filter-rule-char"
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <option value="ALL">Tất cả nhân vật</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug}) {c.isActive ? '★ Active' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          data-testid="form-add-rule"
          style={{
            background: '#1e293b',
            border: '1px solid #38bdf8',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px 0', color: '#38bdf8' }}>
            Tạo quy tắc quà tặng mới
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Tên quy tắc *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Quà Hoa Sen VIP"
                data-testid="input-rule-name"
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
                Mã quà tặng (Trigger Gift ID, để trống = mọi loại quà)
              </label>
              <input
                type="text"
                value={triggerGiftId}
                onChange={(e) => setTriggerGiftId(e.target.value)}
                placeholder="VD: lotus hoặc để trống"
                data-testid="input-rule-gift-id"
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Nhân vật *
              </label>
              <select
                value={formCharId}
                onChange={(e) => {
                  setFormCharId(e.target.value);
                  setFormAnimId('');
                }}
                data-testid="select-rule-form-char"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug}) {c.isActive ? '★ Active' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Hoạt ảnh kích hoạt *
              </label>
              <select
                value={formAnimId}
                onChange={(e) => setFormAnimId(e.target.value)}
                data-testid="select-rule-form-anim"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              >
                {characterAnimations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (Clip: {a.clipName}, {a.durationMs}ms)
                  </option>
                ))}
                {characterAnimations.length === 0 && (
                  <option value="">(Chưa có hoạt ảnh cho nhân vật này)</option>
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Số lượng tối thiểu *
              </label>
              <input
                type="number"
                min="1"
                value={minGiftCount}
                onChange={(e) => setMinGiftCount(parseInt(e.target.value) || 1)}
                data-testid="input-rule-min-count"
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
                Xu tối thiểu
              </label>
              <input
                type="number"
                min="0"
                value={minCoinValue}
                onChange={(e) => setMinCoinValue(parseInt(e.target.value) || 0)}
                data-testid="input-rule-min-coin"
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
                Chiến lược Combo
              </label>
              <select
                value={comboTriggerMode}
                onChange={(e) => setComboTriggerMode(e.target.value as any)}
                data-testid="select-rule-combo"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 6,
                }}
              >
                <option value="COMBO_MERGE">COMBO_MERGE (Gộp 1.5s)</option>
                <option value="THRESHOLD_STEP">THRESHOLD_STEP</option>
                <option value="EACH_EVENT">EACH_EVENT</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Độ ưu tiên (1-100)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 10)}
                data-testid="input-rule-priority"
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

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Mẫu câu chữ hiển thị trên Overlay
            </label>
            <input
              type="text"
              value={overlayTextTemplate}
              onChange={(e) => setOverlayTextTemplate(e.target.value)}
              placeholder="{senderName} đã tặng {giftCount}x {giftName}"
              data-testid="input-rule-template"
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
              data-testid="btn-submit-rule"
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
              Lưu Quy tắc
            </button>
          </div>
        </form>
      )}

      {/* Rules Table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '12px 14px' }}>Tên quy tắc</th>
              <th style={{ padding: '12px 14px' }}>Mã quà (Gift ID)</th>
              <th style={{ padding: '12px 14px' }}>Điều kiện</th>
              <th style={{ padding: '12px 14px' }}>Chiến lược</th>
              <th style={{ padding: '12px 14px' }}>Ưu tiên</th>
              <th style={{ padding: '12px 14px' }}>Trạng thái</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} data-testid={`rule-row-${rule.id}`} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f8fafc' }}>
                  {rule.name}
                </td>
                <td style={{ padding: '12px 14px', color: '#38bdf8' }}>
                  <code>{rule.triggerGiftId || '★ Mọi quà'}</code>
                </td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                  ≥ {rule.minGiftCount} cái {rule.minCoinValue > 0 ? `| ≥ ${rule.minCoinValue} xu` : ''}
                </td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                  {rule.comboTriggerMode}
                </td>
                <td style={{ padding: '12px 14px', color: '#f8fafc' }}>
                  <span
                    style={{
                      background: rule.priority >= 50 ? '#831843' : '#1e3a8a',
                      color: rule.priority >= 50 ? '#fbcfe8' : '#bfdbfe',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    P{rule.priority} {rule.priority >= 50 ? '(VIP)' : ''}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(rule)}
                    data-testid={`btn-toggle-rule-${rule.id}`}
                    style={{
                      background: rule.isEnabled ? '#065f46' : '#334155',
                      color: rule.isEnabled ? '#34d399' : '#94a3b8',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {rule.isEnabled ? '✓ Đang bật' : '✕ Đã tắt'}
                  </button>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(rule)}
                    data-testid={`btn-delete-rule-${rule.id}`}
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
            {rules.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  Chưa có quy tắc quà tặng nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
