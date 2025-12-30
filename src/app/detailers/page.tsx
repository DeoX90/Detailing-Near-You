'use client';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface User {
  id: string;
  business_name?: string;
  description?: string;
  logo_url?: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  status: string;
  notes: string;
  created_at: string;
}

interface Appointment {
  id: string;
  customer_name: string;
  service: string;
  date: string;
  time: string;
  notes: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  sales: number;
}

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface Availability {
  day: string;
  active: boolean;
  start: string;
  end: string;
}

interface Metrics {
  leads: number;
  appointments: number;
  revenue: number;
}

interface Activity {
  message: string;
  created_at: string;
}

interface BusinessData {
  name: string;
  description: string;
  logo: File | null;
}

interface AppointmentForm {
  customer_name: string;
  customer_phone?: string; 
  customer_email?: string;
  service: string;
  date: string;
  time: string;
  notes: string;
}

interface InventoryForm {
  id: string | null;
  name: string;
  category: string;
  price: string;
  stock: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchLeads, setSearchLeads] = useState('');
  const [filterLeads, setFilterLeads] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>({
    customer_name: '',
    service: 'Full Detail',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    notes: '',
  });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchInventory, setSearchInventory] = useState('');
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [inventoryForm, setInventoryForm] = useState<InventoryForm>({
    id: null,
    name: '',
    category: 'Interior',
    price: '',
    stock: '',
  });
  const [businessData, setBusinessData] = useState<BusinessData>({
    name: '',
    description: '',
    logo: null,
  });
  const [services, setServices] = useState<Service[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([
    { day: 'Monday', active: true, start: '09:00', end: '18:00' },
    { day: 'Tuesday', active: true, start: '09:00', end: '18:00' },
    { day: 'Wednesday', active: true, start: '09:00', end: '18:00' },
    { day: 'Thursday', active: true, start: '09:00', end: '18:00' },
    { day: 'Friday', active: true, start: '09:00', end: '18:00' },
    { day: 'Saturday', active: false, start: '10:00', end: '16:00' },
    { day: 'Sunday', active: false, start: '00:00', end: '00:00' },
  ]);
  const [metrics, setMetrics] = useState<Metrics>({ leads: 0, appointments: 0, revenue: 0 });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [settingsTab, setSettingsTab] = useState<'profile' | 'availability' | 'timing' | 'services'>('profile');

  const [detailerSettings, setDetailerSettings] = useState({
  default_duration_minutes: 180,
  buffer_minutes: 30,
  max_appointments_per_slot: 1
  });

  // Helper: Convert 24h time (HH:MM) to 12h format (HH:MM AM/PM)
  const to12Hour = (time24: string): string => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Helper: Parse date string (YYYY-MM-DD) without timezone issues
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Helper: Get day of week from date string
  const getDayOfWeek = (dateStr: string): string => {
    const date = parseLocalDate(dateStr);
    return date.toLocaleString('en-us', { weekday: 'long' });
  };

  // Generate time slots based on selected day's availability, service duration, buffer, and existing appointments
  const getAvailableTimeSlots = (selectedDate: string, selectedService?: string): string[] => {
    const dayOfWeek = getDayOfWeek(selectedDate);
    const dayAvail = availability.find(a => a.day === dayOfWeek);
    if (!dayAvail || !dayAvail.active) return [];

    const [startH, startM] = dayAvail.start.split(':').map(Number);
    const [endH, endM] = dayAvail.end.split(':').map(Number);
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    // Handle overnight shifts (e.g., 22:00 to 04:00)
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    console.log('Availability for', dayOfWeek, ':', dayAvail.start, '→', dayAvail.end, '→', startMinutes, 'to', endMinutes);

    const serviceDuration = selectedService
      ? (services.find(s => s.name === selectedService)?.duration_minutes || detailerSettings.default_duration_minutes)
      : detailerSettings.default_duration_minutes;
    const buffer = detailerSettings.buffer_minutes;
    const totalNeeded = serviceDuration + buffer;

    console.log('Service needs:', serviceDuration, 'min +', buffer, 'min buffer =', totalNeeded, 'min total');

    const maxPerSlot = detailerSettings.max_appointments_per_slot;
    const dayAppointments = appointments.filter(a => a.date === selectedDate);
    const slots: string[] = [];

    for (let mins = startMinutes; mins + totalNeeded <= endMinutes; mins += 30) {
      let h = Math.floor(mins / 60) % 24; // Wrap around midnight
      const m = mins % 60;
      const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      // Count overlapping appointments (with buffer)
      const appointmentsAtSlot = dayAppointments.filter(appt => {
        const [apptH, apptM] = appt.time.split(':').map(Number);
        let apptStart = apptH * 60 + apptM;
        // If we're in an overnight window and appointment is before start, assume it's next day
        if (endMinutes > 1440 && apptStart < startMinutes) {
          apptStart += 1440;
        }
        const apptDuration = (appt as any).duration_minutes || detailerSettings.default_duration_minutes;
        const apptEnd = apptStart + apptDuration + buffer;
        const newStart = mins;
        const newEnd = mins + totalNeeded;

        return newEnd > apptStart && newStart < apptEnd;
      });

      if (appointmentsAtSlot.length < maxPerSlot) {
        slots.push(time24);
      }
    }

    console.log('Generated available slots:', slots);
    return slots;
  };
  
  useEffect(() => {
const checkUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = '/auth';
    return;
  }

  // Get or create profile
  let profile = null;
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, role, is_detailer')
    .eq('user_id', session.user.id)
    .single();

if (!existingProfile) {
  // Profile doesn't exist yet - create it from user metadata
  const isDetailer = session.user.user_metadata?.is_detailer || false;
  const { data: newProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      user_id: session.user.id,
      email: session.user.email || '',
      role: isDetailer ? 'detailer' : 'customer',
      is_detailer: isDetailer,
    })
    .select('id, role, is_detailer')
    .single();

  if (createError) {
    console.error('Profile creation error:', createError);
    alert('Could not set up your profile. Please try again.');
    window.location.href = '/';
    return;
  }
  profile = newProfile;
} else {
  profile = existingProfile;
}

// Now check role
if (!profile || !profile.is_detailer) {
  alert('Access denied. Only users who signed up as detailers can access this page.');
  window.location.href = '/';
  return;
}

  // Continue with detailer load/auto-create (your existing code)
  const { data: detailer, error: detailerError } = await supabase
    .from('detailers')
    .select('name, description, image, default_duration_minutes, buffer_minutes, max_appointments_per_slot')
    .eq('profile_id', session.user.id)
    .maybeSingle();

      if (detailerError && detailerError.code !== 'PGRST116') {
        console.error('Error loading detailer:', detailerError);
      }

      if (!detailer) {
        // Create default detailer row
        const { error: createError } = await supabase
          .from('detailers')
          .insert({
            profile_id: session.user.id,
            name: 'My Detailing Business',
            description: '',
            image: null,
            default_duration_minutes: 180,
            buffer_minutes: 30,
            max_appointments_per_slot: 1
          });

        if (createError) {
          console.error('Failed to create detailer row:', createError);
          alert('Could not initialize your profile. Please try again.');
          return;
        }

        // Use defaults
        setUser({
          id: session.user.id,
          business_name: 'My Detailing Business',
          description: '',
          logo_url: undefined,
        });
        setBusinessData({
          name: 'My Detailing Business',
          description: '',
          logo: null,
        });
        setDetailerSettings({
          default_duration_minutes: 180,
          buffer_minutes: 30,
          max_appointments_per_slot: 1,
        });
      } else {
        setUser({
          id: session.user.id,
          business_name: detailer.name || 'My Detailing Business',
          description: detailer.description || '',
          logo_url: detailer.image || undefined,
        });
        setBusinessData({
          name: detailer.name || '',
          description: detailer.description || '',
          logo: null,
        });
        setDetailerSettings({
          default_duration_minutes: detailer.default_duration_minutes || 180,
          buffer_minutes: detailer.buffer_minutes || 30,
          max_appointments_per_slot: detailer.max_appointments_per_slot || 1,
        });
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  useEffect(() => {
    if (!user?.id || loading) return;

 const fetchData = async () => {
  try {
    const [
      { data: leadsData },
      { data: appointmentsData },
      { data: inventoryData },
      { data: servicesData },
      { data: activityData },
    ] = await Promise.all([
      supabase.from('leads').select('*').eq('detailer_id', user.id),
      supabase.from('appointments').select('*').eq('detailer_id', user.id),
      supabase.from('inventory').select('*').eq('detailer_id', user.id),
      supabase.from('services').select('*').eq('detailer_id', user.id),
      supabase.from('activity').select('message, created_at').eq('detailer_id', user.id).order('created_at', { ascending: false }).limit(10),
    ]);

    setLeads(leadsData || []);
    setAppointments(appointmentsData || []);
    setInventory(inventoryData || []);
    setServices(servicesData || []);
    setActivity(activityData || []);

    // Calculate metrics
    const futureAppts = (appointmentsData || []).filter(a => new Date(a.date) >= new Date());
    const revenue = futureAppts.reduce((sum, appt) => {
      const service = servicesData?.find(s => s.name === appt.service);
      return sum + (service?.price || 0);
    }, 0);

    setMetrics({
      leads: leadsData?.length || 0,
      appointments: futureAppts.length,
      revenue,
    });

    // Load detailer timing settings (buffer + default duration + max appointments)
    const { data: detailerData, error: detailerError } = await supabase
      .from('detailers')
      .select('default_duration_minutes, buffer_minutes, max_appointments_per_slot')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (detailerError && detailerError.code !== 'PGRST116') {
      console.error('Error loading detailer settings:', detailerError);
    }
    if (detailerData) {
      setDetailerSettings({
        default_duration_minutes: detailerData.default_duration_minutes || 180,
        buffer_minutes: detailerData.buffer_minutes || 30,
        max_appointments_per_slot: detailerData.max_appointments_per_slot || 1,
      });
    }

// Load availability settings
    const { data: availabilityData, error: availError } = await supabase
      .from('availabilities')
      .select('day, active, start_time, end_time')
      .eq('detailer_id', user.id);

    console.log('Raw availability from DB:', availabilityData);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const updatedAvailability = days.map(day => {
      const saved = availabilityData?.find(a => a.day === day);
      if (saved) {
        const trim = (t: string) => t.slice(0, 5); // '00:00:00' → '00:00'
        return {
          day,
          active: saved.active,
          start: trim(saved.start_time),
          end: trim(saved.end_time),
        };
      }
      return {
        day,
        active: false,
        start: '09:00',
        end: '18:00',
      };
    });

    setAvailability(updatedAvailability);

  } catch (err) {
    console.error('Fetch error:', err);
  }
};

fetchData();

const channels = [
  supabase.channel('leads').on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `detailer_id=eq.${user.id}` }, () => fetchData()).subscribe(),
  supabase.channel('appointments').on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `detailer_id=eq.${user.id}` }, () => fetchData()).subscribe(),
  supabase.channel('activity').on('postgres_changes', { event: '*', schema: 'public', table: 'activity', filter: `detailer_id=eq.${user.id}` }, () => fetchData()).subscribe(),
];

    return () => channels.forEach(ch => ch.unsubscribe());
  }, [user?.id, loading]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.href = '/login';
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleLeadAction = async (id: string, action: 'contact' | 'accept' | 'decline') => {
    if (action === 'contact') return alert('Email client opening...');
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    try {
      const res = await fetch('/.netlify/functions/update-lead', {
        method: 'POST',
        body: JSON.stringify({ id, status: action === 'accept' ? 'Booked' : 'Declined', detailer_id: user!.id }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      if (action === 'accept') {
        const date = prompt('Date (YYYY-MM-DD)', new Date().toISOString().split('T')[0]) || new Date().toISOString().split('T')[0];
        const time = prompt('Time', '10:00') || '10:00';
        await Promise.all([
          supabase.from('appointments').insert({
            detailer_id: user!.id,
            customer_name: lead.name,
            service: lead.service,
            date,
            time,
            notes: lead.notes,
          }),
          supabase.from('activity').insert({
            detailer_id: user!.id,
            message: `Booked ${lead.name} for ${lead.service} on ${date}`,
          }),
        ]);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleSaveAppointment = async () => {
  if (!user || !appointmentForm.customer_name || !appointmentForm.service || !appointmentForm.date || !appointmentForm.time) {
    return alert('Please fill all required fields');
  }

  try {
    const dayOfWeek = getDayOfWeek(appointmentForm.date);
    
       // 1. Check availability
    const { data: avail } = await supabase
      .from('availabilities')
      .select('active, start_time, end_time')
      .eq('detailer_id', user.id)
      .eq('day', dayOfWeek)
      .single();
    if (!avail || !avail.active) {
      alert(`You are not available on ${dayOfWeek}s! Update in Settings → Availability`);
      return;
    }

    // Convert times to minutes
    const [selH, selM] = appointmentForm.time.split(':').map(Number);
    let selMinutes = selH * 60 + selM;

    const [startH, startM] = avail.start_time.split(':').map(Number);
    const [endH, endM] = avail.end_time.split(':').map(Number);
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    // Handle overnight shifts (e.g., 22:00 to 04:00)
    if (endMinutes < startMinutes) {
      endMinutes += 1440;
    }
    if (endMinutes > 1440 && selMinutes < startMinutes) {
      selMinutes += 1440; // Adjust selected time if it's overnight
    }

    const duration = services.find(s => s.name === appointmentForm.service)?.duration_minutes || detailerSettings.default_duration_minutes || 180;
    const buffer = detailerSettings.buffer_minutes || 30;
    const totalNeeded = duration + buffer;

    if (selMinutes < startMinutes || selMinutes + totalNeeded > endMinutes) {
      alert(`Outside your available hours or buffer!\nAvailable: ${avail.start_time} – ${avail.end_time}`);
      return;
    }

    // 2. Check double-booking WITH buffer
    const { data: conflicts } = await supabase
      .from('appointments')
      .select('time, duration_minutes')
      .eq('detailer_id', user.id)
      .eq('date', appointmentForm.date);

    const newStartMin = selMinutes;
    const newEndMin = selMinutes + duration + buffer;

    for (const appt of conflicts || []) {
      const [h, m] = appt.time.split(':').map(Number);
      let existStart = h * 60 + m;
      // Adjust existing appointments for overnight comparison
      if (endMinutes > 1440 && existStart < startMinutes) {
        existStart += 1440;
      }
      const existDuration = appt.duration_minutes || 180;
      const existEnd = existStart + existDuration + buffer;

      if (newEndMin > existStart && newStartMin < existEnd) {
        alert('This time overlaps with another appointment (including buffer time)!');
        return;
      }
    }

    // 3. Save appointment
    const { error } = await supabase.from('appointments').insert({
      detailer_id: user.id,
      customer_name: appointmentForm.customer_name,
      customer_phone: appointmentForm.customer_phone || null,
      customer_email: appointmentForm.customer_email || null,
      service: appointmentForm.service,
      date: appointmentForm.date,
      time: appointmentForm.time,
      duration_minutes: duration,
      notes: appointmentForm.notes,
    });

    if (error) throw error;

    await supabase.from('activity').insert({
      detailer_id: user.id,
      message: `Booked ${appointmentForm.customer_name} for ${appointmentForm.service} at ${appointmentForm.time}`,
    });

    setShowAppointmentModal(false);
    setAppointmentForm({
      customer_name: '', customer_phone: '', customer_email: '',
      service: 'Full Detail', date: new Date().toISOString().split('T')[0], time: '10:00', notes: ''
    });

    alert('Appointment booked successfully!');
  } catch (err: any) {
    alert('Error: ' + err.message);
  }
};

  const handleSaveProduct = async () => {
    if (!user || !inventoryForm.name || !inventoryForm.price || !inventoryForm.stock) return alert('Fill all fields');
    const payload = { name: inventoryForm.name, category: inventoryForm.category, price: parseFloat(inventoryForm.price), stock: parseInt(inventoryForm.stock), detailer_id: user.id };
    try {
      const { error } = inventoryForm.id
        ? await supabase.from('inventory').update(payload).eq('id', inventoryForm.id)
        : await supabase.from('inventory').insert(payload);
      if (error) throw error;
      setShowInventoryForm(false);
      setInventoryForm({ id: null, name: '', category: 'Interior', price: '', stock: '' });
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleEditProduct = (p: InventoryItem) => {
    setInventoryForm({ id: p.id, name: p.name, category: p.category, price: p.price.toString(), stock: p.stock.toString() });
    setShowInventoryForm(true);
  };

  const handlePurchase = async (product: InventoryItem) => {
    const stripe = await stripePromise;
    if (!stripe) return alert('Stripe failed');
    try {
      const res = await fetch('/.netlify/functions/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: product.price }),
      });
      const { clientSecret } = await res.json();
      const { error } = await stripe.confirmPayment({
        clientSecret,
        confirmParams: { return_url: `${window.location.origin}/dashboard?tab=inventory&success=true` },
      });
      if (error) alert(error.message ?? 'Payment failed');
      else {
        await supabase.from('inventory').update({ sales: product.sales + 1 }).eq('id', product.id);
        alert('Payment successful!');
      }
    } catch (err: any) {
      alert('Payment error: ' + err.message);
    }
  };

  const handleSaveBusiness = async () => {
    if (!user) return;
    try {
      let logoUrl = user.logo_url;
      if (businessData.logo) {
        const fileName = `${user.id}/${Date.now()}.${businessData.logo.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('logos').upload(fileName, businessData.logo, { upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
        logoUrl = data.publicUrl;
      }
      const { error } = await supabase.from('detailers').update({
        name: businessData.name,
        description: businessData.description,
        image: logoUrl,
      }).eq('profile_id', user.id);
      if (error) throw error;
      setUser(prev => ({ ...prev!, business_name: businessData.name, description: businessData.description, logo_url: logoUrl }));
      alert('Profile saved!');
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    }
  };

  const handleAddService = async () => {
    const name = prompt('Service name:');
    const price = parseFloat(prompt('Price ($):') || '0');
    if (!name || isNaN(price)) return;
    await supabase.from('services').insert({ detailer_id: user!.id, name, price });
  };

  const handleEditService = async (s: Service) => {
    const name = prompt('Service name:', s.name);
    const price = parseFloat(prompt('Price ($):', s.price.toString()) || '0');
    if (!name || isNaN(price)) return;
    await supabase.from('services').update({ name, price }).eq('id', s.id);
  };

  // Save availability to Supabase using upsert
const handleSaveAvailability = async () => {
  if (!user) return;
  try {
    // Use upsert to insert or update each day individually
    for (const day of availability) {
      const { error } = await supabase
        .from('availabilities')
        .upsert(
          {
            detailer_id: user.id,
            day: day.day,
            active: day.active,
            start_time: day.start,
            end_time: day.end
          },
          { onConflict: 'detailer_id,day' }
        );
      if (error) {
        console.error(`Error saving ${day.day}:`, error);
        throw error;
      }
    }
    alert('Availability saved successfully!');
  } catch (err: any) {
    console.error('Save availability error:', err);
    alert('Save failed: ' + err.message);
  }
};

const handleSaveDetailerSettings = async () => {
  if (!user) return;
  try {
    const { error } = await supabase
      .from('detailers')
      .update({
        default_duration_minutes: detailerSettings.default_duration_minutes,
        buffer_minutes: detailerSettings.buffer_minutes,
        max_appointments_per_slot: detailerSettings.max_appointments_per_slot
      })
      .eq('profile_id', user.id);

    if (error) throw error;
    alert('Timing settings saved!');
  } catch (err: any) {
    alert('Failed: ' + err.message);
  }
};

 // Navigate calendar months
  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (calendarMonth === 0) {
        setCalendarMonth(11);
        setCalendarYear(calendarYear - 1);
      } else {
        setCalendarMonth(calendarMonth - 1);
      }
    } else {
      if (calendarMonth === 11) {
        setCalendarMonth(0);
        setCalendarYear(calendarYear + 1);
      } else {
        setCalendarMonth(calendarMonth + 1);
      }
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCalendarMonth(today.getMonth());
    setCalendarYear(today.getFullYear());
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  const renderCalendar = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const cells: React.ReactNode[] = [];

    // empty cells before the 1st
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-day empty" />);
    }

    // actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayAppts = appointments.filter(a => a.date === dateStr);
      const dayOfWeek = getDayOfWeek(dateStr);
      const dayAvail = availability.find(a => a.day === dayOfWeek);
      const isToday = dateStr === todayStr;
      const isPast = new Date(calendarYear, calendarMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isAvailable = dayAvail?.active;

      cells.push(
        <div
          key={dateStr}
          className={`calendar-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${!isAvailable ? 'unavailable' : ''}`}
          onClick={() => {
            if (!isPast && isAvailable) {
              setAppointmentForm({ ...appointmentForm, date: dateStr });
              setShowAppointmentModal(true);
            }
          }}
          style={{ cursor: (!isPast && isAvailable) ? 'pointer' : 'default' }}
        >
          <span className="day-number">{day}</span>
          {dayAppts.length > 0 && (
            <div className="appointments-list">
              {dayAppts.slice(0, 2).map(a => (
                <div
                  key={a.id}
                  className="appointment"
                  title={`${a.customer_name} - ${a.service}\n${a.notes || 'No notes'}`}
                >
                  {to12Hour(a.time)} {a.customer_name.split(' ')[0]}
                </div>
              ))}
              {dayAppts.length > 2 && (
                <div className="more-appointments">+{dayAppts.length - 2} more</div>
              )}
            </div>
          )}
        </div>
      );
    }

    return cells;
  };

  if (loading || !user) return null;

  return (
    <div>
      <style jsx>{`
        :root {
          --accent: #0ea5a4;
          --accent-hover: #0d8b8a;
          --accent-light: rgba(14,165,164,0.1);
          --accent-glass: rgba(14,165,164,0.06);
          --bg: #ffffff;
          --bg-secondary: #f0fdfa;
          --text: #0f172a;
          --text-muted: #64748b;
          --border: rgba(15,23,42,0.08);
          --card: #ffffff;
          --shadow-sm: 0 4px 12px rgba(0,0,0,0.06);
          --shadow-md: 0 10px 30px rgba(0,0,0,0.1);
          --shadow-lg: 0 20px 50px rgba(0,0,0,0.12);
          --radius: 14px;
        }
        html, body {
          height: 100%;
          margin: 0;
          font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
          background: linear-gradient(180deg, #f0fdfa 0%, #ecfdf5 100%);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          color: var(--text);
          line-height: 1.5;
        }
        .wrap { width: min(1200px, 94%); margin: 0 auto; }
        header {
          position: sticky;
          top: 0;
          z-index: 999;
          backdrop-filter: blur(12px);
          background: rgba(255,255,255,0.95);
          border-bottom: 1px solid var(--border);
        }
        .header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 0;
          height: 64px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-mark {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent), var(--accent-hover));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          box-shadow: var(--shadow-sm);
        }
        .brand .title {
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.2px;
        }
        .brand .sub {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: -4px;
        }
        nav.primary {
          display: flex;
          gap: 18px;
          align-items: center;
        }
        nav.primary a {
          color: var(--text);
          text-decoration: none;
          font-weight: 600;
          padding: 8px 12px;
          border-radius: 10px;
          transition: background 0.2s ease;
        }
        nav.primary a:hover {
          background: var(--accent-light);
        }
        .menu-toggle {
          display: none;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 10px;
        }
        .menu-toggle svg {
          width: 24px;
          height: 24px;
        }
        .mobile-menu {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--card);
          z-index: 2000;
          padding: 20px;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }
        .mobile-menu.open {
          display: flex;
        }
        .mobile-menu a {
          color: var(--text);
          text-decoration: none;
          font-weight: 600;
          font-size: 18px;
          padding: 12px;
          border-radius: 10px;
        }
        .mobile-menu a:hover {
          background: var(--accent-light);
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .btn-ghost {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--card);
          font-weight: 700;
          cursor: pointer;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-ghost:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0,0,0,0.1);
        }
        .btn-primary {
          padding: 10px 14px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent), var(--accent-hover));
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(14,165,164,0.25);
          min-height: 44px;
          position: relative;
          overflow: hidden;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(14,165,164,0.35);
        }
        .btn-primary::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: width 0.3s ease, height 0.3s ease;
        }
        .btn-primary:active::after {
          width: 200px;
          height: 200px;
        }
        .account-icon {
          display: none;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
        }
        .user-info img {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid var(--accent);
        }
        .notification-bell {
          position: relative;
          cursor: pointer;
          padding: 8px;
        }
        .notification-bell svg {
          width: 20px;
          height: 20px;
        }
        .notification-badge {
          position: absolute;
          top: 0;
          right: 0;
          background: #ef4444;
          color: white;
          font-size: 10px;
          font-weight: 800;
          padding: 4px;
          border-radius: 50%;
          min-width: 16px;
          text-align: center;
        }
        .dashboard-main {
          padding: 24px 0;
          display: grid;
          grid-template-columns: 250px 1fr;
          gap: 24px;
        }
        .welcome-banner {
          background: linear-gradient(135deg, var(--accent), var(--accent-hover));
          color: white;
          padding: 24px;
          border-radius: 12px;
          margin-bottom: 24px;
          text-align: center;
          box-shadow: var(--shadow-lg);
        }
        .welcome-banner h1 {
          font-family: 'Playfair Display', serif;
          font-size: 32px;
          margin: 0 0 8px;
        }
        .welcome-banner p {
          font-size: 16px;
          opacity: 0.9;
          margin: 0;
        }
        .sidebar {
          background: var(--card);
          border-radius: var(--radius);
          padding: 16px;
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--border);
          position: sticky;
          top: 80px;
          height: fit-content;
        }
        .sidebar h3 {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 16px;
          color: var(--text);
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sidebar-nav button {
          background: none;
          border: none;
          padding: 12px;
          text-align: left;
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }
        .sidebar-nav button.active, .sidebar-nav button:hover {
          background: var(--accent-light);
          color: var(--accent);
          transform: translateX(4px);
        }
        .sidebar-nav svg {
          width: 20px;
          height: 20px;
        }
        .tab-content {
          display: none;
          background: var(--card);
          border-radius: var(--radius);
          padding: 24px;
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--border);
          animation: fadeIn 0.3s ease;
        }
        .tab-content.active {
          display: block;
        }
        .tab-content h2 {
          font-family: 'Playfair Display', serif;
          font-size: 36px;
          margin: 0 0 24px;
          color: var(--text);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .metric-card {
          background: var(--card);
          border-radius: var(--radius);
          padding: 20px;
          box-shadow: var(--shadow-sm);
          text-align: center;
          transition: transform 0.2s ease;
        }
        .metric-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-md);
        }
        .metric-card h4 {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-muted);
          margin: 0 0 8px;
        }
        .metric-card p {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
          color: var(--accent);
        }
        .activity-feed {
          max-height: 400px;
          overflow-y: auto;
          background: var(--bg-secondary);
          border-radius: var(--radius);
          padding: 16px;
        }
        .activity-item {
          padding: 12px;
          border-radius: 8px;
          background: var(--card);
          margin-bottom: 8px;
          box-shadow: var(--shadow-sm);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .leads-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        .leads-controls input, .leads-controls select {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          font-size: 14px;
          flex: 1;
          transition: border-color 0.2s ease;
        }
        .leads-controls input:focus, .leads-controls select:focus {
          border-color: var(--accent);
          box-shadow: 0 0 6px rgba(14,165,164,0.2);
        }
        .leads-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          background: var(--card);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .leads-table th, .leads-table td {
          padding: 14px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .leads-table th {
          font-weight: 700;
          color: var(--text);
          background: var(--accent-light);
        }
        .leads-table tr:nth-child(even) {
          background: var(--bg-secondary);
        }
        .leads-table td {
          color: var(--text-muted);
        }
        .leads-table .actions {
          display: flex;
          gap: 8px;
        }
        .leads-table button {
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        .leads-table button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(255,255,255,0.2);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: width 0.3s ease, height 0.3s ease;
        }
        .leads-table button:active::before {
          width: 100px;
          height: 100px;
        }
        .btn-contact { background: var(--accent); color: white; }
        .btn-accept { background: #22c55e; color: white; }
        .btn-decline { background: #ef4444; color: white; }
        .tooltip {
          position: relative;
        }
        .tooltip:hover::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: var(--text);
          color: white;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 10;
        }
        .calendar-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .calendar-controls button {
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          font-weight: 600;
          cursor: pointer;
        }
        .calendar-view {
          display: flex;
          gap: 8px;
        }
        .calendar-view button {
          background: var(--card);
          border: 1px solid var(--border);
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .calendar-view button.active, .calendar-view button:hover {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
        }
        .calendar {
          background: var(--card);
          border-radius: var(--radius);
          padding: 16px;
          box-shadow: var(--shadow-sm);
        }
        .calendar-header {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          font-weight: 700;
          padding: 12px 0;
          background: var(--accent-light);
          border-radius: 8px;
          margin-bottom: 8px;
        }
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .calendar-day {
          padding: 8px;
          text-align: left;
          border: 1px solid var(--border);
          border-radius: 8px;
          min-height: 100px;
          position: relative;
          background: #f0fdfa;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
        }
        .calendar-day:hover:not(.empty):not(.past):not(.unavailable) {
          background: var(--accent-light);
          border-color: var(--accent);
          transform: scale(1.02);
        }
        .calendar-day.empty {
          background: #f8fafc;
          border-color: transparent;
        }
        .calendar-day.today {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
        }
        .calendar-day.today .day-number {
          color: white;
          font-weight: 800;
        }
        .calendar-day.past {
          background: #e2e8f0;
          opacity: 0.6;
        }
        .calendar-day.unavailable {
          background: #f1f5f9;
          border-style: dashed;
        }
        .calendar-day .day-number {
          font-weight: 700;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .calendar-day .appointments-list {
          flex: 1;
          overflow: hidden;
        }
        .appointment {
          background: var(--accent);
          color: white;
          padding: 4px 6px;
          border-radius: 4px;
          margin: 2px 0;
          font-size: 10px;
          cursor: pointer;
          position: relative;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .calendar-day.today .appointment {
          background: white;
          color: var(--accent);
        }
        .more-appointments {
          font-size: 10px;
          color: var(--text-muted);
          padding: 2px 0;
          font-weight: 600;
        }
        .calendar-day.today .more-appointments {
          color: rgba(255,255,255,0.8);
        }
        .inventory-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        .inventory-controls input {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          font-size: 14px;
          flex: 1;
        }
        .inventory-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          background: var(--card);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .inventory-table th, .inventory-table td {
          padding: 14px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .inventory-table th {
          font-weight: 700;
          color: var(--text);
          background: var(--accent-light);
        }
        .inventory-table tr:nth-child(even) {
          background: var(--bg-secondary);
        }
        .inventory-table td {
          color: var(--text-muted);
        }
        .inventory-form {
          display: none;
          margin-top: 16px;
          padding: 20px;
          background: var(--bg-secondary);
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
        }
        .inventory-form.active {
          display: block;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .form-group input, .form-group select {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          font-size: 14px;
          transition: border-color 0.2s ease;
        }
        .form-group input:focus, .form-group select:focus {
          border-color: var(--accent);
          box-shadow: 0 0 6px rgba(14,165,164,0.2);
        }
        .settings-section {
          display: grid;
          gap: 24px;
        }
        .settings-section h3 {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 12px;
          color: var(--text);
        }
        .settings-form input, .settings-form textarea, .settings-form select {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          font-size: 14px;
        }
        .settings-form textarea {
          min-height: 100px;
          resize: vertical;
        }
        /* Settings Tab Navigation */
        .settings-tabs {
          display: flex;
          gap: 8px;
          padding: 6px;
          background: var(--bg-secondary);
          border-radius: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .settings-tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: none;
          background: transparent;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
          flex: 1;
          min-width: 140px;
          justify-content: center;
        }
        .settings-tab-btn:hover {
          background: var(--card);
          color: var(--text);
        }
        .settings-tab-btn.active {
          background: var(--card);
          color: var(--accent);
          box-shadow: var(--shadow-sm);
        }
        .settings-tab-btn svg {
          width: 18px;
          height: 18px;
        }
        /* Settings Card */
        .settings-card {
          background: var(--card);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          overflow: hidden;
        }
        .settings-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 24px;
          background: linear-gradient(135deg, var(--accent-light), var(--bg-secondary));
          border-bottom: 1px solid var(--border);
        }
        .settings-card-header-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--accent), var(--accent-hover));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        .settings-card-header-icon svg {
          width: 22px;
          height: 22px;
        }
        .settings-card-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
        }
        .settings-card-header p {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--text-muted);
        }
        .settings-card-body {
          padding: 24px;
        }
        /* Form Field Improvements */
        .settings-field {
          margin-bottom: 20px;
        }
        .settings-field:last-child {
          margin-bottom: 0;
        }
        .settings-field label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 8px;
        }
        .settings-field input,
        .settings-field textarea,
        .settings-field select {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid var(--border);
          border-radius: 10px;
          font-size: 14px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          background: var(--card);
        }
        .settings-field input:focus,
        .settings-field textarea:focus,
        .settings-field select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-light);
        }
        .settings-field textarea {
          min-height: 100px;
          resize: vertical;
        }
        .settings-field-hint {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-muted);
        }
        /* File Upload */
        .file-upload-area {
          border: 2px dashed var(--border);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: var(--bg-secondary);
        }
        .file-upload-area:hover {
          border-color: var(--accent);
          background: var(--accent-light);
        }
        .file-upload-area input[type="file"] {
          display: none;
        }
        .file-upload-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          color: var(--text-muted);
        }
        .file-upload-text {
          font-size: 14px;
          color: var(--text-muted);
        }
        .file-upload-text span {
          color: var(--accent);
          font-weight: 600;
        }
        /* Logo Preview */
        .logo-preview {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        .logo-preview img {
          width: 80px;
          height: 80px;
          border-radius: 12px;
          object-fit: cover;
          border: 2px solid var(--border);
        }
        .logo-preview-placeholder {
          width: 80px;
          height: 80px;
          border-radius: 12px;
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          border: 2px dashed var(--border);
        }
        /* Availability Day Card */
        .availability-day-card {
          background: var(--card);
          border: 2px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.2s ease;
        }
        .availability-day-card.active {
          border-color: var(--accent);
          background: var(--accent-light);
        }
        .availability-day-card.inactive {
          opacity: 0.6;
          background: var(--bg-secondary);
        }
        .availability-day-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .availability-day-name {
          font-weight: 700;
          font-size: 15px;
          color: var(--text);
        }
        .availability-toggle {
          position: relative;
          width: 48px;
          height: 26px;
        }
        .availability-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .availability-toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #cbd5e1;
          transition: 0.3s;
          border-radius: 26px;
        }
        .availability-toggle-slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background: white;
          transition: 0.3s;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .availability-toggle input:checked + .availability-toggle-slider {
          background: var(--accent);
        }
        .availability-toggle input:checked + .availability-toggle-slider:before {
          transform: translateX(22px);
        }
        .availability-time-select {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .availability-time-select select {
          flex: 1;
          padding: 10px 12px;
          border: 2px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          background: var(--card);
          cursor: pointer;
        }
        .availability-time-select select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .availability-time-select span {
          color: var(--text-muted);
          font-size: 13px;
        }
        /* Timing Settings Grid */
        .timing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }
        .timing-card {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid var(--border);
        }
        .timing-card-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--accent-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          margin-bottom: 12px;
        }
        .timing-card h4 {
          margin: 0 0 8px;
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
        }
        .timing-card p {
          margin: 0 0 12px;
          font-size: 13px;
          color: var(--text-muted);
        }
        .timing-card select {
          width: 100%;
          padding: 12px;
          border: 2px solid var(--border);
          border-radius: 10px;
          font-size: 14px;
          background: var(--card);
          cursor: pointer;
        }
        /* Service Card */
        .service-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          transition: all 0.2s ease;
        }
        .service-card:hover {
          border-color: var(--accent);
          box-shadow: var(--shadow-sm);
        }
        .service-card-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .service-card-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--accent-light);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }
        .service-card-name {
          font-weight: 600;
          color: var(--text);
          margin-bottom: 2px;
        }
        .service-card-details {
          font-size: 13px;
          color: var(--text-muted);
        }
        .service-card-actions {
          display: flex;
          gap: 8px;
        }
        .btn-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: all 0.2s ease;
        }
        .btn-icon:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-light);
        }
        .btn-icon svg {
          width: 16px;
          height: 16px;
        }
        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }
        .empty-state-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          color: var(--border);
        }
        .empty-state h4 {
          margin: 0 0 8px;
          color: var(--text);
        }
        .empty-state p {
          margin: 0;
          font-size: 14px;
        }
        /* Settings Footer */
        .settings-card-footer {
          padding: 16px 24px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        .availability-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }
        .availability-day {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--card);
          text-align: center;
        }
        .services-list {
          display: grid;
          gap: 12px;
        }
        .service-item {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--card);
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: transform 0.2s ease;
        }
        .service-item:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 3000;
          align-items: center;
          justify-content: center;
        }
        .modal.active {
          display: flex;
        }
        .modal-content {
          background: var(--card);
          border-radius: var(--radius);
          padding: 24px;
          max-width: 500px;
          width: 90%;
          box-shadow: var(--shadow-lg);
          animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-content h3 {
          font-family: 'Playfair Display', serif;
          font-size: 24px;
          margin: 0 0 16px;
          color: var(--text);
        }
        .modal-content .form-group {
          margin-bottom: 16px;
        }
        .modal-content .btn-primary, .modal-content .btn-ghost {
          width: 48%;
          margin: 0 1%;
        }
        footer {
          background: linear-gradient(180deg, #0a2e2d, #051615);
          color: #ffffff;
          padding: 48px 0;
          margin: 0;
          width: 100%;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 24px;
          margin-bottom: 24px;
        }
        .footer-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        .footer-logo .logo-mark {
          width: 48px;
          height: 48px;
        }
        .footer-logo .title {
          font-size: 18px;
          font-weight: 800;
          color: white;
        }
        .footer-col h4 {
          margin: 0 0 12px;
          font-size: 16px;
          font-weight: 800;
          color: white;
        }
        .footer-col a {
          display: block;
          color: var(--text-muted);
          text-decoration: none;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .footer-col a:hover {
          color: var(--accent);
        }
        .newsletter-form {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .newsletter-form input {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: white;
          flex: 1;
          min-height: 44px;
        }
        .newsletter-form input::placeholder {
          color: var(--text-muted);
        }
        .newsletter-form button {
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          min-height: 44px;
        }
        .social-links {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }
        .social-links a {
          color: var(--text-muted);
          font-size: 20px;
          text-decoration: none;
        }
        .social-links a:hover {
          color: var(--accent);
        }
        .footer-bottom {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
          color: var(--text-muted);
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 16px;
        }
        @media (max-width: 900px) {
          .dashboard-main {
            grid-template-columns: 1fr;
          }
          .sidebar {
            position: static;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .sidebar-nav {
            flex-direction: row;
            justify-content: center;
          }
          .sidebar-nav button {
            flex: 1;
            text-align: center;
            padding: 10px;
            font-size: 13px;
          }
          .sidebar-nav svg {
            display: none;
          }
          .header-inner {
            min-height: 56px;
            padding: 10px 0;
          }
          nav.primary {
            display: none;
          }
          .menu-toggle {
            display: inline-flex;
          }
          .btn-ghost#open-account-modal {
            padding: 0;
            width: 48px;
            height: 48px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--card);
          }
          .btn-ghost#open-account-modal span {
            display: none;
          }
          .account-icon {
            display: block;
            width: 20px;
            height: 20px;
          }
          .user-info {
            display: none;
          }
        }
        @media (max-width: 600px) {
          .wrap {
            width: 92%;
          }
          .welcome-banner h1 {
            font-size: 28px;
          }
          .tab-content h2 {
            font-size: 28px;
          }
          .metric-card p {
            font-size: 24px;
          }
          .leads-table, .inventory-table {
            font-size: 13px;
          }
          .leads-table th, .leads-table td, .inventory-table th, .inventory-table td {
            padding: 10px;
          }
          .calendar-grid {
            grid-template-columns: repeat(7, 1fr);
          }
          .calendar-day {
            padding: 8px;
            min-height: 80px;
            font-size: 12px;
          }
          .appointment {
            font-size: 10px;
            padding: 4px;
          }
        }
        @media print {
          .sidebar, header, footer, .leads-controls, .calendar-controls, .inventory-controls, .inventory-form, .modal, .welcome-banner {
            display: none;
          }
          .calendar {
            box-shadow: none;
            border: none;
          }
        }
      `}</style>
      <header>
        <div className="wrap header-inner">
          <div className="brand">
            <div className="logo-mark">DN</div>
            <div>
              <div className="title">Detailing Near You</div>
              <div className="sub">The Detailing Citadel</div>
            </div>
          </div>
          <nav className="primary" aria-label="Primary">
            <Link href="/#services">Services</Link>
            <Link href="/#shop">Shop</Link>
            <Link href="/for-business">For Business</Link>
            <Link href="/#contact">Contact</Link>
          </nav>
          <div className="actions">
            <div className="user-info">
              <img src={user.logo_url || 'https://via.placeholder.com/32?text=User'} alt="User avatar" />
              <span>{user.business_name || 'Detailer'}</span>
            </div>
            <div className="notification-bell" onClick={() => alert('Showing notifications (mock).')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <span className="notification-badge">3</span>
            </div>
            <button className="btn-ghost" id="open-account-modal" onClick={handleLogout}>
              <span>Logout</span>
              <svg className="account-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" stroke="black" strokeWidth="1.6"/>
                <path d="M6 20C6 16.6863 8.68629 14 12 14C15.3137 14 18 16.6863 18 20" stroke="black" strokeWidth="1.6"/>
              </svg>
            </button>
            <button
              className="menu-toggle"
              aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H21M3 12H21M3 18H21" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <nav className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`} aria-label="Mobile menu">
          <Link href="/#services">Services</Link>
          <Link href="/#shop">Shop</Link>
          <Link href="/for-business">For Business</Link>
          <Link href="/#contact">Contact</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="#" onClick={handleLogout}>Logout</Link>
        </nav>
      </header>
      <main className="wrap dashboard-main" role="main">
        <aside className="sidebar">
          <h3>Detailer Dashboard</h3>
          <div className="sidebar-nav">
            {[
              { id: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M9 22V12h6v10"/></svg> },
              { id: 'leads', label: 'Leads', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
              { id: 'schedule', label: 'Schedule', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg> },
              { id: 'inventory', label: 'Inventory', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg> },
              { id: 'settings', label: 'Settings', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19.5v-15M5 12l3-3m2 6h7m-7-6l3 3"/></svg> },
            ].map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </aside>
        <div>
          <div className="welcome-banner">
            <h1>Welcome, {user.business_name || 'Detailer'}!</h1>
            <p>Manage your leads, schedule, and inventory with ease.</p>
          </div>
          {activeTab === 'overview' && (
            <section className="tab-content active" id="overview">
              <h2>Dashboard Overview</h2>
              <div className="metrics-grid">
                <div className="metric-card">
                  <h4>Total Leads</h4>
                  <p>{metrics.leads}</p>
                </div>
                <div className="metric-card">
                  <h4>Upcoming Appointments</h4>
                  <p>{metrics.appointments}</p>
                </div>
                <div className="metric-card">
                  <h4>Monthly Revenue</h4>
                  <p>${metrics.revenue.toFixed(2)}</p>
                </div>
              </div>
              <h3 style={{ fontFamily: 'Playfair Display', fontSize: '20px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
                Recent Activity
              </h3>
              <div className="activity-feed">
                {activity.map((a) => (
                  <div key={a.created_at} className="activity-item">
                    {a.message} <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({new Date(a.created_at).toLocaleString()})</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {activeTab === 'leads' && (
            <section className="tab-content active" id="leads">
              <h2>Manage Leads</h2>
              <div className="leads-controls">
                <input
                  type="text"
                  placeholder="Search by name or email"
                  value={searchLeads}
                  onChange={(e) => setSearchLeads(e.target.value)}
                />
                <select value={filterLeads} onChange={(e) => setFilterLeads(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Booked">Booked</option>
                  <option value="Declined">Declined</option>
                </select>
              </div>
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchLeads || filterLeads
                    ? leads.filter(
                        (l) =>
                          (l.name.toLowerCase().includes(searchLeads.toLowerCase()) ||
                            l.email.toLowerCase().includes(searchLeads.toLowerCase())) &&
                          (filterLeads ? l.status === filterLeads : true)
                      )
                    : leads
                  ).length ? (
                    leads.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td>{l.email}</td>
                        <td>{l.phone}</td>
                        <td>{l.service}</td>
                        <td>{l.status}</td>
                        <td>{l.notes}</td>
                        <td className="actions">
                          <button
                            className="btn-contact tooltip"
                            onClick={() => handleLeadAction(l.id, 'contact')}
                            data-tooltip="Send email"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="16">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                              <path d="M22 6l-10 7L2 6"/>
                            </svg>
                          </button>
                          <button
                            className="btn-accept tooltip"
                            onClick={() => handleLeadAction(l.id, 'accept')}
                            disabled={l.status === 'Booked'}
                            data-tooltip="Create appointment"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="16">
                              <path d="M5 13l4 4L19 7"/>
                            </svg>
                          </button>
                          <button
                            className="btn-decline tooltip"
                            onClick={() => handleLeadAction(l.id, 'decline')}
                            disabled={l.status === 'Declined'}
                            data-tooltip="Decline lead"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="16">
                              <path d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No leads found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}
          {activeTab === 'schedule' && (
            <section className="tab-content active" id="schedule">
              <h2>Schedule</h2>
              <div className="calendar-controls">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn-primary" onClick={() => setShowAppointmentModal(true)}>Add Appointment</button>
                  <button className="btn-ghost" onClick={() => window.print()}>Export to PDF</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn-ghost" onClick={goToToday}>Today</button>
                </div>
              </div>

              {/* Month Navigation */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: '16px 0',
                padding: '12px 16px',
                background: 'var(--accent-light)',
                borderRadius: '10px'
              }}>
                <button
                  onClick={() => navigateMonth('prev')}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  ← Previous
                </button>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
                  {monthNames[calendarMonth]} {calendarYear}
                </h3>
                <button
                  onClick={() => navigateMonth('next')}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Next →
                </button>
              </div>

              {/* Calendar Legend */}
              <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '12px',
                fontSize: '12px',
                color: 'var(--text-muted)'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#0ea5a4', borderRadius: '3px' }}></span>
                  Today
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#f0fdfa', border: '1px solid #0ea5a4', borderRadius: '3px' }}></span>
                  Available
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#f1f5f9', borderRadius: '3px' }}></span>
                  Unavailable
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#e2e8f0', borderRadius: '3px' }}></span>
                  Past
                </span>
              </div>

              <div className="calendar">
                <div className="calendar-header">
                  <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                </div>
                <div className="calendar-grid">{renderCalendar()}</div>
              </div>

              <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Click on an available day to quickly add an appointment
              </p>
            </section>
          )}
          {activeTab === 'inventory' && (
            <section className="tab-content active" id="inventory">
              <h2>Manage Inventory</h2>
              <div className="inventory-controls">
                <input
                  type="text"
                  placeholder="Search products"
                  value={searchInventory}
                  onChange={(e) => setSearchInventory(e.target.value)}
                />
                <button className="btn-primary" onClick={() => setShowInventoryForm(true)}>Add Product</button>
              </div>
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Sales</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchInventory
                    ? inventory.filter((p) => p.name.toLowerCase().includes(searchInventory.toLowerCase()))
                    : inventory
                  ).length ? (
                    inventory.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.category}</td>
                        <td>${p.price.toFixed(2)}</td>
                        <td>{p.stock}</td>
                        <td>{p.sales}</td>
                        <td>
                          <button
                            className="btn-primary tooltip"
                            onClick={() => handleEditProduct(p)}
                            data-tooltip="Edit product"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="16">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            className="btn-primary tooltip"
                            onClick={() => handlePurchase(p)}
                            data-tooltip="Purchase product"
                          >
                            Buy
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No products found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className={`inventory-form ${showInventoryForm ? 'active' : ''}`}>
                <h3>{inventoryForm.id ? 'Edit' : 'Add'} Product</h3>
                <div className="form-group">
                  <label htmlFor="product-name">Product Name</label>
                  <input
                    type="text"
                    id="product-name"
                    value={inventoryForm.name}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="product-category">Category</label>
                  <select
                    id="product-category"
                    value={inventoryForm.category}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                  >
                    <option value="Interior">Interior</option>
                    <option value="Exterior">Exterior</option>
                    <option value="Tools">Tools</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="product-price">Price</label>
                  <input
                    type="number"
                    id="product-price"
                    step="0.01"
                    value={inventoryForm.price}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="product-stock">Stock</label>
                  <input
                    type="number"
                    id="product-stock"
                    value={inventoryForm.stock}
                    onChange={(e) => setInventoryForm({ ...inventoryForm, stock: e.target.value })}
                  />
                </div>
                <button className="btn-primary" onClick={handleSaveProduct}>Save Product</button>
                <button className="btn-ghost" onClick={() => setShowInventoryForm(false)}>Cancel</button>
              </div>
            </section>
          )}
          {activeTab === 'settings' && (
            <section className="tab-content active" id="settings">
              <h2>Settings</h2>
              <div className="settings-section">
                <div>
                  <h3>Business Profile</h3>
                  <div className="form-group">
                    <label htmlFor="business-name">Business Name</label>
                    <input
                      type="text"
                      id="business-name"
                      value={businessData.name}
                      onChange={(e) => setBusinessData({ ...businessData, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="business-desc">Description</label>
                    <textarea
                      id="business-desc"
                      value={businessData.description}
                      onChange={(e) => setBusinessData({ ...businessData, description: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="business-logo">Logo</label>
                    <input
                      type="file"
                      id="business-logo"
                      accept="image/*"
                      onChange={(e) => setBusinessData({ ...businessData, logo: e.target.files?.[0] || null })}
                    />
                  </div>
                  <button className="btn-primary" onClick={handleSaveBusiness}>Save Profile</button>
                </div>
               {/* === AVAILABILITY === */}
              <div>
                <h3 className="text-2xl font-bold mb-6">Availability</h3>
                <div className="availability-grid mb-6">
                  {availability.map((day, index) => {
                    // Generate time options for dropdowns
                    const timeOptions = [];
                    for (let h = 0; h < 24; h++) {
                      for (let m = 0; m < 60; m += 30) {
                        const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        timeOptions.push(time24);
                      }
                    }

                    return (
                      <div key={day.day} className="availability-day p-4 bg-white rounded-lg border">
                        <label className="flex items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={day.active}
                            onChange={(e) => {
                              const updated = [...availability];
                              updated[index] = { ...updated[index], active: e.target.checked };
                              setAvailability(updated);
                            }}
                          />
                          {day.day}
                        </label>
                        <div className="flex items-center gap-2 mt-2">
                          <select
                            value={day.start}
                            onChange={(e) => {
                              const updated = [...availability];
                              updated[index] = { ...updated[index], start: e.target.value };
                              setAvailability(updated);
                            }}
                            disabled={!day.active}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                          >
                            {timeOptions.map(t => (
                              <option key={`start-${t}`} value={t}>{to12Hour(t)}</option>
                            ))}
                          </select>
                          <span>to</span>
                          <select
                            value={day.end}
                            onChange={(e) => {
                              const updated = [...availability];
                              updated[index] = { ...updated[index], end: e.target.value };
                              setAvailability(updated);
                            }}
                            disabled={!day.active}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                          >
                            {timeOptions.map(t => (
                              <option key={`end-${t}`} value={t}>{to12Hour(t)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="btn-primary" onClick={handleSaveAvailability}>
                  Save Availability Hours
                </button>
              </div>

              {/* === NEW: DETAILER TIMING SETTINGS (BUFFER + DEFAULT DURATION) === */}
              <div className="mt-12 p-8 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-2xl border border-teal-200">
                <h3 className="text-2xl font-bold mb-6 text-teal-900">Appointment Timing Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-lg font-medium mb-3">Default Service Duration</label>
                    <select 
                      value={detailerSettings.default_duration_minutes || 180}
                      onChange={(e) => setDetailerSettings({...detailerSettings, default_duration_minutes: Number(e.target.value)})}
                      className="w-full px-5 py-4 text-lg border-2 border-teal-300 rounded-xl focus:ring-4 focus:ring-teal-300"
                    >
                      <option value="120">2 hours</option>
                      <option value="150">2.5 hours</option>
                      <option value="180">3 hours (default)</option>
                      <option value="210">3.5 hours</option>
                      <option value="240">4 hours</option>
                      <option value="300">5 hours</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-lg font-medium mb-3">Buffer Between Appointments</label>
                    <select 
                      value={detailerSettings.buffer_minutes || 30}
                      onChange={(e) => setDetailerSettings({...detailerSettings, buffer_minutes: Number(e.target.value)})}
                      className="w-full px-5 py-4 text-lg border-2 border-teal-300 rounded-xl focus:ring-4 focus:ring-teal-300"
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes (default)</option>
                      <option value="45">45 minutes</option>
                      <option value="60">1 hour</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-lg font-medium mb-3">Max Appointments Per Time Slot</label>
                    <select
                      value={detailerSettings.max_appointments_per_slot || 1}
                      onChange={(e) => setDetailerSettings({...detailerSettings, max_appointments_per_slot: Number(e.target.value)})}
                      className="w-full px-5 py-4 text-lg border-2 border-teal-300 rounded-xl focus:ring-4 focus:ring-teal-300"
                    >
                      <option value="1">1 appointment (solo detailer)</option>
                      <option value="2">2 appointments (2 bays/employees)</option>
                      <option value="3">3 appointments</option>
                      <option value="4">4 appointments</option>
                      <option value="5">5 appointments</option>
                    </select>
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                      Set how many appointments you can handle simultaneously (e.g., if you have multiple bays or employees)
                    </p>
                  </div>
                </div>
                <button
                  className="btn-primary mt-8 text-lg px-8 py-4"
                  onClick={handleSaveDetailerSettings}
                >
                  Save Timing Settings
                </button>
              </div>

              {/* === SERVICES OFFERED (unchanged) === */}
              <div className="mt-12">
                <h3 className="text-2xl font-bold mb-6">Services Offered</h3>
                <div className="services-list space-y-4">
                  {services.map((s) => (
                    <div key={s.id} className="service-item p-4 bg-white rounded-lg border flex justify-between items-center">
                      <span className="text-lg font-medium">{s.name} — ${s.price.toFixed(2)} ({s.duration_minutes || detailerSettings.default_duration_minutes || 180} min)</span>
                      <button className="btn-ghost" onClick={() => handleEditService(s)}>Edit</button>
                    </div>
                  ))}
                </div>
                <button className="btn-primary mt-6" onClick={handleAddService}>Add New Service</button>
              </div>
              </div>
            </section>
          )}
          <div className={`modal ${showAppointmentModal ? 'active' : ''}`}>
            <div className="modal-content">
              <h3>Add Appointment</h3>
              <div className="form-group">
                <label htmlFor="appt-customer">Customer Name</label>
                <input
                  type="text"
                  id="appt-customer"
                  value={appointmentForm.customer_name}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, customer_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
              <label htmlFor="appt-phone">Customer Phone</label>
              <input
                type="tel"
                id="appt-phone"
                value={appointmentForm.customer_phone || ''}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, customer_phone: e.target.value })}
                placeholder="e.g. (555) 123-4567"
              />
            </div>
            <div className="form-group">
              <label htmlFor="appt-email">Customer Email</label>
              <input
                type="email"
                id="appt-email"
                value={appointmentForm.customer_email || ''}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, customer_email: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>
              <div className="form-group">
                <label htmlFor="appt-service">Service</label>
                <select
                  id="appt-service"
                  value={appointmentForm.service}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, service: e.target.value })}
                  required
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="appt-date">Date</label>
                <input
                  type="date"
                  id="appt-date"
                  value={appointmentForm.date}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="appt-time">Time</label>
                {(() => {
                  const availableSlots = getAvailableTimeSlots(appointmentForm.date, appointmentForm.service);
                  const dayOfWeek = getDayOfWeek(appointmentForm.date);
                  const dayAvail = availability.find(a => a.day === dayOfWeek);
                  const serviceDuration = services.find(s => s.name === appointmentForm.service)?.duration_minutes || detailerSettings.default_duration_minutes;

                  if (!dayAvail?.active) {
                    return (
                      <p style={{ color: '#ef4444', fontSize: '14px', padding: '12px', background: '#fef2f2', borderRadius: '8px' }}>
                        You are not available on {dayOfWeek}s. Update your availability in Settings.
                      </p>
                    );
                  }

                  if (availableSlots.length === 0) {
                    return (
                      <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '8px' }}>
                        <p style={{ color: '#f59e0b', fontSize: '14px', margin: 0 }}>
                          No time slots available for this day.
                        </p>
                        <p style={{ color: '#92400e', fontSize: '12px', margin: '8px 0 0 0' }}>
                          Service duration: {Math.floor(serviceDuration / 60)}h {serviceDuration % 60}m + {detailerSettings.buffer_minutes}m buffer
                        </p>
                      </div>
                    );
                  }

                  return (
                    <select
                      id="appt-time"
                      value={appointmentForm.time}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, time: e.target.value })}
                      required
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {availableSlots.map(time24 => (
                        <option key={time24} value={time24}>
                          {to12Hour(time24)}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>
              <div className="form-group">
                <label htmlFor="appt-notes">Notes</label>
                <textarea
                  id="appt-notes"
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn-primary" onClick={handleSaveAppointment}>Save</button>
                <button className="btn-ghost" onClick={() => setShowAppointmentModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer>
        <div className="wrap footer-grid">
          <div className="footer-col">
            <div className="footer-logo">
              <div className="logo-mark">DN</div>
              <div className="title">Detailing Near You</div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
              The capital of car detailing, connecting owners with top-tier detailers nationwide.
            </p>
            <div className="social-links">
              <a href="https://x.com" aria-label="Twitter/X">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.9 2.2h3.3l-7.2 8.3 8.5 11.2h-6.6l-5.2-6.8-5.9 6.8H2.5l7.7-8.8L2.1 2.2h6.8l4.7 6.2 5.3-6.2zm-1.2 17.8h1.8L6.8 4.1H4.9l12.8 15.9z" />
                </svg>
              </a>
              <a href="https://instagram.com" aria-label="Instagram">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c-.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0-2.2c-3.3 0-3.7 0-5 .1-1.3.1-2.2.3-3 .7-.8.4-1.5.9-2.1 1.5-.6.6-1.1 1.3-1.5 2.1-.4.8-.6 1.7-.7 3-.1 1.3-.1 1.7-.1 5s0 3.7.1 5c.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.5 2.1.6.6 1.3 1.1 2.1 1.5.8.4 1.7.6 3 .7 1.3.1 1.7.1 5 .1s3.7 0 5-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.1-1.5.6-.6 1.1-1.3 1.5-2.1.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5s0-3.7-.1-5c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.5-2.1-.6-.6-1.3-1.1-2.1-1.5-.8-.4-1.7-.6-3-.7-1.3-.1-1.7-.1-5-.1zm0 5.8c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm6.2-10.2c-.8 0-1.4.6-1.4 1.4s.6 1.4 1.4 1.4 1.4-.6 1.4-1.4-.6-1.4-1.4-1.4z" />
                </svg>
              </a>
              <a href="https://facebook.com" aria-label="Facebook">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.1c0-6.6-5.4-12-12-12S0 5.5 0 12.1c0 6 4.4 11 10.1 11.9v-8.4h-3V12.1h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.4 0-1.8.7-1.8 1.7v2.1h3.2l-.5 3.5h-2.7V24c5.7-.9 10.1-5.9 10.1-11.9z" />
                </svg>
              </a>
            </div>
          </div>
          <div className="footer-col">
            <h4>For Customers</h4>
            <Link href="/#services">Find a Detailer</Link>
            <Link href="/shop">Shop Products</Link>
            <Link href="/#membership">Membership Benefits</Link>
            <Link href="/#contact">Contact Us</Link>
            <Link href="/#faq">FAQ</Link>
          </div>
          <div className="footer-col">
            <h4>For Detailers</h4>
            <Link href="/for-business">Join Our Platform</Link>            <Link href="/#resources">Resources & Tips</Link>
            <Link href="/#support">Support</Link>
            <Link href="/#dashboard">Dashboard Login</Link>
          </div>
          <div className="footer-col">
            <h4>Stay Connected</h4>
            <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '0 0 12px' }}>
              Subscribe for exclusive offers and detailing tips.
            </p>
            <form
              className="newsletter-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const emailInput = e.currentTarget.querySelector('input[type="email"]') as HTMLInputElement;
                const email = emailInput.value;
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  alert('Please enter a valid email address');
                  return;
                }
                try {
                  const { error } = await supabase.from('subscribers').insert([{ email }]);
                  if (error) {
                    if (error.code === '23505') {
                      alert('This email is already subscribed');
                    } else {
                      console.error('Subscription error:', error);
                      alert('Failed to subscribe. Please try again later.');
                    }
                  } else {
                    alert('Subscribed successfully!');
                    emailInput.value = '';
                  }
                } catch (err) {
                  console.error('Unexpected error:', err);
                  alert('An unexpected error occurred. Please try again.');
                }
              }}
            >
              <input type="email" placeholder="Enter your email" required />
              <button type="submit">Subscribe</button>
            </form>
          </div>
        </div>
        <div className="wrap footer-bottom">
          © {new Date().getFullYear()} Detailing Near You. All rights reserved.{' '}
          <Link href="/#privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Privacy Policy
          </Link>{' '}
          |{' '}
          <Link href="/#terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  );
}
