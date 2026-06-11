import React from "react";
import AudioLab from "./components/AudioLab";
import { Mic, Waves } from "lucide-react";

export default function App() {
  return (
    <div id="app-workspace-canvas" className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-emerald-100 selection:text-emerald-900 pb-16">
      
      {/* Visual Accent Top Bar */}
      <div className="h-1.5 w-full bg-emerald-600" />

      {/* Main Workspace Frame */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 font-sans">
        
        {/* Simplified Premium Clean Header */}
        <header className="flex items-center gap-4 pb-8 border-b border-slate-200/80 mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
            <Mic className="w-6 h-6" />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              Voice Lab
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Transcribe and translate long audio voice recordings effortlessly. Supports speech files up to 5 hours long and multi-gigabyte sizes.
            </p>
          </div>
        </header>

        {/* Core Workspace Panel */}
        <main>
          <AudioLab />
        </main>

        {/* Elegant Minimal Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-200 text-center text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-500">© 2026 Voice Lab Transcriber.</p>
          <div className="text-[11px] text-slate-400 space-y-0.5">
            <p><span className="font-semibold text-slate-500">Developer:</span> Muhammad Usman</p>
            <p><span className="font-semibold text-slate-500">Contact:</span> 03237939393</p>
            <p><span className="font-semibold text-slate-500">Address:</span> Islamabad Bani Gala</p>
          </div>
        </footer>

      </div>
    </div>
  );
}
