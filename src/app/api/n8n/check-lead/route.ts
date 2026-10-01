import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ success: false, error: "Email required" }, { status: 400 });

    const docId = email.toLowerCase().trim();
    const docRef = doc(db, "leads", docId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ status: 'skip', reason: 'Not found in database' });
    }

    const data = docSnap.data();

    // Only proceed if the logo has been manually or automatically approved
    if (data.logoStatus === 'approved') {
      return NextResponse.json({
        status: 'approved',
        email: docId, // <---- ADD THIS LINE HERE
        logoUrl: data.logoUrl,
        colors: {
          primary: data.primary,
          secondary: data.secondary,
          tertiary: data.tertiary
        },
        leadData: {
          name: data.Name || data.facebookname,
          intro: data.facebookintro || "",
          address: data.Address || data.facebookaddress || "",
          category: data.Category || data.facebookcategory || "Pet Groomer",
          rating: data.AverageRating || "5.0",
          reviews: data.ReviewCount || "100+"
        }
      });
    }

    // Skip if pending, manual_review, or not_approved
    return NextResponse.json({ status: 'skip', reason: `Logo status is ${data.logoStatus}` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}