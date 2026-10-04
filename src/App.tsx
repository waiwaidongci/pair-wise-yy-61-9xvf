import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Tab,
  TabList,
  Tag,
  Text,
  Textarea,
  Tooltip,
  webLightTheme
} from '@fluentui/react-components';
import {
  AlertRegular,
  ArrowDownloadRegular,
  ArrowSyncRegular,
  BookOpenRegular,
  BranchRegular,
  CheckmarkCircleRegular,
  ClipboardTaskListLtrRegular,
  CloudArrowUpRegular,
  CloudOffRegular,
  DocumentBulletListRegular,
  DocumentTextRegular,
  GaugeRegular,
  HistoryRegular,
  LockClosedRegular,
  NavigationRegular,
  PeopleRegular,
  WarningRegular
} from '@fluentui/react-icons';
import { useGetWorkPackageQuery, useSubmitCardMutation, useSubmitEoChangeMutation } from './api';
import {
  authorizeOverride,
  beginEoChange,
  clearEoConflicts,
  commitEoChange,
  recordEoConflict,
  refreshVersion,
  releasePackage,
  rollbackEoChange,
  selectCard,
  setConflict,
  signStage,
  toggleOffline,
  updateCard,
  type EngineeringOrder,
  type RootState
} from './store';

type NavItem = { path: string; label: string; icon: ReactNode };

function Shell({ children }: { children: ReactNode }) {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const nav: NavItem[] = [
    { path: '/', label: '工作包总览', icon: <ClipboardTaskListLtrRegular /> },
    { path: '/execution', label: '工卡执行', icon: <BookOpenRegular /> },
    { path: '/orders', label: '工程指令', icon: <DocumentTextRegular /> },
    { path: '/release', label: '放行审阅', icon: <LockClosedRegular /> },
    { path: '/audit', label: '审计与差异', icon: <HistoryRegular /> }
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon"><NavigationRegular /></div>
          <div><strong>航空定检执行台</strong><span>Maintenance Work Package</span></div>
        </div>
        <div className="aircraft-chip"><span>B-7891</span><strong>B737-800</strong><Badge appearance="tint" color="brand">48A 定检</Badge></div>
        <div className="header-spacer" />
        <button className={`sync-status ${state.offline ? 'offline' : ''}`} onClick={() => dispatch(toggleOffline())}>
          {state.offline ? <CloudOffRegular /> : <CloudArrowUpRegular />}<span>{state.offline ? '离线暂存' : `已同步 R${state.syncVersion}`}</span>
        </button>
        <div className="user-chip"><span>执行人员</span><strong>宋杰 · 机械</strong></div>
      </header>
      <div className="shell-grid">
        <aside className="side-nav">
          <div className="package-summary">
            <span>工作包</span><strong>WP-B7891-04</strong><small>上海浦东 · H3 机库</small>
            <div><ProgressBar value={0.58} /><span>58% 工卡完成</span></div>
          </div>
          <nav>{nav.map((item) => <NavLink end={item.path === '/'} key={item.path} to={item.path}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>
          <div className="side-status"><WarningRegular /><div><strong>{state.cards.filter((card) => card.status === '待授权').length} 项待授权</strong><span>放行前必须处理</span></div></div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div>;
}

function Overview() {
  const state = useSelector((root: RootState) => root.maintenance);
  const { data } = useGetWorkPackageQuery();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const completed = state.cards.filter((card) => card.status === '已完成').length;
  const blockers = state.cards.filter((card) => card.status === '待授权');
  return (
    <div className="page">
      <PageHeading eyebrow="WP-B7891-04 / 48A CHECK" title="工作包总览" description="监控工卡依赖、阶段签署、超差项目和放行门禁。" actions={<><Button appearance="secondary" icon={<ArrowDownloadRegular />}>导出进度</Button><Button appearance="primary" icon={<NavigationRegular />} onClick={() => navigate('/execution')}>继续执行</Button></>} />
      {blockers.length > 0 && <MessageBar intent="warning" className="top-message"><MessageBarBody><strong>放行阻断：</strong>{blockers.map((card) => `${card.id} ${card.title}`).join('、')} 等待授权人员处理。</MessageBarBody></MessageBar>}
      <div className="metrics-grid">
        {[
          ['工卡完成度', `${completed} / ${state.cards.length}`, `${Math.round(completed / state.cards.length * 100)}%`, 'green'],
          ['已记录工时', '18.6 h', '计划 20.5 h', 'blue'],
          ['开放发现', String(state.cards.filter((card) => card.finding && card.status !== '已完成').length), '1 项重复缺陷', 'amber'],
          ['待签署阶段', String(state.signatures.filter((item) => item.status === '待签署').length), '放行前完成', 'red']
        ].map((item) => <div className="metric-card" key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong><small className={item[3]}>{item[2]}</small></div>)}
      </div>
      <div className="overview-grid">
        <section className="panel task-panel">
          <div className="panel-head"><div><h2>关键工卡与依赖</h2><span>按执行依赖和风险排序</span></div><Badge appearance="tint">{data?.revision ?? 'WP R7'}</Badge></div>
          {state.cards.map((card, index) => (
            <button key={card.id} className={`task-row ${state.activeCardId === card.id ? 'active' : ''}`} onClick={() => { dispatch(selectCard(card.id)); navigate('/execution'); }}>
              <span className={`task-index ${card.status === '已完成' ? 'done' : card.status === '待授权' ? 'blocked' : ''}`}>{card.status === '已完成' ? <CheckmarkCircleRegular /> : index + 1}</span>
              <span className="task-main"><strong>{card.id} · {card.title}</strong><small>{card.zone} · 依赖 {card.dependencies.length ? card.dependencies.join('、') : '无'} · 计划 {card.estimated}h</small></span>
              <Tag appearance="outline" size="small">{card.stage}</Tag>
              <Badge appearance="tint" color={card.status === '已完成' ? 'success' : card.status === '待授权' ? 'danger' : card.status === '执行中' ? 'brand' : 'informative'}>{card.status}</Badge>
            </button>
          ))}
        </section>
        <aside className="overview-side">
          <section className="panel stage-panel"><div className="panel-head"><h2>阶段签字</h2><PeopleRegular /></div>{state.signatures.map((item) => <div className="signature-row" key={item.stage}><span className={item.status === '已签署' ? 'signed' : ''}>{item.status === '已签署' ? <CheckmarkCircleRegular /> : item.stage.slice(0, 1)}</span><div><strong>{item.stage}签署</strong><small>{item.actor} · {item.time}</small></div></div>)}</section>
          <section className="panel dependency-panel"><div className="panel-head"><h2>依赖路径</h2><GaugeRegular /></div><div className="dependency-graph"><span>CARD-01</span><i /><span>CARD-02</span><i /><span className="critical">CARD-03</span><i /><span>CARD-07</span><i /><span>CARD-08</span></div></section>
        </aside>
      </div>
    </div>
  );
}

function Execution() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const { data } = useGetWorkPackageQuery();
  const card = state.cards.find((item) => item.id === state.activeCardId) ?? state.cards[0];
  const [measurement, setMeasurement] = useState(card.measurement);
  const [finding, setFinding] = useState(card.finding);
  const [consumable, setConsumable] = useState('');
  const [witness, setWitness] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [eoId, setEoId] = useState('');
  const [eoRevision, setEoRevision] = useState('1');
  const [eoBasis, setEoBasis] = useState('按 AMM 容差分析并经工程部门确认，允许执行复测与系统恢复。');
  const [eoError, setEoError] = useState('');
  const [submitCard] = useSubmitCardMutation();
  useEffect(() => { setMeasurement(card.measurement); setFinding(card.finding); }, [card.id, card.measurement, card.finding]);
  const toleranceIssue = card.id === 'CARD-03' && Number.parseFloat(measurement) < 2850;
  const dependenciesMet = card.dependencies.every((dependency) => state.cards.find((item) => item.id === dependency)?.status === '已完成');
  // 处置链：该工卡最新一次授权及其指令状态
  const latestAuth = state.authorizations.find((item) => item.cardId === card.id);
  const authEo = latestAuth ? state.engineeringOrders.find((item) => item.id === latestAuth.eoId) : undefined;
  const authStale = Boolean(latestAuth && (latestAuth.status !== '有效' || !authEo || authEo.status !== '有效' || latestAuth.eoRevision !== authEo.revision));
  const dialogEo = state.engineeringOrders.find((item) => item.id === eoId.trim());
  const openOverride = () => {
    const eo = state.engineeringOrders.find((item) => item.cardIds.includes(card.id) && item.status === '有效') ?? state.engineeringOrders.find((item) => item.status === '有效');
    setEoId(eo?.id ?? '');
    setEoRevision(String(eo?.revision ?? 1));
    setEoError('');
    setOverrideOpen(true);
  };
  const confirmOverride = () => {
    if (!dialogEo) {
      setEoError(`工程指令 ${eoId || '(空)'} 未登记，无法作为授权依据。`);
      return;
    }
    if (dialogEo.status !== '有效') {
      setEoError(`工程指令 ${dialogEo.id} 已撤销，不能作为授权依据。`);
      return;
    }
    const revision = Number.parseInt(eoRevision, 10);
    if (revision !== dialogEo.revision) {
      setEoError(`登记修订 R${eoRevision} 与当前有效修订 R${dialogEo.revision} 不一致，授权被拒绝。`);
      return;
    }
    dispatch(authorizeOverride({ eoId: dialogEo.id, eoRevision: revision, basis: eoBasis }));
    setOverrideOpen(false);
    setEoError('');
  };
  const complete = async () => {
    if (!dependenciesMet) {
      dispatch(setConflict(`前置工卡 ${card.dependencies.join('、')} 尚未完成。`));
      return;
    }
    if (authStale && latestAuth) {
      dispatch(setConflict(`工程指令已改版或撤销，原授权 ${latestAuth.authNo} 失效，需按当前有效修订重新授权后才能继续。`));
      return;
    }
    if (toleranceIssue) {
      dispatch(setConflict('测量值超出容差，必须由授权人员处理。'));
      return;
    }
    if (!witness) {
      dispatch(setConflict('关键步骤必须完成见证确认。'));
      return;
    }
    if (state.syncVersion !== state.serverVersion) {
      dispatch(setConflict('检测到冲突提交：本地版本与服务器版本不一致，请刷新后重试。'));
      return;
    }
    const result = await submitCard({ cardId: card.id, expectedRevision: state.serverVersion, measurement, finding }).unwrap().catch((error) => {
      dispatch(setConflict(error.data?.message ?? '提交失败，请重试。'));
      return null;
    });
    if (result?.accepted) {
      dispatch(updateCard({ measurement, finding, status: '已完成' }));
      dispatch(setConflict(''));
    }
  };
  return (
    <div className="page">
      <PageHeading eyebrow={`${card.id} / ${card.stage}`} title={card.title} description={`${card.zone} · 工卡版本 ${data?.revision ?? 'R7'} · 预计 ${card.estimated} 小时`} actions={<><Button appearance="secondary" icon={<ArrowSyncRegular />} onClick={() => dispatch(toggleOffline())}>{state.offline ? '恢复在线' : '离线暂存'}</Button><Button appearance="primary" icon={<CheckmarkCircleRegular />} onClick={complete}>完成并提交</Button></>} />
      {state.conflictMessage && <MessageBar intent="error" className="top-message"><MessageBarBody><strong>提交被阻断：</strong>{state.conflictMessage}</MessageBarBody><Button appearance="secondary" size="small" onClick={() => dispatch(refreshVersion())}>刷新版本</Button></MessageBar>}
      {authStale && latestAuth && <MessageBar intent="warning" className="top-message"><MessageBarBody><strong>授权已失效：</strong>{latestAuth.eoId} 已{authEo?.status === '已撤销' ? '撤销' : `改版至 R${authEo?.revision}`}，原授权 {latestAuth.authNo}（R{latestAuth.eoRevision}）不再有效，需重新授权。</MessageBarBody></MessageBar>}
      <div className="execution-grid">
        <section className="panel card-editor">
          <div className="panel-head"><div><h2>工卡执行内容</h2><span>执行人员必须记录关键数据及证据</span></div><Badge appearance="tint" color={card.status === '待授权' ? 'danger' : 'brand'}>{card.status}</Badge></div>
          <div className="procedure-block">
            <h3>施工步骤</h3>
            {['确认飞机断电并设置 DO NOT OPERATE 警告牌。', '连接校准合格的测试设备，按 AMM 29-10-00 执行压力保持测试。', '记录稳定压力值，检查 10 分钟内压降。', '恢复系统构型，目视检查渗漏并上传证据。'].map((step, index) => <label key={step} className="procedure-step"><Checkbox defaultChecked={index < 2} /><span><b>{index + 1}.</b> {step}</span></label>)}
          </div>
          <Divider />
          <div className="form-grid">
            <Field label="测量值" hint={card.tolerance} validationState={toleranceIssue ? 'error' : 'none'} validationMessage={toleranceIssue ? '低于最低接受值 2850 psi' : undefined}><Input value={measurement} onChange={(_, data) => setMeasurement(data.value)} contentBefore={<GaugeRegular />} /></Field>
            <Field label="耗材 / 航材"><Input value={consumable} onChange={(_, data) => setConsumable(data.value)} placeholder="输入件号或耗材批次" /></Field>
            <Field label="发现与处置" className="wide-field"><Textarea value={finding} onChange={(_, data) => setFinding(data.value)} resize="vertical" placeholder="正常或填写缺陷、处置措施" /></Field>
            <Field label="证据附件" className="wide-field"><div className="upload-zone"><CloudArrowUpRegular /><strong>拖入照片、测试记录或报告</strong><span>已关联 3 个证据 · 支持 JPG / PDF / TXT</span></div></Field>
          </div>
          <label className="witness-check"><Checkbox checked={witness} onChange={(_, data) => setWitness(Boolean(data.checked))} /><span><strong>见证人已现场确认</strong><small>要求：{card.witness}</small></span></label>
        </section>
        <aside className="execution-side">
          <section className="panel card-meta"><div className="panel-head"><h2>工卡信息</h2><DocumentBulletListRegular /></div><dl><div><dt>容差</dt><dd>{card.tolerance}</dd></div><div><dt>证据要求</dt><dd>{card.evidence}</dd></div><div><dt>前置条件</dt><dd>{card.dependencies.length ? card.dependencies.join('、') : '无'}</dd></div><div><dt>阶段签署</dt><dd>{card.stage}</dd></div>{latestAuth && <div><dt>最新授权</dt><dd>{latestAuth.authNo} · {latestAuth.eoId} R{latestAuth.eoRevision} · {latestAuth.status}</dd></div>}</dl></section>
          {card.status === '待授权' && <section className="panel override-panel"><WarningRegular /><h3>超差项目等待授权</h3><p>原始测量值已保留。授权须登记工程指令号与修订号，仅当前有效修订可放行继续；指令改版或撤销后授权自动失效。</p><Button appearance="primary" onClick={openOverride}>授权处理</Button></section>}
          <section className="panel evidence-panel"><div className="panel-head"><h2>证据附件</h2><Badge appearance="tint">3 项</Badge></div>{['IMG_20260929_0904.jpg', '液压测试原始记录.pdf', '见证签字单_宋杰.pdf'].map((file, index) => <div className="evidence-row" key={file}><DocumentBulletListRegular /><div><strong>{file}</strong><small>{index + 1}.8 MB · 09:1{index}</small></div><Button size="small" appearance="subtle">预览</Button></div>)}</section>
        </aside>
      </div>
      <Dialog open={overrideOpen} onOpenChange={(_, data) => { setOverrideOpen(data.open); setEoError(''); }}><DialogSurface><DialogBody><DialogTitle>超差授权处理</DialogTitle><DialogContent>批准后将登记工程指令号与修订号并生成授权号，接入“工卡 → 指令 → 签字 → 放行基线”处置链；指令改版或撤销后本授权自动失效，原始测量值保留。{eoError && <MessageBar intent="error" className="dialog-message"><MessageBarBody>{eoError}</MessageBarBody></MessageBar>}<Field label="工程指令编号" required className="dialog-field"><Input value={eoId} onChange={(_, data) => setEoId(data.value)} placeholder="如 EO-2026-1147" /></Field><Field label="指令修订号" required hint={dialogEo ? `当前有效修订：R${dialogEo.revision} · ${dialogEo.status}` : '该指令未登记'} className="dialog-field"><Input type="number" min={1} value={eoRevision} onChange={(_, data) => setEoRevision(data.value)} /></Field><Field label="授权依据" required className="dialog-field"><Textarea value={eoBasis} onChange={(_, data) => setEoBasis(data.value)} /></Field></DialogContent><DialogActions><Button appearance="secondary" onClick={() => setOverrideOpen(false)}>取消</Button><Button appearance="primary" onClick={confirmOverride}>确认授权</Button></DialogActions></DialogBody></DialogSurface></Dialog>
    </div>
  );
}

function Orders() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const [submitEoChange] = useSubmitEoChangeMutation();
  const [busy, setBusy] = useState('');
  const pending = Boolean(state.pendingEoChange) || busy !== '';
  const validAuths = state.authorizations.filter((item) => item.status === '有效').length;
  const signedStages = state.signatures.filter((item) => item.status === '已签署').length;
  const waitingCards = state.cards.filter((card) => card.status === '待授权').length;
  const chain = [
    { label: '超差工卡', value: `${waitingCards} 项待授权`, ok: waitingCards === 0 },
    { label: '有效授权', value: `${validAuths} / ${state.authorizations.length}`, ok: validAuths === state.authorizations.length },
    { label: '阶段签字', value: `${signedStages} / ${state.signatures.length}`, ok: signedStages === state.signatures.length },
    { label: '放行基线', value: state.released ? '已锁定' : '未锁定', ok: state.released }
  ];
  // 提交指令改版/撤销：乐观失效 → 服务器确认；先到生效，后到留冲突；失败按原授权号恢复
  const runEoChange = async (eo: EngineeringOrder, changeType: 'revise' | 'revoke', simulatePeer: boolean) => {
    if (pending || eo.status !== '有效') return;
    setBusy(`${eo.id}-${changeType}`);
    const baseRevision = eo.revision;
    const actors = ['宋杰 · 本端', '李工 · 另一终端'];
    dispatch(beginEoChange({ eoId: eo.id, changeType }));
    const requests = [submitEoChange({ eoId: eo.id, changeType, expectedRevision: baseRevision, submittedBy: actors[0] })];
    if (simulatePeer) requests.push(submitEoChange({ eoId: eo.id, changeType, expectedRevision: baseRevision, submittedBy: actors[1] }));
    const results = await Promise.all(requests);
    const winnerIndex = results.findIndex((result) => 'data' in result && result.data?.accepted);
    if (winnerIndex >= 0) {
      dispatch(commitEoChange({ eoId: eo.id, actor: actors[winnerIndex] }));
    } else {
      dispatch(rollbackEoChange({ eoId: eo.id }));
    }
    results.forEach((result, index) => {
      if ('error' in result && result.error) {
        const data = (result.error as { data?: { message?: string; serverRevision?: number } }).data;
        dispatch(recordEoConflict({ eoId: eo.id, submittedBy: actors[index], detail: data?.message ?? '提交失败，已保留为冲突。', serverRevision: data?.serverRevision }));
      }
    });
    setBusy('');
  };
  return (
    <div className="page">
      <PageHeading eyebrow="ENGINEERING ORDER / DISPOSITION CHAIN" title="工程指令与授权链" description="超差工卡、工程指令、阶段签字与放行基线联动：指令改版或撤销后，相关授权、签字与基线立即失效重算，原测量保留。" />
      {state.eoConflicts.length > 0 && <MessageBar intent="warning" className="top-message"><MessageBarBody><strong>{state.eoConflicts.length} 条冲突待核对：</strong>后到的指令提交已保留在冲突暂存区，先到版本已生效。</MessageBarBody></MessageBar>}
      <div className="chain-strip">
        {chain.map((node) => <div className={`chain-node ${node.ok ? 'ok' : 'bad'}`} key={node.label}><span>{node.label}</span><strong>{node.value}</strong><small>{node.ok ? '链路正常' : '需处理'}</small></div>)}
      </div>
      <div className="orders-grid">
        <div className="orders-main">
          {state.engineeringOrders.map((eo) => (
            <section className="panel eo-panel" key={eo.id}>
              <div className="panel-head">
                <div><h2>{eo.id} · {eo.title}</h2><span>最近更新 {eo.updatedAt} · {eo.updatedBy}</span></div>
                <div className="eo-badges"><Badge appearance="tint" color="brand">R{eo.revision}</Badge><Badge appearance="tint" color={eo.status === '有效' ? 'success' : 'danger'}>{eo.status}</Badge></div>
              </div>
              {eo.cardIds.map((cardId) => {
                const card = state.cards.find((item) => item.id === cardId);
                const auth = state.authorizations.find((item) => item.cardId === cardId && item.eoId === eo.id);
                if (!card) return null;
                return (
                  <div className="eo-card-row" key={cardId}>
                    <div><strong>{card.id} · {card.title}</strong><small>{auth ? `授权号 ${auth.authNo} · 登记 R${auth.eoRevision} · ${auth.actor}` : '尚未登记授权'} · 原测量 {card.measurement || '—'}</small></div>
                    <Badge appearance="tint" color={auth?.status === '有效' ? 'success' : auth ? 'danger' : 'informative'}>{auth ? `授权${auth.status}` : '未授权'}</Badge>
                    <Badge appearance="tint" color={card.status === '已完成' ? 'success' : card.status === '待授权' ? 'danger' : 'brand'}>{card.status}</Badge>
                  </div>
                );
              })}
              <div className="eo-actions">
                <Button appearance="primary" size="small" disabled={pending || eo.status !== '有效'} onClick={() => void runEoChange(eo, 'revise', false)}>提交改版 R{eo.revision + 1}</Button>
                <Button appearance="secondary" size="small" disabled={pending || eo.status !== '有效'} onClick={() => void runEoChange(eo, 'revise', true)}>模拟双人并发提交</Button>
                <Button appearance="secondary" size="small" disabled={pending || eo.status !== '有效'} onClick={() => void runEoChange(eo, 'revoke', false)}>撤销指令</Button>
                {state.pendingEoChange?.eoId === eo.id && <span className="eo-pending">变更确认中…</span>}
              </div>
            </section>
          ))}
        </div>
        <aside className="orders-side">
          <section className="panel auth-chain-panel">
            <div className="panel-head"><div><h2>授权登记链</h2><span>{state.authorizations.length} 条授权记录</span></div><BranchRegular /></div>
            {state.authorizations.length === 0 && <div className="empty-hint">暂无授权记录，超差工卡授权后在此登记。</div>}
            {state.authorizations.map((auth) => (
              <div className="auth-row" key={auth.authNo}>
                <span className={`timeline-dot ${auth.status === '有效' ? '' : 'invalid'}`} />
                <div><strong>{auth.authNo} · {auth.cardId}</strong><p>{auth.eoId} R{auth.eoRevision} · {auth.basis}</p><small>{auth.time} · {auth.actor}</small></div>
                <Badge appearance="tint" color={auth.status === '有效' ? 'success' : 'danger'}>{auth.status}</Badge>
              </div>
            ))}
          </section>
          <section className="panel conflict-panel">
            <div className="panel-head"><div><h2>冲突暂存</h2><span>后到提交保留在此，待人工核对</span></div>{state.eoConflicts.length > 0 && <Button size="small" appearance="subtle" onClick={() => dispatch(clearEoConflicts())}>清空</Button>}</div>
            {state.eoConflicts.length === 0 && <div className="empty-hint">暂无冲突。</div>}
            {state.eoConflicts.map((conflict, index) => (
              <div className="conflict-row" key={`${conflict.time}-${index}`}>
                <WarningRegular />
                <div><strong>{conflict.eoId} · {conflict.submittedBy}</strong><p>{conflict.detail}</p><small>{conflict.time}</small></div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Release() {
  const state = useSelector((root: RootState) => root.maintenance);
  const dispatch = useDispatch();
  const [tab, setTab] = useState('open');
  const blockers = state.cards.filter((card) => card.status !== '已完成' && card.status !== '未开始');
  const allSigned = state.signatures.every((item) => item.status === '已签署');
  // 授权必须登记当前有效修订，否则放行基线不予锁定
  const staleAuth = state.cards.some((card) => {
    if (card.status === '已完成') return false;
    const auth = state.authorizations.find((item) => item.cardId === card.id);
    if (!auth || auth.status !== '有效') return false;
    const eo = state.engineeringOrders.find((item) => item.id === auth.eoId);
    return !eo || eo.status !== '有效' || auth.eoRevision !== eo.revision;
  });
  return (
    <div className="page">
      <PageHeading eyebrow="RELEASE REVIEW / B-7891" title="放行审阅" description="核对未关闭项目、重复缺陷、关键证据与阶段签字。" actions={<Button appearance="primary" icon={<LockClosedRegular />} disabled={!allSigned || staleAuth || blockers.some((card) => card.status === '待授权')} onClick={() => dispatch(releasePackage())}>{state.released ? '工作包已锁定' : '锁定并放行'}</Button>} />
      {state.released && <MessageBar intent="success" className="top-message"><MessageBarBody>工作包已锁定，形成只读放行基线并纳入审计记录。</MessageBarBody></MessageBar>}
      {staleAuth && <MessageBar intent="warning" className="top-message"><MessageBarBody><strong>授权链失效：</strong>存在基于旧修订或已撤销指令的授权，放行基线已重算，需重新授权并签署。</MessageBarBody></MessageBar>}
      <div className="release-grid">
        <section className="panel release-main">
          <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(String(data.value))}><Tab value="open">未关闭项目 <Badge>{blockers.length}</Badge></Tab><Tab value="repeat">重复缺陷 <Badge>2</Badge></Tab><Tab value="evidence">关键证据 <Badge>12</Badge></Tab></TabList>
          <div className="tab-body">
            {tab === 'open' && blockers.map((card) => <div className="review-item" key={card.id}><span className={`risk-icon ${card.status === '待授权' ? 'danger' : ''}`}><AlertRegular /></span><div><strong>{card.id} · {card.title}</strong><p>{card.finding || '工卡正在执行，完成后需由放行人员复核。'}</p><small>{card.zone} · 负责人 宋杰 · 要求证据 {card.evidence}</small></div><Badge appearance="tint" color={card.status === '待授权' ? 'danger' : 'warning'}>{card.status}</Badge></div>)}
            {tab === 'repeat' && <><div className="review-item"><span className="risk-icon danger"><HistoryRegular /></span><div><strong>液压系统压力偏低 · 第 3 次记录</strong><p>2026-08-16、09-02、09-29 均在系统 A 出现压力低于目标值。</p><small>建议移交可靠性分析，并关联历史排故记录。</small></div><Badge appearance="tint" color="danger">关键</Badge></div><div className="review-item"><span className="risk-icon"><HistoryRegular /></span><div><strong>APU 启动时间延长</strong><p>最近两次航线记录均略高于机队均值。</p><small>非放行阻塞项，建议后续监控。</small></div><Badge appearance="tint" color="warning">观察</Badge></div></>}
            {tab === 'evidence' && <div className="evidence-grid">{['液压系统测试记录.pdf', '发动机孔探照片_01.jpg', 'AD 执行签署页.pdf', '时寿件履历截图.png', '超差工程指令.pdf', '见证人签字单.pdf'].map((file) => <div className="evidence-tile" key={file}><DocumentBulletListRegular /><strong>{file}</strong><span>已绑定工卡 · 已核验</span></div>)}</div>}
          </div>
        </section>
        <aside className="release-side">
          <section className="panel signoff-card"><div className="panel-head"><h2>分阶段签字</h2><span>{state.signatures.filter((item) => item.status === '已签署').length} / 4</span></div>{state.signatures.map((item) => <div className="signoff-row" key={item.stage}><div><span>{item.stage}</span><strong>{item.actor}</strong><small>{item.time}</small></div>{item.status === '已签署' ? <Badge appearance="tint" color="success">已签署</Badge> : <Button size="small" appearance="primary" onClick={() => dispatch(signStage(item.stage))}>签署</Button>}</div>)}</section>
          <section className="panel release-gate-card"><LockClosedRegular /><h3>放行门禁</h3><label><Checkbox checked={!blockers.some((card) => card.status === '待授权')} readOnly /> 无待授权超差项目</label><label><Checkbox checked={!staleAuth} readOnly /> 授权均登记当前有效修订</label><label><Checkbox checked={state.cards.filter((card) => card.status === '已完成').length >= 6} readOnly /> 关键工卡完成率 ≥ 75%</label><label><Checkbox checked={allSigned} readOnly /> 四个阶段均完成电子签署</label><label><Checkbox checked /> 审计记录和证据附件完整</label></section>
        </aside>
      </div>
    </div>
  );
}

function Audit() {
  const state = useSelector((root: RootState) => root.maintenance);
  const [selected, setSelected] = useState('R7');
  const downloadAudit = () => {
    const csv = ['时间,操作者,动作,说明', ...state.audit.map((item) => [item.time, item.actor, item.action, item.detail].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'B7891-48A-audit.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const diffs = useMemo(() => [
    { card: 'CARD-03', field: '容差', from: '≥ 2800 psi / 10 min', to: '≥ 2850 psi / 10 min', reason: 'AMM 临时修订 TR-114' },
    { card: 'CARD-07', field: '依赖', from: 'CARD-02', to: 'CARD-03', reason: '试车前置条件调整' },
    { card: 'CARD-08', field: '证据', from: '近 2 次记录', to: '近 3 次记录', reason: '可靠性复核要求' }
  ], []);
  return (
    <div className="page">
      <PageHeading eyebrow="AUDIT / VERSION CONTROL" title="审计与版本差异" description="对比工卡版本、查看操作历史并导出闭环证据。" actions={<Button appearance="primary" icon={<ArrowDownloadRegular />} onClick={downloadAudit}>导出审计记录</Button>} />
      <div className="audit-grid">
        <section className="panel diff-panel"><div className="panel-head"><div><h2>工卡版本差异</h2><span>R6 → R7 · 3 处变更</span></div><select value={selected} onChange={(event) => setSelected(event.target.value)}><option>R7</option><option>R6</option><option>R5</option></select></div><div className="diff-table"><div className="diff-head"><span>工卡</span><span>字段</span><span>原值</span><span>新值 / 原因</span></div>{diffs.map((diff) => <div className="diff-row" key={`${diff.card}-${diff.field}`}><strong>{diff.card}</strong><span>{diff.field}</span><del>{diff.from}</del><div><ins>{diff.to}</ins><small>{diff.reason}</small></div></div>)}</div></section>
        <section className="panel audit-panel"><div className="panel-head"><div><h2>完整审计时间线</h2><span>{state.audit.length} 条记录</span></div><HistoryRegular /></div>{state.audit.map((item, index) => <div className="audit-row" key={`${item.time}-${index}`}><span className="timeline-dot" /><div><strong>{item.action}</strong><p>{item.detail}</p><small>{item.time} · {item.actor}</small></div></div>)}</section>
      </div>
    </div>
  );
}

function NotFound() {
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <BrowserRouter>
        <Shell><Routes><Route path="/" element={<Overview />} /><Route path="/execution" element={<Execution />} /><Route path="/orders" element={<Orders />} /><Route path="/release" element={<Release />} /><Route path="/audit" element={<Audit />} /><Route path="*" element={<NotFound />} /></Routes></Shell>
      </BrowserRouter>
    </FluentProvider>
  );
}
