'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ReferEarn() {
  const [user, setUser] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralCode, setReferralCode] = useState<string>('');

  useEffect(() => {
    // Fetch user session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    // Fetch referrals
    const fetchReferrals = async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user?.id);
      if (error) console.error(error);
      else setReferrals(data || []);

      // Generate or fetch referral code
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('referral_code')
          .eq('user_id', user.id)
          .single();
        if (profile?.referral_code) {
          setReferralCode(profile.referral_code);
        } else {
          const newCode = `REF${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          await supabase
            .from('profiles')
            .update({ referral_code: newCode })
            .eq('user_id', user.id);
          setReferralCode(newCode);
        }
      }
    };

    if (user) fetchReferrals();
  }, [user]);

  if (!user) return <div>Please log in at /auth</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Refer & Earn</h1>
      <p>Your Referral Code: {referralCode}</p>
      <p>Share this link: http://localhost:3000/auth?ref={referralCode}</p>
      <h2>Your Referrals</h2>
      {referrals.length === 0 ? (
        <p>No referrals yet</p>
      ) : (
        <ul>
          {referrals.map((ref) => (
            <li key={ref.id}>
              Referred ID: {ref.referred_id} - Credit: ${ref.credit_earned} ({ref.status})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}