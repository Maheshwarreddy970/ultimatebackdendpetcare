'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoProcessNextSuccessRecordFirebase } from '@/actions/firebaseNavbarActions';

export default function AutoApproveEngine() {
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const router = useRouter(); 

  const runEngine = async () => {
    setIsRunning(true);
    
    try {
      const response = await autoProcessNextSuccessRecordFirebase();
      
      setLog(prev => [...prev, response.message].slice(-5));

      // Refresh the page so the approved item disappears from the stack instantly
      router.refresh(); 

      if (response.status === 'processing' || response.status === 'error') {
        // Wait 1.5 seconds before doing the next one to avoid Firebase rate limits / timeouts
        setTimeout(() => {
          runEngine(); 
        }, 1500);
      } else {
        // Status is 'complete'
        setLog(prev => [...prev, "🎉 All records have been auto-approved!"].slice(-5));
        setIsRunning(false);
      }
    } catch (error) {
      setLog(prev => [...prev, "Engine encountered a fatal error."]);
      setIsRunning(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Firebase Processing Engine</h2>
          <p className="text-sm text-gray-500">Removes BG and marks as 'approved' automatically in Firestore.</p>
        </div>
        <button 
          onClick={runEngine} 
          disabled={isRunning}
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {isRunning ? 'Processing Stack...' : 'Start Auto-Approve Engine'}
        </button>
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