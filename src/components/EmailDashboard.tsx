"use client";

import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Mail, Send, MousePointerClick, Users, Percent, Activity } from 'lucide-react';
import { EmailCampaignData, EmailSubscriberData } from '@/lib/data';
import { StatCard } from './ui/StatCard';
import { cn } from './ui/StatCard';
import { Glossary } from './Glossary';

interface Props {
  campaignData: EmailCampaignData[];
  subscriberData: EmailSubscriberData[];
}

export function EmailDashboard({ campaignData, subscriberData }: Props) {
  const [activeView, setActiveView] = useState<'campaigns' | 'subscribers'>('campaigns');

  // Campaigns Aggregates
  const totalSent = campaignData.reduce((acc, curr) => acc + curr.sent, 0);
  const totalOpens = campaignData.reduce((acc, curr) => acc + curr.totalOpens, 0);
  const totalClicks = campaignData.reduce((acc, curr) => acc + curr.clicked, 0);
  const totalUnsubs = campaignData.reduce((acc, curr) => acc + curr.unsubscribed, 0);
  
  const avgOpenRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : "0";
  const avgClickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : "0";
  
  // Subscribers Aggregates (taking the latest snapshot for top-level stats if needed, or an average)
  const latestSnapshot = subscriberData.length > 0 ? subscriberData[subscriberData.length - 1] : null;

  const formatNumber = (val: number) => new Intl.NumberFormat('en-US').format(val);

  return (
    <div className="space-y-6 animate-in mt-6">
      
      {/* View Switcher inside Email Dashboard */}
      <div className="flex border-b border-white/10 mb-6">
        <button
          onClick={() => setActiveView('campaigns')}
          className={cn(
            "px-6 py-3 font-medium text-sm transition-colors border-b-2",
            activeView === 'campaigns' 
              ? "border-purple-400 text-purple-300" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          General Campaigns
        </button>
        <button
          onClick={() => setActiveView('subscribers')}
          className={cn(
            "px-6 py-3 font-medium text-sm transition-colors border-b-2",
            activeView === 'subscribers' 
              ? "border-emerald-400 text-emerald-300" 
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          Welcome Flow (Subscribers)
        </button>
      </div>

      {activeView === 'campaigns' && (
        <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Total Sent" value={formatNumber(totalSent)} icon={<Send className="w-5 h-5 text-blue-400" />} />
            <StatCard title="Total Opens" value={formatNumber(totalOpens)} icon={<Mail className="w-5 h-5 text-emerald-400" />} />
            <StatCard title="Avg Open Rate" value={`${avgOpenRate}%`} icon={<Percent className="w-5 h-5 text-purple-400" />} />
            <StatCard title="Total Clicks" value={formatNumber(totalClicks)} icon={<MousePointerClick className="w-5 h-5 text-amber-400" />} />
            <StatCard title="Avg Click Rate" value={`${avgClickRate}%`} icon={<Percent className="w-5 h-5 text-rose-400" />} />
          </div>

          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <Activity className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-100">Performance Timeline</h3>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={campaignData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    <XAxis dataKey="sendingDate" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
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
                    <th className="px-6 py-4 font-medium text-right">Delivered Rate</th>
                    <th className="px-6 py-4 font-medium text-right">Opens</th>
                    <th className="px-6 py-4 font-medium text-right">Open Rate</th>
                    <th className="px-6 py-4 font-medium text-right">Clicked</th>
                    <th className="px-6 py-4 font-medium text-right">Click Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-slate-300">
                  {campaignData.map((campaign, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-slate-400">{campaign.sendingDate}</td>
                      <td className="px-6 py-4 font-medium text-white">{campaign.campaignName || 'Unnamed'}</td>
                      <td className="px-6 py-4 text-right">{formatNumber(campaign.sent)}</td>
                      <td className="px-6 py-4 text-right text-slate-300">{campaign.deliveredRate}%</td>
                      <td className="px-6 py-4 text-right">{formatNumber(campaign.totalOpens)}</td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-medium">{campaign.openRate}%</td>
                      <td className="px-6 py-4 text-right">{formatNumber(campaign.clicked)}</td>
                      <td className="px-6 py-4 text-right text-blue-400 font-medium">{campaign.clickRate}%</td>
                    </tr>
                  ))}
                  {campaignData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        No campaigns found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeView === 'subscribers' && (
        <div className="space-y-8 animate-in duration-500 fade-in slide-in-from-bottom-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <StatCard 
              title="Recent Welcome Emails Sent" 
              value={latestSnapshot ? formatNumber(latestSnapshot.emailsSent) : "0"} 
              icon={<Users className="w-6 h-6 text-emerald-400" />} 
            />
            <StatCard 
              title="Welcome Open Rate" 
              value={`${latestSnapshot?.trackableOpenersRate || 0}%`} 
              icon={<Mail className="w-6 h-6 text-indigo-400" />} 
            />
             <StatCard 
              title="Welcome Click Rate" 
              value={`${latestSnapshot?.uniqueClickersRate || 0}%`} 
              icon={<MousePointerClick className="w-6 h-6 text-rose-400" />} 
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-xl font-semibold text-slate-100">Welcome Automation Snapshots</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white/5 text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Snapshot Date</th>
                    <th className="px-6 py-4 font-medium text-right">Emails Sent</th>
                    <th className="px-6 py-4 font-medium text-right">Delivered %</th>
                    <th className="px-6 py-4 font-medium text-right">Est. Openers %</th>
                    <th className="px-6 py-4 font-medium text-right">Trackable Openers %</th>
                    <th className="px-6 py-4 font-medium text-right">Unique Clickers %</th>
                    <th className="px-6 py-4 font-medium text-right">Bounced %</th>
                    <th className="px-6 py-4 font-medium text-center">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-slate-300">
                  {subscriberData.map((sub, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-slate-400">{sub.snapshotDate}</td>
                      <td className="px-6 py-4 text-right">{formatNumber(sub.emailsSent)}</td>
                      <td className="px-6 py-4 text-right">{sub.deliveredRate}%</td>
                      <td className="px-6 py-4 text-right text-purple-400">{sub.estimatedOpenersRate}%</td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-medium">{sub.trackableOpenersRate}%</td>
                      <td className="px-6 py-4 text-right text-blue-400 font-medium">{sub.uniqueClickersRate}%</td>
                      <td className="px-6 py-4 text-right text-rose-400">{sub.bouncedRate}%</td>
                      <td className="px-6 py-4 text-center text-slate-400 truncate max-w-[200px]" title={sub.notes}>{sub.notes || '-'}</td>
                    </tr>
                  ))}
                  {subscriberData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        No subscriber snapshots found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Glossary included at the bottom of the Email Dashboard */}
      <Glossary />
    </div>
  );
}
