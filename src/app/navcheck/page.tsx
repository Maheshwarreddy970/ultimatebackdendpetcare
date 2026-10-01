import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import JsonNavbarReviewCard from '@/components/JsonNavbarReviewCard';
import AutoExtractEngine from '@/components/AutoExtractEngine'; 

export const dynamic = 'force-dynamic'; 

async function getReviewLeadsCount(): Promise<number> {
  try {
    const q = query(collection(db, "leads"), where("logoStatus", "==", "manual_review"));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error) {
    return 0;
  }
}

// 🔥 REMOVED THE LIMIT: Fetches ALL pending/manual_review leads at once!
async function getReviewLeads() {
  const q = query(collection(db, "leads"), where("logoStatus", "==", "manual_review"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
}

export default async function FirebaseNavbarPage() {
  const [displayItems, reviewCount] = await Promise.all([
    getReviewLeads(),
    getReviewLeadsCount()
  ]);

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <div className="w-full text-center py-8">
        <h1 className="text-3xl font-bold">Manual Review Dashboard</h1>
        
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-sm shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            Awaiting Approval: {reviewCount}
          </span>
        </div>
      </div>

      <AutoExtractEngine />

      <div className="flex flex-col w-full gap-6 px-4 max-w-5xl mx-auto">
        {displayItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500 font-medium bg-white rounded-lg border border-gray-200">
            🎉 Review queue empty! Either hit "Start Auto Extract" above to fetch more pending leads, or you're all done!
          </div>
        ) : (
          displayItems.map((item, index) => (
            <JsonNavbarReviewCard 
              key={`card-${item.id}-${index}`} 
              item={item} 
            />
          ))
        )}
      </div>
    </main>
  );
}