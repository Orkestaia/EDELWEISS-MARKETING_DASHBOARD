"use client";

import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from './ui/StatCard';

interface GlossaryItem {
  term: string;
  definition: string;
}

const META_GLOSSARY: GlossaryItem[] = [
  { term: "Spend ($)", definition: "Total amount spent on the campaign." },
  { term: "Reach", definition: "Number of unique people who saw the ads at least once." },
  { term: "Impressions", definition: "Total number of times the ads appeared on screen." },
  { term: "Frequency", definition: "Average number of times each reached person saw the ad." },
  { term: "Results", definition: "Number of times the ad achieved its primary objective." },
  { term: "Cost per Result ($)", definition: "Average spend attributed to each campaign result." },
  { term: "CPM ($)", definition: "Cost per 1,000 ad impressions." },
  { term: "Link Clicks", definition: "Clicks on links that lead to the website." },
  { term: "CPC Link ($)", definition: "Average cost for each link click." },
  { term: "CTR Link (%)", definition: "Percentage of impressions that produced a link click." },
  { term: "Clicks (All)", definition: "All interactions counted as clicks, including links, images and social actions." },
  { term: "CTR (All) (%)", definition: "Percentage of impressions that produced any type of click." },
  { term: "CPC (All) ($)", definition: "Average cost for any type of ad click." },
  { term: "Landing Page Views", definition: "Visits where the website successfully loaded after an ad click." },
  { term: "Cost per LPV ($)", definition: "Average cost per confirmed landing-page view." },
];

const EMAIL_GLOSSARY: GlossaryItem[] = [
  { term: "Sent", definition: "Total emails sent to contacts." },
  { term: "Delivered", definition: "Emails successfully accepted by recipients' mail servers." },
  { term: "Total Opens", definition: "Total recorded opens, including repeat opens by the same person." },
  { term: "Trackable Open Rate (%)", definition: "Trackable unique opens as a percentage of delivered emails." },
  { term: "Clicked", definition: "Total recorded clicks on links in the email." },
  { term: "Click Rate (%)", definition: "Clicks as a percentage of delivered emails." },
  { term: "Apple MPP Opens", definition: "Opens generated through Apple Mail Privacy Protection and not necessarily human opens." },
  { term: "Click-to-Open Rate", definition: "Share of openers who also clicked." },
  { term: "Bounced / Hard Bounces", definition: "Permanent delivery failures, often caused by invalid addresses." },
  { term: "Soft Bounces", definition: "Temporary delivery failures such as a full inbox or server issue." },
  { term: "Complaint Rate", definition: "Percentage of recipients who marked the email as spam." },
];

export function Glossary() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full mt-10 mb-6 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-white/5 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Info className="w-5 h-5 text-indigo-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-100">Metrics glossary</h3>
        </div>
        <ChevronDown className={cn("w-6 h-6 text-slate-400 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      <div 
        className={cn(
          "transition-all duration-500 ease-in-out px-6 overflow-hidden",
          isOpen ? "max-h-[2000px] opacity-100 pb-6" : "max-h-0 opacity-0"
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mt-2 border-t border-white/10 pt-6">
          {/* Meta Ads Area */}
          <div>
            <h4 className="text-lg font-medium text-indigo-300 mb-4 pb-2 border-b border-white/10">Meta Ads</h4>
            <dl className="space-y-4">
              {META_GLOSSARY.map((item, idx) => (
                <div key={idx}>
                  <dt className="font-semibold text-slate-200">{item.term}</dt>
                  <dd className="text-sm text-slate-400 mt-1">{item.definition}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Email Marketing Area */}
          <div>
            <h4 className="text-lg font-medium text-purple-300 mb-4 pb-2 border-b border-white/10">Email Marketing</h4>
            <dl className="space-y-4">
              {EMAIL_GLOSSARY.map((item, idx) => (
                <div key={idx}>
                  <dt className="font-semibold text-slate-200">{item.term}</dt>
                  <dd className="text-sm text-slate-400 mt-1">{item.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
