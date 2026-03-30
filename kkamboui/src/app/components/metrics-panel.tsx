import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/* ─── Animated Counter ─── */
function AnimatedNumber({ target, duration = 1600, suffix = '', delay = 0 }: { target: number; duration?: number; suffix?: string; delay?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
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
  label: string; value: number; suffix?: string; note: string; color: string; delay: number; tag?: string;
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

/* ─── Main Panel ─── */
export function MetricsPanel({ visible }: { visible: boolean }) {
  if (!visible) return null;

  const overall = Math.round(72 * 0.25 + 58 * 0.15 + 81 * 0.2 + 67 * 0.1 + 75 * 0.2 + 64 * 0.1);

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
            <span className="text-[48px] text-black/90 tracking-tighter" style={{ lineHeight: 1 }}>
              <AnimatedNumber target={overall} delay={400} />
            </span>
            <div className="pb-2 flex items-center gap-1.5">
              <span className="text-[12px] text-emerald-600">+12</span>
              <span className="text-[11px] text-black/35">vs 지난 세션</span>
            </div>
          </div>
          <div className="flex gap-4 mt-3">
            {[
              { label: '지식', value: 72, color: 'bg-blue-400/70' },
              { label: '메타인지', value: 81, color: 'bg-emerald-400/70' },
              { label: '상호작용', value: 75, color: 'bg-rose-400/70' },
            ].map((d) => (
              <div key={d.label} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${d.color}`} />
                <span className="text-[11px] text-black/45">{d.label} {d.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="h-px bg-black/[0.06] mb-1" />

        {/* ── Metrics ── */}
        <MetricRow
          label="핵심 키워드 도달률"
          value={72}
          note="주요 키워드 18개 중 13개 언급"
          color="rgba(96,165,250,0.6)"
          delay={0.55}
        />
        <MetricRow
          label="개념 연결성 지수"
          value={58}
          note="상위 개념 간 연결 4건 중 2건 성립"
          color="rgba(167,139,250,0.6)"
          delay={0.65}
        />

        {/* Alert - minimal */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.72 }}
          className="flex items-center gap-2.5 py-3"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600/70 flex-shrink-0" />
          <span className="text-[12px] text-amber-700/70">전제조건 1건 누락 · 사실 오류 1건</span>
        </motion.div>

        <div className="h-px bg-black/[0.06] mb-1" />

        <MetricRow
          label="파인만 지수"
          value={81}
          note="비유 3회 · 전공 용어 직접 인용 2회"
          color="rgba(52,211,153,0.6)"
          delay={0.82}
          tag="우수"
        />
        <MetricRow
          label="설명 유창성"
          value={67}
          note="수정 빈도 낮음 · 평균 입력 지연 1.2s"
          color="rgba(34,211,238,0.5)"
          delay={0.92}
        />

        <div className="h-px bg-black/[0.06] mb-1" />

        <MetricRow
          label="돌발 질문 방어율"
          value={75}
          note="돌발 질문 4건 중 3건 방어"
          color="rgba(251,113,133,0.6)"
          delay={1.02}
          tag="3/4"
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
              <AnimatedNumber target={64} suffix="%" delay={1300} />
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0.1 }}
                animate={{ opacity: i < 6 ? 0.8 : 0.1 }}
                transition={{ duration: 0.3, delay: 1.15 + i * 0.04 }}
                className="flex-1 h-1.5 rounded-full"
                style={{ background: i < 6 ? 'rgba(251,191,36,0.55)' : 'rgba(0,0,0,0.06)' }}
              />
            ))}
          </div>
          <p className="text-[11px] text-black/35 mt-1.5">깜보가 점점 이해하고 있어요</p>
        </motion.div>
      </div>
    </motion.div>
  );
}