
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Product, Sale, Expense, StockOut as StockOutType, View, DashboardStats, ShopSettings } from './types';
import { INITIAL_PRODUCTS } from './constants';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import SalesHistory from './components/SalesHistory';
import DailySales from './components/DailySales';
import CashOut from './components/CashOut';
import StockOut from './components/StockOut';
import AIAssistant from './components/AIAssistant';

const DEFAULT_SETTINGS: ShopSettings = {
  returnPolicy: {
    enabled: false,
    content: "Items can be returned within 7 days of purchase in original packaging. Receipt is mandatory.",
    lastUpdated: new Date().toISOString()
  }
};

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>(View.DASHBOARD);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Persistence logic with error boundaries
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('sm_products_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : INITIAL_PRODUCTS;
      }
    } catch (e) {
      console.error("Storage error", e);
    }
    return [...INITIAL_PRODUCTS];
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const saved = localStorage.getItem('sm_sales_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error("Storage error", e);
    }
    return [];
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem('sm_expenses_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error("Expense storage error", e);
    }
    return [];
  });

  const [stockOuts, setStockOuts] = useState<StockOutType[]>(() => {
    try {
      const saved = localStorage.getItem('sm_stockouts_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.error("StockOut storage error", e);
    }
    return [];
  });

  const [shopSettings, setShopSettings] = useState<ShopSettings>(() => {
    try {
      const saved = localStorage.getItem('sm_settings_v2');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Settings storage error", e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('sm_products_v2', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('sm_sales_v2', JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem('sm_expenses_v2', JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('sm_stockouts_v2', JSON.stringify(stockOuts));
  }, [stockOuts]);

  useEffect(() => {
    localStorage.setItem('sm_settings_v2', JSON.stringify(shopSettings));
  }, [shopSettings]);

  // Global Calculation Engine
  const stats: DashboardStats = useMemo(() => {
    let baseRevenue = sales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const stockOutRevenue = stockOuts
      .filter(so => so.reason === 'Sale')
      .reduce((acc, so) => {
        const product = products.find(p => p.id === so.productId);
        return acc + (Number(so.quantity) * (product?.price || 0));
      }, 0);

    const totalRevenue = baseRevenue + stockOutRevenue;
    const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    
    const salesProfit = sales.reduce((acc, s) => {
      const saleCogs = (s.items || []).reduce((itemAcc, item) => {
        const product = products.find(p => p.id === item.productId);
        const cost = product ? (Number(product.cost) || 0) : 0;
        return itemAcc + (cost * (Number(item.quantity) || 0));
      }, 0);
      return acc + (Number(s.total) - saleCogs);
    }, 0);

    const stockOutProfit = stockOuts
      .filter(so => so.reason === 'Sale')
      .reduce((acc, so) => {
        const p = products.find(prod => prod.id === so.productId);
        if (!p) return acc;
        const profitPerUnit = Number(p.price) - Number(p.cost);
        return acc + (profitPerUnit * Number(so.quantity));
      }, 0);

    const totalProfit = (salesProfit + stockOutProfit) - totalExpenses;
    const totalSalesCount = sales.length + stockOuts.filter(so => so.reason === 'Sale').length;
    const lowStockCount = products.filter(p => (Number(p.stock) || 0) <= (Number(p.minStock) || 0)).length;

    return { totalRevenue, totalProfit, totalSales: totalSalesCount, totalExpenses, lowStockCount };
  }, [sales, products, expenses, stockOuts]);

  // Action Handlers
  const handleUpdateProduct = useCallback((updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  }, []);

  const handleAddProduct = useCallback((newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
  }, []);

  const handleDeleteProduct = useCallback((productId: string) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
  }, []);

  const handleAddExpense = useCallback((newExpense: Expense) => {
    setExpenses(prev => [...prev, newExpense]);
  }, []);

  const handleRecordStockOut = useCallback((record: StockOutType) => {
    setStockOuts(prev => [...prev, record]);
    setProducts(prev => prev.map(p => {
      if (p.id === record.productId) {
        return {
          ...p,
          stock: Math.max(0, Number(p.stock) - Number(record.quantity)),
          lastUpdated: new Date().toISOString()
        };
      }
      return p;
    }));
  }, []);

  const handleUpdateSettings = useCallback((newSettings: ShopSettings) => {
    setShopSettings(newSettings);
  }, []);

  const renderView = () => {
    switch (activeView) {
      case View.DASHBOARD: return <Dashboard stats={stats} products={products} sales={sales} />;
      case View.INVENTORY: return (
        <Inventory 
          products={products} 
          onUpdate={handleUpdateProduct} 
          onAdd={handleAddProduct} 
          onDelete={handleDeleteProduct}
          shopSettings={shopSettings}
          onUpdateSettings={handleUpdateSettings}
        />
      );
      case View.SALES: return <SalesHistory sales={sales} />;
      case View.DAILY_SALES: return <DailySales sales={sales} products={products} />;
      case View.CASH_OUT: return <CashOut expenses={expenses} onAddExpense={handleAddExpense} />;
      case View.STOCK_OUT: return (
        <StockOut 
          products={products} 
          stockOuts={stockOuts} 
          onRecordStockOut={handleRecordStockOut} 
        />
      );
      case View.AI_INSIGHTS: return <AIAssistant products={products} sales={sales} />;
      default: return <Dashboard stats={stats} products={products} sales={sales} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans text-slate-900">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <main className="flex-1 overflow-y-auto relative bg-slate-100/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto p-8 md:p-12 min-h-full flex flex-col">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-1.5 h-8 bg-indigo-600 rounded-full"></div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
                  {activeView.replace('_', ' ')}
                </h1>
              </div>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] ml-6">ShopMaster Cloud Systems • Pakistan Region</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 800); }}
                className="flex items-center gap-3 px-6 py-4 bg-white border border-slate-200 rounded-[1.2rem] text-[10px] font-black tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-xl shadow-slate-200/50 active:scale-95 group"
              >
                <svg className={`w-4 h-4 text-indigo-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                REFRESH DATA
              </button>
              
              <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-xl shadow-xl shadow-slate-900/20">
                👤
              </div>
            </div>
          </header>
          
          <div className="flex-1 pb-12">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
