'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(true);

  const handleAuth = async () => {
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else alert(isSignUp ? 'Check your email to confirm!' : 'Logged in!');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: 'auto' }}>
      <h1>{isSignUp ? 'Sign Up' : 'Log In'}</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', margin: '10px 0', padding: '8px' }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', margin: '10px 0', padding: '8px' }}
      />
      <button onClick={handleAuth} style={{ padding: '8px 16px' }}>
        {isSignUp ? 'Sign Up' : 'Log In'}
      </button>
      <button
        onClick={() => setIsSignUp(!isSignUp)}
        style={{ marginLeft: '10px', padding: '8px 16px' }}
      >
        Switch to {isSignUp ? 'Log In' : 'Sign Up'}
      </button>
    </div>
  );
}