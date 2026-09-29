'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { autoProcessNextSuccessRecordFirebase } from '@/actions/firebaseNavbarActions';

export default function AutoApproveEngine() {
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const router = useRouter(); 
  
  // Use a ref to track the live running state across async timeout boundaries
  const isRunningRef = useRef(false);

  const runEngine = async () => {
    // Safety check: Don't fetch the next record if the user clicked stop
    if (!isRunningRef.current) return;

    try {
      const response = await autoProcessNextSuccessRecordFirebase();
      
      setLog(prev => [...prev, response.message].slice(-5));

      // Refresh the page so the approved item disappears from the stack instantly
      router.refresh(); 

      // Check again right after the Firebase call finishes
      if (!isRunningRef.current) {
        setLog(prev => [...prev, "🛑 Engine stopped by user."].slice(-5));
        setIsRunning(false);
        return;
      }

      if (response.status === 'processing' || response.status === 'error') {
        // Wait 1.5 seconds before doing the next one to avoid Firebase rate limits / timeouts
        setTimeout(() => {
          // One final check before firing the next loop
          if (isRunningRef.current) {
            runEngine(); 
          }
        }, 1500);
      } else {
        // Status is 'complete'
        setLog(prev => [...prev, "🎉 All records have been auto-approved!"].slice(-5));
        setIsRunning(false);
        isRunningRef.current = false;
      }
    } catch (error) {
      setLog(prev => [...prev, "❌ Engine encountered a fatal error."].slice(-5));
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const handleStart = () => {
    if (isRunningRef.current) return;
    setIsRunning(true);
    isRunningRef.current = true;
    setLog(prev => [...prev, "▶️ Engine started..."].slice(-5));
    runEngine();
  };

  const handleStop = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    setLog(prev => [...prev, "⏳ Stopping engine after current task finishes..."].slice(-5));
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Firebase Processing Engine</h2>
          <p className="text-sm text-gray-500">Removes BG and marks as 'approved' automatically in Firestore.</p>
        </div>
        
        <div className="flex gap-2">
          {isRunning ? (
            <button 
              onClick={handleStop} 
              className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm"
            >
              Stop Engine
            </button>
          ) : (
            <button 
              onClick={handleStart} 
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Start Auto-Approve Engine
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-50 p-3 rounded-lg h-32 overflow-y-auto text-sm font-mono text-gray-700 flex flex-col justify-end border border-gray-100">
        {!log.length && <div className="text-gray-400 italic">Ready to process...</div>}
        {log.map((message, i) => (
          <div key={i} className="mb-1 border-b border-gray-100 pb-1 break-all">
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}