import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MetricsData } from '../App';

/* ─── Animated Counter ─── */
function AnimatedNumber({ target, duration = 1600, suffix = '', delay = 0 }: { target: number; duration?: number; suffix?: string; delay?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    const t = setTimeout(() => {
      let start = 0;
      const step = target / (duration / 16);
      const iv = setInterval(() => {
        start += step;
        if (start >= target) { setValue(target); clearInterval(iv); }
        else setValue(Math.round(start));
      }, 16);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return <>{value}{suffix}</>;
}

/* ─── Thin progress bar ─── */
function Bar({ value, delay, color }: { value: number; delay: number; color: string }) {
  return (
    <div className="h-[3px] rounded-full bg-black/[0.08] overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

/* ─── Single metric row ─── */
function MetricRow({ label, value, suffix = '%', note, color, delay, tag }: {
  label: string; value: number; suffix?: string; note: string; color: string; delay: number; tag?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="py-3"
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-black/70">{label}</span>
          {tag && (
            <span className="text-[10px] px-1.5 py-px rounded text-black/40 bg-black/[0.06]">{tag}</span>
          )}
        </div>
        <span className="text-[13px] text-black/80 tabular-nums tracking-tight">
          <AnimatedNumber target={value} suffix={suffix} delay={delay * 1000 + 200} />
        </span>
      </div>
      <Bar value={Math.min(value, 100)} delay={delay + 0.15} color={color} />
      <p className="text-[11px] text-black/35 mt-1.5">{note}</p>
    </motion.div>
  );
}

/* ─── Skeleton row (분석 전) ─── */
function SkeletonRow({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="py-3"
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="h-3 w-28 bg-black/[0.07] rounded-full animate-pulse" />
        <div className="h-3 w-8 bg-black/[0.07] rounded-full animate-pulse" />
      </div>
      <div className="h-[3px] rounded-full bg-black/[0.06] animate-pulse" />
      <div className="h-2.5 w-40 bg-black/[0.05] rounded-full mt-1.5 animate-pulse" />
    </motion.div>
  );
}

/* ─── Main Panel ─── */
export function MetricsPanel({ visible, metrics }: { visible: boolean; metrics: MetricsData | null }) {
  if (!visible) return null;

  const isLoaded = metrics !== null;
  const overall = isLoaded
    ? Math.round(
        metrics.keywordCoverage * 0.25 +
        metrics.conceptConnectivity * 0.15 +
        metrics.feynmanIndex * 0.20 +
        metrics.explanationFluency * 0.10 +
        metrics.questionDefenseRate * 0.20 +
        metrics.kkamboUnderstanding * 0.10
      )
    : 0;

  const kkamboBlocks = isLoaded ? Math.round(metrics.kkamboUnderstanding / 10) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="absolute right-6 top-48 bottom-6 w-[440px] z-20 pointer-events-auto overflow-y-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="bg-white/[0.8] backdrop-blur-2xl border border-black/[0.06] rounded-2xl px-6 py-5">
        {/* ── Overall Score ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-5"
        >
          <p className="text-[11px] text-black/40 mb-1">종합 스코어</p>
          <div className="flex items-end gap-3">
            {isLoaded ? (
              <span className="text-[48px] text-black/90 tracking-tighter" style={{ lineHeight: 1 }}>
                <AnimatedNumber target={overall} delay={400} />
              </span>
            ) : (
              <div className="h-12 w-16 bg-black/[0.07] rounded-xl animate-pulse" />
            )}
            {!isLoaded && (
              <span className="pb-2 text-[12px] text-black/35 animate-pulse">분석 중...</span>
            )}
          </div>
          <div className="flex gap-4 mt-3">
            {[
              { label: '지식', value: isLoaded ? metrics.keywordCoverage : null, color: 'bg-blue-400/70' },
              { label: '메타인지', value: isLoaded ? metrics.feynmanIndex : null, color: 'bg-emerald-400/70' },
              { label: '상호작용', value: isLoaded ? metrics.questionDefenseRate : null, color: 'bg-rose-400/70' },
            ].map((d) => (
              <div key={d.label} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${d.color}`} />
                <span className="text-[11px] text-black/45">
                  {d.label}{d.value !== null ? ` ${d.value}` : ''}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="h-px bg-black/[0.06] mb-1" />

        {/* ── Metrics ── */}
        {isLoaded ? (
          <>
            <MetricRow
              label="핵심 키워드 도달률"
              value={metrics.keywordCoverage}
              note={metrics.keywordCoverageNote}
              color="rgba(96,165,250,0.6)"
              delay={0.55}
            />
            <MetricRow
              label="개념 연결성 지수"
              value={metrics.conceptConnectivity}
              note={metrics.conceptConnectivityNote}
              color="rgba(167,139,250,0.6)"
              delay={0.65}
            />

            {metrics.alertMessage && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.72 }}
                className="flex items-center gap-2.5 py-3"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600/70 flex-shrink-0" />
                <span className="text-[12px] text-amber-700/70">{metrics.alertMessage}</span>
              </motion.div>
            )}

            <div className="h-px bg-black/[0.06] mb-1" />

            <MetricRow
              label="파인만 지수"
              value={metrics.feynmanIndex}
              note={metrics.feynmanIndexNote}
              color="rgba(52,211,153,0.6)"
              delay={0.82}
              tag={metrics.feynmanIndexTag}
            />
            <MetricRow
              label="설명 유창성"
              value={metrics.explanationFluency}
              note={metrics.explanationFluencyNote}
              color="rgba(34,211,238,0.5)"
              delay={0.92}
            />

            <div className="h-px bg-black/[0.06] mb-1" />

            <MetricRow
              label="돌발 질문 방어율"
              value={metrics.questionDefenseRate}
              note={metrics.questionDefenseRateNote}
              color="rgba(251,113,133,0.6)"
              delay={1.02}
              tag={metrics.questionDefenseRateTag}
            />

            {/* ── Kkambo Understanding ── */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.12 }}
              className="py-3"
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[13px] text-black/70">깜보 이해도</span>
                <span className="text-[13px] text-black/80 tabular-nums">
                  <AnimatedNumber target={metrics.kkamboUnderstanding} suffix="%" delay={1300} />
                </span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0.1 }}
                    animate={{ opacity: i < kkamboBlocks ? 0.8 : 0.1 }}
                    transition={{ duration: 0.3, delay: 1.15 + i * 0.04 }}
                    className="flex-1 h-1.5 rounded-full"
                    style={{ background: i < kkamboBlocks ? 'rgba(251,191,36,0.55)' : 'rgba(0,0,0,0.06)' }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-black/35 mt-1.5">{metrics.kkamboUnderstandingNote}</p>
            </motion.div>
          </>
        ) : (
          <>
            <SkeletonRow delay={0.55} />
            <SkeletonRow delay={0.65} />
            <div className="h-px bg-black/[0.06] mb-1" />
            <SkeletonRow delay={0.75} />
            <SkeletonRow delay={0.85} />
            <div className="h-px bg-black/[0.06] mb-1" />
            <SkeletonRow delay={0.95} />
            <SkeletonRow delay={1.05} />
          </>
        )}
      </div>
    </motion.div>
  );
}
