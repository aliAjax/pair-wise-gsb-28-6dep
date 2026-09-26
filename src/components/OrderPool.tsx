import { useDroppable } from "@dnd-kit/core";
import { useBoard } from "../store";
import OrderTicket from "./OrderTicket";

export default function OrderPool() {
  const orders = useBoard((s) => s.orders);
  const rejections = useBoard((s) => s.rejections);
  const clearRejections = useBoard((s) => s.clearRejections);
  const deleteOrder = useBoard((s) => s.deleteOrder);

  const pending = orders.filter((o) => o.status === "pending");

  const { setNodeRef, isOver } = useDroppable({ id: "pool" });

  return (
    <section className="panel pool">
      <div className="toolbar">
        <h2>待分配订单（{pending.length}）</h2>
      </div>
      <p className="hint">拖进司机卡片后自动按送达顺序排列：远点先装压里侧，近点靠门先卸。被退回的订单原地留原因。</p>

      <div ref={setNodeRef} className={`pool-drop${isOver ? " over" : ""}`}>
        {pending.length === 0 && <div className="empty">待分配区已清空</div>}
        {pending.map((order) => (
          <OrderTicket key={order.id} order={order} onDelete={() => deleteOrder(order.id)} />
        ))}
      </div>

      {rejections.length > 0 && (
        <div className="reject-log">
          <div className="reject-log-head">
            <h3>退回记录</h3>
            <button type="button" className="mini secondary" onClick={clearRejections}>
              清空
            </button>
          </div>
          <ul>
            {rejections.map((r) => (
              <li key={r.id}>
                <span className="reject-when">{new Date(r.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="reject-who">
                  {r.orderNo} → {r.plate}
                </span>
                <span className="reject-why">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
