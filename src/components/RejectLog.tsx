/** 退回记录：哪些单被退回、被哪单挡住、超出多少公斤，持久保存可复核。 */

import { useDispatchStore } from "../state/dispatchStore";

const REASON_LABEL: Record<string, string> = {
  sequence: "顺序冲突",
  overweight: "超重",
  locked: "已锁车",
  unknown: "资料异常"
};

export function RejectLog() {
  const rejects = useDispatchStore((state) => state.rejects);
  const clearRejects = useDispatchStore((state) => state.clearRejects);

  return (
    <section className="reject-panel">
      <div className="reject-head">
        <h2>退回记录</h2>
        <div>
          <span className="pool-count">{rejects.length} 条</span>
          {rejects.length > 0 && (
            <button type="button" className="mini ghost" onClick={clearRejects}>
              清空记录
            </button>
          )}
        </div>
      </div>
      {rejects.length === 0 ? (
        <p className="empty-reject">还没有被退回的订单</p>
      ) : (
        <ul className="reject-list">
          {rejects.map((record) => (
            <li key={record.id} className="reject-item">
              <div className="reject-meta">
                <span className={`reject-tag ${record.reason}`}>{REASON_LABEL[record.reason] ?? record.reason}</span>
                <strong>{record.orderId}</strong>
                <span className="muted">→ {record.truckId}</span>
                <time className="muted">{record.at}</time>
              </div>
              <p>{record.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
