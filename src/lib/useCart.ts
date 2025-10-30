// src/lib/useCart.ts
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  qty: number;
  [key: string]: any;
};

export const useCart = () => {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dn_cart_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCart(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error('Cart load error:', e);
      localStorage.removeItem('dn_cart_v1');
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('dn_cart_v1', JSON.stringify(cart));
    } catch (e) {
      console.error('Cart save error:', e);
      toast.error('Failed to save cart');
    }
  }, [cart]);

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id: string, action: 'increase' | 'decrease') => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const newQty = action === 'increase' ? item.qty + 1 : item.qty - 1;
          return newQty > 0 ? { ...item, qty: newQty } : null;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => setCart([]);

  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return {
    cart,
    addToCart,
    updateQty,
    clearCart,
    totalItems,
    subtotal,
  };
};