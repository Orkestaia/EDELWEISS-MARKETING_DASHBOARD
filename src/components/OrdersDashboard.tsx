"use client";

import { useMemo, useState } from 'react';
import { BarChart3, Building2, CalendarClock, ChevronRight, PackageCheck, Search, ShoppingBag, Sparkles } from 'lucide-react';
import type { OrdersAndRequestsData } from '@/lib/data';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type ProductSale = { name: string; quantity: number; date: Date };

function productSales(orders: OrdersAndRequestsData['orders']): ProductSale[] {
  return orders.flatMap(order => {
    const date = new Date(`${order.pickupDate}T12:00:00-04:00`);
    if (!order.pickupDate || Number.isNaN(date.getTime())) return [];
    return [...order.items.matchAll(/(\d+)x\s+(.+?)\s+\(\$[\d.]+\)/g)].map(match => ({ quantity: Number(match[1]), name: match[2].trim(), date }));
  });
}

function rankProducts(sales: ProductSale[]) {
  const totals = new Map<string, number>();
  sales.forEach(sale => totals.set(sale.name, (totals.get(sale.name) || 0) + sale.quantity));
  return [...totals].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity);
}

export function OrdersDashboard({ data }: { data: OrdersAndRequestsData }) {
  const [view, setView] = useState<'orders' | 'analytics' | 'special' | 'wholesale'>('orders'); const [query, setQuery] = useState('');
  const orders = useMemo(() => data.orders.filter(order => !order.isTest), [data.orders]);
  const revenue = orders.reduce((sum, order) => sum + order.totalUsd, 0); const average = orders.length ? revenue / orders.length : 0;
  const matches = (values: string[]) => !query || values.join(' ').toLowerCase().includes(query.toLowerCase());
  const visibleOrders = [...orders].reverse().filter(order => matches([order.orderId, order.customerName, order.items, order.pickupDate]));
  const visibleSpecial = [...data.specialOrders].sort((a,b) => b.receivedAt.localeCompare(a.receivedAt)).filter(order => matches([order.name, order.eventType, order.message, order.eventDate]));
  const visibleWholesale = data.wholesale.filter(order => matches([order.businessName, order.contactName, order.businessType, order.message]));
  const analytics = useMemo(() => {
    const sales = productSales(orders); const allTime = rankProducts(sales);
    const latestDate = sales.reduce((latest, sale) => sale.date > latest ? sale.date : latest, new Date(0));
    const month = rankProducts(sales.filter(sale => sale.date.getMonth() === latestDate.getMonth() && sale.date.getFullYear() === latestDate.getFullYear()));
    const dayLeaders = weekdays.map((label, index) => ({ label, leader: rankProducts(sales.filter(sale => sale.date.getDay() === index))[0] }));
    const windowStart = new Date(latestDate); windowStart.setDate(windowStart.getDate() - 27);
    const plan = rankProducts(sales.filter(sale => sale.date >= windowStart)).map(item => ({ ...item, weeklyAverage: item.quantity / 4, suggested: Math.ceil(item.quantity / 4 * 1.15) })).slice(0, 12);
    return { allTime, month, dayLeaders, plan, latestDate, totalUnits: sales.reduce((sum, sale) => sum + sale.quantity, 0) };
  }, [orders]);
  return <section className="orders-dashboard">
    <div className="section-heading"><div><span className="eyebrow">Operaciones web · en tiempo real vía n8n</span><h2>Orders &amp; requests</h2><p>Pedidos desde el lanzamiento, encargos especiales y oportunidades wholesale en una sola vista.</p></div><a className="sheet-link" href="https://docs.google.com/spreadsheets/d/1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I/edit" target="_blank" rel="noreferrer">Abrir Sheet <ChevronRight size={15}/></a></div>
    <div className="order-stats"><article><ShoppingBag/><span>Pedidos reales</span><strong>{orders.length}</strong><small>{data.orders.length - orders.length} tests excluidos</small></article><article><PackageCheck/><span>Ingresos web</span><strong>{money.format(revenue)}</strong><small>ticket medio {money.format(average)}</small></article><article><CalendarClock/><span>Encargos especiales</span><strong>{data.specialOrders.length}</strong><small>solicitudes recibidas</small></article><article><Building2/><span>Wholesale leads</span><strong>{data.wholesale.length}</strong><small>oportunidades abiertas</small></article></div>
    <div className="orders-controls"><div className="segmented"><button className={view==='orders'?'active':''} onClick={()=>setView('orders')}>Orders <span>{orders.length}</span></button><button className={view==='analytics'?'active':''} onClick={()=>setView('analytics')}>Product insights</button><button className={view==='special'?'active':''} onClick={()=>setView('special')}>Special Orders <span>{data.specialOrders.length}</span></button><button className={view==='wholesale'?'active':''} onClick={()=>setView('wholesale')}>Wholesale <span>{data.wholesale.length}</span></button></div>{view !== 'analytics' && <label className="order-search"><Search size={16}/><input aria-label="Buscar pedidos y solicitudes" placeholder="Buscar por nombre, fecha o producto…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}</div>
    {view === 'analytics' && <div className="product-insights">
      <div className="insight-summary"><article><BarChart3/><span>Unidades vendidas</span><strong>{analytics.totalUnits}</strong><small>pedidos web reales</small></article><article><Sparkles/><span>Top histórico</span><strong>{analytics.allTime[0]?.name || '—'}</strong><small>{analytics.allTime[0]?.quantity || 0} unidades</small></article><article><CalendarClock/><span>Top del mes</span><strong>{analytics.month[0]?.name || '—'}</strong><small>{analytics.month[0]?.quantity || 0} unidades en {analytics.latestDate.toLocaleString('en-US', { month: 'long' })}</small></article></div>
      <div className="insight-grid">
        <article className="insight-card"><div className="card-title"><div><span className="eyebrow">Demanda acumulada</span><h3>Top products</h3></div><small>Unidades</small></div><div className="product-ranking">{analytics.allTime.slice(0, 10).map((item, index) => <div key={item.name}><span className="rank">{index + 1}</span><div><strong>{item.name}</strong><i style={{width: `${item.quantity / (analytics.allTime[0]?.quantity || 1) * 100}%`}}/></div><b>{item.quantity}</b></div>)}</div></article>
        <article className="insight-card"><div className="card-title"><div><span className="eyebrow">Patrón de recogida</span><h3>Best seller by weekday</h3></div></div><div className="weekday-leaders">{analytics.dayLeaders.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.leader?.name || 'No sales'}</strong><b>{item.leader?.quantity || 0}</b></div>)}</div></article>
      </div>
      <article className="insight-card production-plan"><div className="card-title"><div><span className="eyebrow">Plan orientativo · últimas 4 semanas</span><h3>Weekly production forecast</h3><p>Promedio semanal reciente + 15% de colchón. No incluye ventas presenciales ni pedidos especiales.</p></div><small>Actualizado al {day.format(analytics.latestDate)}</small></div><div className="forecast-table"><div className="forecast-head"><span>Product</span><span>Avg/week</span><span>Suggested</span></div>{analytics.plan.map(item => <div key={item.name}><strong>{item.name}</strong><span>{item.weeklyAverage.toFixed(1)}</span><b>{item.suggested}</b></div>)}</div></article>
    </div>}
    <div className="orders-list">{view==='orders' && visibleOrders.map(order => <article key={order.orderId}><div className="order-date"><strong>{order.pickupDate ? day.format(new Date(`${order.pickupDate}T12:00:00-04:00`)) : '—'}</strong><span>{order.pickupTime || 'Pickup'}</span></div><div className="order-main"><div><span className="eyebrow">#{order.orderId}</span><h3>{order.customerName || 'Cliente web'}</h3></div><p>{order.items}</p><div className="contact-line"><span>{order.customerEmail}</span><span>{order.customerPhone}</span>{order.notes && <span>{order.notes}</span>}</div></div><strong className="order-total">{money.format(order.totalUsd)}</strong></article>)}
    {view==='special' && visibleSpecial.map((order,i) => <article key={`${order.receivedAt}-${i}`}><div className="order-date"><strong>{order.eventDate ? day.format(new Date(`${order.eventDate}T12:00:00-04:00`)) : 'TBD'}</strong><span>{order.guests ? `${order.guests} guests` : 'Special'}</span></div><div className="order-main"><div><span className="eyebrow">{order.eventType}</span><h3>{order.name}</h3></div><p>{order.message}</p><div className="contact-line"><span>{order.email}</span><span>{order.phone}</span></div></div></article>)}
    {view==='wholesale' && visibleWholesale.map((order,i) => <article key={`${order.receivedAt}-${i}`}><div className="order-date wholesale"><Building2/><span>{order.businessType}</span></div><div className="order-main"><div><span className="eyebrow">Wholesale inquiry</span><h3>{order.businessName}</h3></div><p>{order.message}</p><div className="contact-line"><span>{order.contactName}</span><span>{order.email || 'Email pendiente'}</span><span>{order.phone}</span></div>{order.qualityNote && <small className="quality-note">{order.qualityNote}</small>}</div></article>)}
    {((view==='orders'&&!visibleOrders.length)||(view==='special'&&!visibleSpecial.length)||(view==='wholesale'&&!visibleWholesale.length)) && <div className="empty-orders">No hay resultados para esta búsqueda.</div>}</div>
  </section>;
}
