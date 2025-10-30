'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function DetailerDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [calendarView, setCalendarView] = useState('month');
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace('/login');

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (prof?.role !== 'detailer') return router.replace('/');
      setUserId(session.user.id);
      setProfile(prof);
    };
    init();
  }, [router]);

  const fetchData = async () => {
    if (!userId) return;

    const [apptsRes, prodsRes, ordersRes] = await Promise.all([
      supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id (full_name, email, phone),
          vehicle:vehicle_id (vehicle_make, vehicle_model, vehicle_year)
        `)
        .eq('detailer_id', userId)
        .order('appointment_date', { ascending: false }),

      supabase
        .from('products')
        .select('*')
        .eq('detailer_id', userId)
        .order('created_at', { ascending: false }),

      supabase
        .from('orders')
        .select(`
          *,
          product:product_id (name, image),
          customer:customer_id (full_name, email)
        `)
        .in('product_id', (await supabase.from('products').select('id').eq('detailer_id', userId)).data?.map(p => p.id) || [])
        .order('created_at', { ascending: false })
    ]);

    setAppointments(apptsRes.data ?? []);
    setProducts(prodsRes.data ?? []);
    setOrders(ordersRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (userId) fetchData(); }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const apptSub = supabase
      .channel('appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `detailer_id=eq.${userId}` },
        payload => {
          if (payload.eventType === 'INSERT') setAppointments(prev => [payload.new, ...prev]);
          if (payload.eventType === 'UPDATE') setAppointments(prev => prev.map(a => a.id === payload.new.id ? payload.new : a));
        }
      )
      .subscribe();

    const prodSub = supabase
      .channel('products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `detailer_id=eq.${userId}` },
        payload => {
          if (payload.eventType === 'INSERT') setProducts(prev => [payload.new, ...prev]);
          if (payload.eventType === 'UPDATE') setProducts(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
          if (payload.eventType === 'DELETE') setProducts(prev => prev.filter(p => p.id !== payload.old.id));
        }
      )
      .subscribe();

    const orderSub = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(apptSub);
      supabase.removeChannel(prodSub);
      supabase.removeChannel(orderSub);
    };
  }, [userId]);

  if (loading) return <div className="p-8 text-center">Loading dashboard...</div>;

  const upcomingAppts = appointments.filter(a => new Date(a.appointment_date) >= new Date()).length;
  const totalRevenue = appointments.reduce((sum, a) => sum + (a.total_price || 0), 0);
  const filteredAppointments = appointments.filter(a =>
    a.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.service_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAcceptLead = async (apptId: string) => {
    await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', apptId);
  };

  const handleSaveProduct = async () => {
    const name = (document.getElementById('product-name') as HTMLInputElement).value;
    const category = (document.getElementById('product-category') as HTMLSelectElement).value;
    const price = parseFloat((document.getElementById('product-price') as HTMLInputElement).value);
    const stock = parseInt((document.getElementById('product-stock') as HTMLInputElement).value);

    if (editingProduct) {
      await supabase.from('products').update({ name, category, price, stock }).eq('id', editingProduct.id);
    } else {
      await supabase.from('products').insert({ name, category, price, stock, detailer_id: userId });
    }
    setShowInventoryForm(false);
    setEditingProduct(null);
  };

  return (
    <>
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Detailer Dashboard — Detailing Near You</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&family=Playfair+Display:wght@500;700&display=swap" rel="stylesheet" />
          <style dangerouslySetInnerHTML={{ __html: `
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
              background: linear-gradient(180deg, #f7fafc 0%, #e5e7eb 100%);
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              color: #0b1220;
              line-height: 1.5;
            }
            .wrap { width: min(1200px, 94%); margin: 0 auto; }
            header {
              position: sticky;
              top: 0;
              z-index: 999;
              backdrop-filter: blur(12px);
              background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.8));
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
              padding: 8px 12px;
              border-radius: 10px;
              transition: background 0.2s ease;
            }
            nav.primary a:hover {
              background: rgba(14,165,164,0.1);
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
              background: rgba(14,165,164,0.1);
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
              transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .btn-ghost:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 12px rgba(0,0,0,0.1);
            }
            .btn-primary {
              padding: 10px 14px;
              border-radius: 10px;
              background: linear-gradient(135deg, var(--accent), #027373);
              color: white;
              border: none;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 8px 24px rgba(14,165,164,0.2);
              min-height: 44px;
              position: relative;
              overflow: hidden;
            }
            .btn-primary:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 30px rgba(14,165,164,0.3);
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
              background: linear-gradient(135deg, var(--accent), #027373);
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
              background: linear-gradient(180deg, #ffffff, #f7fafc);
              border-radius: 12px;
              padding: 16px;
              box-shadow: var(--shadow-sm);
              border: 1px solid rgba(12,18,26,0.04);
              position: sticky;
              top: 80px;
              height: fit-content;
            }
            .sidebar h3 {
              font-family: 'Playfair Display', serif;
              font-size: 20px;
              font-weight: 700;
              margin: 0 0 16px;
              color: var(--bg-2);
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
              color: #0b1220;
              border-radius: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
              transition: all 0.2s ease;
            }
            .sidebar-nav button.active, .sidebar-nav button:hover {
              background: rgba(14,165,164,0.1);
              color: var(--accent);
              transform: translateX(4px);
            }
            .sidebar-nav svg {
              width: 20px;
              height: 20px;
            }
            .tab-content {
              display: none;
              background: white;
              border-radius: 12px;
              padding: 24px;
              box-shadow: var(--shadow-lg);
              border: 1px solid rgba(12,18,26,0.04);
              animation: fadeIn 0.3s ease;
            }
            .tab-content.active {
              display: block;
            }
            .tab-content h2 {
              font-family: 'Playfair Display', serif;
              font-size: 36px;
              margin: 0 0 24px;
              color: var(--bg-2);
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
              background: linear-gradient(135deg, #ffffff, #f7fafc);
              border-radius: 12px;
              padding: 20px;
              box-shadow: var(--shadow-sm);
              text-align: center;
              transition: transform 0.2s ease;
            }
            .metric-card:hover {
              transform: translateY(-4px);
              box-shadow: 0 12px 24px rgba(0,0,0,0.1);
            }
            .metric-card h4 {
              font-size: 14px;
              font-weight: 700;
              color: var(--muted);
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
              background: #f7fafc;
              border-radius: 12px;
              padding: 16px;
            }
            .activity-item {
              padding: 12px;
              border-radius: 8px;
              background: white;
              margin-bottom: 8px;
              box-shadow: 0 4px 8px rgba(0,0,0,0.05);
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
              border: 1px solid rgba(12,18,26,0.06);
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
              background: white;
              border-radius: 12px;
              overflow: hidden;
            }
            .leads-table th, .leads-table td {
              padding: 14px;
              text-align: left;
              border-bottom: 1px solid rgba(12,18,26,0.04);
            }
            .leads-table th {
              font-weight: 700;
              color: var(--bg-2);
              background: rgba(14,165,164,0.05);
            }
            .leads-table tr:nth-child(even) {
              background: #f7fafc;
            }
            .leads-table td {
              color: var(--muted);
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
              background: var(--bg-2);
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
              background: white;
              border: 1px solid rgba(12,18,26,0.06);
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
              background: white;
              border-radius: 12px;
              padding: 16px;
              box-shadow: var(--shadow-sm);
            }
            .calendar-header {
              display: grid;
              grid-template-columns: repeat(7, 1fr);
              text-align: center;
              font-weight: 700;
              padding: 12px 0;
              background: rgba(14,165,164,0.05);
              border-radius: 8px;
              margin-bottom: 8px;
            }
            .calendar-grid {
              display: grid;
              grid-template-columns: repeat(7, 1fr);
              gap: 4px;
            }
            .calendar-day {
              padding: 12px;
              text-align: center;
              border: 1px solid rgba(12,18,26,0.04);
              border-radius: 8px;
              min-height: 120px;
              position: relative;
              background: #ffffff;
              transition: background 0.2s ease;
            }
            .calendar-day:hover {
              background: rgba(14,165,164,0.05);
            }
            .calendar-day.empty {
              background: #f7fafc;
            }
            .appointment {
              background: var(--accent);
              color: white;
              padding: 6px;
              border-radius: 6px;
              margin: 4px 0;
              font-size: 12px;
              cursor: move;
              position: relative;
            }
            .appointment:hover::after {
              content: attr(data-details);
              position: absolute;
              top: -40px;
              left: 50%;
              transform: translateX(-50%);
              background: var(--bg-2);
              color: white;
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 12px;
              z-index: 10;
            }
            .inventory-controls {
              display: flex;
              gap: 12px;
              margin-bottom: 16px;
            }
            .inventory-controls input {
              padding: 12px;
              border-radius: 10px;
              border: 1px solid rgba(12,18,26,0.06);
              font-size: 14px;
              flex: 1;
            }
            .inventory-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 14px;
              background: white;
              border-radius: 12px;
              overflow: hidden;
            }
            .inventory-table th, .inventory-table td {
              padding: 14px;
              text-align: left;
              border-bottom: 1px solid rgba(12,18,26,0.04);
            }
            .inventory-table th {
              font-weight: 700;
              color: var(--bg-2);
              background: rgba(14,165,164,0.05);
            }
            .inventory-table tr:nth-child(even) {
              background: #f7fafc;
            }
            .inventory-table td {
              color: var(--muted);
            }
            .inventory-form {
              display: none;
              margin-top: 16px;
              padding: 20px;
              background: #f7fafc;
              border-radius: 12px;
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
              border: 1px solid rgba(12,18,26,0.06);
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
              color: var(--bg-2);
            }
            .settings-form input, .settings-form textarea, .settings-form select {
              width: 100%;
              padding: 12px;
              border-radius: 10px;
              border: 1px solid rgba(12,18,26,0.06);
              font-size: 14px;
            }
            .settings-form textarea {
              min-height: 100px;
              resize: vertical;
            }
            .availability-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
              gap: 12px;
            }
            .availability-day {
              padding: 12px;
              border-radius: 10px;
              border: 1px solid rgba(12,18,26,0.06);
              background: #ffffff;
              text-align: center;
            }
            .services-list {
              display: grid;
              gap: 12px;
            }
            .service-item {
              padding: 12px;
              border-radius: 10px;
              border: 1px solid rgba(12,18,26,0.06);
              background: #ffffff;
              display: flex;
              justify-content: space-between;
              align-items: center;
              transition: transform 0.2s ease;
            }
            .service-item:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 12px rgba(0,0,0,0.1);
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
              background: white;
              border-radius: 12px;
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
              color: var(--bg-2);
            }
            .modal-content .form-group {
              margin-bottom: 16px;
            }
            .modal-content .btn-primary, .modal-content .btn-ghost {
              width: 48%;
              margin: 0 1%;
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
                border: 1px solid rgba(12,18,26,0.06);
                background: white;
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
          ` }} />
        </head>
        <body>
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
                <a href="/">Services</a>
                <a href="/shop">Shop</a>
                <a href="/for-business">For Business</a>
                <a href="/contact">Contact</a>
              </nav>
              <div className="actions">
                <div className="user-info">
                  <img src="https://via.placeholder.com/32?text=U" alt="User avatar" />
                  <span>{profile?.full_name || 'Elite Detailing'}</span>
                </div>
                <div className="notification-bell">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="notification-badge">3</span>
                </div>
                <button className="btn-ghost" id="open-account-modal">
                  <span>Account</span>
                  <svg className="account-icon" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" stroke="black" strokeWidth="1.6" />
                    <path d="M6 20C6 16.6863 8.68629 14 12 14C15.3137 14 18 16.6863 18 20" stroke="black" strokeWidth="1.6" />
                  </svg>
                </button>
                <button className="menu-toggle" onClick={() => document.getElementById('mobile-menu')?.classList.toggle('open')}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M3 6H21M3 12H21M3 18H21" stroke="black" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <nav className="mobile-menu" id="mobile-menu">
              <a href="/">Services</a>
              <a href="/shop">Shop</a>
              <a href="/for-business">For Business</a>
              <a href="/contact">Contact</a>
              <a href="/detailer/dashboard">Dashboard</a>
              <a href="#">Account</a>
            </nav>
          </header>

          <main className="wrap dashboard-main">
            <aside className="sidebar">
              <h3>Detailer Dashboard</h3>
              <div className="sidebar-nav">
                {['overview', 'leads', 'schedule', 'inventory', 'settings'].map(tab => (
                  <button
                    key={tab}
                    className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {tab === 'overview' && <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M9 22V12h6v10" />}
                      {tab === 'leads' && <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75" />}
                      {tab === 'schedule' && <path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18" />}
                      {tab === 'inventory' && <path d="M21 8v13H3V8 M1 3h22v5H1z M10 12h4" />}
                      {tab === 'settings' && <path d="M12 19.5v-15M5 12l3-3m2 6h7m-7-6l3 3" />}
                    </svg>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </aside>

            <div>
              <div className="welcome-banner">
                <h1>Welcome, {profile?.full_name || 'Elite Detailing'}!</h1>
                <p>Manage your leads, schedule, and inventory with ease.</p>
              </div>

              {activeTab === 'overview' && (
                <section className="tab-content active">
                  <h2>Dashboard Overview</h2>
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <h4>Total Leads</h4>
                      <p>{appointments.filter(a => ['pending', 'contacted'].includes(a.status)).length}</p>
                    </div>
                    <div className="metric-card">
                      <h4>Upcoming Appointments</h4>
                      <p>{upcomingAppts}</p>
                    </div>
                    <div className="metric-card">
                      <h4>Monthly Revenue</h4>
                      <p>${totalRevenue.toFixed(2)}</p>
                    </div>
                  </div>
                  <h3>Recent Activity</h3>
                  <div className="activity-feed">
                    {[...appointments, ...orders]
                      .sort((a, b) => new Date(b.appointment_date || b.created_at).getTime() - new Date(a.appointment_date || a.created_at).getTime())
                      .slice(0, 5)
                      .map(item => (
                        <div key={item.id} className="activity-item">
                          {item.service_type
                            ? `${item.customer?.full_name} booked ${item.service_type}`
                            : `${item.customer?.full_name} bought ${item.product?.name}`}
                          <span>({new Date(item.appointment_date || item.created_at).toLocaleString()})</span>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {activeTab === 'leads' && (
                <section className="tab-content active">
                  <h2>Manage Leads</h2>
                  <div className="leads-controls">
                    <input
                      type="text"
                      placeholder="Search by name or service"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Email</th><th>Phone</th><th>Service</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppointments
                        .filter(a => ['pending', 'contacted'].includes(a.status))
                        .map(a => (
                          <tr key={a.id}>
                            <td>{a.customer?.full_name}</td>
                            <td>{a.customer?.email}</td>
                            <td>{a.customer?.phone}</td>
                            <td>{a.service_type}</td>
                            <td>{a.status}</td>
                            <td className="actions">
                              <button className="btn-contact" onClick={() => window.open(`mailto:${a.customer?.email}`)}>Contact</button>
                              <button className="btn-accept" onClick={() => handleAcceptLead(a.id)}>Accept</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </section>
              )}

              {activeTab === 'schedule' && (
                <section className="tab-content active">
                  <h2>Schedule</h2>
                  <div className="calendar-controls">
                    <div>
                      <button className="btn-primary" onClick={() => setShowAppointmentModal(true)}>Add Appointment</button>
                      <button className="btn-ghost" onClick={() => window.print()}>Export to PDF</button>
                    </div>
                    <div className="calendar-view">
                      {['month', 'week', 'day'].map(view => (
                        <button
                          key={view}
                          className={`view-btn ${calendarView === view ? 'active' : ''}`}
                          onClick={() => setCalendarView(view)}
                        >
                          {view.charAt(0).toUpperCase() + view.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="calendar">
                    {appointments.map(a => (
                      <div key={a.id} className="appointment">
                        <strong>{new Date(a.appointment_date).toLocaleString()}</strong><br />
                        {a.customer?.full_name} – {a.service_type}<br />
                        {a.vehicle?.vehicle_make} {a.vehicle?.vehicle_model} ({a.vehicle?.vehicle_year})
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'inventory' && (
                <section className="tab-content active">
                  <h2>Manage Inventory</h2>
                  <div className="inventory-controls">
                    <input type="text" placeholder="Search products" />
                    <button className="btn-primary" onClick={() => {
                      setEditingProduct(null);
                      setShowInventoryForm(true);
                    }}>Add Product</button>
                  </div>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Sales</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{p.category}</td>
                          <td>${p.price?.toFixed(2)}</td>
                          <td>{p.stock}</td>
                          <td>{orders.filter(o => o.product_id === p.id).reduce((s, o) => s + o.quantity, 0)}</td>
                          <td>
                            <button className="btn-primary" onClick={() => {
                              setEditingProduct(p);
                              setShowInventoryForm(true);
                              (document.getElementById('product-name') as HTMLInputElement).value = p.name;
                              (document.getElementById('product-category') as HTMLSelectElement).value = p.category;
                              (document.getElementById('product-price') as HTMLInputElement).value = p.price;
                              (document.getElementById('product-stock') as HTMLInputElement).value = p.stock;
                            }}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className={`inventory-form ${showInventoryForm ? 'active' : ''}`}>
                    <h3>{editingProduct ? 'Edit' : 'Add'} Product</h3>
                    <div className="form-group">
                      <label htmlFor="product-name">Product Name</label>
                      <input type="text" id="product-name" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="product-category">Category</label>
                      <select id="product-category" required>
                        <option value="Interior">Interior</option>
                        <option value="Exterior">Exterior</option>
                        <option value="Tools">Tools</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="product-price">Price</label>
                      <input type="number" id="product-price" step="0.01" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="product-stock">Stock</label>
                      <input type="number" id="product-stock" required />
                    </div>
                    <button className="btn-primary" onClick={handleSaveProduct}>Save Product</button>
                    <button className="btn-ghost" onClick={() => setShowInventoryForm(false)}>Cancel</button>
                  </div>
                </section>
              )}

              {activeTab === 'settings' && (
                <section className="tab-content active">
                  <h2>Settings</h2>
                  <div className="settings-section">
                    <div>
                      <h3>Business Profile</h3>
                      <div className="form-group">
                        <label htmlFor="business-name">Business Name</label>
                        <input type="text" id="business-name" defaultValue={profile?.full_name} />
                      </div>
                      <div className="form-group">
                        <label htmlFor="business-desc">Description</label>
                        <textarea id="business-desc">Professional car detailing services in Auto City.</textarea>
                      </div>
                      <div className="form-group">
                        <label htmlFor="business-logo">Logo</label>
                        <input type="file" id="business-logo" accept="image/*" />
                      </div>
                    </div>
                    <div>
                      <h3>Availability</h3>
                      <div className="availability-grid">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                          <div key={day} className="availability-day">
                            <label><input type="checkbox" defaultChecked={day !== 'Sunday'} /> {day}</label>
                            <input type="time" defaultValue="09:00" /> - <input type="time" defaultValue="18:00" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3>Services Offered</h3>
                      <div className="services-list">
                        {appointments.map(a => a.service_type).filter((v, i, a) => a.indexOf(v) === i).map(service => (
                          <div key={service} className="service-item">
                            <span>{service} ($199.99)</span>
                            <button className="btn-ghost">Edit</button>
                          </div>
                        ))}
                      </div>
                      <button className="btn-primary">Add Service</button>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <div className={`modal ${showAppointmentModal ? 'active' : ''}`}>
              <div className="modal-content">
                <h3>Add Appointment</h3>
                <div className="form-group">
                  <label htmlFor="appt-customer">Customer Name</label>
                  <input type="text" id="appt-customer" required />
                </div>
                <div className="form-group">
                  <label htmlFor="appt-service">Service</label>
                  <select id="appt-service" required>
                    <option value="Full Detail">Full Detail</option>
                    <option value="Exterior Wash">Exterior Wash</option>
                    <option value="Interior Clean">Interior Clean</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="appt-date">Date</label>
                  <input type="date" id="appt-date" required />
                </div>
                <div className="form-group">
                  <label htmlFor="appt-time">Time</label>
                  <input type="time" id="appt-time" required />
                </div>
                <div className="form-group">
                  <label htmlFor="appt-notes">Notes</label>
                  <textarea id="appt-notes"></textarea>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button className="btn-primary" onClick={async () => {
                    const customer = (document.getElementById('appt-customer') as HTMLInputElement).value;
                    const service = (document.getElementById('appt-service') as HTMLSelectElement).value;
                    const date = (document.getElementById('appt-date') as HTMLInputElement).value;
                    const time = (document.getElementById('appt-time') as HTMLInputElement).value;
                    const notes = (document.getElementById('appt-notes') as HTMLTextAreaElement).value;
                    if (customer && service && date && time) {
                      await supabase.from('appointments').insert({
                        detailer_id: userId,
                        customer_id: null,
                        service_type: service,
                        appointment_date: `${date}T${time}:00Z`,
                        status: 'confirmed',
                        notes
                      });
                      setShowAppointmentModal(false);
                    }
                  }}>Save</button>
                  <button className="btn-ghost" onClick={() => setShowAppointmentModal(false)}>Cancel</button>
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
                <p style={{ color: 'var(--muted)', fontSize: '14px' }}>The capital of car detailing, connecting owners with top-tier detailers nationwide.</p>
                <div className="social-links">
                  <a href="https://x.com" aria-label="Twitter/X"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2.2h3.3l-7.2 8.3 8.5 11.2h-6.6l-5.2-6.8-5.9 6.8H2.5l7.7-8.8L2.1 2.2h6.8l4.7 6.2 5.3-6.2zm-1.2 17.8h1.8L6.8 4.1H4.9l12.8 15.9z"/></svg></a>
                  <a href="https://instagram.com" aria-label="Instagram"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0-2.2c-3.3 0-3.7 0-5 .1-1.3.1-2.2.3-3 .7-.8.4-1.5.9-2.1 1.5-.6.6-1.1 1.3-1.5 2.1-.4.8-.6 1.7-.7 3-.1 1.3-.1 1.7-.1 5s0 3.7.1 5c.1 1.3.3 2.2.7 3 .4.8.9 1.5 1.5 2.1.6.6 1.3 1.1 2.1 1.5.8.4 1.7.6 3 .7 1.3.1 1.7.1 5 .1s3.7 0 5-.1c1.3-.1 2.2-.3 3-.7.8-.4 1.5-.9 2.1-1.5.6-.6 1.1-1.3 1.5-2.1.4-.8.6-1.7.7-3 .1-1.3.1-1.7.1-5s0-3.7-.1-5c-.1-1.3-.3-2.2-.7-3-.4-.8-.9-1.5-1.5-2.1-.6-.6-1.3-1.1-2.1-1.5-.8-.4-1.7-.6-3-.7-1.3-.1-1.7-.1-5-.1zm0 5.8c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm6.2-10.2c-.8 0-1.4.6-1.4 1.4s.6 1.4 1.4 1.4 1.4-.6 1.4-1.4-.6-1.4-1.4-1.4z"/></svg></a>
                  <a href="https://facebook.com" aria-label="Facebook"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.1c0-6.6-5.4-12-12-12S0 5.5 0 12.1c0 6 4.4 11 10.1 11.9v-8.4h-3V12.1h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.4 0-1.8.7-1.8 1.7v2.1h3.2l-.5 3.5h-2.7V24c5.7-.9 10.1-5.9 10.1-11.9z"/></svg></a>
                </div>
              </div>
              <div className="footer-col">
                <h4>For Customers</h4>
                <a href="/#services">Find a Detailer</a>
                <a href="/#shop">Shop Products</a>
                <a href="/#membership">Membership Benefits</a>
                <a href="/#contact">Contact Us</a>
                <a href="/#faq">FAQ</a>
              </div>
              <div className="footer-col">
                <h4>For Detailers</h4>
                <a href="/for-business">Join Our Platform</a>
                <a href="/#resources">Resources & Tips</a>
                <a href="/#support">Support</a>
                <a href="/detailer/dashboard">Dashboard Login</a>
              </div>
              <div className="footer-col">
                <h4>Stay Connected</h4>
                <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '0 0 12px' }}>Subscribe for exclusive offers and detailing tips.</p>
                <form className="newsletter-form">
                  <input type="email" placeholder="Enter your email" />
                  <button type="submit">Subscribe</button>
                </form>
              </div>
            </div>
            <div className="wrap footer-bottom">
              © <span>{new Date().getFullYear()}</span> Detailing Near You. All rights reserved. <a href="/#privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy Policy</a> | <a href="/#terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms of Service</a>
            </div>
          </footer>
        </body>
      </html>
    </>
  );
}