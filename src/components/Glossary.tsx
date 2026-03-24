"use client";

import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from './ui/StatCard';

interface GlossaryItem {
  term: string;
  definition: string;
}

const META_GLOSSARY: GlossaryItem[] = [
  { term: "Spend ($)", definition: "La cantidad total de dinero invertido en esta campaña." },
  { term: "Reach (Alcance)", definition: "Número de personas únicas que han visto tus anuncios al menos una vez." },
  { term: "Impressions", definition: "Número total de veces que tus anuncios fueron mostrados en la pantalla." },
  { term: "Frequency", definition: "El número promedio de veces que cada persona (alcance) vio el anuncio (Impresiones / Alcance)." },
  { term: "Results", definition: "Número de veces que el anuncio logró su objetivo principal (clics, reproducciones, etc.)." },
  { term: "Cost per Result ($)", definition: "El costo promedio atribuido a cada resultado directo del nivel de campaña." },
  { term: "CPM ($)", definition: "Costo por cada 1,000 impresiones del anuncio (Cost per Mille)." },
  { term: "Link Clicks", definition: "Número de clics en los enlaces incrustados dentro del anuncio que dirigen a tu sitio web." },
  { term: "CPC Link ($)", definition: "El costo promedio por cada clic en el enlace (Costo / Clics en el enlace)." },
  { term: "CTR Link (%)", definition: "Click-Through Rate del enlace. El porcentaje de impresiones que resultaron en un clic de enlace." },
  { term: "Clicks (All)", definition: "Cualquier clic en tu anuncio, incluyendo clics en enlaces, clics en la imagen, interacciones sociales, etc." },
  { term: "CTR (All) (%)", definition: "Click-Through Rate total para cualquier tipo de interacción sobre impresiones totales." },
  { term: "CPC (All) ($)", definition: "Costo promedio por cualquier tipo de clic en el anuncio." },
  { term: "Landing Page Views", definition: "El número de veces que un usuario hizo clic en el enlace y cargó exitosamente tu sitio web." },
  { term: "Cost per LPV ($)", definition: "Costo promedio por cada visualización confirmada en tu sitio web." },
];

const EMAIL_GLOSSARY: GlossaryItem[] = [
  { term: "Sent", definition: "Total de correos enviados a clientes de la base de datos." },
  { term: "Delivered", definition: "Correos que llegaron exitosamente a la bandeja de entrada del usuario de todo el volumen enviado." },
  { term: "Total Opens", definition: "Suma de todas las aperturas registradas (un usuario que abre 5 veces se registra 5 veces)." },
  { term: "Trackable Open Rate (%)", definition: "El porcentaje de aperturas únicas registrables en relación a los correos entregados." },
  { term: "Clicked", definition: "Número total de clics a enlaces dentro del correo electrónico." },
  { term: "Click Rate (%)", definition: "El porcentaje de clics sobre el total de correos entregados." },
  { term: "Apple MPP Opens", definition: "Aperturas procesadas por la privacidad de correo de Apple y no representan aperturas reales." },
  { term: "Click-to-Open Rate", definition: "El porcentaje de personas que hicieron clic respecto al porcentaje de personas que abrieron el correo." },
  { term: "Bounced / Hard Bounces", definition: "Correos que fueron rebotados permanentemente porque las direcciones de email no existen." },
  { term: "Soft Bounces", definition: "Correos temporalmente rebotados por problemas como bandeja llena o problemas de servidor." },
  { term: "Complaint Rate", definition: "Porcentaje de personas que marcaron tu correo como Spam o Correo no deseado." },
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
          <h3 className="text-xl font-semibold text-slate-100">Glosario de Métricas</h3>
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
