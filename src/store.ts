import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { maintenanceApi } from './api';

export type StageSignature = { stage: string; status: '待签署' | '已签署'; actor: string; time: string };
export type OfflineCard = {
  id: string;
  title: string;
  estimated: number;
  zone: string;
  dependencies: string[];
  tolerance: string;
  evidence: string;
  witness: string;
  status: '未开始' | '执行中' | '待授权' | '已完成';
  measurement: string;
  finding: string;
  stage: string;
};

// 工程指令：超差处置的依据，按修订号管理有效性
export type EngineeringOrder = {
  id: string;
  title: string;
  revision: number;
  status: '有效' | '已撤销';
  cardIds: string[];
  updatedBy: string;
  updatedAt: string;
};

// 超差授权登记：授权时必须登记指令号与修订号
export type OverrideAuthorization = {
  authNo: string;
  cardId: string;
  eoId: string;
  eoRevision: number;
  basis: string;
  actor: string;
  time: string;
  status: '有效' | '已失效';
};

// 后到提交的指令版本保留为冲突，等待人工核对
export type EoConflict = { eoId: string; submittedBy: string; time: string; detail: string };

type InvalidatedAuthSnapshot = { authNo: string; cardId: string; previousCardStatus: OfflineCard['status']; previousFinding: string };
type InvalidatedSignatureSnapshot = { stage: string; actor: string; time: string };

// 指令改版/撤销的在途操作：先乐观失效，提交失败时按快照回滚
type PendingEoChange = {
  eoId: string;
  changeType: 'revise' | 'revoke';
  previousRevision: number;
  previousStatus: EngineeringOrder['status'];
  invalidatedAuths: InvalidatedAuthSnapshot[];
  invalidatedSignatures: InvalidatedSignatureSnapshot[];
  wasReleased: boolean;
};

type MaintenanceState = {
  cards: OfflineCard[];
  activeCardId: string;
  syncVersion: number;
  serverVersion: number;
  offline: boolean;
  lastSaved: string;
  conflictMessage: string;
  signatures: StageSignature[];
  released: boolean;
  audit: { time: string; actor: string; action: string; detail: string }[];
  engineeringOrders: EngineeringOrder[];
  authorizations: OverrideAuthorization[];
  eoConflicts: EoConflict[];
  pendingEoChange: PendingEoChange | null;
};

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const initialCards: OfflineCard[] = [
  { id: 'CARD-01', title: '右主起落架收放检查', zone: '起落架舱 RH', estimated: 3.5, dependencies: [], tolerance: '间隙 1.2–2.0 mm', evidence: '近照 + 动作记录', witness: '检验员', status: '已完成', measurement: '1.62 mm', finding: '正常', stage: '机械签署' },
  { id: 'CARD-02', title: '发动机 2 风扇叶片孔探', zone: '发动机 2', estimated: 4.2, dependencies: ['CARD-01'], tolerance: '凹坑 ≤ 0.3 mm', evidence: '孔探照片 + 视频', witness: '发动机工程师', status: '执行中', measurement: '', finding: '', stage: '发动机签署' },
  { id: 'CARD-03', title: '液压系统压力保持测试', zone: '轮舱 / 系统 A', estimated: 2.0, dependencies: ['CARD-01'], tolerance: '≥ 2850 psi / 10 min', evidence: '压力仪记录', witness: '质量检验', status: '待授权', measurement: '2762 psi', finding: '低于容差，等待授权', stage: '系统签署' },
  { id: 'CARD-04', title: '前起落架时寿件核对', zone: '前起落架', estimated: 1.5, dependencies: [], tolerance: '剩余循环 ≥ 500', evidence: '件号照片 + 履历页', witness: '检验员', status: '已完成', measurement: '剩余 836 循环', finding: '正常', stage: '适航签署' },
  { id: 'CARD-05', title: 'AD 2024-15-03 执行确认', zone: '机身后段', estimated: 2.5, dependencies: ['CARD-04'], tolerance: '按 AD 标准施工', evidence: '施工记录 + 签署', witness: '放行人员', status: '未开始', measurement: '', finding: '', stage: '适航签署' },
  { id: 'CARD-06', title: '客舱应急设备检查', zone: '客舱全舱', estimated: 2.8, dependencies: [], tolerance: '全部在有效期内', evidence: '清单复核', witness: '客舱检验', status: '未开始', measurement: '', finding: '', stage: '客舱签署' },
  { id: 'CARD-07', title: 'APU 排故后试车', zone: 'APU 舱', estimated: 3.0, dependencies: ['CARD-03'], tolerance: '参数在 AMM 范围', evidence: '试车数据 + 油样', witness: '动力工程师', status: '未开始', measurement: '', finding: '', stage: '动力签署' },
  { id: 'CARD-08', title: '重复缺陷趋势复核', zone: '全机', estimated: 1.0, dependencies: ['CARD-02', 'CARD-03'], tolerance: '无新增重复缺陷', evidence: '近 3 次记录', witness: '质量经理', status: '执行中', measurement: '发现 2 次压力偏低', finding: '移交可靠性分析', stage: '放行签署' }
];

const initialOrders: EngineeringOrder[] = [
  { id: 'EO-2026-1147', title: '液压系统 A 压力保持容差偏离处置', revision: 1, status: '有效', cardIds: ['CARD-03'], updatedBy: '工程部 · 王工', updatedAt: '09:32' }
];

const defaultState = (): MaintenanceState => ({
  cards: initialCards,
  activeCardId: 'CARD-03',
  syncVersion: 7,
  serverVersion: 7,
  offline: false,
  lastSaved: '09:46',
  conflictMessage: '',
  signatures: [
    { stage: '机械', status: '已签署', actor: '赵明 · 机械师', time: '09:18' },
    { stage: '系统', status: '待签署', actor: '待指定', time: '-' },
    { stage: '动力', status: '待签署', actor: '待指定', time: '-' },
    { stage: '放行', status: '待签署', actor: '质量经理', time: '-' }
  ],
  released: false,
  audit: [
    { time: '08:54', actor: '赵明', action: '完成工卡', detail: 'CARD-01 间隙测量 1.62 mm' },
    { time: '09:05', actor: '宋杰', action: '提交测量', detail: 'CARD-03 压力 2762 psi，低于容差' },
    { time: '09:20', actor: '系统', action: '阻断', detail: 'CARD-03 等待授权处理' }
  ],
  engineeringOrders: initialOrders,
  authorizations: [],
  eoConflicts: [],
  pendingEoChange: null
});

// 旧数据兼容：没有修订号的指令与授权一律按首版 R1 处理；
// 旧版“已批准继续”但没有授权记录的工卡补登首版授权，保持处置链闭合
const migrateState = (saved: Partial<MaintenanceState> | null): MaintenanceState => {
  const base = defaultState();
  if (!saved) return base;
  const state: MaintenanceState = { ...base, ...saved, pendingEoChange: null };
  state.engineeringOrders = (Array.isArray(saved.engineeringOrders) && saved.engineeringOrders.length > 0 ? saved.engineeringOrders : initialOrders).map((eo) => ({
    ...eo,
    revision: eo.revision ?? 1,
    status: eo.status ?? '有效',
    cardIds: eo.cardIds ?? []
  }));
  state.authorizations = (Array.isArray(saved.authorizations) ? saved.authorizations : []).map((auth) => ({
    ...auth,
    eoRevision: auth.eoRevision ?? 1,
    status: auth.status ?? '有效'
  }));
  state.eoConflicts = Array.isArray(saved.eoConflicts) ? saved.eoConflicts : [];
  state.cards.forEach((card) => {
    if (card.finding?.includes('工程指令继续') && !state.authorizations.some((auth) => auth.cardId === card.id)) {
      const eo = state.engineeringOrders.find((item) => item.cardIds.includes(card.id)) ?? state.engineeringOrders[0];
      state.authorizations.push({
        authNo: `AUTH-LEGACY-${card.id}`,
        cardId: card.id,
        eoId: eo?.id ?? 'EO-LEGACY',
        eoRevision: 1,
        basis: '旧数据迁移：无修订号记录，按首版兼容登记',
        actor: '系统迁移',
        time: '-',
        status: '有效'
      });
    }
  });
  return state;
};

const loadState = (): MaintenanceState => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy61-work-package') : null;
    return migrateState(raw ? (JSON.parse(raw) as Partial<MaintenanceState>) : null);
  } catch {
    return defaultState();
  }
};

// 指令改版或撤销后：相关授权、工卡、阶段签字、放行基线立即失效重算，原测量保留。
// 返回失效快照，供提交失败时按原授权号回滚。
const applyEoInvalidation = (state: MaintenanceState, eo: EngineeringOrder) => {
  const invalidatedAuths: InvalidatedAuthSnapshot[] = [];
  const invalidatedSignatures: InvalidatedSignatureSnapshot[] = [];
  state.authorizations.forEach((auth) => {
    if (auth.eoId !== eo.id || auth.status !== '有效') return;
    if (eo.status === '有效' && auth.eoRevision === eo.revision) return; // 仍为当前修订的授权继续有效
    auth.status = '已失效';
    const card = state.cards.find((item) => item.id === auth.cardId);
    if (!card) return;
    invalidatedAuths.push({ authNo: auth.authNo, cardId: card.id, previousCardStatus: card.status, previousFinding: card.finding });
    if (card.status !== '已完成') {
      card.status = '待授权';
      card.finding = `工程指令 ${eo.id} ${eo.status === '已撤销' ? '已撤销' : `已改版至 R${eo.revision}`}，原授权 ${auth.authNo} 失效，需重新授权（原测量 ${card.measurement || '—'} 保留）`;
    }
    const stage = card.stage.replace('签署', '');
    const signature = state.signatures.find((item) => item.stage === stage);
    if (signature && signature.status === '已签署' && !invalidatedSignatures.some((item) => item.stage === stage)) {
      invalidatedSignatures.push({ stage, actor: signature.actor, time: signature.time });
      signature.status = '待签署';
      signature.actor = '待指定';
      signature.time = '-';
    }
  });
  const wasReleased = state.released;
  if (invalidatedAuths.length > 0) state.released = false;
  return { invalidatedAuths, invalidatedSignatures, wasReleased };
};

const slice = createSlice({
  name: 'maintenance',
  initialState: loadState(),
  reducers: {
    selectCard(state, action: PayloadAction<string>) {
      state.activeCardId = action.payload;
    },
    updateCard(state, action: PayloadAction<Partial<OfflineCard>>) {
      const card = state.cards.find((item) => item.id === state.activeCardId);
      if (!card) return;
      Object.assign(card, action.payload);
      state.syncVersion += 1;
      state.lastSaved = now();
      state.audit.unshift({ time: state.lastSaved, actor: '当前用户', action: '离线暂存', detail: `${card.id} 已保存本地草稿` });
    },
    setConflict(state, action: PayloadAction<string>) {
      state.conflictMessage = action.payload;
    },
    refreshVersion(state) {
      state.syncVersion = state.serverVersion;
      state.conflictMessage = '';
    },
    toggleOffline(state) {
      state.offline = !state.offline;
    },
    // 超差授权：登记指令号与修订号，只有当前修订有效才能放行继续
    authorizeOverride(state, action: PayloadAction<{ eoId: string; eoRevision: number; basis: string }>) {
      const card = state.cards.find((item) => item.id === state.activeCardId);
      if (!card) return;
      const eo = state.engineeringOrders.find((item) => item.id === action.payload.eoId);
      if (!eo || eo.status !== '有效') {
        state.conflictMessage = `工程指令 ${action.payload.eoId} 未登记或已撤销，无法作为授权依据。`;
        return;
      }
      if (action.payload.eoRevision !== eo.revision) {
        state.conflictMessage = `工程指令 ${eo.id} 当前有效修订为 R${eo.revision}，登记的 R${action.payload.eoRevision} 已失效，授权被拒绝。`;
        return;
      }
      const time = now();
      const authNo = `AUTH-${String(state.authorizations.length + 1).padStart(4, '0')}`;
      if (!eo.cardIds.includes(card.id)) eo.cardIds.push(card.id);
      state.authorizations.unshift({ authNo, cardId: card.id, eoId: eo.id, eoRevision: eo.revision, basis: action.payload.basis, actor: '放行授权人', time, status: '有效' });
      card.status = '执行中';
      card.finding = `超差已由授权人员批准，按 ${eo.id} R${eo.revision} 继续（授权号 ${authNo}，原测量 ${card.measurement || '—'} 保留）`;
      state.conflictMessage = '';
      state.audit.unshift({ time, actor: '放行授权人', action: '授权继续', detail: `${card.id} 登记 ${eo.id} R${eo.revision}，授权号 ${authNo}` });
    },
    // 指令改版/撤销第一步：乐观生效并失效重算，暂不记审计，等待服务器确认
    beginEoChange(state, action: PayloadAction<{ eoId: string; changeType: 'revise' | 'revoke' }>) {
      if (state.pendingEoChange) return;
      const eo = state.engineeringOrders.find((item) => item.id === action.payload.eoId);
      if (!eo || eo.status !== '有效') return;
      const pending: PendingEoChange = {
        eoId: eo.id,
        changeType: action.payload.changeType,
        previousRevision: eo.revision,
        previousStatus: eo.status,
        invalidatedAuths: [],
        invalidatedSignatures: [],
        wasReleased: state.released
      };
      if (action.payload.changeType === 'revise') eo.revision += 1;
      else eo.status = '已撤销';
      const snapshot = applyEoInvalidation(state, eo);
      pending.invalidatedAuths = snapshot.invalidatedAuths;
      pending.invalidatedSignatures = snapshot.invalidatedSignatures;
      pending.wasReleased = snapshot.wasReleased;
      state.pendingEoChange = pending;
    },
    // 提交生效（先到者）：补记审计，固定在途变更
    commitEoChange(state, action: PayloadAction<{ eoId: string; actor: string }>) {
      const pending = state.pendingEoChange;
      if (!pending || pending.eoId !== action.payload.eoId) return;
      const eo = state.engineeringOrders.find((item) => item.id === pending.eoId);
      state.pendingEoChange = null;
      if (!eo) return;
      const time = now();
      eo.updatedBy = action.payload.actor;
      eo.updatedAt = time;
      const label = pending.changeType === 'revise' ? `改版至 R${eo.revision}` : '已撤销';
      state.audit.unshift({ time, actor: action.payload.actor, action: pending.changeType === 'revise' ? '指令改版' : '指令撤销', detail: `${eo.id} ${label}（原 R${pending.previousRevision}），提交先生效` });
      if (pending.invalidatedAuths.length > 0) {
        const cardIds = [...new Set(pending.invalidatedAuths.map((item) => item.cardId))].join('、');
        state.audit.unshift({ time, actor: '系统', action: '授权链失效', detail: `${eo.id} ${label}：${cardIds} 授权失效，相关阶段签字重置，原测量保留` });
      }
      if (pending.wasReleased) {
        state.audit.unshift({ time, actor: '系统', action: '放行基线失效', detail: `${eo.id} ${label}，放行基线已失效，需重新签署并锁定` });
      }
    },
    // 提交失败：按原授权号恢复授权、工卡、签字与放行基线，不重复记审计
    rollbackEoChange(state, action: PayloadAction<{ eoId: string }>) {
      const pending = state.pendingEoChange;
      if (!pending || pending.eoId !== action.payload.eoId) return;
      const eo = state.engineeringOrders.find((item) => item.id === pending.eoId);
      if (eo) {
        eo.revision = pending.previousRevision;
        eo.status = pending.previousStatus;
      }
      pending.invalidatedAuths.forEach((snapshot) => {
        const auth = state.authorizations.find((item) => item.authNo === snapshot.authNo);
        if (auth) auth.status = '有效';
        const card = state.cards.find((item) => item.id === snapshot.cardId);
        if (card) {
          card.status = snapshot.previousCardStatus;
          card.finding = snapshot.previousFinding;
        }
      });
      pending.invalidatedSignatures.forEach((snapshot) => {
        const signature = state.signatures.find((item) => item.stage === snapshot.stage);
        if (signature) {
          signature.status = '已签署';
          signature.actor = snapshot.actor;
          signature.time = snapshot.time;
        }
      });
      state.released = pending.wasReleased;
      state.pendingEoChange = null;
    },
    // 后到提交保留为冲突；若他人改版已先生效，本地同步当前修订并失效重算
    recordEoConflict(state, action: PayloadAction<{ eoId: string; submittedBy: string; detail: string; serverRevision?: number }>) {
      const { eoId, submittedBy, detail, serverRevision } = action.payload;
      state.eoConflicts.unshift({ eoId, submittedBy, time: now(), detail });
      const eo = state.engineeringOrders.find((item) => item.id === eoId);
      if (!eo || !serverRevision || serverRevision <= eo.revision) return;
      eo.revision = serverRevision;
      eo.updatedAt = now();
      const snapshot = applyEoInvalidation(state, eo);
      const time = now();
      if (snapshot.invalidatedAuths.length > 0) {
        state.audit.unshift({ time, actor: '系统', action: '授权链失效', detail: `${eo.id} 他人提交已先生效至 R${serverRevision}，相关授权、签字失效重算，原测量保留` });
      }
      if (snapshot.wasReleased) {
        state.audit.unshift({ time, actor: '系统', action: '放行基线失效', detail: `${eo.id} 外部改版导致放行基线失效，需重新锁定` });
      }
    },
    clearEoConflicts(state) {
      state.eoConflicts = [];
    },
    signStage(state, action: PayloadAction<string>) {
      const signature = state.signatures.find((item) => item.stage === action.payload);
      if (!signature) return;
      signature.status = '已签署';
      signature.actor = `${action.payload}负责人`;
      signature.time = now();
      state.audit.unshift({ time: signature.time, actor: signature.actor, action: '阶段签署', detail: `${action.payload}阶段确认完成` });
    },
    releasePackage(state) {
      const hasBlockers = state.cards.some((card) => card.status === '待授权');
      const allSigned = state.signatures.every((item) => item.status === '已签署');
      // 放行基线只接受登记当前有效修订的授权
      const staleAuth = state.cards.some((card) => {
        if (card.status === '已完成') return false;
        const auth = state.authorizations.find((item) => item.cardId === card.id);
        if (!auth || auth.status !== '有效') return false;
        const eo = state.engineeringOrders.find((item) => item.id === auth.eoId);
        return !eo || eo.status !== '有效' || auth.eoRevision !== eo.revision;
      });
      if (!hasBlockers && !staleAuth && allSigned) {
        state.released = true;
        state.audit.unshift({ time: now(), actor: '质量经理', action: '锁定放行', detail: '工作包已锁定，放行基线按当前有效指令修订重算生成' });
      }
    }
  }
});

export const {
  selectCard,
  updateCard,
  setConflict,
  refreshVersion,
  toggleOffline,
  authorizeOverride,
  beginEoChange,
  commitEoChange,
  rollbackEoChange,
  recordEoConflict,
  clearEoConflicts,
  signStage,
  releasePackage
} = slice.actions;

export const store = configureStore({
  reducer: { maintenance: slice.reducer, [maintenanceApi.reducerPath]: maintenanceApi.reducer },
  middleware: (getDefault) => getDefault().concat(maintenanceApi.middleware)
});

store.subscribe(() => {
  if (typeof localStorage !== 'undefined') localStorage.setItem('yy61-work-package', JSON.stringify(store.getState().maintenance));
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
