"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, ShoppingCart, DollarSign, TrendingUp, AlertCircle, Package, Crown } from "lucide-react";
import Link from "next/link";
import { getAllUsers, getAllOrders } from "@/lib/users";
import { getProducts } from "@/lib/products";

interface Stat {
  label: string;
  value: string;
  icon: typeof Users;
}

interface TopSeller {
  sellerId: string;
  name: string;
  username: string | null;
  revenue: number;
  orders: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [chartData, setChartData] = useState<{ date: string; revenue: number; orders: number }[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [users, orders, products] = await Promise.all([getAllUsers(), getAllOrders(), getProducts()]);

        const today = new Date().toDateString();
        const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

        const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
        const todayRevenue = orders
          .filter((o) => new Date(o.createdAt).toDateString() === today)
          .reduce((sum, o) => sum + o.total, 0);
        const monthRevenue = orders.filter((o) => o.createdAt >= monthAgo).reduce((sum, o) => sum + o.total, 0);
        const newToday = users.filter((u) => new Date(u.createdAt).toDateString() === today).length;
        const avgCheck = orders.length ? totalRevenue / orders.length : 0;

        setStats([
          { label: "Всего пользователей", value: users.length.toLocaleString("ru-RU"), icon: Users },
          { label: "Новых сегодня", value: newToday.toString(), icon: TrendingUp },
          { label: "Всего заказов", value: orders.length.toLocaleString("ru-RU"), icon: ShoppingCart },
          { label: "Заработано сегодня", value: `${todayRevenue.toFixed(0)} ₽`, icon: DollarSign },
          { label: "Заработано за месяц", value: `${monthRevenue.toFixed(0)} ₽`, icon: DollarSign },
          { label: "Всего заработано", value: `${totalRevenue.toFixed(0)} ₽`, icon: DollarSign },
          { label: "Средний чек", value: `${avgCheck.toFixed(0)} ₽`, icon: TrendingUp },
          { label: "Активные товары", value: products.filter((p) => p.stock > 0).length.toString(), icon: Package },
        ]);

        // Группируем заказы по дням за последние 14 дней
        const days: Record<string, { revenue: number; orders: number }> = {};
        for (let i = 13; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const key = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
          days[key] = { revenue: 0, orders: 0 };
        }
        orders.forEach((o) => {
          const key = new Date(o.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
          if (days[key]) {
            days[key].revenue += o.total;
            days[key].orders += 1;
          }
        });
        setChartData(Object.entries(days).map(([date, v]) => ({ date, ...v })));

        // Топ продавцов по выручке с подтверждённых заказов (sellerId "store" — товары площадки, не считаем).
        const revenueBySeller: Record<string, { revenue: number; orders: number }> = {};
        orders
          .filter((o) => o.status === "confirmed" && o.sellerId !== "store")
          .forEach((o) => {
            if (!revenueBySeller[o.sellerId]) revenueBySeller[o.sellerId] = { revenue: 0, orders: 0 };
            revenueBySeller[o.sellerId].revenue += o.total;
            revenueBySeller[o.sellerId].orders += 1;
          });
        const usersById = Object.fromEntries(users.map((u) => [u.uid, u]));
        const ranked = Object.entries(revenueBySeller)
          .map(([sellerId, v]) => ({
            sellerId,
            name: usersById[sellerId]?.displayName ?? "Удалённый пользователь",
            username: usersById[sellerId]?.username ?? null,
            revenue: v.revenue,
            orders: v.orders,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        setTopSellers(ranked);
      } catch {
        setStats([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Аналитика</h1>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка данных...</div>
      ) : stats.length === 0 ? (
        <div className="card p-6 flex items-center gap-3 text-white/50">
          <AlertCircle className="text-accent shrink-0" size={20} />
          Нет данных. Заполните Firestore коллекции users/orders/products, либо запустите npm run seed для товаров.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="card p-4">
                  <Icon className="text-accent mb-2" size={20} />
                  <p className="text-xs text-white/40">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              );
            })}
          </div>

          <div className="card p-5">
            <p className="font-medium mb-4">Доход за последние 14 дней</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#232838" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "#151922", border: "1px solid #232838", borderRadius: 12 }}
                  labelStyle={{ color: "#fff" }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#ff9800" strokeWidth={2} dot={false} name="Доход" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {topSellers.length > 0 && (
            <div className="card p-5">
              <p className="font-medium mb-4 flex items-center gap-2">
                <Crown size={16} className="text-accent" /> Топ продавцов (по выручке)
              </p>
              <div className="space-y-2">
                {topSellers.map((s, i) => (
                  <div key={s.sellerId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-white/30 text-sm w-4">{i + 1}</span>
                      {s.username ? (
                        <Link href={`/seller/${s.username}`} target="_blank" className="text-sm font-medium hover:text-accent hover:underline">
                          {s.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium">{s.name}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{s.revenue.toFixed(0)} ₽</p>
                      <p className="text-xs text-white/30">{s.orders} заказ(ов)</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
