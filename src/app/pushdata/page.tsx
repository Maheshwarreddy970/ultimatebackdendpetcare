'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import Papa from 'papaparse';

export default function PushDataPage() {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLog([`File selected: ${file.name}. Parsing...`]);

    try {
      const text = await file.text();
      let data: any[] = [];

      // Automatically handle both JSON and CSV files
      if (file.name.endsWith('.json')) {
        data = JSON.parse(text);
      } else if (file.name.endsWith('.csv')) {
        // Parse CSV and convert rows to objects based on header row
        const parsedCsv = Papa.parse(text, { header: true, skipEmptyLines: true });
        data = parsedCsv.data;
      } else {
        throw new Error("Invalid file type. Please upload a .json or .csv file.");
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("File is empty or not formatted correctly.");
      }

      setLog(prev => [...prev, `Found ${data.length} records. Beginning optimized batch upload...`]);

      const CHUNK_SIZE = 500; // Firebase batch limit
      let processedCount = 0;

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((item, index) => {
          // Fallback to row_number or a random ID if FinalEmail is missing
          const docId = item.FinalEmail 
            ? String(item.FinalEmail).toLowerCase().trim() 
            : `no_email_${item.row_number || Date.now()}_${index}`;
          
          const docRef = doc(db, "leads", docId);
          
          // Ensure every new lead gets a logoStatus
          const cleanData = {
            ...item,
            logoStatus: item.logoStatus || "pending",
            logoChecked: item.logoChecked || false,
          };

          // merge: true deduplicates and updates existing emails!
          batch.set(docRef, cleanData, { merge: true });
        });

        await batch.commit();
        processedCount += chunk.length;
        setLog(prev => [...prev, `Successfully uploaded ${processedCount} / ${data.length} leads...`]);
      }

      setLog(prev => [...prev, "✅ Upload Complete! All leads deduplicated and stored in Firebase."]);
    } catch (error: any) {
      console.error(error);
      setLog(prev => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
      // Reset input so you can upload another file if needed
      event.target.value = '';
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-12 px-4">
      <h1 className="text-3xl font-bold mb-2">Database Uploader</h1>
      <p className="text-gray-500 mb-8">Upload your CSV or JSON output. Duplicates are auto-merged by Email.</p>

      <div className="w-full max-w-2xl bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center relative hover:bg-gray-50 transition-colors shadow-sm">
        <input 
          type="file" 
          accept=".json,.csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="pointer-events-none">
          <p className="text-lg font-medium text-gray-700">Drag & Drop your CSV or JSON file here</p>
          <p className="text-sm text-gray-400 mt-2">or click to browse</p>
        </div>
      </div>

      <div className="w-full max-w-2xl mt-8 bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto shadow-inner">
        {log.length === 0 ? "Waiting for file..." : log.map((msg, i) => <div key={i} className="mb-1">{msg}</div>)}
      </div>
    </main>
  );
}