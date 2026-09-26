import { Popconfirm } from "antd";
import { useDroppable } from "@dnd-kit/core";
import type { VehicleMaster, VehicleRuntime } from "../types";
import { destinationMap, drivers, routeRules } from "../data/master";
import { formatMinutes, planStops } from "../logic/loading";
import { driverName, useBoard } from "../store";
import OrderTicket from "./OrderTicket";

interface Props {
  master: VehicleMaster;
  runtime: VehicleRuntime;
}

export default function VehicleCard({ master, runtime }: Props) {
  const orders = useBoard((s) => s.orders);
  const depart = useBoard((s) => s.depart);
  const finishTrip = useBoard((s) => s.finishTrip);
  const changeDriver = useBoard((s) => s.changeDriver);
  const setDepartTime = useBoard((s) => s.setDepartTime);

  const locked = Boolean(runtime.lock);

  // 已发车：以发车瞬间锁定的顺序与重量为准；未发车：按送达顺序实时排列
  const lockedOrders = locked
    ? runtime.lock!.orderIds
        .map((id) => orders.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => Boolean(o))
    : [];

  const activeOrders = orders.filter((o) => o.vehicleId === master.id && o.status === "assigned");
  const stops = locked
    ? planStops(lockedOrders, runtime.lock!.departedAt, routeRules, (id) => destinationMap.get(id)!)
    : planStops(activeOrders, runtime.departTime, routeRules, (id) => destinationMap.get(id)!);

  const totalWeight = locked ? runtime.lock!.totalWeight : activeOrders.reduce((s, o) => s + o.weight, 0);
  const capacity = locked ? runtime.lock!.capacity : master.capacity;
  const pct = Math.min(100, Math.round((totalWeight / Math.max(capacity, 1)) * 100));
  const over = totalWeight > capacity;

  const { setNodeRef, isOver } = useDroppable({ id: master.id, disabled: locked });

  return (
    <article className={`panel vehicle${locked ? " locked" : ""}${isOver ? " drop-over" : ""}`}>
      <header className="vehicle-head">
        <div>
          <p className="plate">{master.plate}</p>
          <label className="driver-select">
            当班司机（换班照原顺序接车）
            <select value={runtime.driverId} onChange={(e) => changeDriver(master.id, e.target.value)}>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className={`lock-state${locked ? " on" : ""}`}>{locked ? "已发车 · 顺序锁住" : "待发车"}</span>
      </header>

      <div className="weight-row">
        <div className="weight-track">
          <div className={`weight-fill${over ? " over" : ""}${pct >= 90 && !over ? " near" : ""}`} style={{ width: `${pct}%` }} />
        </div>
        <strong className={over ? "text-danger" : ""}>
          {totalWeight} / {capacity} kg{over ? "（已超载）" : ""}
        </strong>
      </div>

      <div className="depart-row">
        <label>
          {locked ? "实际发车" : "计划发车"}
          <input
            type="time"
            value={locked ? runtime.lock!.departedAt : runtime.departTime}
            disabled={locked}
            onChange={(e) => setDepartTime(master.id, e.target.value)}
          />
        </label>
        {!locked ? (
          <button type="button" disabled={stops.length === 0} onClick={() => depart(master.id)}>
            发车（锁住顺序）
          </button>
        ) : (
          <Popconfirm
            title="回场结单"
            description={`${driverName(runtime.driverId)}这一趟按锁定顺序完成，订单归档，车辆可排下一趟。`}
            okText="确认结单"
            cancelText="再等等"
            onConfirm={() => finishTrip(master.id)}
          >
            <button type="button" className="secondary">
              回场结单
            </button>
          </Popconfirm>
        )}
      </div>

      <div ref={setNodeRef} className="stop-list">
        {stops.length === 0 ? (
          <div className="empty">{locked ? "本趟无订单" : "把待分配订单拖到这里，自动排送达顺序"}</div>
        ) : (
          stops.map((stop) => (
            <OrderTicket
              key={stop.order.id}
              order={stop.order}
              stopNo={stop.stopNo}
              loadNo={stops.length - stop.stopNo + 1}
              draggable={!locked}
              arrivalLabel={`预计 ${formatMinutes(stop.arrivalMinutes)} 送达${
                stop.lateMinutes > 0 ? `（晚 ${stop.lateMinutes} 分钟）` : stop.order.dueTime ? "，赶得上" : ""
              }`}
            />
          ))
        )}
      </div>

      {locked && (
        <p className="locked-foot">
          顺序与总重已于 {runtime.lock!.departedAt} 发车时锁定：{runtime.lock!.orderIds.length} 单 / {runtime.lock!.totalWeight} kg，换班不改顺序。
        </p>
      )}
    </article>
  );
}
