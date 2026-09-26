/** 待分配订单区：退回的订单回到这里；支持拖拽，也可下拉快捷指派。 */

import { useEffect, useState } from "react";
import { DRIVERS } from "../data/drivers";
import {
  selectPendingOrderIds,
  useDispatchStore
} from "../state/dispatchStore";
import { OrderCard } from "./OrderCard";

export function PendingPool() {
  const trucks = useDispatchStore((state) => state.trucks);
  const assignOrder = useDispatchStore((state) => state.assignOrder);
  const lastReject = useDispatchStore((state) => state.lastReject);
  const dismissFlash = useDispatchStore((state) => state.dismissFlash);

  const pendingIds = selectPendingOrderIds(trucks);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // 退回成功 / 失败提示 4.5 秒后自动消失
  useEffect(() => {
    if (!lastReject) return;
    const timer = setTimeout(dismissFlash, 4500);
    return () => clearTimeout(timer);
  }, [lastReject, dismissFlash]);

  const quickAssign = (orderId: string, truckId: string) => {
    const result = assignOrder(truckId, orderId);
    setFeedback({ ok: result.ok, text: result.message });
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <aside className="pool-panel">
      <div className="pool-head">
        <h2>待分配订单</h2>
        <span className="pool-count">{pendingIds.length} 单</span>
      </div>
      <p className="pool-tip">
        拖到右侧司机卡片即自动按送达顺序排列；顺序冲突或超重会退回此处并在下方记录原因。
      </p>

      {feedback && (
        <div className={`feedback ${feedback.ok ? "ok" : "bad"}`}>{feedback.text}</div>
      )}
      {lastReject && (
        <div className="feedback bad reject-toast">
          <strong>{lastReject.orderId} 被退回（{lastReject.truckId}）：</strong>
          {lastReject.message}
        </div>
      )}

      <div className="pool-list">
        {pendingIds.length === 0 ? (
          <div className="empty">全部订单已装车</div>
        ) : (
          pendingIds.map((orderId) => (
            <OrderCard
              key={orderId}
              orderId={orderId}
              flash={lastReject?.orderId === orderId}
              quickAssign={
                <select
                  defaultValue=""
                  title="快捷指派到车次"
                  onChange={(e) => {
                    if (e.target.value) quickAssign(orderId, e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">指派到…</option>
                  {DRIVERS.map((driver) => (
                    <option key={driver.truckId} value={driver.truckId}>
                      {driver.driverName}（{driver.truckId}，载重 {driver.capacityKg}kg）
                    </option>
                  ))}
                </select>
              }
            />
          ))
        )}
      </div>
    </aside>
  );
}
