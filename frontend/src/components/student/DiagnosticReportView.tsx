import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeft,
  Activity,
  Mic,
  AlertTriangle,
  ShieldAlert,
  Ban
} from 'lucide-react';

// ── Pure SVG performance line chart (no external library) ─────────────────────

interface ChartPoint { attempt: number; overallScore: number; date: string; }

function PerformanceChart({ data }: { data: ChartPoint[] }) {
  const W = 480, H = 180;
  const PAD = { top: 24, right: 24, bottom: 44, left: 40 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = data.length;

  const xScale = (i: number) => n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW;
  const yScale = (v: number) => chartH - (v / 100) * chartH;
  const linePath = `M ${data.map((d, i) => `${xScale(i)} ${yScale(d.overallScore)}`).join(' L ')}`;
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg" style={{ minWidth: 260 }}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {yTicks.map(v => (
            <g key={v}>
              <line x1={0} y1={yScale(v)} x2={chartW} y2={yScale(v)} stroke="#f3f4f6" strokeWidth={1} />
              <text x={-6} y={yScale(v) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{v}</text>
            </g>
          ))}
          <path d={linePath} fill="none" stroke="#171717" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={xScale(i)} cy={yScale(d.overallScore)} r={4} fill="#171717" />
              <text x={xScale(i)} y={yScale(d.overallScore) - 9} textAnchor="middle" fontSize={9} fill="#171717" fontWeight="600">
                {d.overallScore}
              </text>
              <text x={xScale(i)} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#6b7280">
                {`Attempt ${d.attempt}`}
              </text>
              {d.date ? (
                <text x={xScale(i)} y={chartH + 26} textAnchor="middle" fontSize={8} fill="#9ca3af">{d.date}</text>
              ) : null}
            </g>
          ))}
          <line x1={0} y1={0} x2={0} y2={chartH} stroke="#e5e7eb" strokeWidth={1} />
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#e5e7eb" strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
}

export const DiagnosticReportView: React.FC = () => {
  const { latestReport, setActiveView } = useApp();
  const [performanceHistory, setPerformanceHistory] = useState<ChartPoint[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token') ?? '';
    fetch('/api/sessions/reports', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.data?.reports)) {
          setPerformanceHistory(data.data.reports);
        }
      })
      .catch(() => {});
  }, []);

  if (!latestReport) return null;

  const isDisqualified = latestReport.isDisqualified || latestReport.tabSwitches >= 4;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8 animate-in fade-in duration-200">
      
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveView('DASHBOARD')}
          className="flex items-center space-x-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Student Dashboard</span>
        </button>

        <span className="px-2.5 py-1 text-xs font-mono font-medium bg-neutral-100 text-neutral-600 rounded-md border border-neutral-200">
          SESSION #{latestReport.id.toUpperCase()}
        </span>
      </div>

      {isDisqualified && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 flex items-start space-x-3.5 text-rose-950 shadow-xs animate-in slide-in-from-top duration-200">
          <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-900">
              Session Terminated &amp; Candidate Disqualified
            </h3>
            <p className="text-xs text-rose-800 leading-relaxed">
              This interview session was terminated because <strong>4 tab switches were detected</strong>. In accordance with college placement proctoring rules, an overall readiness score of <strong>0 / 100</strong> was recorded and you are permanently disqualified from re-attending this interview.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                isDisqualified ? 'bg-rose-600 text-white' : 'bg-neutral-900 text-white'
              }`}>
                {isDisqualified ? 'DISQUALIFIED' : 'EVALUATION COMPLETE'}
              </span>
              <span className="text-xs text-neutral-500 font-mono">{latestReport.date}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              Placement Communication Scorecard
            </h1>
          </div>

          <div className="flex flex-col items-center justify-center p-6 bg-neutral-50 border border-neutral-200/80 rounded-2xl text-center">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider font-mono">Overall Readiness</p>
            <div className="flex items-baseline space-x-1 my-1">
              <span className={`text-5xl font-black tracking-tight ${isDisqualified ? 'text-rose-600' : 'text-neutral-900'}`}>
                {latestReport.overallScore}
              </span>
              <span className="text-base text-neutral-400 font-medium">/100</span>
            </div>
            {isDisqualified ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300 mt-1">
                Disqualified
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 mt-1">
                Placement Ready
              </span>
            )}
          </div>

        </div>

        <div className="grid grid-cols-3 gap-4 pt-6 mt-6 border-t border-neutral-100 text-center">
          <div className="p-3">
            <p className="text-[11px] text-neutral-400 font-mono uppercase">Technical Depth</p>
            <p className="text-xl font-bold text-neutral-900 mt-0.5">{latestReport.technicalScore}%</p>
          </div>
          <div className="p-3 border-x border-neutral-100">
            <p className="text-[11px] text-neutral-400 font-mono uppercase">Clarity & Delivery</p>
            <p className="text-xl font-bold text-neutral-900 mt-0.5">{latestReport.communicationScore}%</p>
          </div>
          <div className="p-3">
            <p className="text-[11px] text-neutral-400 font-mono uppercase">Proctoring Status</p>
            <p className={`text-xl font-bold mt-0.5 font-mono ${isDisqualified ? 'text-rose-600' : 'text-emerald-600'}`}>
              {latestReport.tabSwitches} Switches {isDisqualified ? '(DISQUALIFIED)' : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-neutral-700" />
              <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Speaking Pace Meter</h3>
            </div>
            <span className="text-xs font-mono font-medium text-neutral-500">Target: 120-150 WPM</span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-black text-neutral-900">{latestReport.averageWpm}</span>
            <span className="text-xs text-neutral-500 font-medium">Words Per Minute</span>
          </div>

          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-neutral-900 h-full rounded-full" 
              style={{ width: `${Math.min(100, (latestReport.averageWpm / 160) * 100)}%` }} 
            />
          </div>
        </div>

        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Mic className="w-4 h-4 text-neutral-700" />
              <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Filler Word Density</h3>
            </div>
            <span className="text-xs font-mono font-medium text-neutral-500">Total: {latestReport.totalFillerWords} detected</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(latestReport.fillerWordBreakdown).map(([word, count]) => (
              <div key={word} className="flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs">
                <span className="font-medium text-neutral-800">"{word}"</span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-mono text-[10px]">x{Number(count)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-semibold tracking-tight text-neutral-900">
          Technical Skill Competency Analysis
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {latestReport.skillBreakdown.map((item, idx: number) => (
            <div key={idx} className="p-3.5 bg-neutral-50 border border-neutral-200/70 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900">{item.skill}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                  item.status === 'STRONG' ? 'bg-emerald-100 text-emerald-800' :
                  item.status === 'MODERATE' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {item.score}% · {item.status}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed">{item.recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {performanceHistory.length > 0 && (
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-neutral-900">Interview Performance History</h3>
            <span className="text-xs font-mono text-neutral-400">{performanceHistory.length} attempt{performanceHistory.length !== 1 ? 's' : ''}</span>
          </div>
          <PerformanceChart data={performanceHistory} />
        </div>
      )}

    </div>
  );
};
