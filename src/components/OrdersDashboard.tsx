"use client";

import { useMemo, useState } from 'react';
import { BarChart3, Building2, CalendarClock, ChevronRight, PackageCheck, Search, ShoppingBag, Sparkles } from 'lucide-react';
import type { OrdersAndRequestsData } from '@/lib/data';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const displayDate = (value: string, fallback = '—') => { if (!value) return fallback; const parsed = new Date(`${value}T12:00:00-04:00`); return Number.isNaN(parsed.getTime()) ? 'Invalid date' : day.format(parsed); };

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
  const [period, setPeriod] = useState('all'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const orders = useMemo(() => data.orders.filter(order => !order.isTest), [data.orders]);
  const filteredOrders = useMemo(() => { const now = new Date(); const end = now.toISOString().slice(0,10); const start = new Date(now); if(period==='week') start.setDate(now.getDate()-((now.getDay()+6)%7)); if(period==='7d') start.setDate(now.getDate()-6); if(period==='30d') start.setDate(now.getDate()-29); if(period==='month') start.setDate(1); const startDate=period==='custom'?from:period==='all'?'':start.toISOString().slice(0,10); const endDate=period==='custom'?to:period==='all'?'':end; return orders.filter(order=>(!startDate||order.pickupDate>=startDate)&&(!endDate||order.pickupDate<=endDate)); }, [orders,period,from,to]);
  const revenue = filteredOrders.reduce((sum, order) => sum + order.totalUsd, 0); const average = filteredOrders.length ? revenue / filteredOrders.length : 0;
  const matches = (values: string[]) => !query || values.join(' ').toLowerCase().includes(query.toLowerCase());
  const visibleOrders = [...filteredOrders].reverse().filter(order => matches([order.orderId, order.customerName, order.items, order.pickupDate]));
  const visibleSpecial = [...data.specialOrders].sort((a,b) => b.receivedAt.localeCompare(a.receivedAt)).filter(order => matches([order.name, order.eventType, order.message, order.eventDate]));
  const visibleWholesale = data.wholesale.filter(order => matches([order.businessName, order.contactName, order.businessType, order.message]));
  const analytics = useMemo(() => {
    const sales = productSales(filteredOrders); const allTime = rankProducts(sales);
    const latestDate = sales.reduce((latest, sale) => sale.date > latest ? sale.date : latest, new Date(0));
    const month = rankProducts(sales.filter(sale => sale.date.getMonth() === latestDate.getMonth() && sale.date.getFullYear() === latestDate.getFullYear()));
    const dayLeaders = weekdays.map((label, index) => ({ label, leader: rankProducts(sales.filter(sale => sale.date.getDay() === index))[0] }));
    const windowStart = new Date(latestDate); windowStart.setDate(windowStart.getDate() - 27);
    const plan = rankProducts(sales.filter(sale => sale.date >= windowStart)).map(item => ({ ...item, weeklyAverage: item.quantity / 4, suggested: Math.ceil(item.quantity / 4 * 1.15) })).slice(0, 12);
    return { allTime, month, dayLeaders, plan, latestDate, totalUnits: sales.reduce((sum, sale) => sum + sale.quantity, 0) };
  }, [filteredOrders]);
  return <section className="orders-dashboard">
    <div className="section-heading"><div><span className="eyebrow">Web operations · live via n8n</span><h2>Orders &amp; requests</h2><p>Orders since launch, special requests and wholesale opportunities in one place.</p></div><a className="sheet-link" href="https://docs.google.com/spreadsheets/d/1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I/edit" target="_blank" rel="noreferrer">Open Sheet <ChevronRight size={15}/></a></div>
    <div className="date-filters"><select aria-label="Order date range" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All time</option><option value="today">Today</option><option value="week">This week</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="month">This month</option><option value="custom">Custom range</option></select>{period==='custom'&&<><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}</div>
    <div className="order-stats"><article><ShoppingBag/><span>Real orders</span><strong>{filteredOrders.length}</strong><small>{data.orders.length - orders.length} tests excluded</small></article><article><PackageCheck/><span>Web revenue</span><strong>{money.format(revenue)}</strong><small>average order {money.format(average)}</small></article><article><CalendarClock/><span>Special orders</span><strong>{data.specialOrders.length}</strong><small>requests received</small></article><article><Building2/><span>Wholesale leads</span><strong>{data.wholesale.length}</strong><small>open opportunities</small></article></div>
    <div className="orders-controls"><div className="segmented"><button className={view==='orders'?'active':''} onClick={()=>setView('orders')}>Orders <span>{filteredOrders.length}</span></button><button className={view==='analytics'?'active':''} onClick={()=>setView('analytics')}>Product insights</button><button className={view==='special'?'active':''} onClick={()=>setView('special')}>Special Orders <span>{data.specialOrders.length}</span></button><button className={view==='wholesale'?'active':''} onClick={()=>setView('wholesale')}>Wholesale <span>{data.wholesale.length}</span></button></div>{view !== 'analytics' && <label className="order-search"><Search size={16}/><input aria-label="Search orders and requests" placeholder="Search by name, date or product…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}</div>
    {view === 'analytics' && <div className="product-insights">
      <div className="insight-summary"><article><BarChart3/><span>Units sold</span><strong>{analytics.totalUnits}</strong><small>selected order period</small></article><article><Sparkles/><span>Period leader</span><strong>{analytics.allTime[0]?.name || '—'}</strong><small>{analytics.allTime[0]?.quantity || 0} units</small></article><article><CalendarClock/><span>Latest month leader</span><strong>{analytics.month[0]?.name || '—'}</strong><small>{analytics.month[0]?.quantity || 0} units{analytics.latestDate.getTime() ? ` in ${analytics.latestDate.toLocaleString('en-US', { month: 'long' })}` : ''}</small></article></div>
      <div className="insight-grid">
        <article className="insight-card"><div className="card-title"><div><span className="eyebrow">Cumulative demand</span><h3>Top products</h3></div><small>Units</small></div><div className="product-ranking">{analytics.allTime.slice(0, 10).map((item, index) => <div key={item.name}><span className="rank">{index + 1}</span><div><strong>{item.name}</strong><i style={{width: `${item.quantity / (analytics.allTime[0]?.quantity || 1) * 100}%`}}/></div><b>{item.quantity}</b></div>)}</div></article>
        <article className="insight-card"><div className="card-title"><div><span className="eyebrow">Pickup pattern</span><h3>Best seller by weekday</h3></div></div><div className="weekday-leaders">{analytics.dayLeaders.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.leader?.name || 'No sales'}</strong><b>{item.leader?.quantity || 0}</b></div>)}</div></article>
      </div>
      <article className="insight-card production-plan"><div className="card-title"><div><span className="eyebrow">Planning guide · last 4 weeks</span><h3>Weekly production forecast</h3><p>Recent weekly average + 15% buffer. In-store sales and special orders are not included.</p></div><small>Updated {day.format(analytics.latestDate)}</small></div><div className="forecast-table"><div className="forecast-head"><span>Product</span><span>Avg/week</span><span>Suggested</span></div>{analytics.plan.map(item => <div key={item.name}><strong>{item.name}</strong><span>{item.weeklyAverage.toFixed(1)}</span><b>{item.suggested}</b></div>)}</div></article>
    </div>}
    <div className="orders-list">{view==='orders' && visibleOrders.map(order => <article key={order.orderId}><div className="order-date"><strong>{displayDate(order.pickupDate)}</strong><span>{order.pickupTime || 'Pickup'}</span></div><div className="order-main"><div><span className="eyebrow">#{order.orderId}</span><h3>{order.customerName || 'Web customer'}</h3></div><p>{order.items}</p><div className="contact-line"><span>{order.customerEmail}</span><span>{order.customerPhone}</span>{order.notes && <span>{order.notes}</span>}</div></div><strong className="order-total">{money.format(order.totalUsd)}</strong></article>)}
    {view==='special' && visibleSpecial.map((order,i) => <article key={`${order.receivedAt}-${i}`}><div className="order-date"><strong>{displayDate(order.eventDate, 'TBD')}</strong><span>{order.guests ? `${order.guests} guests` : 'Special'}</span></div><div className="order-main"><div><span className="eyebrow">{order.eventType}</span><h3>{order.name}</h3></div><p>{order.message}</p><div className="contact-line"><span>{order.email}</span><span>{order.phone}</span></div></div></article>)}
    {view==='wholesale' && visibleWholesale.map((order,i) => <article key={`${order.receivedAt}-${i}`}><div className="order-date wholesale"><Building2/><span>{order.businessType}</span></div><div className="order-main"><div><span className="eyebrow">Wholesale inquiry</span><h3>{order.businessName}</h3></div><p>{order.message}</p><div className="contact-line"><span>{order.contactName}</span><span>{order.email || 'Email pending'}</span><span>{order.phone}</span></div>{order.qualityNote && <small className="quality-note">{order.qualityNote}</small>}</div></article>)}
    {((view==='orders'&&!visibleOrders.length)||(view==='special'&&!visibleSpecial.length)||(view==='wholesale'&&!visibleWholesale.length)) && <div className="empty-orders">No results match these filters.</div>}</div>
  </section>;
}
