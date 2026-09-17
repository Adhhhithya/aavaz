import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function BreathingExercise() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('inhale'); // 'inhale', 'hold', 'exhale'
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [active, setActive] = useState(false);

  useEffect(() => {
    let interval;
    if (active && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setActive(false);
    }
    return () => clearInterval(interval);
  }, [active, timeLeft]);

  useEffect(() => {
    let cycleTimeout;
    if (active) {
      const runCycle = () => {
        setPhase('inhale');
        cycleTimeout = setTimeout(() => {
          setPhase('hold');
          cycleTimeout = setTimeout(() => {
            setPhase('exhale');
            cycleTimeout = setTimeout(() => {
              if (active) runCycle();
            }, 5000); // Exhale 5s
          }, 2000); // Hold 2s
        }, 4000); // Inhale 4s
      };
      runCycle();
    }
    return () => clearTimeout(cycleTimeout);
  }, [active]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getInstruction = () => {
    if (!active && timeLeft === 120) return "Ready to begin?";
    if (!active && timeLeft === 0) return "Session complete.";
    if (!active) return "Paused";
    switch(phase) {
      case 'inhale': return "Breathe In...";
      case 'hold': return "Hold...";
      case 'exhale': return "Breathe Out...";
      default: return "";
    }
  };

  // Dynamically scale the circle using inline CSS based on the phase
  const getScale = () => {
    if (!active && timeLeft === 120) return 'scale(1)';
    if (!active) return 'scale(1)';
    switch(phase) {
      case 'inhale': return 'scale(1.5)';
      case 'hold': return 'scale(1.5)';
      case 'exhale': return 'scale(1)';
      default: return 'scale(1)';
    }
  };

  const getTransition = () => {
    if (!active) return 'transform 0.5s ease-in-out';
    switch(phase) {
      case 'inhale': return 'transform 4s ease-out';
      case 'hold': return 'transform 2s linear';
      case 'exhale': return 'transform 5s ease-in-out';
      default: return 'transform 1s ease-in-out';
    }
  };

  return (
    <div className="min-h-screen bg-canvas-base flex flex-col p-6 relative overflow-hidden">
      
      {/* Background soft gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent-sage/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-primary-main/10 rounded-full blur-[100px] pointer-events-none"></div>

      <button 
        onClick={() => navigate(-1)} 
        className="w-10 h-10 bg-canvas-surface rounded-full shadow-sm flex items-center justify-center text-text-muted hover:text-text-primary transition-colors absolute top-6 left-6 z-10"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-2 text-center">Grounding Exercise</h1>
        <p className="text-text-muted font-medium mb-12 text-center max-w-sm">
          Follow the circle to regulate your breathing and calm your nervous system.
        </p>

        <div className="relative w-64 h-64 flex items-center justify-center mb-16">
          {/* Animated Flower Petals */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[...Array(6)].map((_, i) => (
              <div 
                key={i}
                className="absolute w-20 h-40 rounded-full bg-accent-sage/30 border border-accent-sage/50 mix-blend-multiply origin-bottom"
                style={{
                  transform: `${getScale()} rotate(${i * 60}deg) translateY(-20px)`,
                  transition: getTransition()
                }}
              ></div>
            ))}
            {/* Center Core */}
            <div className="absolute w-16 h-16 rounded-full bg-accent-sage/40 backdrop-blur-md border-2 border-accent-sage/60 flex items-center justify-center z-10"
              style={{
                transform: getScale(),
                transition: getTransition()
              }}
            ></div>
          </div>
          
          <div className="text-xl font-bold text-text-primary z-20 tracking-widest uppercase mt-32">
            {getInstruction()}
          </div>
        </div>

        <div className="text-4xl font-black text-text-primary font-mono tabular-nums mb-8">
          {formatTime(timeLeft)}
        </div>

        <button 
          onClick={() => {
            if (timeLeft === 0) setTimeLeft(120);
            setActive(!active);
          }}
          className={`px-8 py-3.5 rounded-pill font-bold text-white shadow-hover transition-all active:scale-95 text-lg w-full max-w-xs ${
            active ? 'bg-text-primary hover:bg-black' : 'bg-accent-sage hover:bg-[#5aa17a]'
          }`}
        >
          {active ? 'Pause' : timeLeft === 0 ? 'Restart' : 'Start Session'}
        </button>

      </div>
    </div>
  );
}
