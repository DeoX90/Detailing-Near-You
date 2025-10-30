'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Head from 'next/head'; // Import next/head
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { loadStripe } from '@stripe/stripe-js';
import { ShoppingCart, Search, Heart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/lib/useCart'; // ← The shared cart hook

// Initialize Supabase and Stripe
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [quickView, setQuickView] = useState<any | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [wishlistPopupOpen, setWishlistPopupOpen] = useState(false);
  const [activeCartTab, setActiveCartTab] = useState<'cart' | 'wishlist'>('cart');
  const [user, setUser] = useState<any | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [activeVehicleTab, setActiveVehicleTab] = useState('auto');
  const [activeAccountTab, setActiveAccountTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [vehicleType, setVehicleType] = useState('auto');
  const [selectedVehicleType, setSelectedVehicleType] = useState<string | null>(null);
  const [vehicleModalUsed, setVehicleModalUsed] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchData, setSearchData] = useState<any>({});

  // Cart calculations
  const getSubtotal = () => cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const getTotalItems = () => cart.reduce((sum, item) => sum + item.qty, 0);

  // Fetch products from Supabase
  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from('products').select('*').limit(3);
      if (error) {
        console.error('Products fetch error:', error);
        setError('Failed to load products');
      } else {
        const updatedProducts = data.map((p: any) => ({
          ...p,
          image: p.image || 'https://via.placeholder.com/120x120?text=Product',
        }));
        setProducts(updatedProducts);
      }
    };
    fetchProducts();
  }, []);

  // Load cart from Supabase or localStorage
  useEffect(() => {
    const loadCart = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('cart')
          .select('*, products(*)')
          .eq('user_id', user.id);
        if (error) {
          console.error('Error fetching cart:', error);
        } else {
          setCart(data.map((item: any) => ({ ...item.products, qty: item.quantity })));
        }
      } else {
        try {
          const savedCart = JSON.parse(localStorage.getItem('dn_cart_v1') || '[]');
          setCart(savedCart);
        } catch (e) {
          console.error('Error reading cart from localStorage:', e);
        }
      }
    };
    loadCart();
  }, [user]);

  // Save cart to Supabase or localStorage
  useEffect(() => {
    const saveCart = async () => {
      if (user) {
        try {
          await supabase.from('cart').delete().eq('user_id', user.id);
          const cartItems = cart.map((item) => ({
            user_id: user.id,
            product_id: item.id,
            quantity: item.qty,
          }));
          if (cartItems.length > 0) {
            const { error } = await supabase.from('cart').insert(cartItems);
            if (error) throw error;
          }
        } catch (e) {
          console.error('Error saving cart to Supabase:', e);
        }
      } else {
        try {
          localStorage.setItem('dn_cart_v1', JSON.stringify(cart));
        } catch (e) {
          console.error('Error saving cart to localStorage:', e);
        }
      }
    };
    saveCart();
  }, [cart, user]);

  // Check auth state and load wishlist
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error fetching user:', error);
        setUser(null);
        setWishlist([]);
      } else {
        setUser(user);
        if (user) {
          const { data, error } = await supabase
            .from('wishlist')
            .select('products(*)')
            .eq('user_id', user.id);
          if (error) {
            console.error('Error fetching wishlist:', error);
            setWishlist([]);
          } else {
            setWishlist(data.map((item: any) => item.products));
          }
        } else {
          setWishlist([]);
        }
      }
    };
    checkUser();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      setDropdownOpen(false);
      if (session?.user) {
        supabase
          .from('wishlist')
          .select('products(*)')
          .eq('user_id', session.user.id)
          .then(({ data, error }) => {
            if (error) {
              console.error('Error fetching wishlist:', error);
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
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Cart interactions
  const addToCart = async (product: any) => {
    const existing = cart.find((item) => item.id === product.id);
    let newCart;
    if (existing) {
      newCart = cart.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      newCart = [...cart, { ...product, qty: 1 }];
    }
    setCart(newCart);
    setCartOpen(true);
    if (quickView) {
      setQuickView(null);
    }
    if (user) {
      try {
        const { error } = await supabase
          .from('cart')
          .upsert({ user_id: user.id, product_id: product.id, quantity: (existing?.qty || 0) + 1 });
        if (error) throw error;
      } catch (e) {
        console.error('Error adding to cart:', e);
        alert('Failed to update cart');
      }
    }
  };

  const handleAddToCart = (product: any, event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      const button = event.currentTarget;
      button.classList.add('clicked');
      setTimeout(() => button.classList.remove('clicked'), 300);
    }
    addToCart(product);
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
          console.error('Error updating cart:', e);
          alert('Failed to update cart');
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
        console.error('Error clearing cart:', e);
        alert('Failed to clear cart');
      }
    }
  };

  // Wishlist interactions
  const toggleWishlist = async (product: any) => {
    if (!user) {
      setWishlistPopupOpen(true);
      return;
    }
    const existing = wishlist.find((item) => item.id === product.id);
    try {
      if (existing) {
        const { error } = await supabase
          .from('wishlist')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', product.id);
        if (error) throw error;
        setWishlist(wishlist.filter((item) => item.id !== product.id));
      } else {
        const { error } = await supabase
          .from('wishlist')
          .insert([{ user_id: user.id, product_id: product.id }]);
        if (error) throw error;
        setWishlist([...wishlist, product]);
      }
    } catch (error) {
      console.error('Wishlist error:', error);
      alert('Failed to update wishlist. Please try again.');
    }
  };

  // Checkout with Stripe
  const handlePurchase = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/checkout_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart, user_id: user?.id }),
      });
      const { url, error } = await response.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Failed to initiate purchase');
    }
    setLoading(false);
  };

  // Authentication handlers
  const handleAuth = async () => {
    if (activeAccountTab === 'signup' && password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    try {
      if (activeAccountTab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          alert(error.message);
        } else {
          setAccountModalOpen(false);
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          if (error.code === 'user_already_exists' || error.message.includes('already registered')) {
            alert('This email is already registered');
          } else {
            alert(error.message);
          }
        } else if (data.user) {
          alert('Check your email to confirm!');
          setAccountModalOpen(false);
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        } else {
          alert('Sign-up failed. Please try again.');
        }
      }
    } catch (err) {
      console.error('Unexpected auth error:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert(error.message);
      } else {
        setDropdownOpen(false);
      }
    } catch (err) {
      console.error('Unexpected sign-out error:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // Search logic
  const doSearch = async (zip: string, vType: string, mke: string, mdl: string, clr: string) => {
    if (!zip || !/^\d{5}$/.test(zip)) {
      setSearchError('Please enter a valid 5-digit ZIP code');
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    try {
      if (user) {
        const { error: vehicleError } = await supabase
          .from('vehicles')
          .upsert({
            user_id: user.id,
            make: mke,
            model: mdl,
            color: clr,
            vehicle_type: vType,
            zip_code: zip,
            updated_at: new Date().toISOString(),
          });
        if (vehicleError) {
          console.error('Vehicle upsert error:', vehicleError);
          throw vehicleError;
        }
      }
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipCode: zip, vehicleType: vType }),
      });
      console.log('API response status:', response.status);
      const data = await response.json();
      console.log('API response data:', data);
      if (!response.ok) {
        throw new Error(data.error || 'Search API failed');
      }
      if (data.error) {
        console.log('API returned error:', data.error);
        setSearchData({
          vehicleType: vType,
          zipCode: zip,
          make: mke,
          model: mdl,
          color: clr,
          lat: data.lat || null,
          lon: data.lon || null,
          detailers: [],
        });
      } else {
        setSearchData({
          vehicleType: vType,
          zipCode: zip,
          make: mke,
          model: mdl,
          color: clr,
          lat: data.lat || null,
          lon: data.lon || null,
          detailers: data.detailers || [],
        });
      }
      localStorage.setItem('dn_search_v1', JSON.stringify(searchData));
      const queryParams = new URLSearchParams({
        type: vType,
        zip,
        make: mke,
        model: mdl,
        color: clr,
      });
      router.push(`/services?${queryParams.toString()}`);
    } catch (err: any) {
      console.error('Search error:', err.message);
      setSearchError(err.message || 'Failed to find detailers. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Search box handler
  const handleSearch = async () => {
    await doSearch(zipCode, vehicleType, make, model, color);
  };

  // Vehicle modal handler
  const handleVehicleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = {
      make: (e.currentTarget.elements.namedItem('modal-make') as HTMLInputElement)?.value,
      model: (e.currentTarget.elements.namedItem('modal-model') as HTMLInputElement)?.value,
      color: (e.currentTarget.elements.namedItem('modal-color') as HTMLInputElement)?.value,
      zip: (e.currentTarget.elements.namedItem('modal-zip') as HTMLInputElement)?.value,
    };
    setMake(formData.make);
    setModel(formData.model);
    setColor(formData.color);
    setZipCode(formData.zip);
    setVehicleModalUsed(true);
    setVehicleModalOpen(false);
    if (user) {
      try {
        const { error } = await supabase.from('vehicles').upsert({
          user_id: user.id,
          make: formData.make,
          model: formData.model,
          color: formData.color,
          vehicle_type: vehicleType,
          zip_code: formData.zip,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      } catch (e) {
        console.error('Error saving vehicle:', e);
        alert('Failed to save vehicle details');
      }
    }
    await doSearch(formData.zip, vehicleType, formData.make, formData.model, formData.color);
  };

  const handleVehicleSelect = (type: string) => {
    setVehicleType(type);
    setSelectedVehicleType(type);
    setVehicleModalUsed(true);
  };

  // Button handlers
  const handleFindDetailer = () => {
    router.push('/services');
  };

  const handleShopProducts = () => {
    router.push('/shop');
  };

  const handleBookService = async (serviceType: string, detailerId?: string) => {
    if (!user || !user.id) {
      setAccountModalOpen(true);
      setActiveAccountTab('login');
      return;
    }
    try {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (vehicleError || !vehicleData) {
        alert('Please save vehicle details first');
        setVehicleModalOpen(true);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile) {
        alert('User profile not found. Please complete your profile.');
        router.push('/profile');
        return;
      }
      let mappedDetailerId: string | null = null;
      if (detailerId) {
        const { data: detailerData, error: detailerError } = await supabase
          .from('detailers')
          .select('profile_id')
          .eq('id', detailerId)
          .single();
        if (detailerError || !detailerData) {
          alert('Invalid detailer selected.');
          return;
        }
        mappedDetailerId = detailerData.profile_id;
      }
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: profile.id,
          detailer_id: mappedDetailerId,
          service_type: serviceType,
          vehicle_id: vehicleData.id,
          appointment_date: new Date().toISOString(),
          status: 'pending',
        }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || 'Failed to create appointment');
      }
      const { appointment } = await response.json();
      router.push(`/appointments/${appointment.id}`);
    } catch (e: any) {
      console.error('Booking error:', e);
      alert(`Failed to book service: ${e.message || 'Unknown error'}`);
    }
  };

  const handleJoinMembership = async () => {
    if (!user) {
      setAccountModalOpen(true);
      setActiveAccountTab('login');
      return;
    }
    try {
      const response = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, plan: '7-step' }),
      });
      const { membership, error } = await response.json();
      if (error) throw new Error(error);
      router.push(`/membership/${membership.id}`);
    } catch (e) {
      console.error('Membership error:', e);
      alert('Failed to join membership');
    }
  };

  const handleGetReferralLink = async () => {
    if (!user) {
      setAccountModalOpen(true);
      setActiveAccountTab('login');
      return;
    }
    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const { referralLink, error } = await response.json();
      if (error) throw new Error(error);
      alert(`Your referral link: ${referralLink}`);
    } catch (e) {
      console.error('Referral error:', e);
      alert('Failed to generate referral link');
    }
  };

  const handleFilterCompanies = async (location: string) => {
    try {
      const { data, error } = await supabase
        .from('detailers')
        .select('*, profiles!detailers_profile_id_fkey(id, full_name, email)')
        .eq('location_zip', location.split(',')[0].trim());
      if (error) throw error;
      localStorage.setItem('dn_filtered_detailers', JSON.stringify(data));
      router.push('/companies');
    } catch (e) {
      console.error('Filter companies error:', e);
      alert('Failed to filter companies');
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Detailing Near You — The Detailing Citadel</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&family=Playfair+Display:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <style jsx global>{`
        :root {
          --bg-1: #0f1724;
          --bg-2: #071018;
          --card: #ffffff;
          --muted: #9aa3ae;
          --accent: #0ea5a4;
          --accent-2: #063c3b;
          --gold: #d4af37;
          --glass: rgba(255,255,255,0.06);
          --radius: 14px;
          --shadow-lg: 0 20px 50px rgba(2,6,23,0.45);
          --shadow-sm: 0 10px 30px rgba(2,6,23,0.18);
          color-scheme: light;
        }
        html, body {
          height: 100%;
          margin: 0;
          font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
        }
        body {
          background: linear-gradient(180deg, #f7fafc 0%, #eff6f9 100%);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          color: #0b1220;
          line-height: 1.45;
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
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.2px;
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
          padding: 20px;
          flex-direction: column;
          gap: 16px;
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
          font-weight: 700;
          cursor: pointer;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-primary {
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(14,165,164,0.14);
          min-height: 44px;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          transition: all .18s ease;
        }
        .btn-primary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .cart-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
          min-width: 22px;
          text-align: center;
          box-shadow: 0 6px 18px rgba(0,0,0,0.12);
        }
        .hero {
          display: grid;
          grid-template-columns: 1fr 420px;
          gap: 32px;
          align-items: center;
          padding: 52px 0;
        }
        .eyebrow {
          display: inline-block;
          background: linear-gradient(90deg, rgba(14,165,164,0.08), rgba(6,58,59,0.04));
          padding: 8px 12px;
          border-radius: 999px;
          color: var(--accent);
          font-weight: 800;
          font-size: 13px;
        }
        .title {
          font-family: 'Playfair Display', serif;
          font-size: 44px;
          margin: 12px 0 10px;
          line-height: 1.02;
          color: var(--bg-2);
          font-weight: 700;
        }
        .subtitle {
          color: var(--muted);
          font-size: 16px;
          max-width: 680px;
        }
        .hero-ctas {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }
        .hero-card {
          background: white;
          border-radius: 16px;
          padding: 18px;
          box-shadow: var(--shadow-lg);
          border: 1px solid rgba(12,18,26,0.04);
        }
        .hero-image {
          height: 300px;
          border-radius: 12px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(6,58,59,0.06), rgba(14,165,164,0.06));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--bg-2);
          font-weight: 700;
          font-size: 18px;
        }
        .search-box {
          margin-top: 14px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .search-box input, .search-box select {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(12,18,26,0.06);
          flex: 1;
          min-height: 44px;
          font-size: 14px;
        }
        .search-box input:focus, .search-box select:focus {
          border-color: var(--accent);
          box-shadow: 0 0 6px rgba(14,165,164,0.2);
        }
        .search-box button {
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          cursor: pointer;
          font-weight: 800;
          min-height: 44px;
        }
        .search-box button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .search-error {
          color: #ef4444;
          font-size: 13px;
          margin-top: 8px;
          text-align: center;
          width: 100%;
        }
        .vehicle-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1200;
        }
        .vehicle-modal-content {
          background: var(--card);
          border-radius: var(--radius);
          width: min(750px, 90%);
          padding: 24px;
          box-shadow: var(--shadow-lg);
          border: 1px solid rgba(12,18,26,0.04);
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .vehicle-modal-content h2 {
          margin: 0 0 16px;
          text-align: center;
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          font-size: 28px;
          color: var(--bg-2);
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(12,18,26,0.04);
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
          animation: fadeIn 0.3s ease;
        }
        .account-modal-content h2 {
          margin: 0 0 16px;
          text-align: center;
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          font-size: 28px;
          color: var(--bg-2);
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(12,18,26,0.04);
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
        .account-form input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 8px rgba(14,165,164,0.3);
        }
        .account-form label {
          font-weight: 600;
          font-size: 14px;
          color: var(--bg-2);
          margin-bottom: 6px;
        }
        .quick-view-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 16px;
        }
        .quick-view-content {
          background: var(--card);
          border-radius: var(--radius);
          max-width: 800px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          box-shadow: var(--shadow-lg);
          display: flex;
          flex-direction: row;
          gap: 24px;
          padding: 24px;
        }
        .quick-view-image {
          flex: 0 0 40%;
        }
        .quick-view-image img {
          width: 100%;
          height: 200px;
          object-fit: cover;
          border-radius: 10px;
          background: #eef6ff;
        }
        .quick-view-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 8px 0;
        }
        .quick-view-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: transparent;
          border: none;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          color: var(--muted);
          padding: 8px;
          border-radius: 8px;
        }
        .quick-view-close:hover {
          background: rgba(12,18,26,0.06);
        }
        .quick-view-details h3 {
          font-family: 'Playfair Display', serif;
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: var(--bg-2);
        }
        .quick-view-details .product-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--muted);
          font-size: 16px;
        }
        .quick-view-details .product-meta span:first-child {
          font-weight: 700;
          color: var(--bg-1);
        }
        .quick-view-details .rating {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .quick-view-details .stars {
          color: var(--gold);
          font-size: 16px;
        }
        .quick-view-details .badge {
          display: inline-block;
          background: var(--accent-2);
          color: white;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 700;
          margin: 8px 0;
        }
        .quick-view-details .badge:empty {
          visibility: hidden;
        }
        .quick-view-details .stock-low {
          background: #ef4444;
        }
        .quick-view-details p {
          font-size: 15px;
          color: var(--muted);
          line-height: 1.6;
          margin: 0;
          flex: 1;
        }
        .quick-view-details .product-cta {
          width: 100%;
          max-width: 200px;
          padding: 12px 16px;
          font-size: 16px;
          box-shadow: 0 8px 24px rgba(14,165,164,0.2);
          align-self: flex-start;
          transition: background 0.3s ease;
        }
        .quick-view-details .product-cta:hover {
          background: #0d8d8c;
        }
        .quick-view-details .product-cta.clicked {
          animation: clickFeedback 0.3s ease;
        }
        @keyframes clickFeedback {
          0% { background: #0ea5a4; }
          50% { background: #0ea5a4; }
          100% { background: #0d8d8c; }
        }
        .wishlist-popup {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 16px;
        }
        .wishlist-popup-content {
          background: var(--card);
          border: 1px solid rgba(12,18,26,0.06);
          border-radius: 10px;
          max-width: 300px;
          width: 90%;
          padding: 24px;
          box-shadow: var(--shadow-lg);
          position: relative;
          text-align: center;
        }
        .wishlist-popup-close {
          position: absolute;
          top: 8px;
          right: 8px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 10px;
          border-radius: 8px;
          z-index: 10;
        }
        .wishlist-popup-close:hover {
          background: rgba(12,18,26,0.06);
        }
        .wishlist-popup p {
          font-size: 16px;
          font-weight: 600;
          color: var(--bg-2);
          margin: 0;
        }
        .wishlist-popup-login {
          padding: 12px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          box-shadow: 0 8px 24px rgba(14,165,164,0.14);
          width: 100%;
          cursor: pointer;
        }
        .wishlist-popup-login:hover {
          background: #0d8d8c;
        }
        .wishlist-item {
          display: flex;
          gap: 16px;
          align-items: center;
        }
        .wishlist-item img {
          width: 64px;
          height: 56px;
          border-radius: 8px;
          object-fit: cover;
        }
        .account-icon, .profile-icon {
          display: none;
          width: 20px;
          height: 20px;
        }
        section { padding: 36px 0; }
        .section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .section-head h3 {
          margin: 0;
          font-size: 20px;
          color: var(--bg-2);
        }
        .section-head p {
          margin: 0;
          color: var(--muted);
          font-size: 13px;
        }
        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 18px;
        }
        .service-card {
          background: white;
          border-radius: 14px;
          padding: 18px;
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.04);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .service-card h4 {
          margin: 0;
          font-size: 16px;
        }
        .service-card p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          flex: 1;
        }
        .service-cta {
          margin-top: 8px;
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--bg-2);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          min-height: 44px;
        }
        .companies-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 18px;
        }
        .company-card {
          background: white;
          border-radius: 14px;
          padding: 18px;
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.04);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .company-card img {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          object-fit: cover;
          background: #eef6ff;
        }
        .company-card h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
        }
        .company-card p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          flex: 1;
        }
        .company-cta {
          margin-top: 8px;
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
        }
        .shop-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 18px;
        }
        .product {
          background: white;
          border-radius: 12px;
          padding: 14px;
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.04);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .prod-thumb {
          height: 120px;
          border-radius: 8px;
          background: linear-gradient(135deg, #eef2ff, #fff);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: var(--bg-2);
        }
        .prod-title {
          font-weight: 800;
        }
        .prod-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .prod-actions {
          display: flex;
          gap: 8px;
          margin-top: auto;
        }
        .btn-add {
          background: var(--bg-2);
          color: white;
          padding: 8px 10px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 800;
          min-height: 44px;
        }
        .btn-buy {
          background: transparent;
          border: 1px solid rgba(12,18,26,0.06);
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          min-height: 44px;
        }
        .membership {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px;
          border-radius: 12px;
          background: linear-gradient(90deg, #fffaf0, #f7fffb);
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.03);
        }
        .crm {
          display: flex;
          gap: 18px;
          align-items: center;
          flex-wrap: wrap;
        }
        .crm .left {
          flex: 1;
        }
        .crm .right {
          flex: 0 0 360px;
          background: white;
          padding: 14px;
          border-radius: 12px;
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.04);
        }
        .test-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .testimonial {
          background: white;
          padding: 16px;
          border-radius: 12px;
          box-shadow: var(--shadow-sm);
        }
        .referral {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px;
          border-radius: 12px;
          background: linear-gradient(90deg, #f0f8ff, #f7fff9);
          box-shadow: var(--shadow-sm);
          border: 1px solid rgba(12,18,26,0.03);
        }
        .cart-panel {
          position: fixed;
          right: 0;
          top: 0;
          width: 320px;
          max-width: calc(100% - 16px);
          height: 100vh;
          background: linear-gradient(180deg, #ffffff, #f3f4f6);
          border-radius: 16px 0 0 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          overflow: auto;
          z-index: 1500;
          border-left: 1px solid rgba(12,18,26,0.06);
        }
        .cart-panel header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 20px;
          border-bottom: 1px solid rgba(12,18,26,0.04);
          font-weight: 800;
          font-size: 20px;
        }
        .cart-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(12,18,26,0.04);
        }
        .cart-tab {
          padding: 8px 16px;
          font-weight: 700;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        .cart-tab.active {
          border-bottom: 2px solid var(--accent);
          color: var(--accent);
        }
        .cart-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cart-item {
          display: flex;
          gap: 16px;
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
        }
        .sticky-cart {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
        }
        .sticky-cart-btn {
          padding: 14px 24px;
          border-radius: 999px;
          background: #000000;
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sticky-cart-btn.clicked {
          animation: cartClickFeedback 0.3s ease;
        }
        @keyframes cartClickFeedback {
          0% { background: #000000; }
          50% { background: var(--accent-2); }
          100% { background: #000000; }
        }
        @media (max-width: 900px) {
          .hero {
            grid-template-columns: 1fr;
            gap: 18px;
            padding: 24px 0;
          }
          .title {
            font-size: 32px;
          }
          .subtitle {
            font-size: 14px;
          }
          .hero-card {
            padding: 14px;
          }
          .hero-image {
            height: 200px;
            font-size: 16px;
          }
          .search-box {
            flex-direction: column;
            align-items: stretch;
          }
          .search-box input, .search-box select, .search-box button {
            width: 100%;
          }
          .hero-ctas {
            flex-direction: column;
            gap: 10px;
          }
          nav.primary {
            display: none;
          }
          .menu-toggle {
            display: inline-flex;
          }
          .header-inner {
            min-height: 56px;
            padding: 10px 0;
          }
          .actions {
            gap: 8px;
          }
          .btn-primary, .cart-btn {
            padding: 8px 12px;
            font-size: 14px;
            min-height: 40px;
          }
          .cart-panel {
            right: 0;
            left: 0;
            width: 100%;
            top: 72px;
            height: calc(100vh - 88px);
            border-radius: 0;
          }
          .membership, .referral {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            padding: 14px;
          }
          .crm .right {
            flex: 1;
          }
          .section-head {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .vehicle-modal-content {
            padding: 18px;
          }
          .vehicle-modal-content h2 {
            font-size: 24px;
          }
          .form-row {
            gap: 16px;
          }
          .quick-view-content {
            flex-direction: column;
          }
          .quick-view-image {
            flex: 0 0 auto;
            width: 100%;
          }
          .quick-view-image img {
            height: 160px;
          }
          .quick-view-details h3 {
            font-size: 20px;
          }
          .quick-view-details .product-meta {
            font-size: 14px;
          }
          .quick-view-details .stars {
            font-size: 14px;
          }
          .quick-view-details .product-cta {
            max-width: 100%;
          }
          .account-modal-content {
            width: 95%;
            padding: 16px;
          }
          .account-modal-content h2 {
            font-size: 20px;
          }
          .account-modal input {
            font-size: 14px;
          }
          .account-modal button[type="submit"] {
            font-size: 14px;
          }
          .wishlist-popup-content {
            padding: 16px;
          }
          .wishlist-popup p {
            font-size: 14px;
          }
          .wishlist-popup-close {
            top: 6px;
            right: 6px;
            padding: 8px;
          }
          .wishlist-popup-login {
            padding: 10px;
            font-size: 14px;
          }
          .btn-ghost#open-account-modal {
            padding: 0;
            width: 48px;
            height: 48px;
            border-radius: 12px;
            border: 1px solid rgba(12,18,26,0.06);
            background: white;
          }
          .btn-ghost#open-account-modal span {
            display: none;
          }
          .account-icon, .profile-icon {
            display: block;
            width: 20px;
            height: 20px;
          }
          .dropdown {
            right: 16px;
            top: 64px;
          }
        }
        @media (max-width: 600px) {
          .wrap {
            width: 92%;
          }
          .services-grid, .shop-grid, .companies-grid, .test-grid {
            grid-template-columns: 1fr;
          }
          .service-card, .product, .company-card, .testimonial {
            padding: 14px;
          }
          .section-head h3 {
            font-size: 18px;
          }
          .section-head p {
            font-size: 12px;
          }
          .company-card h4, .service-card h4 {
            font-size: 15px;
          }
          .company-card p, .service-card p, .product p, .testimonial p {
            font-size: 13px;
          }
          .service-cta, .company-cta, .btn-add, .btn-buy {
            padding: 8px 10px;
            font-size: 14px;
          }
          .cart-body {
            font-size: 14px;
          }
          .footer-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
          .footer-logo .title {
            font-size: 16px;
          }
          .newsletter-form {
            flex-direction: column;
          }
          .newsletter-form input, .newsletter-form button {
            width: 100%;
          }
          .social-links {
            justify-content: center;
          }
          .vehicle-grid {
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          }
          .vehicle-card {
            padding: 12px;
          }
          .vehicle-card p {
            font-size: 13px;
          }
          .form-row {
            flex-direction: column;
            gap: 12px;
          }
          .form-row > div {
            min-width: 100%;
          }
          .account-modal-content {
            padding: 18px;
          }
          .account-modal-content h2 {
            font-size: 24px;
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
            <Link href="/services">Services</Link>
            <Link href="/shop">Shop</Link>
            <Link href="/for-business">For Business</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <div className="actions">
            <div style={{ position: 'relative' }}>
              <button
                className="btn-ghost"
                id="open-account-modal"
                onClick={() => user ? setDropdownOpen(!dropdownOpen) : setAccountModalOpen(true)}
                aria-label={user ? 'Open profile menu' : 'Open account modal'}
              >
                {user ? (
                  <svg className="profile-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="currentColor" />
                    <path d="M6 20C6 16.6863 8.68629 14 12 14C15.3137 14 18 16.6863 18 20" fill="currentColor" />
                  </svg>
                ) : (
                  <>
                    <span>Account</span>
                    <svg className="account-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="8" r="4" stroke="black" strokeWidth="1.6" />
                      <path d="M6 20C6 16.6863 8.68629 14 12 14C15.3137 14 18 16.6863 18 20" stroke="black" strokeWidth="1.6" />
                    </svg>
                  </>
                )}
              </button>
              <AnimatePresence>
                {user && dropdownOpen && (
                  <motion.div
                    className="dropdown"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link href="/dashboard">
                      <button>Dashboard</button>
                    </Link>
                    <button onClick={handleSignOut}>Sign Out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button className="btn-primary" onClick={() => handleBookService('Any')}>
              Book Now
            </button>
            <button className="cart-btn" onClick={() => setCartOpen(!cartOpen)} aria-label="Open cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="3" y="7" width="18" height="11" rx="1.2" stroke="black" strokeWidth="1.6" fill="none" />
                <line x1="3" y1="7" x2="21" y2="7" stroke="black" strokeWidth="1.6" />
                <path d="M6 7L9 3H15L18 7" stroke="black" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="8.5" y1="7.5" x2="8.5" y2="18.5" stroke="black" strokeWidth="1.2" />
                <line x1="11.5" y1="7.5" x2="11.5" y2="18.5" stroke="black" strokeWidth="1.2" />
                <line x1="14.5" y1="7.5" x2="14.5" y2="18.5" stroke="black" strokeWidth="1.2" />
              </svg>
              <div className="cart-badge" style={{ display: getTotalItems() > 0 ? 'block' : 'none' }}>{getTotalItems()}</div>
            </button>
            <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H21M3 12H21M3 18H21" stroke="black" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <nav className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`} aria-label="Mobile menu">
          <Link href="/services">Services</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/for-business">For Business</Link>
          <Link href="/contact">Contact</Link>
          <div style={{ position: 'relative' }}>
            <Link
              href="#"
              id="mobile-account-link"
              onClick={(e) => {
                e.preventDefault();
                user ? setDropdownOpen(!dropdownOpen) : setAccountModalOpen(true);
                setMobileMenuOpen(false);
              }}
            >
              {user ? 'Profile' : 'Account'}
            </Link>
            <AnimatePresence>
              {user && dropdownOpen && (
                <motion.div
                  className="dropdown"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Link href="/dashboard">
                    <button>Dashboard</button>
                  </Link>
                  <button onClick={handleSignOut}>Sign Out</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>
      </header>
      <main className="wrap" role="main">
        <section className="hero" aria-label="Hero">
          <div>
            <div className="eyebrow">THE DETAILING HUB</div>
            <h1 className="title">The capital of car detailing — find, book, and buy with confidence.</h1>
            <p className="subtitle">We connect car owners with the finest detailers nationwide. Curated services, professional-grade products, and a platform that values the craft.</p>
            <div className="hero-ctas">
              <button className="btn-primary" onClick={handleFindDetailer}>
                Find a Detailer
              </button>
              <button className="btn-ghost" onClick={handleShopProducts}>
                Shop Products
              </button>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
              <div style={{ background: 'white', padding: '10px 12px', borderRadius: '10px', boxShadow: 'var(--shadow-sm)', fontWeight: 700 }}>
                Vetted Pros
              </div>
              <div style={{ background: 'white', padding: '10px 12px', borderRadius: '10px', boxShadow: 'var(--shadow-sm)', fontWeight: 700 }}>
                Secure Payments
              </div>
              <div style={{ background: 'white', padding: '10px 12px', borderRadius: '10px', boxShadow: 'var(--shadow-sm)', fontWeight: 700 }}>
                Nationwide
              </div>
            </div>
          </div>
          <div className="hero-card">
            <div className="hero-image">Premium Visual / Placeholder</div>
            <div className="search-box" style={{ marginTop: '16px' }}>
              <input
                id="hero-make"
                placeholder="Make e.g., Toyota"
                value={make}
                onChange={(e) => setMake(e.target.value)}
              />
              <input
                id="hero-model"
                placeholder="Model e.g., Camry"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <input
                id="hero-zip"
                placeholder="ZIP Code e.g., 90210"
                style={{ maxWidth: '110px' }}
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
              />
              <button onClick={handleSearch} disabled={searchLoading}>
                {searchLoading ? 'Searching...' : 'Find'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setVehicleModalOpen(true);
                  setVehicleModalUsed(true);
                  setSelectedVehicleType(null);
                }}
              >
                More Vehicles & Options
              </button>
              {searchError && <div className="search-error">{searchError}</div>}
            </div>
          </div>
        </section>
        <AnimatePresence>
          {vehicleModalOpen && (
            <motion.div
              className="vehicle-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="vehicle-modal-content"
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
              >
                <h2>Select Your Vehicle</h2>
                <div className="tabs">
                  <div
                    className={`tab ${activeVehicleTab === 'auto' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveVehicleTab('auto');
                      setSelectedVehicleType(null);
                    }}
                  >
                    Auto
                  </div>
                  <div
                    className={`tab ${activeVehicleTab === 'rv' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveVehicleTab('rv');
                      setSelectedVehicleType(null);
                    }}
                  >
                    RV
                  </div>
                  <div
                    className={`tab ${activeVehicleTab === 'boat' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveVehicleTab('boat');
                      setSelectedVehicleType(null);
                    }}
                  >
                    Boat
                  </div>
                  <div
                    className={`tab ${activeVehicleTab === 'atv' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveVehicleTab('atv');
                      setSelectedVehicleType(null);
                    }}
                  >
                    ATV
                  </div>
                  <div
                    className={`tab ${activeVehicleTab === 'work' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveVehicleTab('work');
                      setSelectedVehicleType(null);
                    }}
                  >
                    Work
                  </div>
                </div>
                <div className={`vehicle-grid ${activeVehicleTab === 'auto' ? 'active' : ''}`} id="auto">
                  <div className={`vehicle-card ${selectedVehicleType === 'Coupe' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Coupe')}>
                    <img src="https://via.placeholder.com/100x60?text=Coupe" alt="Coupe" />
                    <p>Coupe</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Sedan' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Sedan')}>
                    <img src="https://via.placeholder.com/100x60?text=Sedan" alt="Sedan" />
                    <p>Sedan</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Sedan' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Sedan')}>
                    <img src="https://via.placeholder.com/100x60?text=Sedan" alt="Sedan" />
                    <p>Sedan</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'SUV' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('SUV')}>
                    <img src="https://via.placeholder.com/100x60?text=SUV" alt="SUV" />
                    <p>SUV</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Truck' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Truck')}>
                    <img src="https://via.placeholder.com/100x60?text=Truck" alt="Truck" />
                    <p>Truck</p>
                  </div>
                </div>
                <div className={`vehicle-grid ${activeVehicleTab === 'rv' ? 'active' : ''}`} id="rv">
                  <div className={`vehicle-card ${selectedVehicleType === 'Class A' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Class A')}>
                    <img src="https://via.placeholder.com/100x60?text=Class+A" alt="Class A" />
                    <p>Class A</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Class B' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Class B')}>
                    <img src="https://via.placeholder.com/100x60?text=Class+B" alt="Class B" />
                    <p>Class B</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Class C' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Class C')}>
                    <img src="https://via.placeholder.com/100x60?text=Class+C" alt="Class C" />
                    <p>Class C</p>
                  </div>
                </div>
                <div className={`vehicle-grid ${activeVehicleTab === 'boat' ? 'active' : ''}`} id="boat">
                  <div className={`vehicle-card ${selectedVehicleType === 'Yacht' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Yacht')}>
                    <img src="https://via.placeholder.com/100x60?text=Yacht" alt="Yacht" />
                    <p>Yacht</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Jet Ski' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Jet Ski')}>
                    <img src="https://via.placeholder.com/100x60?text=Jet+Ski" alt="Jet Ski" />
                    <p>Jet Ski</p>
                  </div>
                </div>
                <div className={`vehicle-grid ${activeVehicleTab === 'atv' ? 'active' : ''}`} id="atv">
                  <div className={`vehicle-card ${selectedVehicleType === 'Quad' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Quad')}>
                    <img src="https://via.placeholder.com/100x60?text=Quad" alt="Quad" />
                    <p>Quad</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'UTV' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('UTV')}>
                    <img src="https://via.placeholder.com/100x60?text=UTV" alt="UTV" />
                    <p>UTV</p>
                  </div>
                </div>
                <div className={`vehicle-grid ${activeVehicleTab === 'work' ? 'active' : ''}`} id="work">
                  <div className={`vehicle-card ${selectedVehicleType === 'Work Truck' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Work Truck')}>
                    <img src="https://via.placeholder.com/100x60?text=Work+Truck" alt="Work Truck" />
                    <p>Work Truck</p>
                  </div>
                  <div className={`vehicle-card ${selectedVehicleType === 'Van' ? 'selected' : ''}`} onClick={() => handleVehicleSelect('Van')}>
                    <img src="https://via.placeholder.com/100x60?text=Van" alt="Van" />
                    <p>Van</p>
                  </div>
                </div>
                <form onSubmit={handleVehicleSubmit}>
                  <div className="form-row">
                    <div>
                      <label htmlFor="modal-make">Make</label>
                      <input
                        id="modal-make"
                        placeholder="e.g., Toyota"
                        value={make}
                        onChange={(e) => setMake(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-model">Model</label>
                      <input
                        id="modal-model"
                        placeholder="e.g., Camry"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label htmlFor="modal-color">Color</label>
                      <input
                        id="modal-color"
                        placeholder="e.g., Black"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="modal-zip">ZIP Code</label>
                      <input
                        id="modal-zip"
                        placeholder="e.g., 90210"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setVehicleModalOpen(false)}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                      Submit
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <section aria-label="Services">
          <div className="section-head">
            <h3>Our Services</h3>
            <p>Explore our curated detailing services for every vehicle type.</p>
          </div>
          <div className="services-grid">
            <div className="service-card">
              <h4>Interior Detail</h4>
              <p>Deep cleaning, upholstery care, and premium interior restoration.</p>
              <button className="service-cta" onClick={() => handleBookService('Interior Detail')}>
                Book Now
              </button>
            </div>
            <div className="service-card">
              <h4>Exterior Detail</h4>
              <p>Hand wash, wax, polish, and paint correction for a showroom shine.</p>
              <button className="service-cta" onClick={() => handleBookService('Exterior Detail')}>
                Book Now
              </button>
            </div>
            <div className="service-card">
              <h4>Ceramic Coating</h4>
              <p>Long-lasting protection with a glossy, hydrophobic finish.</p>
              <button className="service-cta" onClick={() => handleBookService('Ceramic Coating')}>
                Book Now
              </button>
            </div>
            <div className="service-card">
              <h4>Premium Package</h4>
              <p>Full interior and exterior detail with top-tier treatments.</p>
              <button className="service-cta" onClick={() => handleBookService('Premium Package')}>
                Book Now
              </button>
            </div>
          </div>
        </section>
        <section aria-label="Companies">
          <div className="section-head">
            <h3>Top Detailing Companies</h3>
            <p>Connect with vetted professionals in your area.</p>
          </div>
          <div className="companies-grid">
            <div className="company-card">
              <img src="https://via.placeholder.com/60x60?text=Pro" alt="Pro Detail" />
              <h4>Pro Detail</h4>
              <p>Los Angeles, CA</p>
              <button
                className="company-cta"
                onClick={() => handleFilterCompanies('Los Angeles, CA')}
              >
                View Detailers
              </button>
            </div>
            <div className="company-card">
              <img src="https://via.placeholder.com/60x60?text=Elite" alt="Elite Shine" />
              <h4>Elite Shine</h4>
              <p>Miami, FL</p>
              <button
                className="company-cta"
                onClick={() => handleFilterCompanies('Miami, FL')}
              >
                View Detailers
              </button>
            </div>
            <div className="company-card">
              <img src="https://via.placeholder.com/60x60?text=Gloss" alt="Gloss Kings" />
              <h4>Gloss Kings</h4>
              <p>Chicago, IL</p>
              <button
                className="company-cta"
                onClick={() => handleFilterCompanies('Chicago, IL')}
              >
                View Detailers
              </button>
            </div>
          </div>
        </section>
        <section aria-label="Shop">
          <div className="section-head">
            <h3>Shop Detailing Products</h3>
            <p>Professional-grade supplies for DIY enthusiasts and pros alike.</p>
          </div>
          <div className="shop-grid">
            {products.map((product) => (
              <div className="product" key={product.id}>
                <div className="prod-thumb">{product.name[0]}</div>
                <div className="prod-title">{product.name}</div>
                <div className="prod-meta">
                  <span>${product.price}</span>
                  <span className="rating">
                    <span className="stars">
                      {product.rating ? '★'.repeat(Math.round(product.rating)) : '☆☆☆☆☆'}
                    </span>
                    {product.reviews ? ` (${product.reviews})` : ''}
                  </span>
                </div>
                <div className="prod-actions">
                  <button
                    className="btn-add"
                    onClick={(e) => handleAddToCart(product, e)}
                  >
                    Add to Cart
                  </button>
                  <button
                    className="btn-buy"
                    onClick={() => {
                      setQuickView(product);
                    }}
                  >
                    Quick View
                  </button>
                  <button
                    className="btn-buy"
                    onClick={() => toggleWishlist(product)}
                    style={{ padding: '8px', minHeight: '40px' }}
                  >
                    <Heart
                      style={{
                        width: '20px',
                        height: '20px',
                        fill: wishlist.some((item) => item.id === product.id) ? '#ef4444' : 'none',
                        stroke: wishlist.some((item) => item.id === product.id) ? '#ef4444' : 'black',
                      }}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="membership" aria-label="Membership">
          <div>
            <div className="eyebrow">7-STEP DETAIL</div>
            <h3>Join Our Membership</h3>
            <p style={{ color: 'var(--muted)' }}>
              Unlock exclusive perks, priority booking, and discounts with our premium membership.
            </p>
          </div>
          <button className="btn-primary" onClick={handleJoinMembership}>
            Join Now
          </button>
        </section>
        <section aria-label="Testimonials">
          <div className="section-head">
            <h3>What Our Customers Say</h3>
            <p>Hear from car owners who trust us with their vehicles.</p>
          </div>
          <div className="test-grid">
            <div className="testimonial">
              <p style={{ margin: '0 0 12px', fontStyle: 'italic', fontSize: '14px' }}>
                "My car looks brand new! The detailer was professional and thorough."
              </p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>- Sarah M., Miami</p>
            </div>
            <div className="testimonial">
              <p style={{ margin: '0 0 12px', fontStyle: 'italic', fontSize: '14px' }}>
                "Best detailing service I've ever used. Highly recommend!"
              </p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>- John D., Chicago</p>
            </div>
            <div className="testimonial">
              <p style={{ margin: '0 0 12px', fontStyle: 'italic', fontSize: '14px' }}>
                "The ceramic coating is phenomenal. My car stays clean longer."
              </p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>- Emily R., Los Angeles</p>
            </div>
          </div>
        </section>
        <section className="crm" aria-label="For Detailers">
          <div className="left">
            <div className="eyebrow">FOR DETAILERS</div>
            <h3>Grow Your Detailing Business</h3>
            <p style={{ color: 'var(--muted)', maxWidth: '520px' }}>
              Join our platform to connect with car owners, streamline bookings, and access professional-grade tools.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button className="btn-primary">Join Now</button>
              <button className="btn-ghost">Learn More</button>
            </div>
          </div>
          <div className="right">
            <div style={{ fontWeight: 700, marginBottom: '12px' }}>Why join us?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: 'var(--muted)' }}>
              <p style={{ margin: 0 }}>- Reach thousands of customers</p>
              <p style={{ margin: 0 }}>- Easy booking management</p>
              <p style={{ margin: 0 }}>- Marketing & CRM tools</p>
              <p style={{ margin: 0 }}>- Verified customer reviews</p>
            </div>
          </div>
        </section>
        <section className="referral" aria-label="Referral">
          <div>
            <div className="eyebrow">REFER A FRIEND</div>
            <h3>Earn Rewards</h3>
            <p style={{ color: 'var(--muted)' }}>
              Invite your friends and get exclusive discounts on your next detailing service.
            </p>
          </div>
          <button className="btn-primary" onClick={handleGetReferralLink}>
            Get Your Link
          </button>
        </section>
      </main>
      <AnimatePresence>
        {quickView && (
          <motion.div
            className="quick-view-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="quick-view-content"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <button
                className="quick-view-close"
                onClick={() => setQuickView(null)}
                aria-label="Close quick view"
              >
                ✕
              </button>
              <div className="quick-view-image">
                <img src={quickView.image || 'https://via.placeholder.com/300x200?text=Product'} alt={quickView.name} />
              </div>
              <div className="quick-view-details">
                <h3>{quickView.name}</h3>
                <div className="product-meta">
                  <span>${quickView.price}</span>
                  <div className="rating">
                    <span className="stars">
                      {quickView.rating ? '★'.repeat(Math.round(quickView.rating)) : '☆☆☆☆☆'}
                    </span>
                    {quickView.reviews ? ` (${quickView.reviews})` : ''}
                  </div>
                </div>
                {quickView.badge && <div className="badge">{quickView.badge}</div>}
                {quickView.stock && quickView.stock <= 5 && (
                  <div className="badge stock-low">Low Stock: {quickView.stock} left</div>
                )}
                <p>{quickView.description || 'No description available.'}</p>
                <button
                  className="product-cta btn-primary"
                  onClick={(e) => handleAddToCart(quickView, e)}
                >
                  Add to Cart
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {wishlistPopupOpen && (
          <motion.div
            className="wishlist-popup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="wishlist-popup-content"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <button
                className="wishlist-popup-close"
                onClick={() => setWishlistPopupOpen(false)}
                aria-label="Close wishlist popup"
              >
                ✕
              </button>
              <p>Please log in to add items to your wishlist.</p>
              <button
                className="wishlist-popup-login"
                onClick={() => {
                  setWishlistPopupOpen(false);
                  setAccountModalOpen(true);
                  setActiveAccountTab('login');
                }}
              >
                Log In
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {accountModalOpen && !user && (
          <motion.div
            className="account-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="account-modal-content"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <h2>Account</h2>
              <div className="account-tabs">
                <div
                  className={`account-tab ${activeAccountTab === 'login' ? 'active' : ''}`}
                  onClick={() => setActiveAccountTab('login')}
                >
                  Log In
                </div>
                <div
                  className={`account-tab ${activeAccountTab === 'signup' ? 'active' : ''}`}
                  onClick={() => setActiveAccountTab('signup')}
                >
                  Sign Up
                </div>
              </div>
              <form
                className={`account-form ${activeAccountTab === 'login' ? 'active' : ''}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAuth();
                }}
              >
                <div>
                  <label htmlFor="login-email">Email</label>
                  <input
                    type="email"
                    id="login-email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="login-password">Password</label>
                  <input
                    type="password"
                    id="login-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button className="btn-primary" type="submit">
                  Log In
                </button>
              </form>
              <form
                className={`account-form ${activeAccountTab === 'signup' ? 'active' : ''}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAuth();
                }}
              >
                <div>
                  <label htmlFor="signup-email">Email</label>
                  <input
                    type="email"
                    id="signup-email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="signup-password">Password</label>
                  <input
                    type="password"
                    id="signup-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="signup-confirm-password">Confirm Password</label>
                  <input
                    type="password"
                    id="signup-confirm-password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button className="btn-primary" type="submit">
                  Sign Up
                </button>
              </form>
              <button
                className="btn-ghost"
                onClick={() => setAccountModalOpen(false)}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cartOpen && (
          <motion.div
            className="cart-panel"
            initial={{ x: '115%' }}
            animate={{ x: 0 }}
            exit={{ x: '115%' }}
            transition={{ type: 'tween', duration: 0.28 }}
          >
            <header>
              <div>Your Cart</div>
              <button
                onClick={() => setCartOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 800 }}
                aria-label="Close cart"
              >
                ✕
              </button>
            </header>
            <div className="cart-tabs">
              <div
                className={`cart-tab ${activeCartTab === 'cart' ? 'active' : ''}`}
                onClick={() => setActiveCartTab('cart')}
              >
                Cart
              </div>
              <div
                className={`cart-tab ${activeCartTab === 'wishlist' ? 'active' : ''}`}
                onClick={() => setActiveCartTab('wishlist')}
              >
                Wishlist
              </div>
            </div>
            <div className="cart-body">
              {activeCartTab === 'cart' && (
                <>
                  {cart.length > 0 ? (
                    cart.map((item) => (
                      <div className="cart-item" key={item.id}>
                        <div className="cart-thumb">{item.name[0]}</div>
                        <div style={{ flex: 1 }}>
                          <div>{item.name}</div>
                          <div style={{ color: 'var(--muted)' }}>${(item.price * item.qty).toFixed(2)}</div>
                        </div>
                        <div className="qty-controls">
                          <button
                            className="qty-btn"
                            onClick={() => updateCartQty(item.id, 'decrease')}
                          >
                            −
                          </button>
                          <span>{item.qty}</span>
                          <button
                            className="qty-btn"
                            onClick={() => updateCartQty(item.id, 'increase')}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: 'var(--muted)', padding: '18px', textAlign: 'center' }}>
                      Your cart is empty — add products to get started.
                    </div>
                  )}
                </>
              )}
              {activeCartTab === 'wishlist' && (
                <>
                  {wishlist.length > 0 ? (
                    wishlist.map((item) => (
                      <div className="wishlist-item" key={item.id}>
                        <img src={item.image || 'https://via.placeholder.com/64x56?text=Product'} alt={item.name} />
                        <div style={{ flex: 1 }}>
                          <div>{item.name}</div>
                          <div style={{ color: 'var(--muted)' }}>${item.price}</div>
                        </div>
                        <button
                          className="btn-add"
                          onClick={() => {
                            addToCart(item);
                            toggleWishlist(item);
                          }}
                          style={{ padding: '8px 10px', minHeight: '40px' }}
                        >
                          Add to Cart
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: 'var(--muted)', padding: '18px', textAlign: 'center' }}>
                      Your wishlist is empty — add products to get started.
                    </div>
                  )}
                </>
              )}
            </div>
            {activeCartTab === 'cart' && cart.length > 0 && (
              <div style={{ padding: '20px', borderTop: '1px solid rgba(12,18,26,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'var(--muted)' }}>Subtotal</div>
                  <div style={{ fontWeight: 900 }}>${getSubtotal().toFixed(2)}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    className="btn-ghost"
                    style={{ flex: 1 }}
                    onClick={clearCart}
                  >
                    Clear
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={handlePurchase}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Checkout'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="sticky-cart">
        <button
          className="sticky-cart-btn"
          onClick={() => setCartOpen(!cartOpen)}
          aria-label="Open cart"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="3" y="7" width="18" height="11" rx="1.2" stroke="white" strokeWidth="1.6" fill="none" />
            <line x1="3" y1="7" x2="21" y2="7" stroke="white" strokeWidth="1.6" />
            <path d="M6 7L9 3H15L18 7" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="8.5" y1="7.5" x2="8.5" y2="18.5" stroke="white" strokeWidth="1.2" />
            <line x1="11.5" y1="7.5" x2="11.5" y2="18.5" stroke="white" strokeWidth="1.2" />
            <line x1="14.5" y1="7.5" x2="14.5" y2="18.5" stroke="white" strokeWidth="1.2" />
          </svg>
          <span>Cart</span>
          <div className="cart-badge" style={{ display: getTotalItems() > 0 ? 'block' : 'none' }}>{getTotalItems()}</div>
        </button>
      </div>
      <footer>
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="logo-mark">DN</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>Detailing Near You</div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
              The capital of car detailing, connecting owners with top-tier detailers nationwide.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: 'white' }}>
              For Customers
            </h4>
            <Link href="/services" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Find a Detailer
            </Link>
            <Link href="/shop" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Shop Products
            </Link>
            <Link href="/membership" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Membership Benefits
            </Link>
            <Link href="/contact" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Contact Us
            </Link>
            <Link href="/faq" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              FAQ
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: 'white' }}>
              For Detailers
            </h4>
            <Link href="/for-business" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Join Our Platform
            </Link>
            <Link href="/resources" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Resources & Tips
            </Link>
            <Link href="/support" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Support
            </Link>
            <Link href="/dashboard" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '14px' }}>
              Dashboard Login
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: 'white' }}>
              Stay Connected
            </h4>
            <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '0 0 12px' }}>
              Subscribe for exclusive offers and detailing tips.
            </p>
            <form style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onSubmit={async (e) => {
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
            }}>
              <input
                type="email"
                placeholder="Enter your email"
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                }}
                required
              />
              <button
                type="submit"
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '13px',
            color: 'var(--muted)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: '16px',
          }}
        >
          © {new Date().getFullYear()} Detailing Near You. All rights reserved.{' '}
          <Link href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Privacy Policy
          </Link>{' '}
          |{' '}
          <Link href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  );
}
