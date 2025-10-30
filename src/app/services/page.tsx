'use client';
import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { loadStripe } from '@stripe/stripe-js';
import dynamic from 'next/dynamic';
import { ShoppingCart, X, Calendar, MapPin, MessageSquare, Car, Truck, Store, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast, { Toaster } from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';

/* --------------------------------------------------------------
   Leaflet – load **only in the browser** (no top‑level await)
   -------------------------------------------------------------- */
let L: any = null;
if (typeof window !== 'undefined') {
  import('leaflet').then((mod) => {
    L = mod.default;

    // Fix default marker icons
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  });
}

/* React‑Leaflet components – SSR disabled */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup),        { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function Services() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any | null>(null);
  const [detailers, setDetailers] = useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [vehicleType, setVehicleType] = useState<string>('Sedan');
  const [zipCode, setZipCode] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('best');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [mapVisible, setMapVisible] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [cart, setCart] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [accountModalOpen, setAccountModalOpen] = useState<boolean>(false);
  const [activeAccountTab, setActiveAccountTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [exploreModalOpen, setExploreModalOpen] = useState<boolean>(false);
  const [selectedDetailer, setSelectedDetailer] = useState<any | null>(null);
  const [activeExploreTab, setActiveExploreTab] = useState<'services' | 'company' | 'testimonials'>('services');
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState<boolean>(false);
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);
  const [activeVehicleTab, setActiveVehicleTab] = useState<string>('auto');
  const [selectedVehicleType, setSelectedVehicleType] = useState<string | null>(null);
  const [bookingData, setBookingData] = useState<{
    location: string;
    specialRequests: string;
    preferredTime: string;
    serviceMode: 'Mobile' | 'In-Shop';
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    vehicleColor: string;
  }>({
    location: '',
    specialRequests: '',
    preferredTime: '',
    serviceMode: 'Mobile',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
  });
  const [filterRating, setFilterRating] = useState<string>('all');
  const [showBookingChoice, setShowBookingChoice] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState<string>('');

  const sampleServices = [
    { id: '1', name: 'Express Detailing', description: 'Quick wash and wax for a shiny finish.', price: 50, icon: <Car size={20} /> },
    { id: '2', name: 'Interior Detailing', description: 'Deep cleaning of vehicle interior.', price: 100, icon: <Car size={20} /> },
    { id: '3', name: 'Exterior Detailing', description: 'Comprehensive exterior cleaning and polish.', price: 120, icon: <Car size={20} /> },
    { id: '4', name: 'Deluxe Detailing', description: 'Full interior and exterior detailing package.', price: 200, icon: <Car size={20} /> },
    { id: '5', name: 'Exterior Coating', description: 'Ceramic coating for long-lasting protection.', price: 300, icon: <Car size={20} /> },
  ];
  const [services, setServices] = useState<any[]>(sampleServices);

  const vehicleTypes = {
    auto: ['Coupe', 'Sedan', 'SUV', 'Truck'],
    rv: ['Class A', 'Class B', 'Class C'],
    boat: ['Yacht', 'Jet Ski'],
    atv: ['Quad', 'UTV'],
    work: ['Work Truck', 'Van'],
  };

  const getSubtotal = (): number => cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const getTotalItems = (): number => cart.reduce((sum, item) => sum + item.qty, 0);

  const sanitizeCartForCheckout = (rawCart: any[], userId?: string) => {
    return rawCart
      .filter(item => item && typeof item.price === 'number' && item.price > 0)
      .map(item => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: `${item.detailerName || 'Detailing Near You'} • ${item.serviceMode || ''} ${item.location ? `• ${item.location}` : ''}`.trim(),
            metadata: {
              detailer_id: item.detailerId || '',
              service_mode: item.serviceMode || '',
              vehicle_make: item.vehicleMake || '',
              vehicle_model: item.vehicleModel || '',
              vehicle_year: item.vehicleYear || '',
            },
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty ?? 1,
        metadata: {
          cart_item_id: item.id,
          user_id: userId || '',
        },
      }));
  };

  const handlePurchase = async () => {
  if (cart.length === 0) {
    toast.error('Your cart is empty');
    return;
  }

  try {
    const response = await fetch('/api/checkout_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user?.id,
        line_items: cart.map(item => ({
          price_data: {
            currency: 'usd',
            product_data: { name: item.name },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: item.qty,
          metadata: { cart_item_id: item.id },
        })),
      }),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      toast.error(data.error || 'Checkout failed');
    }
  } catch (error) {
    console.error('Checkout error:', error);
    toast.error('Failed to initiate checkout');
  }
};

  useEffect(() => {
    const loadSearchData = async () => {
      const type = searchParams.get('type') || 'Sedan';
      const zip = searchParams.get('zip') || '';
      const make = searchParams.get('make') || '';
      const model = searchParams.get('model') || '';
      const color = searchParams.get('color') || '';
      setVehicleType(type);
      setZipCode(zip);
      setBookingData((prev) => ({
        ...prev,
        vehicleMake: make,
        vehicleModel: model,
        vehicleColor: color,
        location: '',
      }));

      try {
        const savedSearch = JSON.parse(localStorage.getItem('dn_search_v1') || '{}');
        if (savedSearch.detailers && savedSearch.lat && savedSearch.lon) {
          setDetailers(savedSearch.detailers);
          setLat(savedSearch.lat);
          setLon(savedSearch.lon);
        } else {
          setSearchError('No search data found. Please search again.');
        }
        const savedRecentlyViewed = JSON.parse(localStorage.getItem('dn_recently_viewed_v1') || '[]');
        setRecentlyViewed(savedRecentlyViewed);

        if (user) {
          const { data: vehicleData } = await supabase
            .from('vehicles')
            .select('make, model, year, color')
            .eq('user_id', user.id)
            .single();
          if (vehicleData) {
            setBookingData((prev) => ({
              ...prev,
              vehicleMake: vehicleData.make || '',
              vehicleModel: vehicleData.model || '',
              vehicleYear: vehicleData.year || '',
              vehicleColor: vehicleData.color || '',
              location: '',
            }));
          }
        } else {
          const savedVehicle = JSON.parse(localStorage.getItem('dn_vehicle_v1') || '{}');
          if (savedVehicle.make && savedVehicle.model && savedVehicle.year) {
            setBookingData((prev) => ({
              ...prev,
              vehicleMake: savedVehicle.make,
              vehicleModel: savedVehicle.model,
              vehicleYear: savedVehicle.year,
              vehicleColor: savedVehicle.color || '',
              location: '',
            }));
          }
        }
      } catch (e) {
        setSearchError('Error loading search data. Please try again.');
      }
    };
    loadSearchData();
  }, [searchParams, user]);

  useEffect(() => {
    const fetchServices = async () => {
      if (selectedDetailer) {
        try {
          const { data, error } = await supabase
            .from('detailers_services')
            .select('id, name, description, price')
            .eq('detailer_id', selectedDetailer.id);
          if (error) throw error;
          setServices(data.length > 0 ? data.map((s: any) => ({ ...s, icon: <Car size={20} /> })) : sampleServices);
        } catch (e) {
          setServices(sampleServices);
        }
      }
    };
    fetchServices();
  }, [selectedDetailer]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        setUser(null);
        setWishlist([]);
      } else {
        setUser(user);
        if (user) {
          const { data: cartData, error: cartError } = await supabase
            .from('cart')
            .select('*, products(*)')
            .eq('user_id', user.id);
          if (cartError) {
            console.error('Error fetching cart:', cartError);
          } else {
            setCart(cartData.map((item: any) => ({ ...item.products, qty: item.quantity })));
          }
          const { data: wishlistData, error: wishlistError } = await supabase
            .from('wishlist')
            .select('products(*)')
            .eq('user_id', user.id);
          if (wishlistError) {
            setWishlist([]);
          } else {
            setWishlist(wishlistData.map((item: any) => item.products));
          }
        } else {
          try {
            const savedCart = JSON.parse(localStorage.getItem('dn_cart_v1') || '[]');
            setCart(savedCart);
          } catch (e) {
            console.error('Error reading cart from localStorage:', e);
          }
        }
      }
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        supabase
          .from('wishlist')
          .select('products(*)')
          .eq('user_id', session.user.id)
          .then(({ data, error }) => {
            if (error) {
              setWishlist([]);
            } else {
              setWishlist(data.map((item: any) => item.products));
            }
          });
      } else {
        setWishlist([]);
      }
    });

    return () => {
      authListener.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
  const saveCart = async () => {
    if (user) {
      try {
        // Clear old cart
        await supabase.from('service_cart').delete().eq('user_id', user.id);

        const cartItems = cart.map((item) => ({
          user_id: user.id,
          service_id: item.id,
          detailer_id: item.detailerId || null,
          service_mode: item.serviceMode || null,
          location: item.location || null,
          preferred_time: item.preferredTime || null,
          special_requests: item.specialRequests || null,
          vehicle_make: item.vehicleMake || null,
          vehicle_model: item.vehicleModel || null,
          vehicle_year: item.vehicleYear || null,
          vehicle_color: item.vehicleColor || null,
          quantity: item.qty,
          price: item.price,
          updated_at: new Date().toISOString(),
        }));

        if (cartItems.length > 0) {
          const { error } = await supabase
            .from('service_cart')
            .insert(cartItems);

          if (error) throw error;
        }
      } catch (e) {
        console.error('Error saving service cart:', e);
      }
    } else {
      localStorage.setItem('dn_cart_v1', JSON.stringify(cart));
    }
  };

  const timeout = setTimeout(saveCart, 500);
  return () => clearTimeout(timeout);
}, [cart, user]);

  useEffect(() => {
    if (selectedDetailer) {
      const updatedRecentlyViewed = [
        selectedDetailer,
        ...recentlyViewed.filter((d) => d.id !== selectedDetailer.id),
      ].slice(0, 5);
      setRecentlyViewed(updatedRecentlyViewed);
      localStorage.setItem('dn_recently_viewed_v1', JSON.stringify(updatedRecentlyViewed));
    }
  }, [selectedDetailer]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      setSearchError('Please enter a valid 5-digit ZIP code');
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zipCode,
          vehicleType: activeVehicleTab,
          vehicleMake: bookingData.vehicleMake,
          vehicleModel: bookingData.vehicleModel,
          vehicleColor: bookingData.vehicleColor,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to search detailers');
      }
      if (data.error) {
        setSearchError(data.error);
        setDetailers([]);
        setLat(null);
        setLon(null);
        return;
      }

      // Sort detailers
      let sortedDetailers = [...data.detailers];
      if (sortBy === 'rating') {
        sortedDetailers.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      } else if (sortBy === 'distance' && data.lat && data.lon) {
        sortedDetailers.sort((a, b) => {
          const distA = Math.hypot(a.lat - data.lat, a.lon - data.lon);
          const distB = Math.hypot(b.lat - data.lat, b.lon - data.lon);
          return distA - distB;
        });
      }

      setDetailers(sortedDetailers);
      setLat(data.lat);
      setLon(data.lon);

      localStorage.setItem('dn_search_v1', JSON.stringify({
        vehicleType: activeVehicleTab,
        zipCode,
        vehicleMake: bookingData.vehicleMake,
        vehicleModel: bookingData.vehicleModel,
        vehicleColor: bookingData.vehicleColor,
        lat: data.lat,
        lon: data.lon,
        detailers: sortedDetailers,
      }));
    } catch (err: any) {
      setSearchError(`Failed to find detailers: ${err.message || 'Unknown error'}`);
      setDetailers([]);
      setLat(null);
      setLon(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleVehicleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const formData = {
    make: (e.currentTarget.elements.namedItem('modal-make') as HTMLInputElement)?.value.trim(),
    model: (e.currentTarget.elements.namedItem('modal-model') as HTMLInputElement)?.value.trim(),
    color: (e.currentTarget.elements.namedItem('modal-color') as HTMLInputElement)?.value.trim(),
    zip: (e.currentTarget.elements.namedItem('modal-zip') as HTMLInputElement)?.value.trim(),
  };

  // Always update UI
  setBookingData((prev) => ({
    ...prev,
    vehicleMake: formData.make,
    vehicleModel: formData.model,
    vehicleColor: formData.color,
  }));
  setZipCode(formData.zip);
  setVehicleType(activeVehicleTab);

  // Only try to save to DB if:
  // 1. User is logged in
  // 2. We have vehicle_type (from tab or selection)
  if (user && (selectedVehicleType || activeVehicleTab)) {
    try {
      const payload: any = {
        user_id: user.id,
        make: formData.make || null,
        model: formData.model || null,
        color: formData.color || null,
        zip_code: formData.zip || null,
        year: bookingData.vehicleYear || null,
        vehicle_type: selectedVehicleType || activeVehicleTab,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('vehicles')
        .upsert(payload, { onConflict: 'user_id' });

      // SILENTLY ignore errors — no toast!
      if (error) {
        console.warn('Vehicle save skipped (not critical):', error.message);
        // No toast.error() here
      }
    } catch (e) {
      console.warn('Vehicle save failed silently:', e);
      // No toast
    }
  } else {
    // Guest or no vehicle_type → save to localStorage only
    localStorage.setItem('dn_vehicle_v1', JSON.stringify({
      make: formData.make,
      model: formData.model,
      year: bookingData.vehicleYear || '',
      color: formData.color,
      vehicle_type: selectedVehicleType || activeVehicleTab,
      zip_code: formData.zip,
    }));
  }

  // Always search
  const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
  await handleSearch(fakeEvent);
};
  const handleBookService = async (serviceName: string, detailerId?: string) => {
    const detailer = detailers.find((d) => d.id === detailerId);
    if (!detailer) {
      toast.error('Invalid detailer selected.');
      return;
    }
    setSelectedDetailer(detailer);
    setSelectedService(services.find(s => s.name === serviceName) || null);
    setBookingModalOpen(true);
    setBookingData((prev) => ({
      ...prev,
      location: '',
      serviceMode: detailer.has_shop ? 'In-Shop' : 'Mobile',
    }));
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetailer) {
      toast.error('No detailer selected.');
      return;
    }
    if (!bookingData.vehicleMake || !bookingData.vehicleModel || !bookingData.vehicleYear || (bookingData.serviceMode === 'Mobile' && !bookingData.location)) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (!/^\d{4}$/.test(bookingData.vehicleYear)) {
      toast.error('Please enter a valid 4-digit year.');
      return;
    }
    setBookingLoading(true);
    try {
      if (user) {
        await supabase.from('vehicles').upsert({
          user_id: user.id,
          make: bookingData.vehicleMake,
          model: bookingData.vehicleModel,
          year: bookingData.vehicleYear,
          color: bookingData.vehicleColor || null,
          vehicle_type: selectedVehicleType || activeVehicleTab,
          location_zip: zipCode,
          updated_at: new Date().toISOString(),
        });
      } else {
        localStorage.setItem('dn_vehicle_v1', JSON.stringify({
          make: bookingData.vehicleMake,
          model: bookingData.vehicleModel,
          year: bookingData.vehicleYear,
          color: bookingData.vehicleColor || null,
          vehicle_type: selectedVehicleType || activeVehicleTab,
          zip_code: zipCode,
        }));
      }

      const service = selectedService || {
        id: `temp-${Date.now()}`,
        name: 'Custom Service',
        price: 100,
      };
      const newCartItem = {
        ...service,
        qty: 1,
        detailerId: selectedDetailer.id,
        detailerName: selectedDetailer.name,
        serviceMode: bookingData.serviceMode,
        location: bookingData.serviceMode === 'Mobile' ? bookingData.location : selectedDetailer.shop_address || null,
        preferredTime: bookingData.preferredTime || null,
        specialRequests: bookingData.specialRequests || null,
        vehicleMake: bookingData.vehicleMake,
        vehicleModel: bookingData.vehicleModel,
        vehicleYear: bookingData.vehicleYear,
        vehicleColor: bookingData.vehicleColor || null,
      };
      setCart([...cart, newCartItem]);
      toast.success(`${service.name} added to cart!`);
      setBookingModalOpen(false);
      setExploreModalOpen(false);
      setShowBookingChoice(true);
    } catch (e: any) {
      toast.error(`Failed to complete booking: ${e.message || 'Unknown error'}`);
    } finally {
      setBookingLoading(false);
    }
  };

  const filteredDetailers = detailers
    .filter((d) => {
      if (filterRating !== 'all' && (d.rating || 0) < parseInt(filterRating)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'distance' && lat && lon) {
        const distA = Math.hypot(a.lat - lat, a.lon - lon);
        const distB = Math.hypot(b.lat - lat, b.lon - lon);
        return distA - distB;
      }
      return 0;
    });

  const handleAuth = async () => {
    if (activeAccountTab === 'signup' && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      if (activeAccountTab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast.error(error.message);
        else {
          toast.success('Signed in successfully!');
          setAccountModalOpen(false);
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) toast.error(error.message);
        else if (data.user) {
          toast.success('Check your email to confirm!');
          setAccountModalOpen(false);
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        } else toast.error('Sign-up failed. Please try again.');
      }
    } catch {
      toast.error('An unexpected error occurred. Please try again.');
    }
  };

  const updateCartQty = async (id: string, action: 'increase' | 'decrease') => {
    let newCart = [...cart];
    const item = newCart.find((item) => item.id === id);
    if (item) {
      if (action === 'increase') {
        item.qty += 1;
      } else if (action === 'decrease') {
        item.qty -= 1;
        if (item.qty === 0) {
          newCart = newCart.filter((item) => item.id !== id);
        }
      }
      setCart(newCart);
      if (user) {
        try {
          if (item.qty === 0) {
            await supabase.from('cart').delete().eq('user_id', user.id).eq('product_id', id);
          } else {
            await supabase
              .from('cart')
              .upsert({ user_id: user.id, product_id: id, quantity: item.qty });
          }
        } catch (e) {
          toast.error('Failed to update cart');
        }
      }
    }
  };

  const clearCart = async () => {
    setCart([]);
    if (user) {
      try {
        await supabase.from('cart').delete().eq('user_id', user.id);
      } catch (e) {
        toast.error('Failed to clear cart');
      }
    }
  };

  const handleSubscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = newsletterEmail;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    try {
      const { error } = await supabase.from('subscribers').insert([{ email }]);
      if (error) {
        if (error.code === '23505') toast.error('This email is already subscribed');
        else toast.error('Failed to subscribe. Please try again later.');
      } else {
        toast.success('Subscribed successfully!');
        setNewsletterEmail('');
      }
    } catch {
      toast.error('An unexpected error occurred. Please try again.');
    }
  };

  const handleReset = () => {
    setVehicleType('Sedan');
    setZipCode('');
    setBookingData({
      location: '',
      specialRequests: '',
      preferredTime: '',
      serviceMode: 'Mobile',
      vehicleMake: '',
      vehicleModel: '',
      vehicleYear: '',
      vehicleColor: '',
    });
    setSearchError(null);
    setSelectedVehicleType(null);
    localStorage.removeItem('dn_search_v1');
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <style jsx global>{`
        :root {
          --bg-1: #0f1724;
          --bg-2: #071018;
          --card: #ffffff;
          --muted: #9aa3ae;
          --accent: #0ea5a4;
          --accent-2: #063c3b;
          --gold: #d4af37;
          --radius: 14px;
          --shadow-lg: 0 20px 50px rgba(2,6,23,0.45);
          --shadow-sm: 0 10px 30px rgba(2,6,23,0.18);
        }
        body {
          background: linear-gradient(180deg, #f7fafc 0%, #eff6f9 100%);
          color: #0b1220;
          font-family: Inter, sans-serif;
        }
        .wrap { width: min(1200px, 94%); margin: 0 auto; }
        header {
          position: sticky;
          top: 0;
          z-index: 999;
          backdrop-filter: blur(8px);
          background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.7));
          border-bottom: 1px solid rgba(12,18,26,0.05);
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
          background: linear-gradient(135deg, var(--accent), #027373);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          box-shadow: var(--shadow-sm);
        }
        .brand .title {
          font-family: 'Playfair Display', serif;
          font-weight: 800;
          font-size: 18px;
        }
        .brand .sub {
          font-size: 12px;
          color: var(--muted);
          margin-top: -4px;
        }
        nav.primary {
          display: flex;
          gap: 18px;
          align-items: center;
        }
        nav.primary a {
          color: #0b1220;
          text-decoration: none;
          font-weight: 600;
          padding: 8px 10px;
          border-radius: 10px;
        }
        nav.primary a:hover {
          background: rgba(12,18,26,0.03);
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
          background: white;
          z-index: 2000;
          padding: 24px;
          flex-direction: column;
          gap: 20px;
          overflow-y: auto;
        }
        .mobile-menu.open {
          display: flex;
        }
        .mobile-menu a {
          color: #0b1220;
          text-decoration: none;
          font-weight: 600;
          font-size: 18px;
          padding: 12px;
          border-radius: 10px;
        }
        .mobile-menu a:hover {
          background: rgba(12,18,26,0.03);
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .btn-ghost {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(12,18,26,0.06);
          background: white;
          color: #0b1220;
          font-weight: 700;
          cursor: pointer;
          min-height: 44px;
        }
        .btn-primary {
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          min-height: 44px;
          transition: transform 0.18s ease;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          background: var(--accent) !important;
          color: white !important;
        }
        .btn-explore {
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--accent-2);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          min-height: 44px;
          transition: transform 0.18s ease;
        }
        .btn-explore:hover {
          transform: translateY(-2px);
          background: var(--accent-2) !important;
          color: white !important;
        }
        .btn-black {
          padding: 10px 14px;
          border-radius: 10px;
          background: #0b1220;
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          min-height: 44px;
        }
        .cart-btn {
          position: relative;
          width: 48px;
          height: 48px;
          border-radius: 12px;
          border: 1px solid rgba(12,18,26,0.06);
          background: white;
          cursor: pointer;
        }
        .cart-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          font-weight: 800;
          padding: 6px 8px;
          border-radius: 999px;
          font-size: 12px;
        }
        .search-section {
          padding: 48px 0;
          text-align: center;
        }
        .search-title {
          font-family: 'Playfair Display', serif;
          font-size: 42px;
          margin: 0 0 16px;
          color: var(--bg-2);
          font-weight: 800;
        }
        .search-subtitle {
          color: var(--muted);
          font-size: 18px;
          margin: 0 0 32px;
          max-width: 700px;
          margin-left: auto;
          margin-right: auto;
        }
        .search-container {
          background: var(--card);
          border-radius: var(--radius);
          width: min(750px, 90%);
          padding: 24px;
          box-shadow: var(--shadow-lg);
          border: 1px solid rgba(12,18,26,0.04);
          margin: 0 auto;
        }
        .tabs {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin: 20px 0;
          border-bottom: 1px solid rgba(12,18,26,0.06);
        }
        .tab {
          padding: 10px 20px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          color: var(--muted);
          border-bottom: 3px solid transparent;
          transition: all 0.2s ease;
        }
        .tab.active {
          border-color: var(--accent);
          color: var(--accent);
        }
        .vehicle-grid {
          display: none;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 16px;
          margin: 20px 0;
        }
        .vehicle-grid.active {
          display: grid;
        }
        .vehicle-card {
          background: linear-gradient(180deg, #ffffff, #fbfdff);
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 14px;
          text-align: center;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: var(--shadow-sm);
        }
        .vehicle-card.selected {
          border: 2px solid var(--accent);
          background: rgba(14,165,164,0.1);
        }
        .vehicle-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(2,6,23,0.2);
        }
        .vehicle-card img {
          max-width: 100%;
          border-radius: 8px;
          margin-bottom: 8px;
          background: #eef6ff;
        }
        .vehicle-card p {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--bg-2);
        }
        .form-row {
          display: flex;
          gap: 24px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .form-row > div {
          flex: 1;
          min-width: 150px;
        }
        .form-row label {
          display: block;
          margin-bottom: 6px;
          font-weight: 600;
          font-size: 14px;
          color: var(--bg-2);
        }
        .form-row input {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(12,18,26,0.15);
          background: rgba(247,250,252,0.8);
          font-size: 14px;
          min-height: 44px;
        }
        .form-row input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 8px rgba(14,165,164,0.3);
        }
        .search-error {
          color: #ef4444;
          font-size: 13px;
          margin-top: 8px;
          text-align: center;
          width: 100%;
        }
        .map-section {
          margin: 24px 0;
          text-align: center;
        }
        .map-toggle {
          padding: 10px 20px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          margin-bottom: 16px;
          min-height: 44px;
          transition: transform 0.18s ease;
        }
        .map-toggle:hover {
          transform: translateY(-2px);
        }
        .map-container {
          height: 400px;
          border-radius: 12px;
          box-shadow: var(--shadow-sm);
        }
        .map-error {
          color: #ef4444;
          font-size: 14px;
          margin-top: 8px;
        }
        .detailers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 18px;
          padding: 24px 0;
        }
        .filter-bar {
          padding: 16px 0;
          border-bottom: 1px solid rgba(12,18,26,0.06);
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: var(--muted);
          overflow-x: auto;
          white-space: nowrap;
        }
        .filter-bar select {
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(12,18,26,0.15);
          background: white;
          font-size: 13px;
          min-width: 80px;
        }
        .recently-viewed {
          padding: 24px 0;
        }
        .recently-viewed h2 {
          font-family: 'Playfair Display', serif;
          font-size: 28px;
          color: var(--bg-2);
          margin-bottom: 16px;
        }
        .recently-viewed-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 16px;
        }
        .recently-viewed-card {
          background: white;
          border-radius: 10px;
          padding: 12px;
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.04);
          text-align: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          cursor: pointer;
        }
        .recently-viewed-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(2,6,23,0.2);
        }
        .recently-viewed-logo {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--accent), #027373);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 24px;
          margin: 0 auto 8px;
        }
        .recently-viewed-card h4 {
          margin: 0 0 8px;
          font-size: 14px;
          font-weight: 700;
          font-family: 'Playfair Display', serif;
        }
        .recently-viewed-services {
          font-size: 12px;
          color: var(--muted);
          margin: 0;
          line-height: 1.4;
        }
        .detailer-card {
          background: white;
          border-radius: 14px;
          padding: 18px;
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.04);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .detailer-card img {
          width: 100%;
          height: 140px;
          object-fit: cover;
          border-radius: 10px;
          background: #eef6ff;
        }
        .detailer-card h4 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          font-family: 'Playfair Display', serif;
        }
        .detailer-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--muted);
          font-size: 14px;
        }
        .rating {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .stars {
          color: var(--gold);
          font-size: 14px;
        }
        .services-list {
          color: var(--muted);
          font-size: 14px;
          margin: 8px 0;
        }
        .review-snippet {
          font-size: 13px;
          color: var(--bg-2);
          font-style: italic;
          margin: 8px 0;
          border-left: 3px solid var(--accent);
          padding-left: 8px;
        }
        .detailer-cta {
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          min-height: 44px;
          transition: transform 0.18s ease;
          display: inline-block;
        }
        .detailer-cta:hover {
          transform: translateY(-2px);
          background: var(--accent) !important;
          color: white !important;
        }
        .badge {
          display: inline-block;
          background: var(--accent-2);
          color: white;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }
        .trust-banner {
          text-align: center;
          padding: 24px 0;
          background: linear-gradient(90deg, #f0f8ff, #f7fff9);
          border-radius: 12px;
          margin: 24px 0;
        }
        .trust-banner p {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: var(--bg-2);
        }
        .cart-panel {
          position: fixed;
          right: 26px;
          top: 92px;
          width: 420px;
          max-width: calc(100% - 32px);
          height: calc(100vh - 128px);
          background: linear-gradient(180deg, #ffffff, #fbfdff);
          border-radius: 14px;
          box-shadow: 0 40px 100px rgba(2,6,23,0.35);
          overflow: auto;
          z-index: 1500;
          border: 1px solid rgba(12,18,26,0.06);
        }
        .cart-panel header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px;
          border-bottom: 1px solid rgba(12,18,26,0.04);
          font-weight: 800;
          font-family: 'Playfair Display', serif;
        }
        .cart-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .cart-item {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .cart-thumb {
          width: 64px;
          height: 56px;
          border-radius: 8px;
          background: linear-gradient(135deg, #eef2ff, #fff);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
        }
        .qty-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .qty-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(12,18,26,0.06);
          background: white;
          cursor: pointer;
          font-weight: 700;
          transition: transform 0.18s ease;
        }
        .qty-btn:hover {
          transform: translateY(-2px);
        }
        .account-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1800;
        }
        .account-modal-content {
          background: var(--card);
          border-radius: var(--radius);
          width: min(500px, 90%);
          padding: 24px;
          box-shadow: var(--shadow-lg);
          border: 1px solid rgba(12,18,26,0.04);
        }
        .account-modal-content h2 {
          margin: 0 0 16px;
          text-align: center;
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          font-size: 28px;
          color: var(--bg-2);
        }
        .account-tabs {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin: 20px 0;
          border-bottom: 1px solid rgba(12,18,26,0.06);
        }
        .account-tab {
          padding: 10px 20px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          color: var(--muted);
          border-bottom: 3px solid transparent;
          transition: all 0.2s ease;
        }
        .account-tab.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(14,165,164,0.1);
        }
        .account-form {
          display: none;
          flex-direction: column;
          gap: 16px;
        }
        .account-form.active {
          display: flex;
        }
        .account-form input {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(12,18,26,0.15);
          background: rgba(247,250,252,0.8);
          font-size: 14px;
          min-height: 44px;
        }
        .explore-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1800;
        }
        .explore-modal-content {
          background: var(--card);
          border-radius: var(--radius);
          width: min(800px, 90%);
          max-height: 80vh;
          display: flex;
          overflow: hidden;
          box-shadow: var(--shadow-lg);
          border: 1px solid rgba(12,18,26,0.04);
        }
        .explore-tabs {
          width: 200px;
          background: #f7fafc;
          border-right: 1px solid rgba(12,18,26,0.06);
          display: flex;
          flex-direction: column;
          padding: 16px;
        }
        .explore-tab {
          padding: 12px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          color: var(--muted);
          border-left: 3px solid transparent;
          border-radius: 8px;
          transition: all 0.2s ease;
        }
        .explore-tab.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(14,165,164,0.1);
        }
        .explore-tab:hover {
          background: rgba(14,165,164,0.05);
        }
        .explore-content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }
        .service-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }
        .service-card {
          background: white;
          border-radius: 10px;
          padding: 16px;
          box-shadow: var(--shadow-sm);
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .service-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(2,6,23,0.2);
        }
        .service-card h5 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          font-family: 'Playfair Display', serif;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .service-card p {
          margin: 0;
          font-size: 13px;
          color: var(--muted);
        }
        .service-detail {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .service-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .company-info, .testimonials {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .testimonial-item {
          background: #f7fafc;
          padding: 12px;
          border-radius: 10px;
          display: flex;
          gap: 12px;
        }
        .testimonial-img {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          object-fit: cover;
        }
        .booking-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1800;
        }
        .booking-modal-content {
          background: var(--card);
          border-radius: var(--radius);
          width: min(600px, 90%);
          padding: 24px;
          box-shadow: var(--shadow-lg);
          border: 1px solid rgba(12,18,26,0.04);
        }
        .booking-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .booking-form label {
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .booking-form input, .booking-form select, .booking-form textarea {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(12,18,26,0.15);
          background: rgba(247,250,252,0.8);
          font-size: 14px;
          min-height: 44px;
        }
        .booking-form textarea {
          min-height: 100px;
          resize: vertical;
        }
        footer {
          background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
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
        .footer-logo .title {
          font-size: 18px;
          font-weight: 800;
          font-family: 'Playfair Display', serif;
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
          color: var(--muted);
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
        }
        .newsletter-form input::placeholder {
          color: var(--muted);
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
          transition: transform 0.18s ease;
        }
        .newsletter-form button:hover {
          transform: translateY(-2px);
        }
        .social-links {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }
        .social-links a {
          color: var(--muted);
          font-size: 20px;
        }
        .social-links a:hover {
          color: var(--accent);
        }
        .footer-bottom {
          text-align: center;
          margin-top: 24px;
          font-size: 13px;
          color: var(--muted);
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 16px;
        }
        .cancel-btn-lift {
          transition: transform 0.18s ease !important;
          background: #0b1220 !important;
          color: white !important;
          border: none !important;
        }
        .cancel-btn-lift:hover {
          transform: translateY(-2px) !important;
          background: #0b1220 !important;
          color: white !important;
          border: none !important;
        }
        .vehicle-cancel-btn {
          background: #0b1220 !important;
          color: white !important;
          border: none !important;
          transition: transform 0.18s ease !important;
        }
        .vehicle-cancel-btn:hover {
          background: #0b1220 !important;
          transform: translateY(-2px) !important;
        }
        .clear-filters-btn {
          transition: transform 0.18s ease !important;
          background: white !important;
          color: #0b1220 !important;
          border: 1px solid rgba(12,18,26,0.06) !important;
        }
        .clear-filters-btn:hover {
          transform: translateY(-2px) !important;
          background: white !important;
          color: #0b1220 !important;
          border-color: rgba(12,18,26,0.06) !important;
        }
        .close-x-btn {
          background: transparent !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          transition: none !important;
          padding: 0 !important;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .close-x-btn:hover {
          background: transparent !important;
          transform: none !important;
        }
        .close-x-btn:focus {
          outline: none !important;
        }
        @media (max-width: 900px) {
          .search-container { padding: 16px; }
          .detailers-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
          .recently-viewed-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
          .recently-viewed-card { padding: 10px; }
          .recently-viewed-logo { width: 60px; height: 60px; font-size: 20px; }
          .map-container { height: 300px; }
          .header-inner { min-height: 56px; padding: 10px 0; }
          nav.primary { display: none; }
          .menu-toggle { display: inline-flex; }
          .cart-panel { right: 12px; left: 12px; width: auto; top: 72px; height: calc(100vh - 88px); border-radius: 12px; }
          .account-modal-content { width: 95%; padding: 16px; }
          .explore-modal-content { flex-direction: column; max-height: 90vh; }
          .explore-tabs { width: 100%; flex-direction: row; border-right: none; border-bottom: 1px solid rgba(12,18,26,0.06); overflow-x: auto; }
          .explore-tab { flex: 1; text-align: center; }
          .booking-modal-content { width: 95%; padding: 16px; }
          .service-grid { grid-template-columns: 1fr; }
          .vehicle-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
          .form-row { gap: 16px; }
          .filter-bar { justify-content: flex-start; overflow-x: auto; padding: 12px 0; }
        }
        @media (max-width: 600px) {
          .wrap { width: 92%; }
          .detailers-grid { grid-template-columns: 1fr; }
          .recently-viewed-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
          .recently-viewed-card { padding: 8px; }
          .recently-viewed-logo { width: 50px; height: 50px; font-size: 18px; }
          .recently-viewed-services { font-size: 11px; }
          .detailer-card { padding: 14px; }
          .detailer-card h4 { font-size: 16px; }
          .detailer-meta, .services-list, .review-snippet { font-size: 13px; }
          .detailer-cta, .btn-explore, .btn-black { padding: 8px 10px; }
          .search-title { font-size: 32px; }
          .search-subtitle { font-size: 16px; }
          .map-container { height: 250px; }
          .explore-modal-content { width: 99%; }
          .service-card h5 { font-size: 14px; }
          .service-card p { font-size: 12px; }
          .testimonial-img { width: 60px; height: 60px; }
          .form-row { flex-direction: column; gap: 12px; }
          .form-row > div { min-width: 100%; }
          .filter-bar select { min-width: 70px; font-size: 12px; }
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
            <Link href="/#for-business">For Business</Link>
            <Link href="/#contact">Contact</Link>
          </nav>
          <div className="actions">
            <Button
              className="btn-ghost"
              onClick={() => user ? router.push('/dashboard') : setAccountModalOpen(true)}
            >
              {user ? 'Dashboard' : 'Account'}
            </Button>
            <Button className="cart-btn" onClick={() => setCartOpen(!cartOpen)}>
              <ShoppingCart className="h-5 w-5" />
              <div className="cart-badge" style={{ display: getTotalItems() > 0 ? 'block' : 'none' }}>
                {getTotalItems()}
              </div>
            </Button>
            <Button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <nav className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`} aria-label="Mobile menu">
          <Link href="/#services">Services</Link>
          <Link href="/#shop">Shop</Link>
          <Link href="/#for-business">For Business</Link>
          <Link href="/#contact">Contact</Link>
          <Link href="#" onClick={() => {
            user ? router.push('/dashboard') : setAccountModalOpen(true);
            setMobileMenuOpen(false);
          }}>
            {user ? 'Dashboard' : 'Account'}
          </Link>
        </nav>
      </header>
      <main className="wrap" role="main">
        <section className="search-section">
          <h1 className="search-title">Find a Detailer</h1>
          <p className="search-subtitle">Select your vehicle type and enter your ZIP code to find top detailers in your area.</p>
          <div className="search-container">
            <h2>Select Your Vehicle</h2>
            <div className="tabs">
              {['auto', 'rv', 'boat', 'atv', 'work'].map((tab) => (
                <div
                  key={tab}
                  className={`tab ${activeVehicleTab === tab ? 'active' : ''}`}
                  onClick={() => {
                    setActiveVehicleTab(tab);
                    setSelectedVehicleType(null);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveVehicleTab(tab) && setSelectedVehicleType(null)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </div>
              ))}
            </div>
            {Object.keys(vehicleTypes).map((tab) => (
              <div
                key={tab}
                className={`vehicle-grid ${activeVehicleTab === tab ? 'active' : ''}`}
                id={tab}
              >
                {vehicleTypes[tab as keyof typeof vehicleTypes].map((type) => (
                  <div
                    key={type}
                    className={`vehicle-card ${selectedVehicleType === type ? 'selected' : ''}`}
                    onClick={() => setSelectedVehicleType(type)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedVehicleType(type)}
                  >
                    <img
                      src={`https://via.placeholder.com/100x60?text=${type}`}
                      alt={type}
                      onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/100x60?text=Vehicle')}
                    />
                    <p>{type}</p>
                  </div>
                ))}
              </div>
            ))}
            <form onSubmit={handleVehicleSubmit}>
              <div className="form-row">
                <div>
                  <label htmlFor="modal-make">Make</label>
                  <Input
                    id="modal-make"
                    placeholder="e.g., Toyota"
                    value={bookingData.vehicleMake}
                    onChange={(e) => setBookingData({ ...bookingData, vehicleMake: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="modal-model">Model</label>
                  <Input
                    id="modal-model"
                    placeholder="e.g., Camry"
                    value={bookingData.vehicleModel}
                    onChange={(e) => setBookingData({ ...bookingData, vehicleModel: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label htmlFor="modal-color">Color</label>
                  <Input
                    id="modal-color"
                    placeholder="e.g., Black"
                    value={bookingData.vehicleColor}
                    onChange={(e) => setBookingData({ ...bookingData, vehicleColor: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="modal-zip">ZIP Code</label>
                  <Input
                    id="modal-zip"
                    placeholder="e.g., 90210"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    pattern="\d{5}"
                    title="Please enter a valid 5-digit ZIP code"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <Button
                  type="button"
                  className="btn-ghost vehicle-cancel-btn cancel-btn-lift"
                  onClick={handleReset}
                  style={{ flex: 1 }}
                >
                  Start Over
                </Button>
                <Button
                  type="submit"
                  className="btn-primary"
                  disabled={searchLoading}
                  style={{ flex: 1 }}
                >
                  {searchLoading ? 'Searching...' : 'Search Detailers'}
                </Button>
              </div>
            </form>
            {searchError && <div className="search-error">{searchError}</div>}
          </div>
        </section>
        <section className="map-section">
          <Button
            className="map-toggle"
            onClick={() => setMapVisible(!mapVisible)}
          >
            {mapVisible ? 'Hide Map' : 'Show Map'}
          </Button>
          <AnimatePresence>
            {mapVisible && lat && lon && detailers.length > 0 ? (
              <motion.div
                key="map"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: '400px' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="map-container">
                  <MapContainer center={[lat, lon]} zoom={10} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {detailers.map((detailer) => (
                      <Marker key={detailer.id} position={[detailer.lat, detailer.lon]}>
                        <Popup>
                          <h4>{detailer.name}</h4>
                          <p>Services: {detailer.vehicle_types?.join(', ') || 'N/A'}</p>
                          {detailer.has_shop && <p><Store size={16} /> {detailer.shop_address}</p>}
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </motion.div>
            ) : mapVisible && (!lat || !lon) ? (
              <motion.p
                key="map-error-no-location"
                className="map-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                No location data available. Please search with a valid ZIP code.
              </motion.p>
            ) : mapVisible && detailers.length === 0 ? (
              <motion.p
                key="map-error-no-detailers"
                className="map-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                No detailers found for this location.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </section>
        <section className="trust-banner">
          <p>Trusted by 1000+ Customers Nationwide • Vetted Professionals Only</p>
        </section>
        {detailers.length > 0 && (
          <section className="filter-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Rating:</span>
              <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)}>
                <option value="all">All</option>
                <option value="4">4★+</option>
                <option value="3">3★+</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Sort:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="best">Recommended</option>
                <option value="rating">Highest Rated</option>
                <option value="distance">Nearest</option>
              </select>
            </div>
            <Button
              className="btn-ghost clear-filters-btn"
              onClick={() => {
                setFilterRating('all');
                setSortBy('best');
              }}
              style={{ fontSize: '13px', padding: '6px 12px', height: '15px' }}
            >
              Clear Filters
            </Button>
          </section>
        )}
        <section className="detailers-grid">
          {filteredDetailers.length > 0 ? (
            filteredDetailers.map((detailer) => (
              <motion.div
                key={detailer.id}
                className="detailer-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <img src={detailer.image || 'https://via.placeholder.com/280x140?text=Detailer'} alt={detailer.name} />
                <h4>{detailer.name}</h4>
                <div className="detailer-meta">
                  <span>{detailer.has_shop ? <Store size={16} /> : <Truck size={16} />} {detailer.has_shop ? detailer.shop_address : 'Mobile Service'}</span>
                  <div className="rating">
                    <span className="stars">{detailer.rating ? '★'.repeat(Math.round(detailer.rating)) + '☆'.repeat(5 - Math.round(detailer.rating)) : 'No rating'}</span>
                    <span>{detailer.rating ? `${detailer.rating} (${detailer.reviews || 0} reviews)` : 'No reviews'}</span>
                  </div>
                </div>
                {detailer.badge && <div className="badge">{detailer.badge}</div>}
                <div className="services-list">{detailer.vehicle_types?.join(' • ') || 'N/A'}</div>
                {detailer.reviewSnippet && <div className="review-snippet">{detailer.reviewSnippet}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    className="btn-explore"
                    onClick={() => {
                      setSelectedDetailer(detailer);
                      setExploreModalOpen(true);
                    }}
                    style={{ flex: 1 }}
                    aria-label={`Explore ${detailer.name}`}
                  >
                    Explore
                  </Button>
                </div>
              </motion.div>
            ))
          ) : detailers.length > 0 ? (
                  <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--muted)', margin: '32px 0' }}>
                    No detailers match your filters. Try adjusting them.
                  </p>
                ) : (
                  <p>No detailers found. Try adjusting your search criteria.</p>
                )}
              </section>
              {recentlyViewed.length > 0 && (
                <section className="recently-viewed">
                  <h2>Recently Viewed</h2>
                  <div className="recently-viewed-grid">
                    {recentlyViewed.map((detailer) => (
                      <motion.div
                        key={detailer.id}
                        className="recently-viewed-card"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => {
                          setSelectedDetailer(detailer);
                          setExploreModalOpen(true);
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`View ${detailer.name}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setSelectedDetailer(detailer);
                            setExploreModalOpen(true);
                          }
                        }}
                      >
                        <div className="recently-viewed-logo">{detailer.name.charAt(0)}</div>
                        <h4>{detailer.name}</h4>
                        <p className="recently-viewed-services">{detailer.vehicle_types?.join(' • ') || 'N/A'}</p>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}
            </main>

            {/* CART PANEL */}
            <AnimatePresence>
              {cartOpen && (
                <motion.div
                  className="cart-panel"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ duration: 0.3 }}
                  role="dialog"
                  aria-label="Cart"
                >
                  <header>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Your Cart</h2>
                    <Button
                      className="close-x-btn"
                      onClick={() => setCartOpen(false)}
                      aria-label="Close cart"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </header>
                  <div className="cart-body">
                    {cart.length > 0 ? (
                      cart.map((item) => (
                        <div key={item.id} className="cart-item">
                          <div className="cart-thumb">{item.name.charAt(0)}</div>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700 }}>{item.name}</h4>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                              {item.detailerName} • ${item.price}
                              {item.serviceMode && ` • ${item.serviceMode}`}
                              {item.location && ` • ${item.location}`}
                            </p>
                          </div>
                          <div className="qty-controls">
                            <Button
                              className="qty-btn"
                              onClick={() => updateCartQty(item.id, 'decrease')}
                              aria-label={`Decrease quantity of ${item.name}`}
                            >
                              −
                            </Button>
                            <span>{item.qty}</span>
                            <Button
                              className="qty-btn"
                              onClick={() => updateCartQty(item.id, 'increase')}
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>Your cart is empty.</p>
                    )}
                    {cart.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <p style={{ fontWeight: 700, margin: '0 0 8px' }}>
                          Subtotal: ${getSubtotal().toFixed(2)}
                        </p>
                        <Button
                          className="btn-primary"
                          onClick={handlePurchase}
                          style={{ width: '100%' }}
                          aria-label="Proceed to checkout"
                        >
                          Proceed to Checkout
                        </Button>
                        <Button
                          className="btn-ghost"
                          onClick={clearCart}
                          style={{ width: '100%', marginTop: '8px' }}
                          aria-label="Clear cart"
                        >
                          Clear Cart
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ACCOUNT MODAL */}
            <AnimatePresence>
              {accountModalOpen && (
                <motion.div
                  className="account-modal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  role="dialog"
                  aria-label="Account"
                >
                  <motion.div
                    className="account-modal-content"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2>{activeAccountTab === 'login' ? 'Sign In' : 'Create Account'}</h2>
                    <div className="account-tabs">
                      <div
                        className={`account-tab ${activeAccountTab === 'login' ? 'active' : ''}`}
                        onClick={() => setActiveAccountTab('login')}
                        role="tab"
                        tabIndex={0}
                        aria-selected={activeAccountTab === 'login'}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveAccountTab('login')}
                      >
                        Sign In
                      </div>
                      <div
                        className={`account-tab ${activeAccountTab === 'signup' ? 'active' : ''}`}
                        onClick={() => setActiveAccountTab('signup')}
                        role="tab"
                        tabIndex={0}
                        aria-selected={activeAccountTab === 'signup'}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveAccountTab('signup')}
                      >
                        Sign Up
                      </div>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAuth();
                      }}
                      className={`account-form ${activeAccountTab === 'login' ? 'active' : ''}`}
                      aria-label="Sign in form"
                    >
                      <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        aria-label="Email address"
                      />
                      <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        aria-label="Password"
                      />
                      <Button className="btn-primary" type="submit" aria-label="Sign in">
                        Sign In
                      </Button>
                      <Button
                        className="btn-ghost cancel-btn-lift"
                        type="button"
                        onClick={() => setAccountModalOpen(false)}
                        aria-label="Cancel sign in"
                      >
                        Cancel
                      </Button>
                    </form>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAuth();
                      }}
                      className={`account-form ${activeAccountTab === 'signup' ? 'active' : ''}`}
                      aria-label="Sign up form"
                    >
                      <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        aria-label="Email address"
                      />
                      <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        aria-label="Password"
                      />
                      <Input
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        aria-label="Confirm password"
                      />
                      <Button className="btn-primary" type="submit" aria-label="Sign up">
                        Sign Up
                      </Button>
                      <Button
                        className="btn-ghost cancel-btn-lift"
                        type="button"
                        onClick={() => setAccountModalOpen(false)}
                        aria-label="Cancel sign up"
                      >
                        Cancel
                      </Button>
                    </form>
                    <Button
                      className="close-x-btn"
                      onClick={() => setAccountModalOpen(false)}
                      style={{ position: 'absolute', top: '12px', right: '12px' }}
                      aria-label="Close account modal"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* EXPLORE MODAL */}
            <AnimatePresence>
              {exploreModalOpen && selectedDetailer && (
                <motion.div
                  className="explore-modal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  role="dialog"
                  aria-label="Explore Detailer"
                >
                  <motion.div
                    className="explore-modal-content"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="explore-tabs">
                      <div
                        className={`explore-tab ${activeExploreTab === 'services' ? 'active' : ''}`}
                        onClick={() => setActiveExploreTab('services')}
                        role="tab"
                        tabIndex={0}
                        aria-selected={activeExploreTab === 'services'}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveExploreTab('services')}
                      >
                        Services
                      </div>
                      <div
                        className={`explore-tab ${activeExploreTab === 'company' ? 'active' : ''}`}
                        onClick={() => setActiveExploreTab('company')}
                        role="tab"
                        tabIndex={0}
                        aria-selected={activeExploreTab === 'company'}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveExploreTab('company')}
                      >
                        Company
                      </div>
                      <div
                        className={`explore-tab ${activeExploreTab === 'testimonials' ? 'active' : ''}`}
                        onClick={() => setActiveExploreTab('testimonials')}
                        role="tab"
                        tabIndex={0}
                        aria-selected={activeExploreTab === 'testimonials'}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveExploreTab('testimonials')}
                      >
                        Testimonials
                      </div>
                    </div>
                    <div className="explore-content">
                      {activeExploreTab === 'services' && (
                        <div>
                          <div className="service-detail-header">
                            <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif" }}>
                              {selectedDetailer.name} Services
                            </h3>
                            <Button
                              className="close-x-btn"
                              onClick={() => setExploreModalOpen(false)}
                              style={{ position: 'absolute', top: '12px', right: '12px' }}
                              aria-label="Close explore modal"
                            >
                              <X className="h-5 w-5" />
                            </Button>
                          </div>
                          <div className="service-grid">
                            {services.map((service) => (
                              <motion.div
                                key={service.id}
                                className="service-card"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                onClick={() => {
                                  setSelectedService(service);
                                  handleBookService(service.name, selectedDetailer.id);
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label={`Book ${service.name}`}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setSelectedService(service);
                                    handleBookService(service.name, selectedDetailer.id);
                                  }
                                }}
                              >
                                <h5>{service.icon} {service.name}</h5>
                                <p>{service.description}</p>
                                <p style={{ fontWeight: 700, color: 'var(--accent)' }}>${service.price}</p>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                      {activeExploreTab === 'company' && (
                        <div className="company-info">
                          <div className="service-detail-header">
                            <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif" }}>
                              About {selectedDetailer.name}
                            </h3>
                            <Button
                              className="close-x-btn"
                              onClick={() => setExploreModalOpen(false)}
                              style={{ position: 'absolute', top: '12px', right: '12px' }}
                              aria-label="Close explore modal"
                            >
                              <X className="h-5 w-5" />
                            </Button>
                          </div>
                          <p>
                            {selectedDetailer.description || `Learn more about ${selectedDetailer.name}, a trusted detailing service provider in your area.`}
                          </p>
                          {selectedDetailer.has_shop ? (
                            <p>
                              <strong>Shop Address:</strong> {selectedDetailer.shop_address || 'N/A'}
                            </p>
                          ) : (
                            <p>
                              <strong>Service Type:</strong> Mobile Only
                            </p>
                          )}
                          <p>
                            <strong>Specialties:</strong> {selectedDetailer.vehicle_types?.join(', ') || 'N/A'}
                          </p>
                        </div>
                      )}
                      {activeExploreTab === 'testimonials' && (
                        <div className="testimonials">
                          <div className="service-detail-header">
                            <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif" }}>
                              Testimonials
                            </h3>
                            <Button
                              className="close-x-btn"
                              onClick={() => setExploreModalOpen(false)}
                              style={{ position: 'absolute', top: '12px', right: '12px' }}
                              aria-label="Close explore modal"
                            >
                              <X className="h-5 w-5" />
                            </Button>
                          </div>
                          {selectedDetailer.testimonials?.length > 0 ? (
                            selectedDetailer.testimonials.map((testimonial: any, index: number) => (
                              <div key={index} className="testimonial-item">
                                <img
                                  src={testimonial.image || 'https://via.placeholder.com/80?text=User'}
                                  alt={`Testimonial by ${testimonial.author}`}
                                  className="testimonial-img"
                                  onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/80?text=User')}
                                />
                                <div>
                                  <p style={{ fontStyle: 'italic', margin: 0 }}>{testimonial.text}</p>
                                  <p style={{ fontWeight: 700, margin: '4px 0 0' }}>- {testimonial.author}</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p>No testimonials available.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* BOOKING MODAL */}
            <AnimatePresence>
              {bookingModalOpen && selectedDetailer && (
                <motion.div
                  className="booking-modal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  role="dialog"
                  aria-label="Booking"
                >
                  <motion.div
                    className="booking-modal-content"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 style={{ margin: '0 0 16px', fontFamily: "'Playfair Display', serif" }}>
                      Book with {selectedDetailer.name}
                    </h2>
                    <form
                      onSubmit={handleBookingSubmit}
                      className="booking-form"
                      aria-label="Booking form"
                    >
                      {bookingData.serviceMode === 'Mobile' && (
                        <label>
                          Service Address
                          <Input
                            placeholder="Enter full street address"
                            value={bookingData.location}
                            onChange={(e) => setBookingData({ ...bookingData, location: e.target.value })}
                            required
                            aria-label="Service address"
                          />
                        </label>
                      )}
                      {bookingData.serviceMode === 'In-Shop' && selectedDetailer.shop_address && (
                        <p style={{ margin: '8px 0', fontWeight: 600 }}>
                          <Store size={16} /> {selectedDetailer.shop_address}
                        </p>
                      )}
                      <label>
                        Preferred Time
                        <Input
                          type="datetime-local"
                          value={bookingData.preferredTime}
                          onChange={(e) => setBookingData({ ...bookingData, preferredTime: e.target.value })}
                          aria-label="Preferred time"
                        />
                      </label>
                      <label>
                        Service Mode
                        <select
                          value={bookingData.serviceMode}
                          onChange={(e) => setBookingData({ ...bookingData, serviceMode: e.target.value as 'Mobile' | 'In-Shop' })}
                          disabled={!selectedDetailer.has_shop}
                          aria-label="Service mode"
                        >
                          <option value="Mobile">Mobile</option>
                          {selectedDetailer.has_shop && <option value="In-Shop">In-Shop</option>}
                        </select>
                      </label>
                      <label>
                        Vehicle Make
                        <Input
                          placeholder="e.g., Toyota"
                          value={bookingData.vehicleMake}
                          onChange={(e) => setBookingData({ ...bookingData, vehicleMake: e.target.value })}
                          required
                          aria-label="Vehicle make"
                        />
                      </label>
                      <label>
                        Vehicle Model
                        <Input
                          placeholder="e.g., Camry"
                          value={bookingData.vehicleModel}
                          onChange={(e) => setBookingData({ ...bookingData, vehicleModel: e.target.value })}
                          required
                          aria-label="Vehicle model"
                        />
                      </label>
                      <label>
                        Vehicle Year
                        <Input
                          placeholder="e.g., 2020"
                          value={bookingData.vehicleYear}
                          onChange={(e) => setBookingData({ ...bookingData, vehicleYear: e.target.value })}
                          pattern="\d{4}"
                          title="Please enter a valid 4-digit year"
                          required
                          aria-label="Vehicle year"
                        />
                      </label>
                      <label>
                        Vehicle Color
                        <Input
                          placeholder="e.g., Black"
                          value={bookingData.vehicleColor}
                          onChange={(e) => setBookingData({ ...bookingData, vehicleColor: e.target.value })}
                          aria-label="Vehicle color"
                        />
                      </label>
                      <label>
                        Special Requests
                        <textarea
                          placeholder="Any special instructions?"
                          value={bookingData.specialRequests}
                          onChange={(e) => setBookingData({ ...bookingData, specialRequests: e.target.value })}
                          aria-label="Special requests"
                        />
                      </label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <Button
                          className="btn-ghost cancel-btn-lift"
                          type="button"
                          onClick={() => setBookingModalOpen(false)}
                          style={{ flex: 1 }}
                          aria-label="Cancel booking"
                        >
                          Cancel
                        </Button>
                        <Button
                          className="btn-primary"
                          type="submit"
                          disabled={bookingLoading}
                          style={{ flex: 1 }}
                          aria-label="Add to cart"
                        >
                          {bookingLoading ? 'Adding...' : 'Add to Cart'}
                        </Button>
                      </div>
                    </form>
                    <Button
                      className="close-x-btn"
                      onClick={() => setBookingModalOpen(false)}
                      style={{ position: 'absolute', top: '12px', right: '12px' }}
                      aria-label="Close booking modal"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* BOOKING CHOICE MODAL */}
            <AnimatePresence>
              {showBookingChoice && (
                <motion.div
                  className="booking-modal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  role="dialog"
                  aria-label="Booking complete"
                >
                  <motion.div
                    className="booking-modal-content"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.8 }}
                    transition={{ duration: 0.3 }}
                    style={{ maxWidth: '400px', textAlign: 'center' }}
                  >
                    <h2 style={{ margin: '0 0 16px', fontFamily: "'Playfair Display', serif" }}>
                      Added to Cart!
                    </h2>
                    <p style={{ margin: '0 0 24px', color: 'var(--muted)' }}>
                      Your service has been added to your cart.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <Button
                        className="btn-ghost"
                        onClick={() => setShowBookingChoice(false)}
                        style={{ flex: 1 }}
                      >
                        Continue Shopping
                      </Button>
                      <Button
                        className="btn-primary"
                        onClick={() => {
                          setShowBookingChoice(false);
                          setCartOpen(true);
                        }}
                        style={{ flex: 1 }}
                      >
                        Go to Cart
                      </Button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* FOOTER */}
            <footer>
              <div className="wrap footer-grid">
                <div className="footer-col">
                  <div className="footer-logo">
                    <div className="logo-mark">DN</div>
                    <div className="title">Detailing Near You</div>
                  </div>
                  <p style={{ color: 'var(--muted)' }}>
                    Your one-stop platform for premium car detailing services and products.
                  </p>
                  <div className="social-links">
                    <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f"></i></a>
                    <a href="#" aria-label="Twitter"><i className="fab fa-twitter"></i></a>
                    <a href="#" aria-label="Instagram"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
                <div className="footer-col">
                  <h4>Quick Links</h4>
                  <Link href="/#services">Services</Link>
                  <Link href="/#shop">Shop</Link>
                  <Link href="/#for-business">For Detailers</Link>
                  <Link href="/#contact">Contact Us</Link>
                </div>
                <div className="footer-col">
                  <h4>Support</h4>
                  <Link href="/faq">FAQ</Link>
                  <Link href="/terms">Terms of Service</Link>
                  <Link href="/privacy">Privacy Policy</Link>
                  <Link href="/support">Customer Support</Link>
                </div>
                <div className="footer-col">
                  <h4>Newsletter</h4>
                  <p style={{ color: 'var(--muted)' }}>
                    Subscribe to get updates and exclusive offers.
                  </p>
                  <form className="newsletter-form" onSubmit={handleSubscribe}>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      required
                      aria-label="Newsletter email"
                    />
                    <Button type="submit" aria-label="Subscribe to newsletter">
                      Subscribe
                    </Button>
                  </form>
                </div>
              </div>
              <div className="footer-bottom">
                &copy; {new Date().getFullYear()} Detailing Near You. All rights reserved.
              </div>
            </footer>
          </div>
        );
      }