'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, FileText, Trash2, Download, ChevronDown, ChevronUp, 
  CheckCircle, AlertTriangle, FileSpreadsheet, Plus, Edit2, Save, 
  X, RefreshCw, Key, AlertCircle, HelpCircle, Check, Database, Trash
} from 'lucide-react';
import { Invoice, RawInvoice, GstGroup, compileInvoice, roundTo2, RawLineItem } from '@/lib/gst-utils';
import { exportInvoicesToExcel } from '@/lib/excel-export';

export default function Home() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [uploadQueue, setUploadQueue] = useState<{ id: string; name: string; progress: number; status: 'pending' | 'processing' | 'success' | 'error'; error?: string }[]>([]);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [apiKeySet, setApiKeySet] = useState<boolean>(false);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash');

  // Sorting State
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState({
    vendorName: true,
    gstNumber: true,
    customerName: true,
    taxableSubtotal: true,
    totalGst: true,
    total: true,
    confidenceStatus: true,
    createdAt: true,
  });

  const [showColumnDropdown, setShowColumnDropdown] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load invoices and check for API key on mount
  useEffect(() => {
    const savedInvoices = localStorage.getItem('putup_invoices');
    if (savedInvoices) {
      try {
        setInvoices(JSON.parse(savedInvoices));
      } catch (e) {
        console.error('Failed to parse saved invoices:', e);
      }
    }

    const savedModel = localStorage.getItem('putup_selected_model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    
    // Check if key is configured (either in env or local storage as fallback for ease of testing)
    checkApiKeyStatus();
  }, []);

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('putup_selected_model', model);
  };

  const checkApiKeyStatus = async () => {
    try {
      // In Next.js, we check if the user has stored a client-side override in localStorage
      const localKey = localStorage.getItem('GEMINI_API_KEY');
      if (localKey) {
        setApiKeySet(true);
        return;
      }

      // Check if server environment has the API key
      const response = await fetch('/api/extract');
      const data = await response.json();
      if (data.configured) {
        setApiKeySet(true);
      } else {
        setApiKeySet(false);
        setShowApiKeyPrompt(true);
      }
    } catch (e) {
      setApiKeySet(false);
      setShowApiKeyPrompt(true);
    }
  };

  const handleSaveApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem('GEMINI_API_KEY', tempApiKey.trim());
      setApiKeySet(true);
      setShowApiKeyPrompt(false);
      setApiErrorMessage(null);
      // Reload page or reset status
      window.location.reload();
    }
  };

  const handleOpenApiKeySettings = () => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY') || '';
    setTempApiKey(savedKey);
    setShowApiKeyPrompt(true);
  };

  const handleClearApiKey = () => {
    if (confirm('Are you sure you want to delete the saved Gemini API Key?')) {
      localStorage.removeItem('GEMINI_API_KEY');
      setApiKeySet(false);
      setTempApiKey('');
      setShowApiKeyPrompt(false);
      window.location.reload();
    }
  };

  // Sorting and Column Utilities
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortedInvoices = () => {
    return [...invoices].sort((a, b) => {
      let valA: any = a[sortField as keyof Invoice];
      let valB: any = b[sortField as keyof Invoice];

      if (sortField === 'taxableSubtotal') {
        valA = a.total - a.totalGst;
        valB = b.total - b.totalGst;
      }

      if (valA === null || valA === undefined) return sortOrder === 'asc' ? 1 : -1;
      if (valB === null || valB === undefined) return sortOrder === 'asc' ? -1 : 1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <span className="opacity-30 text-[9px] font-mono select-none">⇅</span>;
    }
    return sortOrder === 'asc' 
      ? <span className="text-indigo-400 text-[10px] select-none">▲</span>
      : <span className="text-indigo-400 text-[10px] select-none">▼</span>;
  };

  // Save invoices to local storage whenever they change
  const saveInvoicesList = (newInvoices: Invoice[]) => {
    setInvoices(newInvoices);
    localStorage.setItem('putup_invoices', JSON.stringify(newInvoices));
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(Array.from(e.target.files));
    }
  };

  // Batch Files Upload Handler (Max concurrency: 3)
  const handleFilesUpload = async (files: File[]) => {
    // Filter supported files
    const validFiles = files.filter(file => {
      const isSupported = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type);
      if (!isSupported) {
        alert(`File "${file.name}" is not supported. Please upload PNG, JPG, or PDF.`);
      }
      return isSupported;
    });

    if (validFiles.length === 0) return;

    // Add files to the upload queue state
    const newQueueItems = validFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      progress: 0,
      status: 'pending' as const,
    }));

    setUploadQueue(prev => [...newQueueItems, ...prev]);

    // Process files with controlled concurrency of 3
    const processQueue = [...newQueueItems];
    const activeTasks: Promise<void>[] = [];
    const limit = 3;

    for (const item of processQueue) {
      if (activeTasks.length >= limit) {
        await Promise.race(activeTasks);
      }

      const taskPromise = processFile(item.id, validFiles[processQueue.indexOf(item)])
        .then(() => {
          activeTasks.splice(activeTasks.indexOf(taskPromise), 1);
        });
      activeTasks.push(taskPromise);
    }
    
    await Promise.all(activeTasks);
  };

  // Single file process function
  const processFile = async (queueId: string, file: File): Promise<void> => {
    setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'processing', progress: 30 } : item));

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Add custom headers if API Key or Model selection is set
      const headers: Record<string, string> = {};
      const localKey = localStorage.getItem('GEMINI_API_KEY');
      
      if (localKey) {
        headers['x-gemini-key'] = localKey;
      }
      if (selectedModel) {
        headers['x-gemini-model'] = selectedModel;
      }

      setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, progress: 60 } : item));

      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract invoice data');
      }

      const rawInvoice: RawInvoice = await response.json();
      
      // Compile raw invoice into final model
      const compiled = compileInvoice(rawInvoice, file.name);

      // Add to list and localStorage
      setInvoices(prev => {
        const updated = [compiled, ...prev];
        localStorage.setItem('putup_invoices', JSON.stringify(updated));
        return updated;
      });

      setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'success', progress: 100 } : item));
    } catch (err: any) {
      console.error('Error processing file:', err);
      setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'error', progress: 100, error: err.message || 'Extraction failed' } : item));
    }
  };

  // Handle invoice deletion
  const handleDeleteInvoice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this invoice?')) {
      const updated = invoices.filter(inv => inv.id !== id);
      saveInvoicesList(updated);
      if (expandedInvoiceId === id) setExpandedInvoiceId(null);
    }
  };

  // Excel export trigger
  const handleExport = () => {
    if (invoices.length === 0) return;
    exportInvoicesToExcel(invoices);
  };

  // Load mock data for instant demo
  const loadMockInvoices = () => {
    const mockInvoices: Invoice[] = [
      {
        id: 'mock1',
        fileName: 'Acme_Traders_Inv_9942.pdf',
        vendorName: 'Acme Traders Private Limited',
        gstNumber: '29ABCDE1234F1Z5',
        customerName: 'Vikas Hegde',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        confidenceStatus: 'confident',
        lineItems: [
          { description: 'Office Stationary Kit', quantity: 5, taxableValue: 2000, gstPercent: 5 },
          { description: 'Ergonomic Mesh Chair', quantity: 2, taxableValue: 8220, gstPercent: 18 },
        ],
        gstBreakdown: [
          { gstPercent: 5, taxableValue: 2000, gstAmount: 100 },
          { gstPercent: 18, taxableValue: 8220, gstAmount: 1479.6 },
        ],
        totalGst: 1579.6,
        total: 11799.6
      },
      {
        id: 'mock2',
        fileName: 'Super_Retail_Inv_382.jpg',
        vendorName: 'Super Retail Hub',
        gstNumber: '27GHIJK5678L2Z3',
        customerName: 'Vikas Hegde',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        confidenceStatus: 'confident',
        lineItems: [
          { description: 'Wireless Keyboard & Mouse', quantity: 1, taxableValue: 1500, gstPercent: 18 },
          { description: 'USB-C Charging Cable', quantity: 3, taxableValue: 600, gstPercent: 18 },
        ],
        gstBreakdown: [
          { gstPercent: 18, taxableValue: 2100, gstAmount: 378 },
        ],
        totalGst: 378,
        total: 2478
      },
      {
        id: 'mock3',
        fileName: 'Scan_Blurry_2026.png',
        vendorName: 'Local Hardware Store',
        gstNumber: null, // missing GSTIN triggers low confidence
        customerName: 'Vikas Hegde',
        createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        confidenceStatus: 'low_confidence',
        lineItems: [
          { description: 'Metal Screws & Nails pack', quantity: 10, taxableValue: 450, gstPercent: 0 },
        ],
        gstBreakdown: [
          { gstPercent: 0, taxableValue: 450, gstAmount: 0 },
        ],
        totalGst: 0,
        total: 450
      }
    ];
    saveInvoicesList([...mockInvoices, ...invoices]);
  };

  // Edit Handlers
  const startEditing = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    // Clone invoice to avoid mutating state directly
    setEditingInvoice(JSON.parse(JSON.stringify(invoice)));
    setExpandedInvoiceId(invoice.id);
  };

  const handleHeaderChange = (field: keyof Invoice, value: string | null) => {
    if (!editingInvoice) return;
    setEditingInvoice({
      ...editingInvoice,
      [field]: value
    });
  };

  const handleLineItemChange = (index: number, field: keyof RawLineItem, value: any) => {
    if (!editingInvoice) return;
    const updatedLineItems = [...editingInvoice.lineItems];
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      [field]: value
    };
    
    // Recalculate totals on the fly for editing invoice
    const raw: RawInvoice = {
      vendorName: editingInvoice.vendorName,
      gstNumber: editingInvoice.gstNumber,
      customerName: editingInvoice.customerName,
      lineItems: updatedLineItems
    };

    const compiled = compileInvoice(raw, editingInvoice.fileName, editingInvoice.id, editingInvoice.confidenceStatus);
    setEditingInvoice({
      ...editingInvoice,
      lineItems: compiled.lineItems,
      gstBreakdown: compiled.gstBreakdown,
      totalGst: compiled.totalGst,
      total: compiled.total
    });
  };

  const addLineItem = () => {
    if (!editingInvoice) return;
    const newItem: RawLineItem = {
      description: 'New Line Item',
      quantity: 1,
      taxableValue: 0,
      gstPercent: 18
    };
    const updatedLineItems = [...editingInvoice.lineItems, newItem];
    
    const raw: RawInvoice = {
      vendorName: editingInvoice.vendorName,
      gstNumber: editingInvoice.gstNumber,
      customerName: editingInvoice.customerName,
      lineItems: updatedLineItems
    };

    const compiled = compileInvoice(raw, editingInvoice.fileName, editingInvoice.id, editingInvoice.confidenceStatus);
    setEditingInvoice({
      ...editingInvoice,
      lineItems: compiled.lineItems,
      gstBreakdown: compiled.gstBreakdown,
      totalGst: compiled.totalGst,
      total: compiled.total
    });
  };

  const removeLineItem = (index: number) => {
    if (!editingInvoice) return;
    const updatedLineItems = editingInvoice.lineItems.filter((_, i) => i !== index);
    
    const raw: RawInvoice = {
      vendorName: editingInvoice.vendorName,
      gstNumber: editingInvoice.gstNumber,
      customerName: editingInvoice.customerName,
      lineItems: updatedLineItems
    };

    const compiled = compileInvoice(raw, editingInvoice.fileName, editingInvoice.id, editingInvoice.confidenceStatus);
    setEditingInvoice({
      ...editingInvoice,
      lineItems: compiled.lineItems,
      gstBreakdown: compiled.gstBreakdown,
      totalGst: compiled.totalGst,
      total: compiled.total
    });
  };

  const saveEditedInvoice = () => {
    if (!editingInvoice) return;
    
    // Check if key fields are now filled to clear low confidence
    let updatedStatus = editingInvoice.confidenceStatus;
    if (editingInvoice.vendorName && editingInvoice.gstNumber && editingInvoice.lineItems.length > 0 && updatedStatus === 'low_confidence') {
      updatedStatus = 'confident';
    }

    const finalInvoice: Invoice = {
      ...editingInvoice,
      confidenceStatus: updatedStatus
    };

    const updated = invoices.map(inv => inv.id === finalInvoice.id ? finalInvoice : inv);
    saveInvoicesList(updated);
    setEditingInvoice(null);
  };

  // Global aggregate stats
  const totalInvoicesScanned = invoices.length;
  const grandGrandTotal = roundTo2(invoices.reduce((sum, inv) => sum + inv.total, 0));
  const grandGstTotal = roundTo2(invoices.reduce((sum, inv) => sum + inv.totalGst, 0));
  const grandTaxableTotal = roundTo2(grandGrandTotal - grandGstTotal);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-16">
      
      {/* Background gradients for premium aesthetic */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* API Key Modal Prompt */}
      {showApiKeyPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            
            {apiKeySet && (
              <button 
                onClick={() => setShowApiKeyPrompt(false)} 
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1 hover:bg-slate-800 rounded-lg transition-all"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <Key className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold">Gemini API Key Required</h3>
            </div>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              To analyze invoices, PutUp uses Google's Gemini multimodal AI. Your key is stored locally in your browser and is only sent directly to the local backend.
            </p>

            <div className="space-y-3 mb-6">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 inline" />
                Don't have a key? Get one from Google AI Studio.
              </span>
            </div>

            <div className="flex gap-3 justify-between items-center">
              {apiKeySet ? (
                <button 
                  onClick={handleClearApiKey}
                  className="px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all"
                >
                  Delete Key
                </button>
              ) : (
                <div />
              )}

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowApiKeyPrompt(false)} 
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all"
                >
                  {apiKeySet ? 'Cancel' : 'Skip / Demo Mode'}
                </button>
                <button 
                  onClick={handleSaveApiKey}
                  className="px-5 py-2.5 text-sm bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/25 transition-all"
                >
                  Save API Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-800 gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30">
              <FileSpreadsheet className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  PutUp
                </h1>
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/20">
                  AI Beta
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5">
                Scan invoices, compile tax line items & export structured spreadsheets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select 
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition-all"
              title="Select Gemini Extraction Model"
            >
              <option value="gemini-3.5-flash">⚡ Fast (3.5 Flash)</option>
              <option value="gemini-1.5-pro">🎯 Accurate (1.5 Pro)</option>
            </select>

            <button 
              onClick={loadMockInvoices}
              className="px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" /> Load Sample Invoices
            </button>

            {apiKeySet ? (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl">
                <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                <span className="text-xs text-slate-300 font-medium">Gemini Connected</span>
                <button 
                  onClick={handleOpenApiKeySettings}
                  className="text-xs text-slate-500 hover:text-indigo-400 font-semibold ml-2 border-l border-slate-800 pl-2 transition-colors"
                >
                  Change Key
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowApiKeyPrompt(true)}
                className="px-4 py-2 text-xs font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 rounded-xl transition-all flex items-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5" /> Configure Gemini Key
              </button>
            )}
          </div>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8">
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-5 relative overflow-hidden transition-all hover:border-slate-800">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Invoices Scanned</p>
            <h4 className="text-3xl font-bold mt-2 text-white">{totalInvoicesScanned}</h4>
            <div className="absolute right-4 bottom-4 text-slate-800"><FileText className="w-12 h-12" /></div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-5 relative overflow-hidden transition-all hover:border-slate-800">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Taxable Subtotal</p>
            <h4 className="text-3xl font-bold mt-2 text-white">₹{grandTaxableTotal.toLocaleString('en-IN')}</h4>
            <div className="absolute right-4 bottom-4 text-slate-800"><Database className="w-12 h-12" /></div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-5 relative overflow-hidden transition-all hover:border-slate-800">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total GST Compiled</p>
            <h4 className="text-3xl font-bold mt-2 text-indigo-400">₹{grandGstTotal.toLocaleString('en-IN')}</h4>
            <div className="absolute right-4 bottom-4 text-indigo-950/20"><FileSpreadsheet className="w-12 h-12" /></div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-5 relative overflow-hidden transition-all hover:border-slate-800">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Grand Total</p>
            <h4 className="text-3xl font-bold mt-2 text-teal-400">₹{grandGrandTotal.toLocaleString('en-IN')}</h4>
            <div className="absolute right-4 bottom-4 text-teal-950/20"><CheckCircle className="w-12 h-12" /></div>
          </div>
        </section>

        {/* Upload Zone & Active Queue */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-8">
          
          {/* Uploader Card */}
          <div className="lg:col-span-2">
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging 
                  ? 'border-indigo-500 bg-indigo-500/5 scale-[0.99]' 
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/20 hover:bg-slate-900/30'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                multiple 
                accept="image/jpeg,image/png,application/pdf"
                className="hidden" 
              />
              
              <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-full mb-4 animate-bounce">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-200">Drag and drop invoices here</h3>
              <p className="text-sm text-slate-500 mt-1.5 max-w-md">
                Supports single or multiple PDF, JPEG, and PNG files at once. Processes files concurrently.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                <span className="px-2.5 py-1 text-xs bg-slate-950 text-slate-400 rounded-md border border-slate-850">
                  PDF Documents
                </span>
                <span className="px-2.5 py-1 text-xs bg-slate-950 text-slate-400 rounded-md border border-slate-850">
                  JPEG & PNG Images
                </span>
                <span className="px-2.5 py-1 text-xs bg-slate-950 text-slate-400 rounded-md border border-slate-850">
                  Batch Queue
                </span>
              </div>
            </div>
          </div>

          {/* Processing Queue Status */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-5 flex flex-col h-[208px]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center justify-between">
              <span>Extraction Queue</span>
              {uploadQueue.length > 0 && (
                <button 
                  onClick={() => setUploadQueue([])}
                  className="text-[10px] text-slate-500 hover:text-slate-300 font-semibold"
                >
                  Clear Queue
                </button>
              )}
            </h3>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {uploadQueue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs">
                  <RefreshCw className="w-5 h-5 mb-1.5 animate-spin-slow opacity-45" />
                  No active extractions
                </div>
              ) : (
                uploadQueue.map(item => (
                  <div key={item.id} className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-xs flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-300 truncate">{item.name}</p>
                      
                      {/* Progress bar */}
                      <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
                        <div 
                          className={`h-1 rounded-full transition-all duration-300 ${
                            item.status === 'error' ? 'bg-rose-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      
                      {item.error && (
                        <p className="text-[10px] text-rose-400 mt-1 truncate">{item.error}</p>
                      )}
                    </div>
                    
                    <div>
                      {item.status === 'processing' && (
                        <span className="text-[10px] text-indigo-400 font-medium px-2 py-0.5 bg-indigo-500/10 rounded-full flex items-center gap-1 animate-pulse">
                          Parsing...
                        </span>
                      )}
                      {item.status === 'success' && (
                        <span className="text-[10px] text-teal-400 font-medium px-2 py-0.5 bg-teal-500/10 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-[10px] text-rose-400 font-medium px-2 py-0.5 bg-rose-500/10 rounded-full flex items-center gap-1">
                          Error
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Spreadsheet / Table Section */}
        <section className="bg-slate-900/20 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-5 border-b border-slate-900 bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">Scanned Invoices Ledger</h2>
              <p className="text-slate-400 text-xs mt-0.5">Click any row to view full items breakdown and edit metadata</p>
            </div>
            
            <div className="flex gap-2 relative">
              {invoices.length > 0 && (
                <>
                  <div className="relative">
                    <button 
                      onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                      className="px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all flex items-center gap-1.5"
                    >
                      Columns <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showColumnDropdown && (
                      <div className="absolute right-0 mt-2 z-30 w-48 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl space-y-2 select-none">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-850 pb-1 mb-1">Show Columns</p>
                        {Object.keys(visibleColumns).map((col) => {
                          const labelMap: Record<string, string> = {
                            vendorName: 'Vendor Name',
                            gstNumber: 'Vendor GSTIN',
                            customerName: 'Customer Name',
                            taxableSubtotal: 'Taxable Subtotal',
                            totalGst: 'Total GST',
                            total: 'Grand Total',
                            confidenceStatus: 'Confidence Status',
                            createdAt: 'Date Scanned',
                          };
                          return (
                            <label key={col} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-slate-100 py-0.5">
                              <input 
                                type="checkbox" 
                                checked={visibleColumns[col as keyof typeof visibleColumns]}
                                onChange={() => setVisibleColumns({
                                  ...visibleColumns,
                                  [col]: !visibleColumns[col as keyof typeof visibleColumns]
                                })}
                                className="rounded border-slate-800 bg-slate-950 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5"
                              />
                              {labelMap[col]}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('Clear entire history? This cannot be undone.')) {
                        saveInvoicesList([]);
                        setExpandedInvoiceId(null);
                      }
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <Trash className="w-3.5 h-3.5" /> Reset Ledger
                  </button>
                  
                  <button 
                    onClick={handleExport}
                    className="px-5 py-2.5 text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/15 transition-all flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Export Spreadsheet (.xlsx)
                  </button>
                </>
              )}
            </div>
          </div>

          {invoices.length === 0 ? (
            <div className="py-24 text-center">
              <div className="p-4 bg-slate-900 text-slate-600 rounded-full inline-block mb-4">
                <FileSpreadsheet className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-400">No invoices in ledger</h3>
              <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
                Upload your first invoice file, or click "Load Sample Invoices" above to instantly test dashboard functionality.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-900 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                    <th className="py-4 px-4 text-center w-14">S.No.</th>
                    {visibleColumns.vendorName && (
                      <th 
                        className="py-4 px-6 cursor-pointer hover:text-indigo-400 transition-colors"
                        onClick={() => handleSort('vendorName')}
                      >
                        <div className="flex items-center gap-1">
                          Vendor Name {renderSortIcon('vendorName')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.gstNumber && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors"
                        onClick={() => handleSort('gstNumber')}
                      >
                        <div className="flex items-center gap-1">
                          Vendor GSTIN {renderSortIcon('gstNumber')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.customerName && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors"
                        onClick={() => handleSort('customerName')}
                      >
                        <div className="flex items-center gap-1">
                          Customer Name {renderSortIcon('customerName')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.taxableSubtotal && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors text-right"
                        onClick={() => handleSort('taxableSubtotal')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Taxable Subtotal {renderSortIcon('taxableSubtotal')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.totalGst && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors text-right"
                        onClick={() => handleSort('totalGst')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Total GST {renderSortIcon('totalGst')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.total && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors text-right"
                        onClick={() => handleSort('total')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Grand Total {renderSortIcon('total')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.confidenceStatus && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors text-center"
                        onClick={() => handleSort('confidenceStatus')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Status {renderSortIcon('confidenceStatus')}
                        </div>
                      </th>
                    )}
                    {visibleColumns.createdAt && (
                      <th 
                        className="py-4 px-4 cursor-pointer hover:text-indigo-400 transition-colors text-center"
                        onClick={() => handleSort('createdAt')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Scan Date {renderSortIcon('createdAt')}
                        </div>
                      </th>
                    )}
                    <th className="py-4 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-sm">
                  {getSortedInvoices().map((invoice, index) => {
                    const isExpanded = expandedInvoiceId === invoice.id;
                    const isEditing = editingInvoice?.id === invoice.id;
                    const hasLowConfidence = invoice.confidenceStatus === 'low_confidence';
                    
                    return (
                      <React.Fragment key={invoice.id}>
                        {/* Table Row */}
                        <tr 
                          onClick={() => {
                            if (!isEditing) {
                              setExpandedInvoiceId(isExpanded ? null : invoice.id);
                            }
                          }}
                          className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-slate-900/30' : ''
                          }`}
                        >
                          <td className="py-4 px-4 text-center text-slate-400 font-mono text-xs">
                            {index + 1}
                          </td>
                          {visibleColumns.vendorName && (
                            <td className="py-4 px-6 font-semibold text-white max-w-[200px] truncate">
                              {invoice.vendorName || (
                                <span className="text-rose-400/80 italic flex items-center gap-1 text-xs">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Missing Vendor
                                </span>
                              )}
                            </td>
                          )}
                          {visibleColumns.gstNumber && (
                            <td className="py-4 px-4 font-mono text-xs text-slate-300">
                              {invoice.gstNumber || (
                                <span className="text-rose-400/80 italic flex items-center gap-1 text-xs font-sans">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Missing GSTIN
                                </span>
                              )}
                            </td>
                          )}
                          {visibleColumns.customerName && (
                            <td className="py-4 px-4 text-slate-300 max-w-[150px] truncate">
                              {invoice.customerName || <span className="text-slate-500 italic text-xs">N/A</span>}
                            </td>
                          )}
                          {visibleColumns.taxableSubtotal && (
                            <td className="py-4 px-4 text-right font-medium text-slate-300">
                              ₹{(invoice.total - invoice.totalGst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          )}
                          {visibleColumns.totalGst && (
                            <td className="py-4 px-4 text-right font-medium text-indigo-400">
                              ₹{invoice.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          )}
                          {visibleColumns.total && (
                            <td className="py-4 px-4 text-right font-bold text-teal-400">
                              ₹{invoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          )}
                          {visibleColumns.confidenceStatus && (
                            <td className="py-4 px-4 text-center">
                              {hasLowConfidence ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <AlertCircle className="w-3 h-3" /> Review
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                                  <CheckCircle className="w-3 h-3" /> Confident
                                </span>
                              )}
                            </td>
                          )}
                          {visibleColumns.createdAt && (
                            <td className="py-4 px-4 text-center text-slate-300 text-xs">
                              {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              }) : 'N/A'}
                            </td>
                          )}
                          <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center items-center gap-2">
                              {isEditing ? (
                                <button 
                                  onClick={saveEditedInvoice}
                                  className="p-1.5 hover:bg-teal-500/20 text-teal-400 rounded-lg transition-colors"
                                  title="Save Changes"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                              ) : (
                                <button 
                                  onClick={(e) => startEditing(invoice, e)}
                                  className="p-1.5 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors"
                                  title="Edit Data"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={(e) => handleDeleteInvoice(invoice.id, e)}
                                className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              
                              <div className="text-slate-600 pl-1">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Details Container */}
                        {isExpanded && (
                          <tr className="bg-slate-900/15">
                            <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="px-6 py-6 border-b border-slate-900">
                              
                              {/* Edit Mode Panel */}
                              {isEditing && editingInvoice ? (
                                <div className="space-y-6">
                                  
                                  {/* Section 1: Vendor Header Details */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-850">
                                    <div className="space-y-1.5">
                                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Vendor Name</label>
                                      <input 
                                        type="text" 
                                        value={editingInvoice.vendorName || ''}
                                        onChange={(e) => handleHeaderChange('vendorName', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">GSTIN / GST Number</label>
                                      <input 
                                        type="text" 
                                        value={editingInvoice.gstNumber || ''}
                                        onChange={(e) => handleHeaderChange('gstNumber', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer Name</label>
                                      <input 
                                        type="text" 
                                        value={editingInvoice.customerName || ''}
                                        onChange={(e) => handleHeaderChange('customerName', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                      />
                                    </div>
                                  </div>

                                  {/* Section 2: Editable Line Items */}
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Invoice Items</h4>
                                      <button 
                                        onClick={addLineItem}
                                        className="px-2.5 py-1 text-[10px] font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg transition-all flex items-center gap-1"
                                      >
                                        <Plus className="w-3 h-3" /> Add Item
                                      </button>
                                    </div>

                                    <div className="bg-slate-950/40 rounded-xl border border-slate-850 overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-850">
                                            <th className="py-2.5 px-4 text-left">Description</th>
                                            <th className="py-2.5 px-2 text-right w-20">Quantity</th>
                                            <th className="py-2.5 px-2 text-right w-32">Taxable Value</th>
                                            <th className="py-2.5 px-2 text-right w-24">GST %</th>
                                            <th className="py-2.5 px-4 text-center w-16">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-900">
                                          {editingInvoice.lineItems.map((item, idx) => (
                                            <tr key={idx}>
                                              <td className="py-2 px-4">
                                                <input 
                                                  type="text" 
                                                  value={item.description}
                                                  onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                                                  className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 py-0.5 focus:outline-none text-slate-200"
                                                />
                                              </td>
                                              <td className="py-2 px-2 text-right">
                                                <input 
                                                  type="number" 
                                                  value={item.quantity ?? ''}
                                                  onChange={(e) => handleLineItemChange(idx, 'quantity', e.target.value)}
                                                  className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 text-right py-0.5 focus:outline-none text-slate-200"
                                                />
                                              </td>
                                              <td className="py-2 px-2 text-right">
                                                <input 
                                                  type="number" 
                                                  value={item.taxableValue ?? ''}
                                                  onChange={(e) => handleLineItemChange(idx, 'taxableValue', e.target.value)}
                                                  className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 text-right py-0.5 focus:outline-none text-slate-200"
                                                />
                                              </td>
                                              <td className="py-2 px-2 text-right">
                                                <select 
                                                  value={item.gstPercent}
                                                  onChange={(e) => handleLineItemChange(idx, 'gstPercent', parseFloat(e.target.value) || 0)}
                                                  className="bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-right text-xs focus:outline-none focus:border-indigo-500 text-slate-200"
                                                >
                                                  <option value={0}>0%</option>
                                                  <option value={5}>5%</option>
                                                  <option value={12}>12%</option>
                                                  <option value={18}>18%</option>
                                                  <option value={28}>28%</option>
                                                </select>
                                              </td>
                                              <td className="py-2 px-4 text-center">
                                                <button 
                                                  onClick={() => removeLineItem(idx)}
                                                  className="text-rose-400 hover:text-rose-300 transition-colors"
                                                >
                                                  <X className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Section 3: Save button trigger */}
                                  <div className="flex justify-end gap-2 pt-2">
                                    <button 
                                      onClick={() => setEditingInvoice(null)}
                                      className="px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 rounded-lg transition-all"
                                    >
                                      Cancel
                                    </button>
                                    <button 
                                      onClick={saveEditedInvoice}
                                      className="px-4 py-2 text-xs font-semibold bg-teal-500 hover:bg-teal-600 text-white rounded-lg shadow-lg shadow-teal-500/10 transition-all flex items-center gap-1.5"
                                    >
                                      <Save className="w-3.5 h-3.5" /> Save Invoice
                                    </button>
                                  </div>

                                </div>
                              ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                  
                                  {/* Col 1: File and Header summaries */}
                                  <div className="space-y-4">
                                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-3">
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-900 pb-1.5">Invoice Metadata</h4>
                                      <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">File Name</p>
                                        <p className="text-xs font-semibold text-slate-300 mt-0.5 truncate flex items-center gap-1">
                                          <FileText className="w-3.5 h-3.5 text-slate-400" /> {invoice.fileName}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Vendor</p>
                                        <p className="text-xs font-semibold text-slate-200 mt-0.5">
                                          {invoice.vendorName || <span className="text-rose-400 italic">Not Extracted</span>}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">GSTIN</p>
                                        <p className="text-xs font-mono font-semibold text-indigo-300 mt-0.5">
                                          {invoice.gstNumber || <span className="text-rose-400 italic">Not Extracted</span>}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Customer</p>
                                        <p className="text-xs font-semibold text-slate-200 mt-0.5">
                                          {invoice.customerName || <span className="text-slate-500 italic">N/A</span>}
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={(e) => startEditing(invoice, e)}
                                      className="w-full px-4 py-2.5 text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-xl transition-all"
                                    >
                                      Edit / Add Line Items
                                    </button>
                                  </div>

                                  {/* Col 2: Line Items Breakdown */}
                                  <div className="lg:col-span-2 space-y-4">
                                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850">
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-900 pb-1.5 mb-3 flex items-center justify-between">
                                        <span>Extracted Line Items</span>
                                        <span className="text-[10px] text-slate-500 font-sans normal-case">
                                          {invoice.lineItems.length} items parsed
                                        </span>
                                      </h4>

                                      <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                        {invoice.lineItems.length === 0 ? (
                                          <p className="text-xs text-slate-500 italic text-center py-4">No line items parsed from invoice.</p>
                                        ) : (
                                          invoice.lineItems.map((item, idx) => (
                                            <div key={idx} className="bg-slate-950/60 border border-slate-900 rounded-lg p-2.5 text-xs flex items-center justify-between gap-3">
                                              <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-200 truncate">{item.description}</p>
                                                <p className="text-[10px] text-slate-500 mt-0.5">Qty: {item.quantity} | GST: {item.gstPercent}%</p>
                                              </div>
                                              <div className="text-right">
                                                <p className="font-medium text-slate-300">₹{item.taxableValue.toLocaleString('en-IN')}</p>
                                                <p className="text-[10px] text-indigo-400 mt-0.5">+GST: ₹{roundTo2(item.taxableValue * (item.gstPercent / 100)).toLocaleString('en-IN')}</p>
                                              </div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>

                                    {/* GST rate subtotal cards (Important grouping logic shown graphically) */}
                                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850">
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-900 pb-1.5 mb-3">
                                        GST Clubbed Subtotals
                                      </h4>
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {invoice.gstBreakdown.map((group, idx) => (
                                          <div key={idx} className="bg-slate-950/80 border border-slate-900 rounded-lg p-3 text-xs">
                                            <div className="flex justify-between items-center mb-1">
                                              <span className="font-bold text-indigo-400">{group.gstPercent}% GST</span>
                                              <span className="text-[10px] text-slate-500">Rate Group</span>
                                            </div>
                                            <div className="mt-2 space-y-1">
                                              <div className="flex justify-between text-slate-400 text-[10px]">
                                                <span>Taxable sub:</span>
                                                <span>₹{group.taxableValue.toLocaleString('en-IN')}</span>
                                              </div>
                                              <div className="flex justify-between text-indigo-400 text-[10px]">
                                                <span>GST Amount:</span>
                                                <span>₹{group.gstAmount.toLocaleString('en-IN')}</span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                  </div>

                                </div>
                              )}

                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
