"use client";

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Target, Eye, DollarSign, MousePointerClick, TrendingUp } from 'lucide-react';
import { MetaAdData } from '@/lib/data';
import { StatCard, cn } from './ui/StatCard';

interface Props {
  data: MetaAdData[];
}

export function MetaAdsDashboard({ data }: Props) {
  // Aggregate totals
  const totalSpend = data.reduce((acc, curr) => acc + curr.spend, 0);
  const totalReach = data.reduce((acc, curr) => acc + curr.reach, 0);
  const totalImpressions = data.reduce((acc, curr) => acc + curr.impressions, 0);
  const totalClicks = data.reduce((acc, curr) => acc + curr.clicksAll, 0);
  
  // Format numbers
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatNumber = (val: number) => new Intl.NumberFormat('en-US').format(val);

  return (
    <div className="space-y-8 animate-in mt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Spend"
          value={formatCurrency(totalSpend)}
          icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
        />
        <StatCard
          title="Total Reach"
          value={formatNumber(totalReach)}
          icon={<Target className="w-6 h-6 text-blue-400" />}
        />
        <StatCard
          title="Total Impressions"
          value={formatNumber(totalImpressions)}
          icon={<Eye className="w-6 h-6 text-purple-400" />}
        />
        <StatCard
          title="Total Clicks"
          value={formatNumber(totalClicks)}
          icon={<MousePointerClick className="w-6 h-6 text-amber-400" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Reach vs Impressions */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-100">Reach vs Impressions</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
                <XAxis 
                  dataKey="campaignName" 
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
                  tickFormatter={(val) => val > 1000 ? `${(val/1000).toFixed(0)}k` : val}
                />
                <Tooltip 
                  cursor={{ fill: '#ffffff0a' }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar name="Reach" dataKey="reach" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar name="Impressions" dataKey="impressions" fill="#a855f7" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Cost Per Result & CPC */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-100">Cost Metrics</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
                <XAxis 
                  dataKey="campaignName" 
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
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip 
                  cursor={{ fill: '#ffffff0a' }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                  formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar name="Cost per Result" dataKey="costPerResult" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar name="CPC" dataKey="cpcAll" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Campaign Details Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-xl font-semibold text-slate-100">Campaign Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="px-6 py-4 font-medium">Campaign Name</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Spend</th>
                <th className="px-6 py-4 font-medium text-right">Results</th>
                <th className="px-6 py-4 font-medium text-right">Cost/Result</th>
                <th className="px-6 py-4 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {data.map((campaign, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{campaign.campaignName || 'Unnamed'}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 text-xs rounded-full font-medium",
                      campaign.status.toLowerCase() === 'active' 
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-slate-500/20 text-slate-400"
                    )}>
                      {campaign.status || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">{formatCurrency(campaign.spend)}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(campaign.results)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(campaign.costPerResult)}</td>
                  <td className="px-6 py-4 text-right">{campaign.ctrAll}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
