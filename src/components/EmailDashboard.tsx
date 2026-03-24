"use client";

import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Mail, Send, MousePointerClick, UserMinus, Percent } from 'lucide-react';
import { EmailCampaignData } from '@/lib/data';
import { StatCard } from './ui/StatCard';
import { cn } from './ui/StatCard';

interface Props {
  data: EmailCampaignData[];
}

export function EmailDashboard({ data }: Props) {
  // Aggregate totals
  const totalSent = data.reduce((acc, curr) => acc + curr.sent, 0);
  const totalOpens = data.reduce((acc, curr) => acc + curr.totalOpens, 0);
  const totalClicks = data.reduce((acc, curr) => acc + curr.clicked, 0);
  const totalUnsubs = data.reduce((acc, curr) => acc + curr.unsubscribed, 0);
  
  const avgOpenRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : "0";
  const avgClickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : "0";
  
  // Format numbers
  const formatNumber = (val: number) => new Intl.NumberFormat('en-US').format(val);

  return (
    <div className="space-y-8 animate-in mt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Sent"
          value={formatNumber(totalSent)}
          icon={<Send className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          title="Total Opens"
          value={formatNumber(totalOpens)}
          icon={<Mail className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Avg Open Rate"
          value={`${avgOpenRate}%`}
          icon={<Percent className="w-5 h-5 text-purple-400" />}
        />
        <StatCard
          title="Total Clicks"
          value={formatNumber(totalClicks)}
          icon={<MousePointerClick className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          title="Avg Click Rate"
          value={`${avgClickRate}%`}
          icon={<Percent className="w-5 h-5 text-rose-400" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        {/* Chart 1: Open & Click Rates over time/campaigns */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Mail className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-100">Performance Timeline</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
                <XAxis 
                  dataKey="sendingDate" 
                  stroke="#94a3b8" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#94a3b8" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  cursor={{ stroke: '#ffffff2a', strokeWidth: 1 }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '8px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Area type="monotone" name="Opens" dataKey="totalOpens" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorOpens)" />
                <Area type="monotone" name="Clicks" dataKey="clicked" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorClicks)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Campaign Details Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-slate-100">Campaign Details</h3>
          <span className="text-sm text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
            Total Unsubs: <span className="text-rose-400 font-semibold">{totalUnsubs}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Campaign Name</th>
                <th className="px-6 py-4 font-medium text-right">Sent</th>
                <th className="px-6 py-4 font-medium text-right">Opens</th>
                <th className="px-6 py-4 font-medium text-right">Open Rate</th>
                <th className="px-6 py-4 font-medium text-right">Clicked</th>
                <th className="px-6 py-4 font-medium text-right">Click Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {data.map((campaign, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-slate-400">{campaign.sendingDate}</td>
                  <td className="px-6 py-4 font-medium text-white">{campaign.campaignName || 'Unnamed'}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(campaign.sent)}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(campaign.totalOpens)}</td>
                  <td className="px-6 py-4 text-right text-emerald-400 font-medium">{campaign.openRate}%</td>
                  <td className="px-6 py-4 text-right">{formatNumber(campaign.clicked)}</td>
                  <td className="px-6 py-4 text-right text-blue-400 font-medium">{campaign.clickRate}%</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No campaigns found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
