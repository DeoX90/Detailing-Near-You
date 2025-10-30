'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadStripe } from '@stripe/stripe-js';
import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Search, Heart, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function Shop() {
  const [products, setProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [quickView, setQuickView] = useState<any | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('default');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // State for account modal, auth, and user
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [isLoginForm, setIsLoginForm] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [user, setUser] = useState<any | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // State for wishlist popup
  const [wishlistPopupOpen, setWishlistPopupOpen] = useState(false);
  // State for cart/wishlist tab
  const [activeCartTab, setActiveCartTab] = useState<'cart' | 'wishlist'>('cart');

  // Shipping progress
  const getSubtotal = () => cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const getTotalItems = () => cart.reduce((sum, item) => sum + item.qty, 0);
  const threshold = 50;
  const subtotal = getSubtotal();
  const progressWidth = subtotal >= threshold ? 100 : (subtotal / threshold) * 100;
  const progressText = subtotal >= threshold ? 'You qualify for free shipping!' : `Add $${(threshold - subtotal).toFixed(2)} to get free shipping!`;

  // Fetch products from Supabase
  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) {
        console.error('Products fetch error:', error);
        setError('Failed to load products');
      } else {
        console.log('Fetched products:', data);
        const updatedProducts = data.map((p: any) => ({
          ...p,
          image: p.image || 'https://via.placeholder.com/280x280?text=Product',
        }));
        setProducts(updatedProducts);
        setFilteredProducts(updatedProducts);
      }
    };
    fetchProducts();
  }, []);

// Load cart from localStorage (on mount)
useEffect(() => {
  const loadCart = () => {
    try {
      const saved = localStorage.getItem('dn_cart_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCart(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error('Failed to load cart:', e);
      localStorage.removeItem('dn_cart_v1'); // Clear corrupted data
    }
  };
  loadCart();
}, []);

// Save cart to localStorage (on change)
useEffect(() => {
  const saveCart = () => {
    try {
      localStorage.setItem('dn_cart_v1', JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to save cart:', e);
      toast.error('Cart save failed. Try refreshing.');
    }
  };
  saveCart();
}, [cart]);

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
          // Fetch wishlist for logged-in user
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
        // Fetch wishlist on login
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

  // Filter and sort products
  useEffect(() => {
    let filtered = products
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      .filter((p) => (category === 'all' ? true : p.category === category))
      .sort((a, b) => {
        if (sort === 'low-high') return a.price - b.price;
        if (sort === 'high-low') return b.price - a.price;
        return 0;
      });
    setFilteredProducts(filtered);
  }, [products, search, category, sort]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handle purchase (Stripe checkout)
  const handlePurchase = async () => {
    setLoading(true);
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
  setLoading(false);
};

  // Cart interactions
  const addToCart = (product: any) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      setCart(cart.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item)));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
    setCartOpen(true);
    if (quickView) {
      setQuickView(null);
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

  const updateCartQty = (id: string, action: 'increase' | 'decrease') => {
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
    }
  };

  const clearCart = () => setCart([]);

  // Restrict wishlist to logged-in users and sync with Supabase
  const toggleWishlist = async (product: any) => {
    if (!user) {
      setWishlistPopupOpen(true);
      return;
    }
    const existing = wishlist.find((item) => item.id === product.id);
    try {
      if (existing) {
        // Remove from wishlist
        const { error } = await supabase
          .from('wishlist')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', product.id);
        if (error) throw error;
        setWishlist(wishlist.filter((item) => item.id !== product.id));
      } else {
        // Add to wishlist
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

  // Supabase auth handler with proper duplicate email handling
  const handleAuth = async () => {
    if (!isLoginForm && password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    try {
      if (isLoginForm) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          alert(error.message);
        } else {
          alert('Logged in!');
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

  // Sign out handler
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert(error.message);
      } else {
        alert('Signed out!');
        setDropdownOpen(false);
      }
    } catch (err) {
      console.error('Unexpected sign-out error:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
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
        }
        body {
          background: linear-gradient(180deg, #f7fafc 0%, #eff6f9 100%);
          color: #0b1220;
          line-height: 1.45;
          margin: 0;
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
          box-shadow: 0 6px 24px rgba(0,0,0,0.12);
        }
        .account-icon {
          display: none;
        }
        .profile-icon {
          width: 20px;
          height: 20px;
        }
        .dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
          z-index: 1000;
          width: 160px;
          padding: 8px;
          margin-top: 8px;
        }
        .dropdown button {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          background: transparent;
          border: none;
          text-align: left;
          font-weight: 600;
          color: var(--bg-2);
          cursor: pointer;
        }
        .dropdown button:hover {
          background: rgba(12,18,26,0.03);
        }
        .hero-section {
          position: relative;
          padding: 64px 0;
          text-align: center;
          background: url('https://via.placeholder.com/1200x400?text=Shop+Banner') center/cover no-repeat;
          color: white;
          border-radius: 12px;
          margin: 24px 0;
          overflow: hidden;
        }
        .hero-section::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.4);
          z-index: 1;
        }
        .hero-content {
          position: relative;
          z-index: 2;
        }
        .hero-title {
          font-family: 'Playfair Display', serif;
          font-size: 48px;
          margin: 0 0 16px;
          font-weight: 700;
        }
        .hero-subtitle {
          font-size: 18px;
          margin: 0 0 24px;
          max-width: 680px;
          margin-left: auto;
          margin-right: auto;
          opacity: 0.9;
        }
        .hero-cta {
          padding: 14px 28px;
          font-size: 16px;
          min-height: 48px;
        }
        .trust-banner {
          text-align: center;
          padding: 16px 0;
          background: linear-gradient(90deg, #f0f8ff, #f7fff9);
          border-radius: 12px;
          margin: 24px 0;
          display: flex;
          justify-content: center;
          gap: 24px;
        }
        .trust-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--bg-2);
        }
        .trust-item svg {
          width: 20px;
          height: 20px;
        }
        .category-previews {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          padding: 24px 0;
        }
        .category-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          box-shadow: var(--shadow-sm);
        }
        .category-card img {
          width: 100%;
          height: 100px;
          object-fit: cover;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .category-card h4 {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
        }
        .shipping-progress {
          padding: 16px 0;
          text-align: center;
        }
        .progress-bar {
          width: 100%;
          max-width: 600px;
          height: 10px;
          background: #e5e7eb;
          border-radius: 5px;
          margin: 12px auto;
          position: relative;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width .3s ease;
        }
        .progress-text {
          font-size: 14px;
          color: var(--muted);
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
          flex: 1;
          min-height: 44px;
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
        }
        .social-links {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }
        .social-links a {
          color: var(--muted);
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
          color: var(--muted);
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 16px;
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
          transform: translateX(${cartOpen ? '0' : '100%'});
          transition: transform .28s cubic-bezier(.2,.9,.3,1);
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
        .pagination {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 10px 0;
          margin: 0;
        }
        .pagination button {
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          min-height: 36px;
        }
        .pagination button.active {
          background: var(--accent);
          color: white;
          border: none;
        }
        .pagination button:not(.active) {
          background: white;
          border: 1px solid rgba(12,18,26,0.06);
          color: var(--bg-2);
        }
        .account-modal {
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
        .account-modal-content {
          background: var(--card);
          border-radius: var(--radius);
          max-width: 400px;
          width: 90%;
          padding: 24px;
          box-shadow: var(--shadow-lg);
          position: relative;
        }
        .account-modal-close {
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
        .account-modal-close:hover {
          background: rgba(12,18,26,0.06);
        }
        .account-modal h2 {
          font-family: 'Playfair Display', serif;
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 16px;
          color: var(--bg-2);
        }
        .account-modal form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .account-modal input {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(12,18,26,0.06);
          font-size: 16px;
          color: var(--bg-2);
        }
        .account-modal input::placeholder {
          color: var(--muted);
        }
        .account-modal button[type="submit"] {
          padding: 12px;
          border-radius: 10px;
          background: var(--accent);
          color: white;
          border: none;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(14,165,164,0.14);
        }
        .account-modal button[type="submit"]:hover {
          background: #0d8d8c;
        }
        .account-modal .toggle-form {
          text-align: center;
          font-size: 14px;
          color: var(--muted);
          margin-top: 12px;
        }
        .account-modal .toggle-form a {
          color: var(--accent);
          text-decoration: none;
          font-weight: 700;
          cursor: pointer;
        }
        .account-modal .toggle-form a:hover {
          text-decoration: underline;
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
        @media (max-width: 900px) {
          .shop-main {
            grid-template-columns: 1fr;
          }
          .sidebar {
            position: sticky;
            top: 64px;
            z-index: 100;
            padding: 12px;
          }
          .sidebar details {
            margin-bottom: 12px;
          }
          .sidebar summary {
            font-weight: 700;
            padding: 10px;
            border-radius: 10px;
            background: #f7fafc;
            cursor: pointer;
          }
          .filter-group {
            padding: 0 10px;
          }
          .hero-section {
            padding: 32px 0;
          }
          .hero-title {
            font-size: 36px;
          }
          .hero-subtitle {
            font-size: 16px;
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
          .cart-panel {
            right: 0;
            left: 0;
            width: 100%;
            top: 72px;
            height: calc(100vh - 88px);
            border-radius: 12px;
            border-radius: 0;
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
          .account-modal h2 {
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
        }
        @media (max-width: 600px) {
          .wrap {
            width: 92%;
          }
          .hero-title {
            font-size: 28px;
          }
          .hero-subtitle {
            font-size: 14px;
          }
          .product-card img, .category-card img {
            height: 120px;
          }
          .product-card h4 {
            font-size: 16px;
          }
          .product-meta, .product-desc {
            font-size: 13px;
          }
        }
      `}</style>
      {/* Navbar */}
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
            <Link href="/shop">Shop</Link>
            <Link href="/for-business">For Business</Link>
            <Link href="/#contact">Contact</Link>
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
                  <motion.div className="dropdown" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    <Link href="/dashboard"><button>Dashboard</button></Link>
                    <button onClick={handleSignOut}>Sign Out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button className="btn-primary">Book Now</button>
            <button className="cart-btn" onClick={() => setCartOpen(!cartOpen)} aria-label="Open cart">
              <ShoppingCart className="h-5 w-5" />
              <div className="cart-badge" style={{ display: getTotalItems() > 0 ? 'block' : 'none' }}>
                {getTotalItems()}
              </div>
            </button>
            <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H21M3 12H21M3 18H21" stroke="black" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {/* Mobile menu and other nav elements */}
        <nav className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`} aria-label="Mobile menu">
          <Link href="/#services">Services</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/for-business">For Business</Link>
          <Link href="/#contact">Contact</Link>
          <div style={{ position: 'relative' }}>
            <Link href="#" onClick={(e) => { e.preventDefault(); user ? setDropdownOpen(!dropdownOpen) : setAccountModalOpen(true); }}>
              {user ? 'Profile' : 'Account'}
            </Link>
            <AnimatePresence>
              {user && dropdownOpen && (
                <motion.div className="dropdown" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Link href="/dashboard"><button>Dashboard</button></Link>
                  <button onClick={handleSignOut}>Sign Out</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>
      </header>
      {/* Body */}
      <main className="wrap" role="main">
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">Shop Premium Detailing Products</h1>
            <p className="hero-subtitle">Discover professional-grade cleaners, waxes, and tools to keep your car sparkling clean.</p>
            <button className="btn-primary hero-cta" onClick={() => document.querySelector('.products-grid')?.scrollIntoView({ behavior: 'smooth' })}>
              Shop Now
            </button>
          </div>
        </section>
        <section className="category-previews">
          <div className="category-card">
            <Image src="https://via.placeholder.com/200x100?text=Interior" alt="Interior Cleaning" width={200} height={100} />
            <h4>Interior Cleaning</h4>
          </div>
          <div className="category-card">
            <Image src="https://via.placeholder.com/200x100?text=Exterior" alt="Exterior Cleaning" width={200} height={100} />
            <h4>Exterior Cleaning</h4>
          </div>
          <div className="category-card">
            <Image src="https://via.placeholder.com/200x100?text=Tools" alt="Detailing Tools" width={200} height={100} />
            <h4>Detailing Tools</h4>
          </div>
          <div className="category-card">
            <Image src="https://via.placeholder.com/200x100?text=Packages" alt="Service Packages" width={200} height={100} />
            <h4>Service Packages</h4>
          </div>
        </section>
        <section className="trust-banner">
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7h20L12 2zm0 5v15m-10 0h20" />
            </svg>
            Free Shipping Over $50
          </div>
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            Secure Checkout
          </div>
          <div className="trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            30-Day Returns
          </div>
        </section>
        <section className="max-w-7xl mx-auto px-6 mb-10 flex flex-col md:flex-row justify-between gap-4 items-center">
          <div className="flex items-center w-full md:w-1/2 gap-2">
            <Search className="w-5 h-5 text-gray-500" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap: 4px;">
            <Select onValueChange={setCategory} defaultValue="all">
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Interior">Interior</SelectItem>
                <SelectItem value="Exterior">Exterior</SelectItem>
                <SelectItem value="Tools">Tools</SelectItem>
                <SelectItem value="Packages">Service Packages</SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={setSort} defaultValue="default">
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="low-high">Price: Low to High</SelectItem>
                <SelectItem value="high-low">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>
        <section className="products-grid max-w-7xl mx-auto px-6 pb-16">
          {error && <p className="text-center text-gray-500">{error}</p>}
          {paginatedProducts.length === 0 && !error ? (
            <p className="text-center text-gray-500">No products found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {paginatedProducts.map((product) => (
                <Card
                  key={product.id}
                  className="rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group"
                >
                  <div className="aspect-square overflow-hidden relative">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                      onClick={() => setQuickView(product)}
                    />
                    <button
                      onClick={() => toggleWishlist(product)}
                      className="absolute top-3 right-3 bg-white rounded-full p-2 shadow-md"
                    >
                      <Heart
                        className={`h-5 w-5 ${wishlist.find((item) => item.id === product.id) ? 'text-red-500 fill-red-500' : 'text-gray-600'}`}
                      />
                    </button>
                  </div>
                  <CardContent className="p-4 flex flex-col items-center text-center">
                    <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
                    <p className="text-gray-600 mb-3">${product.price.toFixed(2)}</p>
                    <Button
                      onClick={(e) => handleAddToCart(product, e)}
                      className="w-full bg-black text-white hover:bg-gray-800"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
        <section className="pagination max-w-7xl mx-auto" style={{ padding: '32px 0' }}>
          <div className="pagination">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => setCurrentPage(i + 1)}
                className={currentPage === i + 1 ? 'active' : ''}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </section>
        <section className="shipping-progress max-w-7xl mx-auto">
          <div className="progress-text">{progressText}</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressWidth}%` }}></div>
          </div>
        </section>
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
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
              >
                <button
                  className="quick-view-close"
                  onClick={() => setQuickView(null)}
                >
                  <X className="h-6 w-6" />
                </button>
                <div className="quick-view-image">
                  <img src={quickView.image} alt={quickView.name} />
                </div>
                <div className="quick-view-details">
                  <h3>{quickView.name}</h3>
                  <div className="product-meta">
                    <span>${quickView.price.toFixed(2)}</span>
                    {quickView.rating && (
                      <div className="rating">
                        <span className="stars">{'★'.repeat(Math.round(quickView.rating))}{'☆'.repeat(5 - Math.round(quickView.rating))}</span>
                        <span>{quickView.rating.toFixed(1)} ({quickView.reviews || 0} reviews)</span>
                      </div>
                    )}
                  </div>
                  <div className={`badge ${quickView.stock <= 10 ? 'stock-low' : ''}`}>
                    {quickView.badge}
                    {quickView.badge && quickView.stock <= 10 ? ' • ' : ''}
                    {quickView.stock <= 10 ? 'Low Stock' : ''}
                  </div>
                  <p>{quickView.expanded_description || quickView.description}</p>
                  <Button className="product-cta" onClick={() => handleAddToCart(quickView)}>
                    <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {cartOpen && (
            <motion.div
              className="cart-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <header>
                <h3>{activeCartTab === 'cart' ? 'Your Cart' : 'Your Wishlist'}</h3>
                <button onClick={() => setCartOpen(false)}>
                  <X className="h-6 w-6" />
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
                {activeCartTab === 'cart' ? (
                  cart.length === 0 ? (
                    <p>Your cart is empty</p>
                  ) : (
                    <>
                      {cart.map((item) => (
                        <div key={item.id} className="cart-item">
                          <div className="cart-thumb">
                            <img
                              src={item.image}
                              alt={item.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </div>
                          <div>
                            <h4>{item.name}</h4>
                            <p>${item.price.toFixed(2)}</p>
                            <div className="qty-controls">
                              <button className="qty-btn" onClick={() => updateCartQty(item.id, 'decrease')}>-</button>
                              <span>{item.qty}</span>
                              <button className="qty-btn" onClick={() => updateCartQty(item.id, 'increase')}>+</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px solid rgba(12,18,26,0.04)', marginTop: '16px', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: '12px' }}>
                          <span>Subtotal</span>
                          <span>${getSubtotal().toFixed(2)}</span>
                        </div>
                        <Button
                          className="product-cta"
                          style={{ width: '100%' }}
                          onClick={handlePurchase}
                          disabled={cart.length === 0 || loading}
                        >
                          {loading ? 'Processing...' : 'Checkout'}
                        </Button>
                        <Button
                          className="product-cta"
                          style={{ width: '100%', marginTop: '8px', background: 'white', border: '1px solid rgba(12,18,26,0.06)', color: 'var(--bg-2)' }}
                          onClick={clearCart}
                        >
                          Clear Cart
                        </Button>
                      </div>
                    </>
                  )
                ) : (
                  wishlist.length === 0 ? (
                    <p>Your wishlist is empty</p>
                  ) : (
                    <>
                      {wishlist.map((item) => (
                        <div key={item.id} className="wishlist-item">
                          <img src={item.image} alt={item.name} />
                          <div>
                            <h4>{item.name}</h4>
                            <p>${item.price.toFixed(2)}</p>
                            <Button
                              onClick={() => {
                                addToCart(item);
                                setActiveCartTab('cart');
                              }}
                              style={{ marginTop: '8px', background: 'black', color: 'white' }}
                            >
                              <ShoppingCart className="mr-2 h-4 w-4" /> Add to Cart
                            </Button>
                          </div>
                          <button
                            onClick={() => toggleWishlist(item)}
                            style={{ marginLeft: 'auto', padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid rgba(12,18,26,0.06)' }}
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )
                )}
              </div>
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
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
              >
                <button
                  className="account-modal-close"
                  onClick={() => setAccountModalOpen(false)}
                  aria-label="Close account modal"
                >
                  <X className="h-6 w-6" />
                </button>
                {isLoginForm ? (
                  <>
                    <h2>Log In</h2>
                    <form onSubmit={(e) => { e.preventDefault(); handleAuth(); }}>
                      <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <Button type="submit">Log In</Button>
                      <div className="toggle-form">
                        Don't have an account?{' '}
                        <a onClick={() => { setIsLoginForm(false); setEmail(''); setPassword(''); setConfirmPassword(''); }}>
                          Sign Up
                        </a>
                      </div>
                    </form>
                  </>
                ) : (
                  <>
                    <h2>Sign Up</h2>
                    <form onSubmit={(e) => { e.preventDefault(); handleAuth(); }}>
                      <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <Input
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <Button type="submit">Sign Up</Button>
                      <div className="toggle-form">
                        Already have an account?{' '}
                        <a onClick={() => { setIsLoginForm(true); setEmail(''); setPassword(''); setConfirmPassword(''); }}>
                          Log In
                        </a>
                      </div>
                    </form>
                  </>
                )}
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
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
              >
                <button
                  className="wishlist-popup-close"
                  onClick={() => setWishlistPopupOpen(false)}
                  aria-label="Close wishlist popup"
                >
                  <X className="h-7 w-7" />
                </button>
                <p>You must be logged in to favorite products.</p>
                <Button
                  className="wishlist-popup-login"
                  style={{ marginTop: '8px' }}
                  onClick={() => {
                    setWishlistPopupOpen(false);
                    setAccountModalOpen(true);
                  }}
                >
                  Log In
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="sticky-cart">
          <button className="sticky-cart-btn" onClick={() => setCartOpen(!cartOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="7" width="18" height="11" rx="1.2" stroke="white" strokeWidth="1.6" fill="none"></rect>
              <line x1="3" y1="7" x2="21" y2="7" stroke="white" strokeWidth="1.6" />
              <path d="M6 7L9 3H15L18 7" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="8.5" y1="7.5" x2="8.5" y2="18.5" stroke="white" strokeWidth="1.2" />
              <line x1="11.5" y1="7.5" x2="11.5" y2="18.5" stroke="white" strokeWidth="1.2" />
              <line x1="14.5" y1="7.5" x2="14.5" y2="18.5" stroke="white" strokeWidth="1.2" />
            </svg>
            <span>Cart ({getTotalItems()})</span>
          </button>
        </div>
      </main>
      {/* Footer */}
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
            <Link href="/for-business">Join Our Platform</Link>
            <Link href="/#resources">Resources & Tips</Link>
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
                    emailInput.value = ''; // Clear input
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