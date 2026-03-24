"use client";

import React, { useState } from 'react';
import { MetaAdsDashboard } from './MetaAdsDashboard';
import { EmailDashboard } from './EmailDashboard';
import { MetaAdData, EmailCampaignData } from '@/lib/data';
import { BarChart3, Mail } from 'lucide-react';
import { cn } from './ui/StatCard';

interface Props {
  metaData: MetaAdData[];
  emailData: EmailCampaignData[];
}

export function DashboardTabs({ metaData, emailData }: Props) {
  const [activeTab, setActiveTab] = useState<'meta' | 'email'>('meta');

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header and Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-6 border-b border-white/10 gap-6">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-purple-300">
            Edelweiss Marketing
          </h1>
          <p className="text-slate-400 mt-2">Interactive Performance Dashboard</p>
        </div>
        
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setActiveTab('meta')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
              activeTab === 'meta' 
                ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Meta Ads
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
              activeTab === 'email' 
                ? "bg-purple-500/20 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]" 
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            )}
          >
            <Mail className="w-4 h-4" />
            Email Marketing
          </button>
        </div>
      </div>

      {/* Dynamic Content */}
      <div className="min-h-[600px]">
        {activeTab === 'meta' ? (
          <MetaAdsDashboard data={metaData} />
        ) : (
          <EmailDashboard data={emailData} />
        )}
      </div>
    </div>
  );
}
