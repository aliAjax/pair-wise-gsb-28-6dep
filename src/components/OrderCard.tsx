/** 订单卡片：资料展示 + 拖拽源。纯展示，规则不在这一层。 */

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ORDERS_BY_ID } from "../data/orders";

interface OrderCardProps {
  orderId: string;
  /** 在装车顺序中的位置（车上卡片用，0 = 最先装、车厢最里） */
  loadingIndex?: number;
  totalOnTruck?: number;
  /** 退回闪烁提示 */
  flash?: boolean;
  /** 待分配区快捷操作 */
  quickAssign?: ReactNode;
  /** 卸下按钮（未发车时显示） */
  onRemove?: () => void;
  disabled?: boolean;
}

/** 纯展示部分：拖拽浮层（DragOverlay）也复用它，避免重复注册拖拽 id */
export function OrderCardContent({
  orderId,
  loadingIndex,
  totalOnTruck,
  flash,
  quickAssign,
  onRemove
}: Omit<OrderCardProps, "disabled">) {
  const order = ORDERS_BY_ID.get(orderId);
  if (!order) return null;

  const onTruck = loadingIndex !== undefined && totalOnTruck !== undefined;
  // 装车顺序 1（最里）= 最后送达；靠门（最后装）= 第 1 个送
  const deliveryNo = onTruck ? totalOnTruck! - loadingIndex! : undefined;

  return (
    <>
      {onTruck && (
        <div className="seq-badges">
          <span className="badge load" title="装车次序（1 = 最先装、车厢最里）">装 {loadingIndex! + 1}</span>
          <span className="badge deliver" title="送达次序（1 = 第一站先卸）">送 {deliveryNo}</span>
        </div>
      )}
      <div className="order-body">
        <div className="order-head">
          <strong>{order.id}</strong>
          <span className="distance">{order.distanceKm}km</span>
        </div>
        <div className="order-line">
          <span className="dest">📍 {order.destination}</span>
          <span className="weight">{order.weightKg}kg</span>
        </div>
        {order.deliverBeforeId && (
          <p className="constraint">客户要求：先于 {order.deliverBeforeId} 送达</p>
        )}
        {order.note && <p className="order-note">{order.note}</p>}
        {(quickAssign || onRemove) && (
          <div className="card-actions" onPointerDown={(e) => e.stopPropagation()}>
            {quickAssign}
            {onRemove && (
              <button type="button" className="mini danger" onClick={onRemove}>
                卸下退回
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function OrderCard({
  orderId,
  loadingIndex,
  totalOnTruck,
  flash,
  quickAssign,
  onRemove,
  disabled
}: OrderCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `order:${orderId}`,
    data: { orderId },
    disabled
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const onTruck = loadingIndex !== undefined && totalOnTruck !== undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        "order-card",
        isDragging ? "dragging" : "",
        flash ? "flash-reject" : "",
        onTruck ? "on-truck" : "",
        disabled ? "no-drag" : ""
      ].join(" ")}
      {...attributes}
      {...listeners}
    >
      <OrderCardContent
        orderId={orderId}
        loadingIndex={loadingIndex}
        totalOnTruck={totalOnTruck}
        flash={flash}
        quickAssign={quickAssign}
        onRemove={onRemove}
      />
    </article>
  );
}
