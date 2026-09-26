'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';

export default function PushDataPage() {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLog(["File selected. Parsing JSON..."]);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error("Uploaded file must be a JSON array.");
      }

      setLog(prev => [...prev, `Found ${data.length} records. Beginning optimized batch upload...`]);

      // Firebase limits batch writes to 500 operations at a time
      const CHUNK_SIZE = 500;
      let processedCount = 0;

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((item, index) => {
          // Use FinalEmail as the Document ID to PREVENT DUPLICATES automatically (Zero extra read costs!)
          const docId = item.FinalEmail 
            ? item.FinalEmail.toLowerCase().trim() 
            : `no_email_${item.row_number || Date.now()}_${index}`;
          
          const docRef = doc(db, "leads", docId);
          
          // Ensure every new lead gets a logoStatus
          const cleanData = {
            ...item,
            logoStatus: item.logoStatus || "pending",
            logoChecked: item.logoChecked || false,
          };

          // merge: true updates existing emails instead of creating duplicates
          batch.set(docRef, cleanData, { merge: true });
        });

        await batch.commit();
        processedCount += chunk.length;
        setLog(prev => [...prev, `Successfully uploaded ${processedCount} / ${data.length} leads...`]);
      }

      setLog(prev => [...prev, "✅ Upload Complete! All leads deduplicated and stored."]);
    } catch (error: any) {
      console.error(error);
      setLog(prev => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <h1 className="text-3xl font-bold mb-2">Database Uploader</h1>
      <p className="text-gray-500 mb-8">Upload your n8n JSON output. Duplicates are auto-merged by Email.</p>

      <div className="w-full max-w-2xl bg-white border-2 border-dashed border-gray-300 rounded-xl p-12 text-center relative hover:bg-gray-50 transition-colors">
        <input 
          type="file" 
          accept=".json"
          onChange={handleFileUpload}
          disabled={loading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="pointer-events-none">
          <p className="text-lg font-medium text-gray-700">Drag & Drop your JSON file here</p>
          <p className="text-sm text-gray-400 mt-2">or click to browse</p>
        </div>
      </div>

      <div className="w-full max-w-2xl mt-8 bg-black text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto">
        {log.length === 0 ? "Waiting for file..." : log.map((msg, i) => <div key={i}>{msg}</div>)}
      </div>
    </main>
  );
}