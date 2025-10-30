// app/api/checkout_sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '[SET]' : '[MISSING]');
    console.log('NEXT_PUBLIC_BASE_URL:', process.env.NEXT_PUBLIC_BASE_URL);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { user_id, items, line_items } = await req.json();

    console.log('Items received:', items);
    console.log('Line items received:', line_items);
    console.log('User ID:', user_id);

    let finalLineItems: any[] = [];

    if (Array.isArray(line_items) && line_items.length > 0) {
      // Services page: strip metadata from line_items
      finalLineItems = line_items.map((item: any) => {
        const { metadata, ...rest } = item;
        return {
          ...rest,
          price_data: {
            currency: rest.price_data?.currency || 'usd',
            product_data: {
              name: rest.price_data?.product_data?.name || 'Service',
              description: rest.price_data?.product_data?.description || undefined,
            },
            unit_amount: rest.price_data?.unit_amount || 0,
          },
        };
      });
    } else if (Array.isArray(items) && items.length > 0) {
      const productIds = items.map((item: any) => item.id);
      const { data: products, error: supabaseError } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      if (supabaseError) {
        console.error('Supabase fetch error:', supabaseError);
        throw new Error('Failed to fetch products from Supabase');
      }

      finalLineItems = items.map((cartItem: any) => {
        const product = products?.find((p: any) => p.id === cartItem.id);
        return {
          price_data: {
            currency: 'usd',
            product_data: { name: product?.name || 'Unknown Item' },
            unit_amount: Math.round(cartItem.price * 100),
          },
          quantity: cartItem.qty,
        };
      });
    } else {
      return NextResponse.json(
        { error: 'No valid cart or service items received' },
        { status: 400 }
      );
    }

    finalLineItems = finalLineItems.filter((item) => item.price_data.unit_amount > 0);
    if (finalLineItems.length === 0) {
      return NextResponse.json({ error: 'No valid items to process' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const cartItemIds = line_items
      ? line_items.map((item: any) => item.metadata?.cart_item_id).filter(Boolean)
      : items?.map((item: any) => item.id).filter(Boolean) || [];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: finalLineItems,
      mode: 'payment',
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/services`,
      metadata: {
        user_id: user_id || 'guest',
        cart_item_ids: cartItemIds.join(','),
      },
    });

    const totalAmount = finalLineItems.reduce(
      (sum, item) => sum + (item.price_data.unit_amount * (item.quantity || 1)),
      0
    ) / 100;

    // === FIXED: Use profiles.id for customer_id ===
    if (user_id && user_id !== 'guest') {
      try {
        // 1. Fetch user from auth.users to get email
        const { data: authUser, error: authError } = await supabase
          .auth
          .admin
          .getUserById(user_id);

        if (authError || !authUser?.user) {
          console.warn('Could not fetch user email:', authError);
        }

        const userEmail = authUser?.user?.email || null;

        // 2. Find or create profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user_id)
          .single();

        let profileId = profile?.id;

        if (profileError || !profile) {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({ 
              user_id, 
              email: userEmail 
            })
            .select('id')
            .single();

          if (insertError) throw insertError;
          profileId = newProfile.id;
        }

        // 3. Save order
        const orderItems = finalLineItems.map((item: any, index: number) => ({
          customer_id: profileId,
          user_id: user_id,
          product_id: cartItemIds[index] || null,
          quantity: item.quantity,
          total_price: (item.price_data.unit_amount * item.quantity) / 100,
          status: 'pending',
          session_id: session.id,
          total_amount: totalAmount,
        }));

        for (const order of orderItems) {
          const { error } = await supabase.from('orders').insert(order);
          if (error) console.warn('Order save error:', error);
        }
      } catch (e) {
        console.error('Failed to save order:', e);
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    );
  }
}