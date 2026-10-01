'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { autoExtractBatch } from '@/actions/autoExtractActions';

export default function AutoExtractEngine() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const router = useRouter();
  
  const stopRequested = useRef(false);

  const handleStartExtraction = async () => {
    setIsExtracting(true);
    stopRequested.current = false;
    setLogs(["🚀 Starting SUPER FAST concurrent extraction (10 at a time)..."]);

    while (!stopRequested.current) {
      // Processes 10 leads simultaneously!
      const result = await autoExtractBatch(10);
      
      setLogs(prev => [...result.messages, ...prev].slice(0, 15));

      if (result.status === 'complete' || result.status === 'error') {
        break;
      }
      
      router.refresh();
      // Tiny pause to avoid hitting Firebase read limits too aggressively
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsExtracting(false);
    setLogs(prev => ["Extraction stopped.", ...prev]);
  };

  const handleStopExtraction = () => {
    stopRequested.current = true;
    setLogs(prev => ["Stopping after current batch finishes...", ...prev]);
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm text-center">
      <h2 className="text-lg font-bold mb-2">Automated Logo Extractor (Turbo Mode)</h2>
      <p className="text-sm text-gray-500 mb-4">
        Extracts 10 websites/Facebook pages concurrently. Extracted logos are placed into <b>Manual Review</b> below for you to approve.
      </p>
      
      <div className="flex justify-center gap-4">
        <button 
          onClick={handleStartExtraction} 
          disabled={isExtracting}
          className="px-6 py-2 bg-indigo-600 text-white font-bold rounded shadow disabled:opacity-50 hover:bg-indigo-700 transition"
        >
          {isExtracting ? 'Extracting (10x Speed)...' : 'Start Auto Extract'}
        </button>
        
        {isExtracting && (
          <button 
            onClick={handleStopExtraction} 
            className="px-6 py-2 bg-red-600 text-white font-bold rounded shadow hover:bg-red-700 transition animate-pulse"
          >
            Stop
          </button>
        )}
      </div>

      {logs.length > 0 && (
        <div className="mt-4 p-3 bg-gray-900 text-green-400 font-mono text-xs rounded text-left h-40 overflow-y-auto shadow-inner">
          {logs.map((log, i) => (
            <div key={i} className={i === 0 ? "text-white font-bold" : "opacity-70"}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}