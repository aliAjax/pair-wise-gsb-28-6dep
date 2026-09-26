import { FormEvent, useState } from "react";
import { destinations } from "../data/master";
import { useBoard } from "../store";

export default function NewOrderForm() {
  const addOrder = useBoard((s) => s.addOrder);
  const [orderNo, setOrderNo] = useState("");
  const [destinationId, setDestinationId] = useState(destinations[0].id);
  const [weight, setWeight] = useState(100);
  const [dueTime, setDueTime] = useState("");
  const [note, setNote] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addOrder({ orderNo: orderNo.trim(), destinationId, weight: Number(weight), dueTime, note });
    setOrderNo("");
    setWeight(100);
    setDueTime("");
    setNote("");
  }

  return (
    <form className="panel add-form" onSubmit={submit}>
      <h2>新增待分配订单</h2>
      <div className="form-grid">
        <label>
          订单号
          <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} required placeholder="如 ORD-9101" />
        </label>
        <label>
          送达点（距离以资料层维护）
          <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}（{d.distance} km）
              </option>
            ))}
          </select>
        </label>
        <label>
          重量 kg
          <input type="number" min={1} step={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} required />
        </label>
        <label>
          预约送达截止时间（可选，用来判顺序冲突）
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </label>
        <label>
          备注
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="现场要求等" />
        </label>
        <button type="submit">加入待分配</button>
      </div>
    </form>
  );
}
