import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { maintenanceApi } from './api';

export type StageSignature = {
  stage: string;
  status: '待签署' | '已签署';
  actor: string;
  time: string;
  eoNumber?: string;
  eoRevision?: string;
};

export type CardAuthorization = {
  authId: string;        // 授权号：同一工卡 + 同一指令修订唯一，失败重试按原授权号恢复
  eoNumber: string;      // 指令号
  eoRevision: string;    // 修订号
  authorizedBy: string;
  time: string;
};

export type EngineeringInstruction = {
  eoNumber: string;
  revision: string;
  status: '有效' | '撤销';
  updatedAt: string;
};

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
  authorization?: CardAuthorization;
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
  releaseEoNumber?: string;
  releaseEoRevision?: string;
  eo: EngineeringInstruction;
  eoVersion: number;      // 指令乐观并发版本：先到生效，后到留冲突
  audit: { time: string; actor: string; action: string; detail: string }[];
};

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export const DEFAULT_EO_NUMBER = 'EO-2026-1147';
export const FIRST_REVISION = 'R1';

export function bumpRevision(revision: string): string {
  const match = /^R?(\d+)$/.exec(revision.trim());
  if (match) return `R${Number.parseInt(match[1], 10) + 1}`;
  return `${revision.trim()}-1`;
}

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

const defaultSignatures: StageSignature[] = [
  { stage: '机械', status: '已签署', actor: '赵明 · 机械师', time: '09:18' },
  { stage: '系统', status: '待签署', actor: '待指定', time: '-' },
  { stage: '动力', status: '待签署', actor: '待指定', time: '-' },
  { stage: '放行', status: '待签署', actor: '质量经理', time: '-' }
];

const defaultEo: EngineeringInstruction = {
  eoNumber: DEFAULT_EO_NUMBER,
  revision: FIRST_REVISION,
  status: '有效',
  updatedAt: '—'
};

// 旧数据兼容：没有修订号的指令 / 签字 / 放行基线一律按首版 R1 处理。
function migrate(saved: Partial<MaintenanceState> | null): MaintenanceState {
  const base: MaintenanceState = {
    cards: initialCards,
    activeCardId: 'CARD-03',
    syncVersion: 7,
    serverVersion: 7,
    offline: false,
    lastSaved: '09:46',
    conflictMessage: '',
    signatures: defaultSignatures,
    released: false,
    eo: { ...defaultEo },
    eoVersion: 1,
    audit: [
      { time: '08:54', actor: '赵明', action: '完成工卡', detail: 'CARD-01 间隙测量 1.62 mm' },
      { time: '09:05', actor: '宋杰', action: '提交测量', detail: 'CARD-03 压力 2762 psi，低于容差' },
      { time: '09:20', actor: '系统', action: '阻断', detail: 'CARD-03 等待授权处理' }
    ]
  };
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    cards: saved.cards ?? base.cards,
    signatures: saved.signatures ?? base.signatures,
    eo: saved.eo ?? { ...defaultEo },
    eoVersion: saved.eoVersion ?? 1,
    audit: saved.audit ?? base.audit
  };
}

const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy61-work-package') : null;
const saved = raw ? JSON.parse(raw) as Partial<MaintenanceState> : null;
const initialState: MaintenanceState = migrate(saved);

function addAudit(state: MaintenanceState, actor: string, action: string, detail: string) {
  const time = now();
  const last = state.audit[0];
  if (last && last.action === action && last.detail === detail) return; // 重试不重复记审计
  state.audit.unshift({ time, actor, action, detail });
}

// 处置链联动：指令修订或撤销后，授权工卡、阶段签字、放行基线立即失效重算；原测量保留。
function invalidateChain(state: MaintenanceState) {
  const revision = state.eo.revision;
  const active = state.eo.status === '有效';

  state.cards.forEach((card) => {
    if (!card.authorization) return;
    if (!active || card.authorization.eoRevision !== revision) {
      const prev = card.authorization.eoRevision;
      card.status = '待授权';
      card.authorization = undefined;
      addAudit(state, '系统', '链路失效', `${card.id} 授权依据 ${prev} 已失效（当前 ${revision}${active ? '' : '，已撤销'}），工卡回到待授权，原测量保留`);
    }
  });

  state.signatures.forEach((signature) => {
    const signedRevision = signature.eoRevision ?? FIRST_REVISION; // 旧签字无修订号按首版兼容
    if (signature.status === '已签署' && (!active || signedRevision !== revision)) {
      signature.status = '待签署';
      signature.actor = '待指定';
      signature.time = '-';
      signature.eoNumber = undefined;
      signature.eoRevision = undefined;
      addAudit(state, '系统', '签字失效', `${signature.stage} 阶段签字（${signedRevision}）已失效，须按当前 ${revision} 重新签署`);
    }
  });

  if (state.released) {
    const releaseRevision = state.releaseEoRevision ?? FIRST_REVISION;
    if (!active || releaseRevision !== revision) {
      state.released = false;
      state.releaseEoNumber = undefined;
      state.releaseEoRevision = undefined;
      addAudit(state, '系统', '放行基线失效', `放行基线（${releaseRevision}）已失效，须按当前 ${revision} 重新放行`);
    }
  }
}

const slice = createSlice({
  name: 'maintenance',
  initialState,
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
      addAudit(state, '当前用户', '离线暂存', `${card.id} 已保存本地草稿`);
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
    authorizeOverride(state, action: PayloadAction<{ eoNumber: string; eoRevision: string }>) {
      const card = state.cards.find((item) => item.id === state.activeCardId);
      if (!card) return;
      const { eoNumber, eoRevision } = action.payload;
      const authId = `AUTH-${card.id}-${eoNumber}-${eoRevision}`;

      // 幂等：同一授权号重试（失败恢复）直接按原授权号放行，不重复记审计。
      if (card.authorization?.authId === authId) {
        card.status = '执行中';
        state.conflictMessage = '';
        return;
      }

      // 只有当前有效修订的指令授权才能放行。
      if (state.eo.status !== '有效' || state.eo.revision !== eoRevision) {
        state.conflictMessage = `授权未生效：工程指令须为当前有效修订（当前 ${state.eo.revision}）。`;
        return;
      }

      card.status = '执行中';
      card.authorization = { authId, eoNumber, eoRevision, authorizedBy: '放行授权人', time: now() };
      card.finding = `超差已授权（${eoNumber} ${eoRevision}，授权号 ${authId}），按工程指令继续施工；原测量 ${card.measurement} 保留。`;
      state.conflictMessage = '';
      addAudit(state, '放行授权人', '授权继续', `${card.id} 超差放行，登记 ${eoNumber} ${eoRevision}，授权号 ${authId}`);
    },
    reviseInstruction(state, action: PayloadAction<{ eoNumber: string; revision: string; expectedVersion: number }>) {
      const { eoNumber, revision, expectedVersion } = action.payload;
      if (state.eo.status === '撤销') {
        state.conflictMessage = '工程指令已撤销，不能修订；请重新开立指令。';
        return;
      }
      // 乐观并发：先到生效，后到留冲突。
      if (expectedVersion !== state.eoVersion) {
        state.conflictMessage = '他人已先行提交同一指令修订（先到生效），本次提交留冲突；请刷新后基于最新版本重试。';
        return;
      }
      state.eoVersion += 1;
      state.eo.eoNumber = eoNumber;
      state.eo.revision = revision;
      state.eo.updatedAt = now();
      state.conflictMessage = '';
      addAudit(state, '工程指令', '指令修订', `${eoNumber} 升级至 ${revision}（并发版本 v${state.eoVersion}），处置链联动失效重算`);
      invalidateChain(state);
    },
    revokeInstruction(state) {
      if (state.eo.status === '撤销') return;
      state.eo.status = '撤销';
      state.eo.updatedAt = now();
      state.conflictMessage = '';
      addAudit(state, '工程指令', '指令撤销', `${state.eo.eoNumber} ${state.eo.revision} 已撤销，处置链全部失效`);
      invalidateChain(state);
    },
    // 模拟另一授权端先行提交同一指令：先到生效并推进并发版本。
    simulateConcurrentCommit(state) {
      if (state.eo.status === '撤销') {
        state.conflictMessage = '工程指令已撤销，不能提交修订。';
        return;
      }
      const next = bumpRevision(state.eo.revision);
      state.eoVersion += 1;
      state.eo.revision = next;
      state.eo.updatedAt = now();
      state.conflictMessage = '';
      addAudit(state, '工程指令', '并发提交生效', `另一授权端先行提交 ${state.eo.eoNumber} ${next}（并发版本 v${state.eoVersion}），先到生效`);
      invalidateChain(state);
    },
    signStage(state, action: PayloadAction<string>) {
      const signature = state.signatures.find((item) => item.stage === action.payload);
      if (!signature) return;
      if (state.eo.status !== '有效') {
        state.conflictMessage = '工程指令已撤销，阶段签字无效。';
        return;
      }
      signature.status = '已签署';
      signature.actor = `${action.payload}负责人`;
      signature.time = now();
      signature.eoNumber = state.eo.eoNumber;
      signature.eoRevision = state.eo.revision;
      state.conflictMessage = '';
      addAudit(state, signature.actor, '阶段签署', `${action.payload}阶段确认完成（${state.eo.eoNumber} ${state.eo.revision}）`);
    },
    releasePackage(state) {
      if (state.eo.status !== '有效') {
        state.conflictMessage = '工程指令已撤销，放行基线无效。';
        return;
      }
      const hasBlockers = state.cards.some((card) => card.status === '待授权');
      const allSigned = state.signatures.every(
        (item) => item.status === '已签署' && (item.eoRevision ?? FIRST_REVISION) === state.eo.revision
      );
      const chainCurrent = state.cards.every(
        (card) => !card.authorization || card.authorization.eoRevision === state.eo.revision
      );
      if (!hasBlockers && allSigned && chainCurrent) {
        state.released = true;
        state.releaseEoNumber = state.eo.eoNumber;
        state.releaseEoRevision = state.eo.revision;
        state.conflictMessage = '';
        addAudit(state, '质量经理', '锁定放行', `工作包已锁定，形成 ${state.eo.eoNumber} ${state.eo.revision} 放行基线`);
      } else {
        state.conflictMessage = '处置链未闭合：存在失效工卡、签字或指令修订不一致，放行基线未生效。';
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
  reviseInstruction,
  revokeInstruction,
  simulateConcurrentCommit,
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
