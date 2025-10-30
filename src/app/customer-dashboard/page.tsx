'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function CustomerDashboard() {
  const [user, setUser] = useState<any>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Session fetch error:', sessionError);
        setError('Failed to fetch session');
        return;
      }
      if (session?.user) {
        setUser(session.user);
        console.log('User ID:', session.user.id);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .single();
        if (profileError) {
          console.error('Profile fetch error:', profileError);
          setError('Failed to fetch profile');
        } else {
          console.log('Profile ID:', profile?.id);
          setProfileId(profile?.id);
        }
      } else {
        setError('No user session found');
      }
    };

    fetchUserAndProfile();
  }, []);

  useEffect(() => {
    const fetchAppointments = async () => {
      if (profileId) {
        console.log('Fetching appointments for profileId:', profileId);
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('customer_id', profileId);
        if (error) {
          console.error('Appointments fetch error:', error);
          setError('Failed to fetch appointments');
        } else {
          console.log('Appointments:', data);
          setAppointments(data || []);
        }
      }
    };

    fetchAppointments();
  }, [profileId]);

  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>Please log in at /auth</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Customer Dashboard</h1>
      <p>Email: {user.email}</p>
      <h2>Appointments</h2>
      {appointments.length === 0 ? (
        <p>No appointments</p>
      ) : (
        <ul>
          {appointments.map((appt) => (
            <li key={appt.id}>
              {appt.service_type} - {new Date(appt.appointment_date).toLocaleString()} ({appt.status})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}