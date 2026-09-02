"use client";

import { useMemo, useState } from 'react';
import { Building2, CalendarClock, ChevronRight, PackageCheck, Search, ShoppingBag } from 'lucide-react';
import type { OrdersAndRequestsData } from '@/lib/data';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

export function OrdersDashboard({ data }: { data: OrdersAndRequestsData }) {
  const [view, setView] = useState<'orders' | 'special' | 'wholesale'>('orders'); const [query, setQuery] = useState('');
  const orders = useMemo(() => data.orders.filter(order => !order.isTest), [data.orders]);
  const revenue = orders.reduce((sum, order) => sum + order.totalUsd, 0); const average = orders.length ? revenue / orders.length : 0;
  const matches = (values: string[]) => !query || values.join(' ').toLowerCase().includes(query.toLowerCase());
  const visibleOrders = [...orders].reverse().filter(order => matches([order.orderId, order.customerName, order.items, order.pickupDate]));
  const visibleSpecial = [...data.specialOrders].sort((a,b) => b.receivedAt.localeCompare(a.receivedAt)).filter(order => matches([order.name, order.eventType, order.message, order.eventDate]));
  const visibleWholesale = data.wholesale.filter(order => matches([order.businessName, order.contactName, order.businessType, order.message]));
  return <section className="orders-dashboard">
    <div className="section-heading"><div><span className="eyebrow">Operaciones web · en tiempo real vía n8n</span><h2>Orders &amp; requests</h2><p>Pedidos desde el lanzamiento, encargos especiales y oportunidades wholesale en una sola vista.</p></div><a className="sheet-link" href="https://docs.google.com/spreadsheets/d/1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I/edit" target="_blank" rel="noreferrer">Abrir Sheet <ChevronRight size={15}/></a></div>
    <div className="order-stats"><article><ShoppingBag/><span>Pedidos reales</span><strong>{orders.length}</strong><small>{data.orders.length - orders.length} tests excluidos</small></article><article><PackageCheck/><span>Ingresos web</span><strong>{money.format(revenue)}</strong><small>ticket medio {money.format(average)}</small></article><article><CalendarClock/><span>Encargos especiales</span><strong>{data.specialOrders.length}</strong><small>solicitudes recibidas</small></article><article><Building2/><span>Wholesale leads</span><strong>{data.wholesale.length}</strong><small>oportunidades abiertas</small></article></div>
    <div className="orders-controls"><div className="segmented"><button className={view==='orders'?'active':''} onClick={()=>setView('orders')}>Orders <span>{orders.length}</span></button><button className={view==='special'?'active':''} onClick={()=>setView('special')}>Special Orders <span>{data.specialOrders.length}</span></button><button className={view==='wholesale'?'active':''} onClick={()=>setView('wholesale')}>Wholesale <span>{data.wholesale.length}</span></button></div><label className="order-search"><Search size={16}/><input aria-label="Buscar pedidos y solicitudes" placeholder="Buscar por nombre, fecha o producto…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="orders-list">{view==='orders' && visibleOrders.map(order => <article key={order.orderId}><div className="order-date"><strong>{order.pickupDate ? day.format(new Date(`${order.pickupDate}T12:00:00-04:00`)) : '—'}</strong><span>{order.pickupTime || 'Pickup'}</span></div><div className="order-main"><div><span className="eyebrow">#{order.orderId}</span><h3>{order.customerName || 'Cliente web'}</h3></div><p>{order.items}</p><div className="contact-line"><span>{order.customerEmail}</span><span>{order.customerPhone}</span>{order.notes && <span>{order.notes}</span>}</div></div><strong className="order-total">{money.format(order.totalUsd)}</strong></article>)}
    {view==='special' && visibleSpecial.map((order,i) => <article key={`${order.receivedAt}-${i}`}><div className="order-date"><strong>{order.eventDate ? day.format(new Date(`${order.eventDate}T12:00:00-04:00`)) : 'TBD'}</strong><span>{order.guests ? `${order.guests} guests` : 'Special'}</span></div><div className="order-main"><div><span className="eyebrow">{order.eventType}</span><h3>{order.name}</h3></div><p>{order.message}</p><div className="contact-line"><span>{order.email}</span><span>{order.phone}</span></div></div></article>)}
    {view==='wholesale' && visibleWholesale.map((order,i) => <article key={`${order.receivedAt}-${i}`}><div className="order-date wholesale"><Building2/><span>{order.businessType}</span></div><div className="order-main"><div><span className="eyebrow">Wholesale inquiry</span><h3>{order.businessName}</h3></div><p>{order.message}</p><div className="contact-line"><span>{order.contactName}</span><span>{order.email || 'Email pendiente'}</span><span>{order.phone}</span></div>{order.qualityNote && <small className="quality-note">{order.qualityNote}</small>}</div></article>)}
    {((view==='orders'&&!visibleOrders.length)||(view==='special'&&!visibleSpecial.length)||(view==='wholesale'&&!visibleWholesale.length)) && <div className="empty-orders">No hay resultados para esta búsqueda.</div>}</div>
  </section>;
}
