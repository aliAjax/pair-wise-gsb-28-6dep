/** 司机/车次卡片：拖放目标。装车结果、重量、发车锁定、换班、重开核对都在这里。 */

import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDroppable } from "@dnd-kit/core";
import { DRIVERS_BY_TRUCK } from "../data/drivers";
import { ORDERS_BY_ID } from "../data/orders";
import { deliveryOrder, totalWeight, verifyManifest } from "../logic/loading";
import { useDispatchStore, type TruckState } from "../state/dispatchStore";
import { OrderCard } from "./OrderCard";

interface TruckCardProps {
  truck: TruckState;
}

export function TruckCard({ truck }: TruckCardProps) {
  const master = DRIVERS_BY_TRUCK.get(truck.truckId);
  const { depart, removeOrder, handover } = useDispatchStore(
    useShallow(({ depart, removeOrder, handover }) => ({ depart, removeOrder, handover }))
  );
  const [handoverName, setHandoverName] = useState("");
  const [showHandover, setShowHandover] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `truck:${truck.truckId}`,
    data: { truckId: truck.truckId },
    disabled: truck.departed
  });

  const orders = useMemo(
    () =>
      truck.orderIds
        .map((id) => ORDERS_BY_ID.get(id))
        .filter((order): order is NonNullable<typeof order> => Boolean(order)),
    [truck.orderIds]
  );

  const weight = totalWeight(orders);
  const capacity = master?.capacityKg ?? 0;
  const ratio = capacity > 0 ? weight / capacity : 0;
  const nearFull = ratio >= 0.85;
  const over = weight > capacity;

  const manifest = truck.departed && truck.snapshot
    ? verifyManifest(truck.snapshot, truck.orderIds)
    : undefined;

  if (!master) return null;

  const firstStop = deliveryOrder(orders)[0];
  const lastLoad = orders[orders.length - 1];

  const submitHandover = () => {
    handover(truck.truckId, handoverName);
    setHandoverName("");
    setShowHandover(false);
  };

  return (
    <section
      ref={setNodeRef}
      className={[
        "truck-card",
        isOver ? "drag-over" : "",
        truck.departed ? "locked" : "",
        over ? "overweight" : ""
      ].join(" ")}
    >
      <header className="truck-head">
        <div>
          <h3>{truck.driverName} <span className="plate">{master.plate}</span></h3>
          <p className="truck-sub">
            {master.vehicleType} · 车次 {truck.truckId} · 核定载重 {capacity}kg
          </p>
        </div>
        {truck.departed ? (
          <span className="status-badge locked-badge">🔒 已发车 · 顺序锁定</span>
        ) : (
          <span className="status-badge prep-badge">待发车</span>
        )}
      </header>

      {truck.departed && truck.snapshot && (
        <div className={`manifest ${manifest?.ok ? "ok" : "bad"}`}>
          {manifest?.ok ? (
            <p>✅ 重开核对一致：{truck.snapshot.loadingOrder.length} 单，{manifest.actualWeightKg}kg，指纹 {truck.snapshot.checksum}</p>
          ) : (
            <>
              <p>⚠️ 重开核对不一致：</p>
              <ul>{manifest?.issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>
            </>
          )}
          <p className="manifest-meta">发车时间 {truck.departedAt} · 锁定司机 {truck.snapshot.driverName}</p>
        </div>
      )}

      <div className="weight-row">
        <div className="weight-bar-track">
          <div
            className={`weight-bar-fill ${over ? "over" : nearFull ? "warn" : "fine"}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <span className={`weight-text ${over ? "over" : nearFull ? "warn" : ""}`}>
          {weight}/{capacity}kg
        </span>
      </div>

      <div className="cargo-area" data-empty={orders.length === 0}>
        {orders.length === 0 ? (
          <div className="cargo-hint">
            {truck.departed ? "本车未装车即记录" : "把待分配订单拖到这里，自动按送达顺序插入"}
          </div>
        ) : (
          <>
            <div className="cargo-end">车厢最里 · 最后送</div>
            {/* 保存的是装车顺序：[0] 最先装（最里、最远），末尾靠门 */}
            {truck.orderIds.map((orderId, index) => (
              <OrderCard
                key={orderId}
                orderId={orderId}
                loadingIndex={index}
                totalOnTruck={truck.orderIds.length}
                disabled={truck.departed}
                onRemove={truck.departed ? undefined : () => removeOrder(truck.truckId, orderId)}
              />
            ))}
            <div className="cargo-door">车门 · 第一站先卸{firstStop ? `：${firstStop.id} ${firstStop.destination}` : ""}</div>
          </>
        )}
      </div>

      {orders.length > 0 && (
        <p className="route-line">
          送达路线：{deliveryOrder(orders).map((o) => `${o.id}(${o.distanceKm}km)`).join(" → ")}
          {lastLoad && <span className="load-hint">（靠门：{lastLoad.id}）</span>}
        </p>
      )}

      {truck.departed ? (
        <div className="locked-panel">
          <div className="handovers">
            {truck.handovers.length === 0 ? (
              <p className="handover-note">换班司机照原顺序接车，订单不可增删：</p>
            ) : (
              <div className="handover-list">
                {truck.handovers.map((log, i) => (
                  <p key={i} className="handover-entry">
                    🔁 {log.at}：{log.from} → {log.to} 接车（顺序不变）
                  </p>
                ))}
              </div>
            )}
          </div>
          {showHandover ? (
            <div className="handover-form">
              <input
                value={handoverName}
                onChange={(e) => setHandoverName(e.target.value)}
                placeholder="接班司机姓名"
                onKeyDown={(e) => e.key === "Enter" && submitHandover()}
                autoFocus
              />
              <button type="button" className="mini" onClick={submitHandover} disabled={!handoverName.trim()}>
                确认接车
              </button>
              <button type="button" className="mini ghost" onClick={() => setShowHandover(false)}>
                取消
              </button>
            </div>
          ) : (
            <button type="button" className="secondary" onClick={() => setShowHandover(true)}>
              换班登记
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="depart-btn"
          disabled={orders.length === 0 || over}
          onClick={() => depart(truck.truckId)}
          title={over ? "超重，不能发车" : orders.length === 0 ? "空车不能发车" : "发车后顺序锁定"}
        >
          {over ? "超重，不能发车" : "发车并锁定顺序"}
        </button>
      )}
    </section>
  );
}
