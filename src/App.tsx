/**
 * 页面层：只负责布局、拖拽编排与用户交互。
 * 规则判断全部走 src/logic/loading.ts，资料全部来自 src/data/*，本文件不写业务规则。
 */

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { ORDERS, ORDERS_BY_ID } from "./data/orders";
import { totalWeight } from "./logic/loading";
import { selectPendingOrderIds, useDispatchStore } from "./state/dispatchStore";
import { OrderCardContent } from "./components/OrderCard";
import { PendingPool } from "./components/PendingPool";
import { TruckCard } from "./components/TruckCard";
import { RejectLog } from "./components/RejectLog";

export default function App() {
  const trucks = useDispatchStore((state) => state.trucks);
  const assignOrder = useDispatchStore((state) => state.assignOrder);
  const resetAll = useDispatchStore((state) => state.resetAll);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  // 约束在订单卡片上按下后移动 6px 才算拖拽，避免和卡片内下拉框冲突
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const metrics = useMemo(() => {
    const allIds = Object.values(trucks).flatMap((truck) => truck.orderIds);
    const loadedWeight = totalWeight(
      allIds.map((id) => ORDERS_BY_ID.get(id)!).filter(Boolean)
    );
    const departedCount = Object.values(trucks).filter((truck) => truck.departed).length;
    return {
      pending: selectPendingOrderIds(trucks).length,
      loaded: allIds.length,
      loadedWeight,
      departed: departedCount
    };
  }, [trucks]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveOrderId(String(event.active.data.current?.orderId ?? ""));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrderId(null);
    const orderId = event.active.data.current?.orderId as string | undefined;
    const truckId = event.over?.data.current?.truckId as string | undefined;
    if (orderId && truckId) {
      assignOrder(truckId, orderId);
      // 退回结果已由 store 记录并在待分配区/退回记录中展示
    }
  };

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">配送装车排车台</p>
            <h1>按送达顺序装车 · 拖拽排车</h1>
            <p className="subtitle">
              远点先装、近点靠门，先送的货不再被压在车底。顺序冲突或超重的订单自动退回待分配区，发车后顺序锁死，换班照单接车。
            </p>
          </div>
          <div className="top-actions">
            <button type="button" className="ghost-btn" onClick={() => setShowRules((v) => !v)}>
              {showRules ? "收起规则" : "装车规则"}
            </button>
            <button
              type="button"
              className="ghost-btn danger-ghost"
              onClick={() => {
                if (window.confirm("确定清空所有车次、退回记录并重新开始？该操作不可撤销。")) {
                  resetAll();
                }
              }}
            >
              清空重来
            </button>
          </div>
        </header>

        {showRules && (
          <section className="rules-panel">
            <h3>装车与退回规则</h3>
            <ol>
              <li><strong>送达顺序</strong>：距仓近的先送（数字小的在前），开门第一单就是最近点，不用整车翻找。</li>
              <li><strong>装车顺序</strong>：与送达相反 —— 最远点先装车厢最里，最近点最后装、靠车门放。拖入新车次会自动插到正确位置。</li>
              <li><strong>顺序冲突退回</strong>：同一送达点同距离（谁先谁后排不出），或客户硬性要求与"近点先送"矛盾时退回待分配区，记录被车上哪一单挡住。</li>
              <li><strong>超重退回</strong>：加入后单趟总重超过该车核定载重即退回，写明超出多少公斤、被靠门先送的哪一单挡住。</li>
              <li><strong>发车锁定</strong>：发车后订单顺序与重量生成指纹快照，不能再增删；换班只改司机，订单照原顺序交接。</li>
              <li><strong>重开核对</strong>：订单资料、装车判断、页面分开维护；刷新重开后按资料重新核算重量并与发车指纹逐项核对，少货/多货/换序/改重都会报出。</li>
            </ol>
            <p className="rules-data-note">
              资料示例：共 {ORDERS.length} 个待分配订单，3 个车次。可尝试把 O-1011 拖到已装 O-1003 的车（同点同距冲突），
              把 O-1012 与 O-1006 装同车（客户要求与距离冲突），或向赵师傅/孙师傅的车连续装单触发超重。
            </p>
          </section>
        )}

        <section className="metrics">
          <article className="metric"><span>待分配</span><strong>{metrics.pending}</strong><em>单</em></article>
          <article className="metric"><span>已装车</span><strong>{metrics.loaded}</strong><em>单</em></article>
          <article className="metric"><span>在车总重</span><strong>{metrics.loadedWeight}</strong><em>kg</em></article>
          <article className="metric"><span>已发车锁定</span><strong>{metrics.departed}</strong><em>车</em></article>
        </section>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveOrderId(null)}>
          <div className="workspace">
            <PendingPool />
            <div className="truck-grid">
              {Object.values(trucks).map((truck) => (
                <TruckCard key={truck.truckId} truck={truck} />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeOrderId && ORDERS_BY_ID.get(activeOrderId) ? (
              <div className="drag-overlay">
                <article className="order-card no-drag">
                  <OrderCardContent orderId={activeOrderId} />
                </article>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <RejectLog />

        <footer className="footer-note">
          数据仅保存在本机浏览器（localStorage），订单资料改在 <code>src/data/</code>，装车规则改在 <code>src/logic/loading.ts</code>，页面互不耦合。
        </footer>
      </div>
    </main>
  );
}
