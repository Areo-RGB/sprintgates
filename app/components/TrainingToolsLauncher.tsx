'use client';

import React, { useState } from 'react';

const trainingTools = [
  {
    id: 'farben',
    title: 'Farben',
    description: 'Stroop effect - cognitive reaction trainer',
    icon: '🎨',
    color: 'bg-purple-600/20 border-purple-500/50 text-purple-400',
    hover: 'hover:bg-purple-600/30',
  },
  {
    id: 'kettenrechner',
    title: 'Kettenrechner',
    description: 'Mental math chain calculator',
    icon: '🔢',
    color: 'bg-blue-600/20 border-blue-500/50 text-blue-400',
    hover: 'hover:bg-blue-600/30',
  },
  {
    id: 'timers',
    title: 'Timers',
    description: 'Interval timers and loop presets',
    icon: '⏱️',
    color: 'bg-green-600/20 border-green-500/50 text-green-400',
    hover: 'hover:bg-green-600/30',
  },
  {
    id: 'intervall',
    title: 'Intervall',
    description: 'Custom audio beep intervals',
    icon: '🔔',
    color: 'bg-yellow-600/20 border-yellow-500/50 text-yellow-400',
    hover: 'hover:bg-yellow-600/30',
  },
  {
    id: 'sound-counter',
    title: 'Sound Counter',
    description: 'Microphone sound detection counter',
    icon: '🎤',
    color: 'bg-red-600/20 border-red-500/50 text-red-400',
    hover: 'hover:bg-red-600/30',
  },
  {
    id: 'motion-counter',
    title: 'Motion Counter',
    description: 'Camera-based motion detection',
    icon: '📷',
    color: 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400',
    hover: 'hover:bg-cyan-600/30',
  },
];

const TrainingToolsLauncher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);

  const launchTool = async (toolId: string) => {
    setLaunching(toolId);

    // Launch Flutter Windows app
    try {
      // Method 1: Use process start (if supported)
      const response = await fetch('/api/launch-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolId }),
      });

      if (!response.ok) {
        throw new Error('Failed to launch');
      }

      // Close modal after successful launch
      setTimeout(() => {
        setIsOpen(false);
        setLaunching(null);
      }, 500);
    } catch (error) {
      console.error('Launch failed:', error);

      // Fallback: Show instructions
      alert(
        `To launch ${toolId}:\n\n` +
        `Open "Trainer Flutter" from your desktop shortcut\n` +
        `or run: ${getExePath()}\n\n` +
        `Navigate to ${toolId} tool`
      );
    } finally {
      setLaunching(null);
    }
  };

  const getExePath = () => {
    return 'C:\\Users\\Anwender\\flutter\\flutter_windows_app\\trainer_flutter\\build\\windows\\x64\\runner\\Release\\trainer_flutter.exe';
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-[#CEFF00]/30 rounded-full backdrop-blur-sm hover:bg-[#CEFF00]/10 transition-colors"
        title="Open Training Tools"
      >
        <span className="text-sm">🏋️</span>
        <span className="text-white/70 text-[10px] font-mono tracking-wider font-bold uppercase">Training</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-zinc-900 border border-[#CEFF00]/20 rounded-2xl overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏋️</span>
                <h3 className="text-white font-bold text-lg">Training Tools</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/50 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Content - Tool Grid */}
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {trainingTools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => launchTool(tool.id)}
                    disabled={launching !== null}
                    className={`p-4 rounded-xl border ${tool.color} ${tool.hover} backdrop-blur-sm transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center text-center gap-2`}
                  >
                    <span className="text-4xl">{tool.icon}</span>
                    <span className="font-bold text-sm">{tool.title}</span>
                    <span className="text-[10px] opacity-80 leading-tight">
                      {tool.description}
                    </span>
                    {launching === tool.id && (
                      <div className="mt-2 w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer - Info */}
            <div className="p-4 border-t border-white/10 bg-black/20">
              <div className="text-center">
                <p className="text-white/50 text-[10px] font-mono mb-2">
                  Launching native Windows application...
                </p>
                <div className="flex items-center justify-center gap-4 text-[10px] text-white/40 font-mono">
                  <span>Path: {getExePath()}</span>
                  <span className="text-[#CEFF00]">✓ Native Flutter App</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default TrainingToolsLauncher;
