'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import toast from 'react-hot-toast';
import type { Customer, Product, PetitFourType, Package } from '@/types/database';

interface OrderItem {
  מוצר_id: string;
  שם_מוצר: string;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string;
  missingPrice?: boolean;
}

type PriceEntry = { מוצר_id: string; price_type: string; מחיר: number; min_quantity: number | null };

function resolvePriceListEntry(
  priceList: PriceEntry[],
  productId: string,
  priceType: string,
  qty: number,
): PriceEntry | undefined {
  if (priceType === 'business_quantity') {
    const tiers = priceList
      .filter(pl => pl.מוצר_id === productId && pl.price_type === 'business_quantity' && (pl.min_quantity ?? 0) <= qty)
      .sort((a, b) => (b.min_quantity ?? 0) - (a.min_quantity ?? 0));
    return tiers[0];
  }
  return priceList.find(pl => pl.מוצר_id === productId && pl.price_type === priceType);
}

interface PackageItem {
  מוצר_id: string | null;
  שם_מארז: string;
  גודל_מארז: number;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string;
  פטיפורים: { פטיפור_id: string; שם: string; כמות: number }[];
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
      >
        {number}
      </div>
      <h3 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>{title}</h3>
    </div>
  );
}

export default function NewOrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Synchronous lock — prevents double-submit before React re-renders the disabled button
  const submittingRef = useRef(false);
  // Unique ID for this form instance — sent to server for idempotency deduplication
  const clientRequestIdRef = useRef(`req_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [petitFourTypes, setPetitFourTypes] = useState<PetitFourType[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [priceList, setPriceList] = useState<{ מוצר_id: string; price_type: string; מחיר: number; min_quantity: number | null }[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [deliveryType, setDeliveryType] = useState<'משלוח' | 'איסוף עצמי'>('משלוח');
  const [recipientType, setRecipientType] = useState<'customer' | 'other'>('customer');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientCity, setRecipientCity] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('מזומן');
  const [paymentStatus, setPaymentStatus] = useState<'ממתין' | 'שולם' | 'חלקי'>('ממתין');
  const [greetingText, setGreetingText] = useState('');
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'ללא' | 'אחוז' | 'סכום'>('ללא');
  const [discountValue, setDiscountValue] = useState(0);
  const [orderSource, setOrderSource] = useState('');
  const [orderType, setOrderType] = useState<'רגיל' | 'סאטמר'>('רגיל');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);

  // Post-save payment link flow
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  const [savedCustomerPhone, setSavedCustomerPhone] = useState('');
  const [showPostSaveModal, setShowPostSaveModal] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false);
  const [paymentLinkCreated, setPaymentLinkCreated] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/customers?limit=200').then(r => r.json()),
      fetch('/api/products?active=true').then(r => r.json()),
      fetch('/api/petit-four-types').then(r => r.json()),
      fetch('/api/packages').then(r => r.json()),
      fetch('/api/prices').then(r => r.json()),
    ]).then(([c, p, pf, pkg, prices]) => {
      const allProducts = p.data || [];
      console.log('[new-order] products loaded:', allProducts.length,
        '| business-only count:', allProducts.filter((x: { לקוחות_עסקיים_בלבד?: boolean }) => x.לקוחות_עסקיים_בלבד).length,
        '| sample:', allProducts.slice(0, 3).map((x: { שם_מוצר: string; לקוחות_עסקיים_בלבד?: boolean }) => `${x.שם_מוצר}=${x.לקוחות_עסקיים_בלבד}`));
      setCustomers(c.data || []);
      setProducts(allProducts);
      setPetitFourTypes(pf.data || []);
      setPackages(pkg.data || []);
      setPriceList(prices.data || []);
    });
  }, []);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomer(customerId);
    const cust = customers.find(c => c.id === customerId);
    const pct = Number(cust?.אחוז_הנחה ?? 0);
    console.log('[discount debug] selected customer:', cust);
    console.log('[discount debug] אחוז_הנחה field value:', cust?.אחוז_הנחה);
    console.log('[discount debug] pct:', pct);
    if (pct > 0) {
      setDiscountType('אחוז');
      setDiscountValue(pct);
      console.log('[discount debug] → set discountType=אחוז, discountValue=', pct);
    } else {
      setDiscountType('ללא');
      setDiscountValue(0);
      console.log('[discount debug] → no discount');
    }
    // Auto-fill recipient from customer when in "customer" mode
    if (deliveryType === 'משלוח' && recipientType === 'customer' && cust) {
      setRecipientName(`${cust.שם_פרטי} ${cust.שם_משפחה}`.trim());
      setRecipientPhone(cust.טלפון || '');
    }
  };

  const subtotal = [...orderItems, ...packageItems].reduce((sum, item) => sum + item.סהכ, 0);
  const discountAmount = discountType === 'אחוז'
    ? +(subtotal * discountValue / 100).toFixed(2)
    : discountType === 'סכום'
      ? Math.min(subtotal, discountValue)
      : 0;
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);
  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const customerType = selectedCustomerData?.סוג_לקוח;
  const isBusiness = customerType === 'עסקי' || customerType === 'עסקי - קבוע' || customerType === 'עסקי - כמות';
  const VAT_RATE = 0.18;
  // VAT display only — סך_הכל_לתשלום stored in DB is always pre-VAT (server calculates it)
  const vatAmount = isBusiness ? +(total * VAT_RATE).toFixed(2) : 0;
  const totalWithVat = isBusiness ? +(total * (1 + VAT_RATE)).toFixed(2) : total;

  const addProductItem = () => {
    setOrderItems(prev => [...prev, {
      מוצר_id: '', שם_מוצר: '', כמות: 1, מחיר_ליחידה: 0, סהכ: 0, הערות_לשורה: '', missingPrice: false,
    }]);
  };

  const updateProductItem = (idx: number, field: string, value: string | number) => {
    setOrderItems(prev => {
      const items = [...prev];
      const item = { ...items[idx], [field]: value };

      const custType = selectedCustomerData?.סוג_לקוח;
      let priceType = 'retail';
      if (custType === 'עסקי - כמות') priceType = 'business_quantity';
      else if (custType === 'עסקי - קבוע' || custType === 'עסקי') priceType = 'business_fixed';
      const isBusinessCust = priceType !== 'retail';

      if (field === 'מוצר_id') {
        const prod = products.find(p => p.id === value);
        if (prod) {
          item.שם_מוצר = prod.שם_מוצר;
          const entry = resolvePriceListEntry(priceList, String(value), priceType, item.כמות);
          if (entry) {
            item.מחיר_ליחידה = entry.מחיר;
            item.missingPrice = false;
          } else if (isBusinessCust) {
            item.מחיר_ליחידה = 0;
            item.missingPrice = true;
          } else {
            item.מחיר_ליחידה = prod.מחיר;
            item.missingPrice = false;
          }
        }
      }

      if (field === 'כמות' && priceType === 'business_quantity' && item.מוצר_id) {
        const entry = resolvePriceListEntry(priceList, item.מוצר_id, 'business_quantity', Number(value));
        if (entry) {
          item.מחיר_ליחידה = entry.מחיר;
          item.missingPrice = false;
        } else {
          item.missingPrice = true;
        }
      }

      item.סהכ = item.כמות * item.מחיר_ליחידה;
      items[idx] = item;
      return items;
    });
  };

  const removeProductItem = (idx: number) => setOrderItems(prev => prev.filter((_, i) => i !== idx));

  const addPackageItem = () => {
    setPackageItems(prev => [...prev, {
      מוצר_id: null, שם_מארז: '', גודל_מארז: 0, כמות: 1,
      מחיר_ליחידה: 0, סהכ: 0, הערות_לשורה: '', פטיפורים: [],
    }]);
  };

  const updatePackageItem = (idx: number, field: string, value: string | number) => {
    setPackageItems(prev => {
      const items = [...prev];
      let item = { ...items[idx], [field]: value };
      if (field === 'מוצר_id') {
        const pkg = packages.find(p => p.id === value);
        if (pkg) {
          item.שם_מארז = pkg.שם_מארז;
          item.גודל_מארז = pkg.גודל_מארז;
          item.מחיר_ליחידה = pkg.מחיר_מארז;
        }
      }
      item.סהכ = item.כמות * item.מחיר_ליחידה;
      items[idx] = item;
      return items;
    });
  };

  const addPetitFour = (pkgIdx: number, pfId: string) => {
    const pf = petitFourTypes.find(p => p.id === pfId);
    if (!pf) return;
    setPackageItems(prev => {
      const items = [...prev];
      const pkg = { ...items[pkgIdx] };
      if (!pkg.פטיפורים.find(p => p.פטיפור_id === pfId)) {
        pkg.פטיפורים = [...pkg.פטיפורים, { פטיפור_id: pfId, שם: pf.שם_פטיפור, כמות: 1 }];
      }
      items[pkgIdx] = pkg;
      return items;
    });
  };

  const updatePetitFourQty = (pkgIdx: number, pfIdx: number, qty: number) => {
    setPackageItems(prev => {
      const items = [...prev];
      const pkg = { ...items[pkgIdx] };
      pkg.פטיפורים = pkg.פטיפורים.map((pf, i) => i === pfIdx ? { ...pf, כמות: qty } : pf);
      items[pkgIdx] = pkg;
      return items;
    });
  };

  const removePetitFour = (pkgIdx: number, pfIdx: number) => {
    setPackageItems(prev => {
      const items = [...prev];
      const pkg = { ...items[pkgIdx] };
      pkg.פטיפורים = pkg.פטיפורים.filter((_, i) => i !== pfIdx);
      items[pkgIdx] = pkg;
      return items;
    });
  };

  const handleCreatePaymentLink = async () => {
    if (!savedOrderId) return;
    setPaymentLinkLoading(true);
    try {
      const res = await fetch(`/api/orders/${savedOrderId}/create-payment-link`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה ביצירת קישור');
      setPaymentLinkUrl(json.payment_url);
      setPaymentLinkCreated(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה ביצירת קישור תשלום');
    } finally {
      setPaymentLinkLoading(false);
    }
  };

  const handleWhatsApp = () => {
    const phone = savedCustomerPhone.replace(/\D/g, '').replace(/^0/, '972');
    const text = encodeURIComponent(`היי, מצורף קישור לתשלום עבור ההזמנה שלך:\n${paymentLinkUrl}`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous guard — blocks any second call that arrives before setLoading re-renders
    if (submittingRef.current || loading) return;
    // If an order was already created (post-save modal open), never create another
    if (savedOrderId) return;
    if (!selectedCustomer) { toast.error('יש לבחור לקוח'); return; }

    submittingRef.current = true;
    setLoading(true);
    const reqId = clientRequestIdRef.current;
    console.log('[new-order] submit started', {
      time: new Date().toISOString(),
      reqId,
      savedOrderId,
      loading,
      submittingRef: submittingRef.current,
    });
    try {
      const payload = {
        clientRequestId: reqId,
        לקוח: { id: selectedCustomer },
        הזמנה: {
          הזמנה_דחופה: isUrgent,
          תאריך_אספקה: deliveryDate || null,
          שעת_אספקה: deliveryTime || null,
          סוג_אספקה: deliveryType,
          שם_מקבל: recipientName || null,
          טלפון_מקבל: recipientPhone || null,
          כתובת_מקבל_ההזמנה: recipientAddress || null,
          עיר: recipientCity || null,
          הוראות_משלוח: deliveryInstructions || null,
          דמי_משלוח: deliveryFee,
          delivery_recipient_type: deliveryType === 'משלוח' ? recipientType : null,
          סוג_הזמנה: orderType,
          אופן_תשלום: paymentMethod,
          סטטוס_תשלום: paymentStatus,
          סוג_הנחה: discountType,
          ערך_הנחה: discountValue,
          ברכה_טקסט: greetingText || null,
          הערות_להזמנה: notes || null,
          מקור_ההזמנה: orderSource || null,
        },
        מוצרים: orderItems.filter(i => i.מוצר_id).map(i => ({
          מוצר_id: i.מוצר_id,
          כמות: i.כמות,
          מחיר_ליחידה: i.מחיר_ליחידה,
          הערות_לשורה: i.הערות_לשורה || null,
        })),
        מארזי_פטיפורים: packageItems.map(p => ({
          מוצר_id: p.מוצר_id,
          גודל_מארז: p.גודל_מארז,
          כמות: p.כמות,
          מחיר_ליחידה: p.מחיר_ליחידה,
          הערות_לשורה: p.הערות_לשורה || null,
          פטיפורים: p.פטיפורים.map(pf => ({ פטיפור_id: pf.פטיפור_id, כמות: pf.כמות })),
        })),
        משלוח: deliveryType === 'משלוח'
          ? { כתובת: recipientAddress, עיר: recipientCity, הוראות_משלוח: deliveryInstructions }
          : null,
      };

      console.log('[new-order] calling fetch', { reqId, time: new Date().toISOString() });
      const res = await fetch('/api/orders/create-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('[new-order] fetch returned', { reqId, status: res.status, time: new Date().toISOString() });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה ביצירת הזמנה');

      console.log('[new-order] order created:', json.data?.מספר_הזמנה, '| deduplicated:', json.deduplicated);
      const cust = customers.find(c => c.id === selectedCustomer);
      setSavedOrderId(json.data.id);
      setSavedOrderNumber(json.data.מספר_הזמנה || '');
      setSavedCustomerPhone(cust?.טלפון || '');
      setShowPostSaveModal(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה ביצירת הזמנה');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-6xl">
      <div className="flex gap-6">
        {/* Main form */}
        <div className="flex-1 space-y-4 min-w-0 pb-24 lg:pb-0">

          {/* 1. Customer */}
          <Card>
            <SectionHeader number={1} title="פרטי לקוח" />
            <div className="space-y-3">
              <Select
                label="לקוח"
                required
                value={selectedCustomer}
                onChange={e => handleCustomerChange(e.target.value)}
              >
                <option value="">בחר לקוח...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.שם_פרטי} {c.שם_משפחה}{c.טלפון ? ` — ${c.טלפון}` : ''}
                  </option>
                ))}
              </Select>
              <Link href="/customers/new" className="text-xs hover:underline" style={{ color: '#8B5E34' }}>
                + צור לקוח חדש
              </Link>
            </div>
          </Card>

          {/* 2. Order details */}
          <Card>
            <SectionHeader number={2} title="פרטי הזמנה" />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={e => setIsUrgent(e.target.checked)}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: '#C0392B' }}
                  />
                  <span className="text-sm font-medium text-red-600">הזמנה דחופה</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: '#6B4A2D' }}>סוג הזמנה:</span>
                  <div className="flex gap-1">
                    {(['רגיל', 'סאטמר'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setOrderType(t)}
                        className="px-3 py-1 text-xs font-medium rounded-full border transition-colors"
                        style={orderType === t
                          ? { backgroundColor: '#8B5E34', color: '#fff', borderColor: '#8B5E34' }
                          : { backgroundColor: '#fff', color: '#6B4A2D', borderColor: '#DDD0BC' }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Input
                label="תאריך אספקה"
                type="date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
              />
              <Input
                label="שעת אספקה"
                type="time"
                value={deliveryTime}
                onChange={e => setDeliveryTime(e.target.value)}
              />
              <Select
                label="סוג אספקה"
                value={deliveryType}
                onChange={e => {
                  const t = e.target.value as 'משלוח' | 'איסוף עצמי';
                  setDeliveryType(t);
                  if (t === 'משלוח' && recipientType === 'customer' && selectedCustomerData) {
                    setRecipientName(`${selectedCustomerData.שם_פרטי} ${selectedCustomerData.שם_משפחה}`.trim());
                    setRecipientPhone(selectedCustomerData.טלפון || '');
                  }
                }}
              >
                <option value="משלוח">משלוח</option>
                <option value="איסוף עצמי">איסוף עצמי</option>
              </Select>
              <Select
                label="מקור הזמנה"
                value={orderSource}
                onChange={e => setOrderSource(e.target.value)}
              >
                <option value="">—</option>
                {['טלפון', 'WhatsApp', 'אינסטגרם', 'פייסבוק', 'אתר', 'הפניה', 'אחר'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
          </Card>

          {/* 3. Delivery */}
          {deliveryType === 'משלוח' && (
            <Card>
              <SectionHeader number={3} title="פרטי משלוח" />
              {/* Recipient type toggle */}
              <div className="flex gap-2 mb-4">
                {([
                  { key: 'customer', label: 'שליחה ללקוח המזמין' },
                  { key: 'other',    label: 'שליחה למישהו אחר'   },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setRecipientType(opt.key);
                      if (opt.key === 'customer' && selectedCustomerData) {
                        setRecipientName(`${selectedCustomerData.שם_פרטי} ${selectedCustomerData.שם_משפחה}`.trim());
                        setRecipientPhone(selectedCustomerData.טלפון || '');
                        setRecipientAddress('');
                        setRecipientCity('');
                      } else if (opt.key === 'other') {
                        setRecipientName('');
                        setRecipientPhone('');
                        setRecipientAddress('');
                        setRecipientCity('');
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors"
                    style={recipientType === opt.key
                      ? { backgroundColor: '#8B5E34', color: '#fff', borderColor: '#8B5E34' }
                      : { backgroundColor: '#fff', color: '#6B4A2D', borderColor: '#DDD0BC' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="שם מקבל" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
                <Input label="טלפון מקבל" value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} />
                <Input label="כתובת" value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)} />
                <Input label="עיר" value={recipientCity} onChange={e => setRecipientCity(e.target.value)} />
                <div className="col-span-2">
                  <Textarea
                    label="הוראות משלוח"
                    value={deliveryInstructions}
                    onChange={e => setDeliveryInstructions(e.target.value)}
                    rows={2}
                  />
                </div>
                <Input
                  label="דמי משלוח (₪)"
                  type="number"
                  value={deliveryFee}
                  onChange={e => setDeliveryFee(Number(e.target.value))}
                  min={0}
                  step={0.01}
                />
              </div>
            </Card>
          )}

          {/* 4. Products */}
          <Card>
            <CardHeader>
              <SectionHeader number={deliveryType === 'משלוח' ? 4 : 3} title="מוצרים" />
              <Button type="button" variant="outline" size="sm" onClick={addProductItem}>
                + הוסף מוצר
              </Button>
            </CardHeader>
            {orderItems.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: '#9B7A5A' }}>
                לחץ &quot;+ הוסף מוצר&quot; להוספת פריט
              </p>
            ) : (
              <div className="space-y-2">
                {orderItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: '#FAF7F0' }}
                  >
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Select
                        label="מוצר"
                        value={item.מוצר_id}
                        onChange={e => updateProductItem(idx, 'מוצר_id', e.target.value)}
                      >
                        <option value="">בחר...</option>
                        {(() => {
                          const ct = customerType || '';
                          const regular = products.filter(p => p.סוג_מוצר === 'מוצר רגיל');
                          const visible = regular.filter(p => {
                            const avail = p.price_availability ?? (p.לקוחות_עסקיים_בלבד ? 'business_fixed' : 'retail');
                            if (!ct) return true;
                            if (ct === 'פרטי' || ct === 'חוזר') return avail === 'retail';
                            if (ct === 'עסקי - קבוע' || ct === 'עסקי') return avail === 'business_fixed';
                            if (ct === 'עסקי - כמות') return avail === 'business_quantity';
                            return true;
                          });
                          console.log('[new-order] customer type:', customerType, '| filtered products:', visible.length);
                          return visible.map(p => (
                            <option key={p.id} value={p.id}>{p.שם_מוצר}</option>
                          ));
                        })()}
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input
                        label="כמות"
                        type="number"
                        value={item.כמות}
                        onChange={e => updateProductItem(idx, 'כמות', Number(e.target.value))}
                        min={1}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label={isBusiness ? 'מחיר (לפני מע״מ)' : 'מחיר'}
                        type="number"
                        value={item.מחיר_ליחידה}
                        onChange={e => updateProductItem(idx, 'מחיר_ליחידה', Number(e.target.value))}
                        min={0}
                        step={0.01}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input label="סה״כ" value={`₪${item.סהכ.toFixed(2)}`} readOnly />
                    </div>
                    <div className="col-span-1 flex items-end justify-center pb-1">
                      <button
                        type="button"
                        onClick={() => removeProductItem(idx)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {item.missingPrice && (
                    <p className="text-xs text-amber-600 mt-1.5">⚠ אין מחיר במחירון זה</p>
                  )}
                  </div>
                ))}
                <div className="pt-2 border-t" style={{ borderColor: '#EDE0CE' }}>
                  <Button type="button" variant="outline" size="sm" onClick={addProductItem}>
                    + הוסף מוצר נוסף
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* 5. Packages */}
          <Card>
            <CardHeader>
              <SectionHeader number={deliveryType === 'משלוח' ? 5 : 4} title="מארזי פטיפורים" />
              <Button type="button" variant="outline" size="sm" onClick={addPackageItem}>
                + הוסף מארז
              </Button>
            </CardHeader>
            {packageItems.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: '#9B7A5A' }}>
                לחץ &quot;+ הוסף מארז&quot; להוספת מארז פטיפורים
              </p>
            ) : (
              <div className="space-y-4">
                {packageItems.map((pkg, pkgIdx) => (
                  <div
                    key={pkgIdx}
                    className="p-4 rounded-xl border"
                    style={{ borderColor: '#DDD0BC', backgroundColor: '#FAF7F0' }}
                  >
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <div className="col-span-2">
                        <Select
                          label="בחר מארז"
                          value={pkg.מוצר_id || ''}
                          onChange={e => updatePackageItem(pkgIdx, 'מוצר_id', e.target.value)}
                        >
                          <option value="">בחר מארז...</option>
                          {packages.filter(p => p.פעיל).map(p => (
                            <option key={p.id} value={p.id}>
                              {p.שם_מארז} — {p.גודל_מארז} יח׳{p.מחיר_מארז ? ` · ₪${p.מחיר_מארז}` : ''}
                            </option>
                          ))}
                        </Select>
                        {pkg.מוצר_id && !packages.find(p => p.id === pkg.מוצר_id)?.מחיר_מארז && (
                          <p className="text-xs mt-1 text-amber-600">⚠ למארז זה אין מחיר מוגדר</p>
                        )}
                      </div>
                      <Input
                        label="כמות"
                        type="number"
                        value={pkg.כמות}
                        onChange={e => updatePackageItem(pkgIdx, 'כמות', Number(e.target.value))}
                        min={1}
                      />
                      <Input
                        label="מחיר ליחידה (₪)"
                        type="number"
                        value={pkg.מחיר_ליחידה}
                        onChange={e => updatePackageItem(pkgIdx, 'מחיר_ליחידה', Number(e.target.value))}
                        min={0}
                        step={0.01}
                      />
                    </div>

                    {/* Petit four selector */}
                    <div className="border-t pt-3" style={{ borderColor: '#DDD0BC' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: '#4A2F1B' }}>
                          בחירת פטיפורים
                        </span>
                        <Select
                          className="w-44 text-xs"
                          value=""
                          onChange={e => { if (e.target.value) addPetitFour(pkgIdx, e.target.value); }}
                        >
                          <option value="">+ הוסף סוג פטיפור</option>
                          {petitFourTypes.filter(pf => pf.פעיל).map(pf => (
                            <option key={pf.id} value={pf.id}>{pf.שם_פטיפור}</option>
                          ))}
                        </Select>
                      </div>
                      {pkg.פטיפורים.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                          {pkg.פטיפורים.map((pf, pfIdx) => (
                            <div
                              key={pfIdx}
                              className="flex items-center gap-2 p-2 bg-white rounded-lg border"
                              style={{ borderColor: '#DDD0BC' }}
                            >
                              <span className="flex-1 text-xs font-medium truncate" style={{ color: '#2B1A10' }}>
                                {pf.שם}
                              </span>
                              <input
                                type="number"
                                value={pf.כמות}
                                onChange={e => updatePetitFourQty(pkgIdx, pfIdx, Number(e.target.value))}
                                className="w-12 px-1.5 py-1 text-xs border rounded text-center focus:outline-none"
                                style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                                min={1}
                              />
                              <button
                                type="button"
                                onClick={() => removePetitFour(pkgIdx, pfIdx)}
                                className="text-red-400 hover:text-red-600 text-base leading-none flex-shrink-0"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs" style={{ color: '#9B7A5A' }}>בחר סוגי פטיפורים למארז</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs font-semibold" style={{ color: '#2B1A10' }}>
                        סה״כ מארז: ₪{pkg.סהכ.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPackageItems(prev => prev.filter((_, i) => i !== pkgIdx))}
                        className="text-xs text-red-500 hover:underline"
                      >
                        הסר מארז
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 6. Greeting + notes */}
          <Card>
            <SectionHeader number={deliveryType === 'משלוח' ? 6 : 5} title="ברכה והערות" />
            <div className="space-y-3">
              <Textarea
                label="טקסט ברכה"
                value={greetingText}
                onChange={e => setGreetingText(e.target.value)}
                rows={2}
                placeholder="כתוב את הברכה כאן..."
              />
              <Textarea
                label="הערות להזמנה"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </Card>

          {/* 7. Payment */}
          <Card>
            <SectionHeader number={deliveryType === 'משלוח' ? 7 : 6} title="תשלום" />
            <div className="grid grid-cols-3 gap-4">
              <Select
                label="אמצעי תשלום"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                {['מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'אחר'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
              <Select
                label="סטטוס תשלום"
                value={paymentStatus}
                onChange={e => setPaymentStatus(e.target.value as 'ממתין' | 'שולם' | 'חלקי')}
              >
                <option value="ממתין">ממתין</option>
                <option value="שולם">שולם</option>
                <option value="חלקי">חלקי</option>
              </Select>
            </div>

            {/* Customer discount — read-only, auto-filled from customer profile */}
            {discountType === 'אחוז' && discountValue > 0 && (
              <div className="col-span-3 pt-1 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" />
                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                  </svg>
                  הנחת לקוח: {discountValue}%
                </span>
                <span className="text-xs font-semibold text-red-600">
                  −₪{discountAmount.toFixed(2)}
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Sticky summary sidebar */}
        <div className="w-72 flex-shrink-0 hidden lg:block">
          <div className="sticky top-6 space-y-4">
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: '#EDE0CE', backgroundColor: '#FFFFFF' }}
            >
              <div
                className="px-5 py-4 border-b"
                style={{ backgroundColor: '#FAF7F0', borderColor: '#EDE0CE' }}
              >
                <h3 className="text-sm font-bold" style={{ color: '#2B1A10' }}>סיכום הזמנה</h3>
              </div>
              <div className="p-5 space-y-4">
                {/* Customer */}
                <div>
                  <p className="text-xs mb-1" style={{ color: '#9B7A5A' }}>לקוח</p>
                  <p className="text-sm font-medium" style={{ color: '#2B1A10' }}>
                    {selectedCustomerData
                      ? `${selectedCustomerData.שם_פרטי} ${selectedCustomerData.שם_משפחה}`
                      : '—'
                    }
                  </p>
                </div>

                {/* Delivery */}
                <div>
                  <p className="text-xs mb-1" style={{ color: '#9B7A5A' }}>אספקה</p>
                  <p className="text-sm font-medium" style={{ color: '#2B1A10' }}>
                    {deliveryDate || '—'} {deliveryTime ? `· ${deliveryTime}` : ''}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B4A2D' }}>{deliveryType}</p>
                </div>

                {/* Items */}
                <div>
                  <p className="text-xs mb-1" style={{ color: '#9B7A5A' }}>פריטים</p>
                  {orderItems.length === 0 && packageItems.length === 0 ? (
                    <p className="text-xs" style={{ color: '#9B7A5A' }}>אין פריטים עדיין</p>
                  ) : (
                    <div className="space-y-1 text-xs" style={{ color: '#6B4A2D' }}>
                      {orderItems.filter(i => i.שם_מוצר).map((i, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="truncate">{i.שם_מוצר} ×{i.כמות}</span>
                          <span className="mr-2 flex-shrink-0">₪{i.סהכ.toFixed(2)}</span>
                        </div>
                      ))}
                      {packageItems.filter(p => p.שם_מארז).map((p, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="truncate">{p.שם_מארז} ×{p.כמות}</span>
                          <span className="mr-2 flex-shrink-0">₪{p.סהכ.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment status */}
                <div>
                  <p className="text-xs mb-1" style={{ color: '#9B7A5A' }}>סטטוס תשלום</p>
                  <StatusBadge status={paymentStatus} type="payment" />
                </div>

                <div className="border-t pt-4" style={{ borderColor: '#EDE0CE' }}>
                  {subtotal > 0 && (
                    <div className="flex justify-between text-xs mb-1" style={{ color: '#6B4A2D' }}>
                      <span>סכום ביניים</span>
                      <span>₪{subtotal.toFixed(2)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-xs mb-1" style={{ color: '#6B4A2D' }}>
                      <span>
                        הנחה{discountType === 'אחוז' ? ` (${discountValue}%)` : ''}
                      </span>
                      <span className="text-red-600">−₪{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-xs mb-1" style={{ color: '#6B4A2D' }}>
                      <span>דמי משלוח</span>
                      <span>₪{deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold" style={{ color: '#2B1A10' }}>
                      {isBusiness ? 'סה״כ לפני מע״מ' : 'סך הכל'}
                    </span>
                    <span className="text-xl font-bold" style={{ color: '#8B5E34' }}>
                      ₪{total.toFixed(2)}
                    </span>
                  </div>
                  {isBusiness && (
                    <>
                      <div className="flex justify-between text-xs mt-1.5" style={{ color: '#6B4A2D' }}>
                        <span>מע״מ 18%</span>
                        <span>₪{vatAmount.toFixed(2)}</span>
                      </div>
                      <div
                        className="flex justify-between items-center mt-1.5 pt-2 border-t"
                        style={{ borderColor: '#EDE0CE' }}
                      >
                        <span className="text-sm font-semibold" style={{ color: '#2B1A10' }}>סה״כ כולל מע״מ</span>
                        <span className="text-lg font-bold" style={{ color: '#8B5E34' }}>
                          ₪{totalWithVat.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <Button type="submit" loading={loading} className="w-full" size="lg">
                צור הזמנה
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.back()}
              >
                ביטול
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Post-save: payment link modal */}
      {showPostSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(43,26,16,0.45)', backdropFilter: 'blur(3px)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ direction: 'rtl', border: '1px solid #EDE0CE' }}
          >
            {!paymentLinkCreated ? (
              <>
                {/* Success icon + prompt */}
                <div className="px-6 pt-7 pb-5 text-center space-y-3">
                  <div
                    className="w-13 h-13 rounded-full flex items-center justify-center mx-auto"
                    style={{ backgroundColor: '#D1FAE5', width: '52px', height: '52px' }}
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="#065F46">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: '#2B1A10' }}>
                      ההזמנה נשמרה בהצלחה
                      {savedOrderNumber && <span className="font-normal text-sm"> #{savedOrderNumber}</span>}
                    </h3>
                    <p className="text-sm" style={{ color: '#6B4A2D' }}>האם ליצור קישור תשלום ללקוחה?</p>
                  </div>
                </div>
                <div className="px-6 pb-6 space-y-2">
                  <button
                    type="button"
                    onClick={handleCreatePaymentLink}
                    disabled={paymentLinkLoading}
                    className="w-full py-2.5 text-sm font-semibold rounded-xl transition-all"
                    style={{ backgroundColor: '#8B5E34', color: '#FFFFFF', opacity: paymentLinkLoading ? 0.7 : 1 }}
                  >
                    {paymentLinkLoading ? 'יוצר קישור...' : 'צור קישור תשלום'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/orders/${savedOrderId}`)}
                    className="w-full py-2.5 text-sm font-medium rounded-xl border transition-all"
                    style={{ borderColor: '#DDD0BC', color: '#6B4A2D', backgroundColor: '#FFFFFF' }}
                  >
                    דלג
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Payment link created */}
                <div className="px-6 pt-7 pb-5 text-center space-y-3">
                  <div
                    className="rounded-full flex items-center justify-center mx-auto"
                    style={{ backgroundColor: '#FEF9EF', width: '52px', height: '52px', border: '1px solid #F0E0C0' }}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#8B5E34">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold mb-2" style={{ color: '#2B1A10' }}>קישור תשלום נוצר בהצלחה</h3>
                    <p
                      className="text-xs px-3 py-2 rounded-lg text-right truncate"
                      style={{ backgroundColor: '#FAF7F2', color: '#6B4A2D', border: '1px solid #EDE0CE', direction: 'ltr' }}
                    >
                      {paymentLinkUrl}
                    </p>
                  </div>
                </div>
                <div className="px-6 pb-6 space-y-2">
                  <button
                    type="button"
                    onClick={() => window.open(paymentLinkUrl, '_blank')}
                    className="w-full py-2.5 text-sm font-semibold rounded-xl transition-all"
                    style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
                  >
                    פתח תשלום
                  </button>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(paymentLinkUrl); toast.success('הקישור הועתק'); }}
                    className="w-full py-2.5 text-sm font-medium rounded-xl border transition-all"
                    style={{ borderColor: '#DDD0BC', color: '#6B4A2D', backgroundColor: '#FFFFFF' }}
                  >
                    העתק קישור
                  </button>
                  {savedCustomerPhone && (
                    <button
                      type="button"
                      onClick={handleWhatsApp}
                      className="w-full py-2.5 text-sm font-medium rounded-xl border transition-all"
                      style={{ borderColor: '#D1FAE5', color: '#065F46', backgroundColor: '#F0FDF4' }}
                    >
                      שלח בוואטסאפ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push(`/orders/${savedOrderId}`)}
                    className="w-full text-xs pt-1"
                    style={{ color: '#9B7A5A' }}
                  >
                    עבור להזמנה
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile bottom bar */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 border-t px-4 py-3 flex items-center justify-between z-20"
        style={{ backgroundColor: '#FFFFFF', borderColor: '#EDE0CE' }}
      >
        <div>
          <span className="text-xs" style={{ color: '#9B7A5A' }}>סך הכל</span>
          <div className="text-lg font-bold" style={{ color: '#8B5E34' }}>₪{total.toFixed(2)}</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>ביטול</Button>
          <Button type="submit" loading={loading}>צור הזמנה</Button>
        </div>
      </div>
    </form>
  );
}
