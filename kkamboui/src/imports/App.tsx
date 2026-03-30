/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Bot } from 'lucide-react';

export default function App() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white overflow-hidden font-sans">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <iframe 
          src='https://my.spline.design/genkubgreetingrobot-Ucp7PWPw2Qa19dJxWCY6sMTW/' 
          frameBorder='0' 
          width='100%' 
          height='100%'
          className="w-full h-full"
          title="3D Robot Background"
        ></iframe>
      </div>

      {/* Gradient Overlays for depth and text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/80 via-transparent to-[#050505]/80 z-0 pointer-events-none"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050505_100%)] opacity-60 z-0 pointer-events-none"></div>

      {/* Navbar */}
      <nav className="absolute top-0 w-full p-6 z-20 pointer-events-auto flex justify-between items-center">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tighter">
          <Bot className="w-6 h-6 text-blue-500" />
          <span>GenKub</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Features</a>
          <a href="#" className="hover:text-white transition-colors">Technology</a>
          <a href="#" className="hover:text-white transition-colors">About</a>
        </div>
        <button className="px-5 py-2.5 text-sm font-medium bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-full transition-colors">
          Sign In
        </button>
      </nav>

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pointer-events-none pt-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-5xl mx-auto flex flex-col items-center"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 mb-8 pointer-events-auto cursor-pointer hover:bg-white/10 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold tracking-widest uppercase text-blue-200">Meet GenKub Robot</span>
          </motion.div>
          
          <h1 className="text-6xl md:text-8xl lg:text-[120px] font-black tracking-tighter mb-6 leading-[0.85] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/30">
            YOUR AI <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600">COMPANION</span>
          </h1>
          
          <p className="text-lg md:text-2xl text-gray-400 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
            Interact with the next generation of digital assistance. Say hello to the future.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pointer-events-auto">
            <button className="px-8 py-4 rounded-full bg-white text-black hover:bg-gray-200 font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95">
              Start Interacting
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
