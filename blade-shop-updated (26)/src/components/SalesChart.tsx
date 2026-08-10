"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { Order } from "@/types";

const DAYS = 14;

export function SalesChart({ orders }: { orders: Order[] }) {
  const data = useMemo(() => {
    const days: { date: number; label: string; revenue: number; count: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({ date: d.getTime(), label: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), revenue: 0, count: 0 });
    }

    for (const order of orders) {
      if (order.status !== "confirmed") continue;
      const d = new Date(order.confirmedAt ?? order.createdAt);
      d.setHours(0, 0, 0, 0);
      const bucket = days.find((day) => day.date === d.getTime());
      if (bucket) {
        bucket.revenue += order.total;
        bucket.count += 1;
      }
    }
    return days;
  }, [orders]);

  const total = data.reduce((s, d) => s + d.revenue, 0);
  const salesCount = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) return null;

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-accent" />
          <p className="font-semibold text-sm">Продажи за последние 14 дней</p>
        </div>
        <p className="text-sm text-white/50">
          <span className="text-accent font-bold">{total.toFixed(0)} ₽</span> · {salesCount} {salesCount === 1 ? "заказ" : "заказов"}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff9800" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ff9800" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" stroke="#5b6272" fontSize={10} tickLine={false} axisLine={false} interval={2} />
          <YAxis stroke="#5b6272" fontSize={10} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            formatter={(v: number) => [`${v} ₽`, "Выручка"]}
            contentStyle={{ background: "#151922", border: "1px solid #232838", borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="revenue" stroke="#ff9800" strokeWidth={2} fill="url(#salesGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
