// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getZipCoordinates = async (zip: string): Promise<{ lat: number; lon: number } | null> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&postalcode=${zip}&country=US&limit=1`,
      {
        headers: {
          'User-Agent': 'DetailingNearYou/1.0 (info@7stepdetailers.com)', // ← CHANGE THIS
        },
      }
    );
    if (!res.ok) throw new Error('Nominatim failed');
    const data: Array<{ lat: string; lon: string }> = await res.json();
    if (!data.length) return null;
    return { lat: +data[0].lat, lon: +data[0].lon };
  } catch (e) {
    console.error('Nominatim error:', e);
    return null;
  }
};

export async function POST(req: NextRequest) {
  try {
    const { zipCode, vehicleType } = await req.json();

    if (!zipCode || typeof zipCode !== 'string' || !/^\d{5}$/.test(zipCode)) {
      return NextResponse.json({ error: 'Invalid ZIP code' }, { status: 400 });
    }

    const center = await getZipCoordinates(zipCode);
    if (!center) {
      return NextResponse.json({ error: 'Unable to geocode ZIP code' }, { status: 400 });
    }

    // NO TRAILING COMMA!
    const { data: detailers, error } = await supabase
    .from('detailers')
    .select(`
      id,
      name,
      image,
      description,
      lat,
      lon,
      location_zip,
      rating,
      reviews,
      has_shop,
      shop_address,
      vehicle_types,
      badge
    `)
    .eq('location_zip', zipCode)
    .eq('is_active', true)  // ← NOW SAFE TO USE
    .order('rating', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!detailers?.length) {
      return NextResponse.json({ detailers: [], lat: center.lat, lon: center.lon });
    }

    const filtered = vehicleType
      ? detailers.filter((d: any) =>
          d.vehicle_types?.some((t: string) =>
            t.toLowerCase().includes(vehicleType.toLowerCase())
          )
        )
      : detailers;

    const withDistance = filtered.map((d: any) => ({
      ...d,
      distance:
        d.lat && d.lon
          ? Math.round(
              3959 *
                Math.acos(
                  Math.cos((center.lat * Math.PI) / 180) *
                    Math.cos((d.lat * Math.PI) / 180) *
                    Math.cos(((d.lon - center.lon) * Math.PI) / 180) +
                    Math.sin((center.lat * Math.PI) / 180) *
                      Math.sin((d.lat * Math.PI) / 180)
                ) *
                100
            ) / 100
          : null,
      testimonials: [],
      reviewSnippet: null,
    }));

    return NextResponse.json({
      detailers: withDistance,
      lat: center.lat,
      lon: center.lon,
    });
  } catch (e) {
    console.error('Search API crash:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}