import React, { ReactNode } from 'react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility to merge tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-white/5 p-6 backdrop-blur-xl border border-white/10",
      "transition-all duration-300 hover:bg-white/10 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/20",
      "group",
      className
    )}>
      {/* Subtle animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
          <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
            {value}
          </h3>
          
          {trend && (
            <div className="mt-2 flex items-center text-sm">
              <span className={cn(
                "font-semibold flex items-center",
                trend.isPositive ? "text-emerald-400" : "text-rose-400"
              )}>
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className="text-slate-500 ml-2">vs last month</span>
            </div>
          )}
          {subtitle && !trend && (
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
        
        {icon && (
          <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/5 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
