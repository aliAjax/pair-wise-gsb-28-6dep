import { CSS } from "@dnd-kit/utilities";
import { useDraggable } from "@dnd-kit/core";
import type { Order } from "../types";
import { destinationMap } from "../data/master";

interface Props {
  order: Order;
  /** 在车辆卡片里显示送达站序；待分配区不传 */
  stopNo?: number;
  /** 装车顺序提示：装车第 n 个装（远点先装） */
  loadNo?: number;
  arrivalLabel?: string;
  draggable?: boolean;
  onDelete?: () => void;
}

export default function OrderTicket({
  order,
  stopNo,
  loadNo,
  arrivalLabel,
  draggable = true,
  onDelete
}: Props) {
  const dest = destinationMap.get(order.destinationId);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    disabled: !draggable
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`ticket${isDragging ? " dragging" : ""}${draggable ? " grab" : ""}${
        order.rejectReason ? " rejected" : ""
      }`}
      {...listeners}
      {...attributes}
      title={draggable ? "按住拖到司机卡片 / 拖回待分配区" : undefined}
    >
      <div className="ticket-head">
        <span className="ticket-no">{order.orderNo}</span>
        {stopNo !== undefined && <span className="stop-badge">第 {stopNo} 站</span>}
      </div>
      <div className="ticket-meta">
        <span>{dest?.name}</span>
        <span>{dest?.distance} km</span>
        <span>{order.weight} kg</span>
        {order.dueTime && <span className="due">约 {order.dueTime}</span>}
      </div>
      {arrivalLabel && <div className="ticket-arrival">{arrivalLabel}</div>}
      {loadNo !== undefined && (
        <div className="ticket-load">装车顺序：第 {loadNo} 个装（远先装、近靠门）</div>
      )}
      {order.rejectReason && <p className="reject-reason">↩ {order.rejectReason}</p>}
      {order.note && !order.rejectReason && <p className="ticket-note">{order.note}</p>}
      {onDelete && (
        <button
          type="button"
          className="mini danger"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          删除
        </button>
      )}
    </article>
  );
}
