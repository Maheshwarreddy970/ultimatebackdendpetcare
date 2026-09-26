import { getPendingLeads } from '@/actions/firebaseNavbarActions';
import AutoApproveEngine from '@/components/AutoApproveEngine';
import JsonNavbarReviewCard from '@/components/JsonNavbarReviewCard';

export const dynamic = 'force-dynamic'; 

export default async function FirebaseNavbarPage() {
  const displayItems = await getPendingLeads();

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <div className="w-full text-center py-8">
        <h1 className="text-3xl font-bold">Firebase Review Dashboard</h1>
        <p className="text-gray-500 mt-2">
          Displaying top 50 pending records to save read limits.
        </p>
      </div>

      <AutoApproveEngine />

      <div className="flex flex-col w-full gap-6 px-4">
        {displayItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500 font-medium">
            🎉 Stack empty! All items have been verified.
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