import { motion } from 'motion/react';
import { Sparkles, Bot, Send, Upload } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { MetricsPanel } from './components/metrics-panel';

export default function App() {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bubbleText = '안녕 나는 깜보야! 나를 학습시켜줘~';
  const [displayedText, setDisplayedText] = useState('');
  const [bubbleVisible, setBubbleVisible] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    const startTyping = () => {
      let i = 0;
      setDisplayedText('');
      setBubbleVisible(true);
      interval = setInterval(() => {
        i++;
        setDisplayedText(bubbleText.slice(0, i));
        if (i >= bubbleText.length) {
          clearInterval(interval);
          // 완성 후 3초 뒤 사라짐
          timeout = setTimeout(() => {
            setBubbleVisible(false);
            // 사라진 후 5초 뒤 다시 시작
            timeout = setTimeout(startTyping, 5000);
          }, 3000);
        }
      }, 80);
    };

    timeout = setTimeout(startTyping, 1700);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleTeach = () => {
    if (fileName.trim()) {
      setIsListening(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-white overflow-hidden font-sans">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 pointer-events-auto overflow-hidden">
        <motion.div
          animate={
            isListening
              ? { x: -350, y: [200, 188, 200], scale: 1.45, rotateX: [0, 8, 0] }
              : { x: [0, 80, 80, -80, -80, 0] }
          }
          transition={
            isListening
              ? {
                  x: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                  scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                  y: { duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.3 },
                  rotateX: { duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.3 },
                }
              : { x: { duration: 10, repeat: Infinity, ease: "easeInOut" } }
          }
          style={{ perspective: 800, transformOrigin: "center 40%" }}
          className="absolute -inset-[100px]"
        >
          <iframe 
            src='https://my.spline.design/genkubgreetingrobot-Ucp7PWPw2Qa19dJxWCY6sMTW/' 
            frameBorder='0' 
            width='100%' 
            height='100%'
            className="w-full h-full"
            title="3D Robot Background"
          ></iframe>
          {/* Speech Bubble - inside robot container for perfect sync */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={
              isListening
                ? { opacity: 1, scale: 1 }
                : { opacity: bubbleVisible ? 1 : 0, scale: bubbleVisible ? 1 : 0.8 }
            }
            transition={{ duration: 0.4 }}
            className="absolute top-[20%] left-[58%] z-10 pointer-events-none"
          >
            <div className="relative bg-white text-black px-7 py-4 rounded-2xl shadow-lg text-[21px] font-medium whitespace-nowrap">
              {isListening ? '음.. 음.. 열심히 듣고 있어! 🤔' : displayedText}
              {!isListening && <span className="inline-block w-[2px] h-[1em] bg-black/70 align-middle ml-[1px] animate-pulse" />}
              <div className="absolute -bottom-2 left-6 w-4 h-4 bg-white rotate-45 rounded-sm"></div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Gradient Overlays */}
      <motion.div
        animate={{ opacity: isListening ? 0.15 : 0.8 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505] z-0 pointer-events-none"
      />
      <motion.div
        animate={{ opacity: isListening ? 0.15 : 0.6 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050505_100%)] z-0 pointer-events-none"
      />

      {/* Navbar */}
      <nav className="absolute top-0 w-full px-6 py-5 z-20 pointer-events-auto flex justify-between items-center">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tighter">
          <Bot className="w-6 h-6 text-blue-500" />
          <span>Kkambo</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-full transition-all flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Premium
          </button>
          <button className="px-5 py-2.5 text-sm font-medium bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-full transition-colors">
            로그인
          </button>
        </div>
      </nav>

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pointer-events-none">
        <MetricsPanel visible={isListening} />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mx-auto flex flex-col items-center w-full"
        >
          {/* Main Headline */}
          <motion.h1
            animate={{ opacity: isListening ? 0 : 1, y: isListening ? -30 : 0 }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-5xl lg:text-[3.5rem] font-black tracking-tight mb-5 leading-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.9)]"
          >
            가르치면서 배우는<br />
            가장 똑똑한 학습법
          </motion.h1>
          
          {/* Sub Headline */}
          <motion.p
            animate={{ opacity: isListening ? 0 : 1, y: isListening ? -20 : 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-sm md:text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]"
          >
            눈으로만 읽는 공부는 끝.<br className="md:hidden" />{' '}
            나만의 AI 제자 깜보에게 설명하며 완벽하게 이해하세요.
          </motion.p>
          
          {/* Search Input Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isListening ? 0 : 1, y: isListening ? 30 : 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="w-full max-w-2xl pointer-events-auto"
            style={{ pointerEvents: isListening ? 'none' : 'auto' }}
          >
            <div className="relative flex items-center bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-2xl p-2 transition-all focus-within:border-blue-500/50 focus-within:bg-white/[0.12] focus-within:shadow-[0_0_40px_rgba(59,130,246,0.15)]">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.hwp,.md"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center gap-3 px-4 py-3 text-left"
              >
                <Upload className="w-5 h-5 text-white/40 flex-shrink-0" />
                <span className={fileName ? 'text-white text-sm md:text-base' : 'text-white/60 text-sm md:text-base'}>
                  {fileName || '오늘 가르칠 파일을 업로드하세요'}
                </span>
              </button>
              <button
                onClick={handleTeach}
                className="flex-shrink-0 px-5 md:px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-medium text-sm md:text-base flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
              >
                깜보 가르치기
                <Send className="w-4 h-4" />
              </button>
            </div>
            {/* Helper chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {['📘 채찍효과란?', '📐 선형계획법 설명', '🧬 DNA 복제 과정'].map((chip) => (
                <button
                  key={chip}
                  onClick={() => setInputValue(chip.replace(/^[^\s]+\s/, ''))}
                  className="px-3.5 py-1.5 text-xs text-gray-400 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded-full transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}