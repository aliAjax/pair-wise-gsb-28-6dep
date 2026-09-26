import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { App as AntApp } from "antd";
import { vehicles, destinationMap } from "./data/master";
import { driverName, useBoard } from "./store";
import NewOrderForm from "./components/NewOrderForm";
import OrderPool from "./components/OrderPool";
import VehicleCard from "./components/VehicleCard";

function Board() {
  const { message } = AntApp.useApp();
  const orders = useBoard((s) => s.orders);
  const runtime = useBoard((s) => s.runtime);
  const assignOrder = useBoard((s) => s.assignOrder);
  const unassignOrder = useBoard((s) => s.unassignOrder);
  const deleteOrder = useBoard((s) => s.deleteOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const completedCount = orders.filter((o) => o.status === "completed").length;
  const departedVehicles = vehicles.filter((v) => runtime[v.id]?.lock).length;
  const waitingVehicles = vehicles.length - departedVehicles;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const orderId = String(active.id);
    const target = String(over.id);

    const order = useBoard.getState().orders.find((o) => o.id === orderId);
    if (!order) return;

    // 拖回待分配区：只有未发车车上的单可退回
    if (target === "pool") {
      if (order.status === "assigned") unassignOrder(orderId);
      return;
    }

    // 拖进某辆车（跨车、从待分配区入车都走同一套装载判断）
    if (vehicles.some((v) => v.id === target)) {
      if (order.vehicleId === target) return;
      const rejection = assignOrder(orderId, target);
      if (rejection) {
        if (rejection.type === "locked") message.warning(rejection.message);
        else message.error({ content: rejection.message, duration: 6 });
      } else {
        message.success(`${order.orderNo} 已按送达顺序排入车辆`);
      }
    }
  }

  const activeOrder = activeId ? orders.find((o) => o.id === activeId) : null;
  const completed = orders.filter((o) => o.status === "completed");

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <main className="app">
        <div className="shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">物流配送 · 装车顺序排班</p>
              <h1>配送任务拖拽排班</h1>
              <p className="subtitle">
                订单拖进司机卡片即按送达顺序排列：远点先装压里侧、近点靠门先卸；单趟总重不超核定载重。
                顺序冲突或超重的订单退回待分配区并注明被哪单挡住、超出多少公斤。发车后顺序锁住，换班照原顺序接车。
              </p>
            </div>
          </header>

          <section className="metrics">
            <article className="metric">
              <span>待分配订单</span>
              <strong>{pendingCount}</strong>
            </article>
            <article className="metric">
              <span>待发车 / 在途车辆</span>
              <strong>
                {waitingVehicles} / {departedVehicles}
              </strong>
            </article>
            <article className="metric">
              <span>已完成订单（归档可核）</span>
              <strong>{completedCount}</strong>
            </article>
          </section>

          <section className="board">
            <div className="left-col">
              <NewOrderForm />
              <OrderPool />
            </div>

            <div className="vehicle-col">
              {vehicles.map((v) => (
                <VehicleCard key={v.id} master={v} runtime={runtime[v.id]} />
              ))}
            </div>
          </section>

          {completed.length > 0 && (
            <section className="panel completed">
              <h2>已完成订单（{completed.length}）</h2>
              <div className="completed-grid">
                {completed.map((o) => (
                  <span className="completed-chip" key={o.id}>
                    {o.orderNo} · {destinationMap.get(o.destinationId)?.name} · {o.weight} kg
                    <button type="button" className="mini danger" onClick={() => deleteOrder(o.id)}>
                      删
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <DragOverlay dropAnimation={null}>
        {activeOrder ? (
          <div className="ticket overlay">
            <span className="ticket-no">{activeOrder.orderNo}</span>
            <span className="ticket-meta">
              {destinationMap.get(activeOrder.destinationId)?.name} · {activeOrder.weight} kg
              {activeOrder.vehicleId ? ` · ${driverName(runtime[activeOrder.vehicleId]?.driverId)}车上` : ""}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default function App() {
  return (
    <AntApp>
      <Board />
    </AntApp>
  );
}
