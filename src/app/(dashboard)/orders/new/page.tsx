'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { normalizeSearchText } from '@/lib/normalize';
import { sumPetitFours, getCapacityInfo } from '@/lib/packageCapacity';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import toast from 'react-hot-toast';
import type { Customer, Product, PetitFourType, Package } from '@/types/database';
import { DeliveryTypeCards } from '@/components/orders/DeliveryTypeCards';

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
type EffectivePriceType = 'retail' | 'retail_quantity' | 'business_fixed' | 'business_quantity';

function resolvePriceListEntry(
  priceList: PriceEntry[],
  productId: string,
  priceType: string,
  qty: number,
): PriceEntry | undefined {
  if (priceType === 'business_quantity' || priceType === 'retail_quantity') {
    const tiers = priceList
      .filter(pl => pl.מוצר_id === productId && pl.price_type === priceType && (pl.min_quantity ?? 0) <= qty)
      .sort((a, b) => (b.min_quantity ?? 0) - (a.min_quantity ?? 0));
    return tiers[0];
  }
  return priceList.find(pl => pl.מוצר_id === productId && pl.price_type === priceType);
}

function computeEffectivePriceType(
  custType: string | undefined,
  items: { מוצר_id: string; כמות: number }[],
  products: { id: string; קטגוריית_מוצר?: string | null }[],
  priceList: PriceEntry[],
): EffectivePriceType {
  if (custType === 'עסקי - כמות') return 'business_quantity';
  if (custType === 'עסקי - קבוע' || custType === 'עסקי') return 'business_fixed';

  // Private / recurring customers — check for event/quantity upgrade
  // Only count items with a product selected (מוצר_id not empty)
  const totalUnits = items.reduce((sum, it) => it.מוצר_id ? sum + (it.כמות || 0) : sum, 0);
  if (totalUnits >= 250) return 'retail_quantity';

  // Amount threshold at retail prices; only one cake item counts toward 2500
  let nonCakeTotal = 0;
  let maxCakeTotal = 0;
  for (const it of items) {
    if (!it.מוצר_id) continue;
    const retailEntry = priceList.find(pl => pl.מוצר_id === it.מוצר_id && pl.price_type === 'retail');
    if (!retailEntry) continue;
    const lineTotal = retailEntry.מחיר * (it.כמות || 0);
    const prod = products.find(p => p.id === it.מוצר_id);
    if (prod?.קטגוריית_מוצר === 'עוגה') {
      maxCakeTotal = Math.max(maxCakeTotal, lineTotal);
    } else {
      nonCakeTotal += lineTotal;
    }
  }
  if (nonCakeTotal + maxCakeTotal >= 2500) return 'retail_quantity';
  return 'retail';
}

const TIER_INFO: Record<EffectivePriceType, { label: string; color: string; bg: string }> = {
  retail:            { label: 'לקוח פרטי',                  color: '#5C3410', bg: '#EFE4D3' },
  retail_quantity:   { label: 'לקוח פרטי אירוע - כמות',    color: '#7C5A1E', bg: '#FFF3CD' },
  business_fixed:    { label: 'עסקי קבוע',                  color: '#1A4D6E', bg: '#D6EAF8' },
  business_quantity: { label: 'עסקי אירוע - כמות',          color: '#1D6A3D', bg: '#D5F0E3' },
};

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
  const prevTierRef = useRef<EffectivePriceType | ''>('');
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
  const [paymentStatus, setPaymentStatus] = useState<'ממתין' | 'שולם' | 'חלקי' | 'בארטר'>('ממתין');
  const [greetingText, setGreetingText] = useState('');
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'ללא' | 'אחוז' | 'סכום'>('ללא');
  const [discountValue, setDiscountValue] = useState(0);
  const [orderSource, setOrderSource] = useState('');
  const [orderType, setOrderType] = useState<'רגיל' | 'סאטמר'>('רגיל');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);

  // Draft support
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get('draft');
  const draftOrderIdRef = useRef<string | null>(draftIdParam);

  // Auto-save
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSavingRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // New product modal (Fix 3)
  const [newProductModal, setNewProductModal] = useState<{ rowIdx: number } | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductType, setNewProductType] = useState('מוצר רגיל');
  const [newProductCategory, setNewProductCategory] = useState('אחר');
  const [newProductActive, setNewProductActive] = useState(true);
  const [newProductSaving, setNewProductSaving] = useState(false);

  // Post-save payment link flow
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [savedOrderNumber, setSavedOrderNumber] = useState('');
  const [savedCustomerPhone, setSavedCustomerPhone] = useState('');
  const [showPostSaveModal, setShowPostSaveModal] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('');
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false);
  const [paymentLinkCreated, setPaymentLinkCreated] = useState(false);

  useEffect(() => {
    const draftFetch = draftIdParam
      ? fetch(`/api/orders/${draftIdParam}`).then(r => r.json())
      : Promise.resolve(null);

    Promise.all([
      fetch('/api/customers?limit=200').then(r => r.json()),
      fetch('/api/products?active=true').then(r => r.json()),
      fetch('/api/petit-four-types').then(r => r.json()),
      fetch('/api/packages').then(r => r.json()),
      fetch('/api/prices').then(r => r.json()),
      draftFetch,
    ]).then(([c, p, pf, pkg, prices, draftResp]) => {
      const allProducts = p.data || [];
      setCustomers(c.data || []);
      setProducts(allProducts);
      setPetitFourTypes(pf.data || []);
      setPackages(pkg.data || []);
      setPriceList(prices.data || []);

      // Pre-fill form from draft order
      if (draftResp?.data && draftResp.data.סטטוס_הזמנה === 'טיוטה') {
        const o = draftResp.data;
        draftOrderIdRef.current = o.id;
        setSelectedCustomer(o.לקוח_id || '');
        setIsUrgent(o.הזמנה_דחופה || false);
        setDeliveryDate(o.תאריך_אספקה || '');
        setDeliveryTime(o.שעת_אספקה || '');
        setDeliveryType(o.סוג_אספקה === 'איסוף עצמי' ? 'איסוף עצמי' : 'משלוח');
        if (o.delivery_recipient_type) setRecipientType(o.delivery_recipient_type);
        setRecipientName(o.שם_מקבל || '');
        setRecipientPhone(o.טלפון_מקבל || '');
        setRecipientAddress(o.כתובת_מקבל_ההזמנה || '');
        setRecipientCity(o.עיר || '');
        setDeliveryInstructions(o.הוראות_משלוח || '');
        setDeliveryFee(o.דמי_משלוח || 0);
        setPaymentMethod(o.אופן_תשלום || 'מזומן');
        setPaymentStatus(o.סטטוס_תשלום || 'ממתין');
        setGreetingText(o.ברכה_טקסט || '');
        setNotes(o.הערות_להזמנה || '');
        setDiscountType(o.סוג_הנחה || 'ללא');
        setDiscountValue(o.ערך_הנחה || 0);
        setOrderSource(o.מקור_ההזמנה || '');
        setOrderType(o.סוג_הזמנה === 'סאטמר' ? 'סאטמר' : 'רגיל');

        const productItems = (o.מוצרים_בהזמנה || [])
          .filter((item: Record<string, unknown>) => item.סוג_שורה === 'מוצר')
          .map((item: Record<string, unknown>) => ({
            מוצר_id: (item.מוצר_id as string) || '',
            שם_מוצר: (item.מוצרים_למכירה as Record<string, string>)?.שם_מוצר || '',
            כמות: (item.כמות as number) || 1,
            מחיר_ליחידה: (item.מחיר_ליחידה as number) || 0,
            סהכ: (item.סהכ as number) || 0,
            הערות_לשורה: (item.הערות_לשורה as string) || '',
            missingPrice: false,
          }));
        setOrderItems(productItems);

        const pkgItems = (o.מוצרים_בהזמנה || [])
          .filter((item: Record<string, unknown>) => item.סוג_שורה === 'מארז')
          .map((item: Record<string, unknown>) => {
            const pfSelections = (item.בחירת_פטיפורים_בהזמנה as Record<string, unknown>[]) || [];
            return {
              מוצר_id: null as string | null,
              שם_מארז: `מארז ${item.גודל_מארז || ''} יח׳`,
              גודל_מארז: (item.גודל_מארז as number) || 0,
              כמות: (item.כמות as number) || 1,
              מחיר_ליחידה: (item.מחיר_ליחידה as number) || 0,
              סהכ: (item.סהכ as number) || 0,
              הערות_לשורה: (item.הערות_לשורה as string) || '',
              פטיפורים: pfSelections.map(s => ({
                פטיפור_id: s.פטיפור_id as string,
                שם: (s.סוגי_פטיפורים as Record<string, string>)?.שם_פטיפור || '',
                כמות: (s.כמות as number) || 1,
              })),
            };
          });
        setPackageItems(pkgItems);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const customerType = selectedCustomerData?.סוג_לקוח;

  const effectivePriceType = useMemo(
    () => computeEffectivePriceType(customerType, orderItems, products, priceList),
    [customerType, orderItems, products, priceList],
  );

  // Reprice all product items when the effective tier changes
  useEffect(() => {
    if (prevTierRef.current === effectivePriceType) return;
    prevTierRef.current = effectivePriceType;
    setOrderItems(prev => {
      if (prev.length === 0) return prev;
      return prev.map(item => {
        if (!item.מוצר_id) return item;
        const entry = resolvePriceListEntry(priceList, item.מוצר_id, effectivePriceType, item.כמות);
        if (entry) {
          return { ...item, מחיר_ליחידה: entry.מחיר, סהכ: item.כמות * entry.מחיר, missingPrice: false };
        }
        const prod = products.find(p => p.id === item.מוצר_id);
        if (effectivePriceType === 'retail' && prod) {
          return { ...item, מחיר_ליחידה: prod.מחיר, סהכ: item.כמות * prod.מחיר, missingPrice: false };
        }
        return { ...item, מחיר_ליחידה: 0, סהכ: 0, missingPrice: true };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePriceType]);

  // Whether the form has enough content to be worth auto-saving
  const hasContent = !!(
    selectedCustomer ||
    orderItems.some(i => i.מוצר_id) ||
    deliveryDate ||
    notes.trim() ||
    recipientName.trim()
  );

  // Auto-save: debounced 3s after any form change; creates/updates a draft silently
  useEffect(() => {
    if (!hasContent) return;
    if (savedOrderId) return; // Already finalized

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (isAutoSavingRef.current) return;
      isAutoSavingRef.current = true;
      setAutoSaveStatus('saving');
      try {
        const payload = buildPayload('טיוטה');
        if (draftOrderIdRef.current) {
          await fetch(`/api/orders/${draftOrderIdRef.current}/save-draft`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } else {
          const res = await fetch('/api/orders/create-full', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (res.ok && json.data?.id) {
            draftOrderIdRef.current = json.data.id;
            window.history.replaceState(null, '', `/orders/new?draft=${json.data.id}`);
          }
        }
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2500);
      } catch {
        setAutoSaveStatus('idle');
      } finally {
        isAutoSavingRef.current = false;
      }
    }, 3000);

    return () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer, orderItems, packageItems, deliveryDate, deliveryTime, deliveryType,
      recipientName, recipientPhone, recipientAddress, recipientCity, deliveryInstructions,
      deliveryFee, paymentMethod, paymentStatus, greetingText, notes, discountType,
      discountValue, orderSource, orderType, isUrgent, savedOrderId]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomer(customerId);
    const cust = customers.find(c => c.id === customerId);
    const pct = Number(cust?.אחוז_הנחה ?? 0);
    if (pct > 0) {
      setDiscountType('אחוז');
      setDiscountValue(pct);
    } else {
      setDiscountType('ללא');
      setDiscountValue(0);
    }
    // Barter customer: auto-set payment status to בארטר (no receipt/invoice will fire)
    if (cust?.סוג_לקוח === 'בארטר') {
      setPaymentStatus('בארטר');
    } else if (paymentStatus === 'בארטר') {
      setPaymentStatus('ממתין');
    }
    // Auto-fill recipient from customer when in "customer" mode.
    // Address/city/instructions populate from the customer's saved address
    // (migration 022) — fills only when the field is currently empty so a
    // manual edit on a previously-typed value isn't overwritten when the
    // user re-picks the same customer.
    if (deliveryType === 'משלוח' && recipientType === 'customer' && cust) {
      setRecipientName(`${cust.שם_פרטי} ${cust.שם_משפחה}`.trim());
      setRecipientPhone(cust.טלפון || '');
      const c = cust as Customer;
      if (!recipientAddress.trim() && c.כתובת)        setRecipientAddress(c.כתובת);
      if (!recipientCity.trim()    && c.עיר)          setRecipientCity(c.עיר);
      if (!deliveryInstructions.trim() && c.הערות_כתובת) setDeliveryInstructions(c.הערות_כתובת);
    }
  };

  const subtotal = [...orderItems, ...packageItems].reduce((sum, item) => sum + item.סהכ, 0);
  const discountAmount = discountType === 'אחוז'
    ? +(subtotal * discountValue / 100).toFixed(2)
    : discountType === 'סכום'
      ? Math.min(subtotal, discountValue)
      : 0;
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);
  // Satmar orders never show VAT, regardless of customer type
  const isBusiness = orderType !== 'סאטמר' && (customerType === 'עסקי' || customerType === 'עסקי - קבוע' || customerType === 'עסקי - כמות');
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

      if (field === 'מוצר_id') {
        const prod = products.find(p => p.id === value);
        if (prod) {
          item.שם_מוצר = prod.שם_מוצר;
          const entry = resolvePriceListEntry(priceList, String(value), effectivePriceType, item.כמות);
          if (entry) {
            item.מחיר_ליחידה = entry.מחיר;
            item.missingPrice = false;
          } else if (effectivePriceType === 'retail') {
            // retail: fall back to base product price
            item.מחיר_ליחידה = prod.מחיר;
            item.missingPrice = false;
          } else {
            // retail_quantity / business: must have explicit price list entry
            item.מחיר_ליחידה = 0;
            item.missingPrice = true;
          }
        }
      }

      if (field === 'כמות' && (effectivePriceType === 'business_quantity' || effectivePriceType === 'retail_quantity') && item.מוצר_id) {
        const entry = resolvePriceListEntry(priceList, item.מוצר_id, effectivePriceType, Number(value));
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
      // Clamp the new qty so the package never exceeds its capacity.
      // When capacity is unknown (size 0) we leave the user free.
      const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
      const cap = Number(pkg.גודל_מארז) || 0;
      let nextQty = safeQty;
      if (cap > 0) {
        const others = pkg.פטיפורים.reduce((sum, pf, i) => i === pfIdx ? sum : sum + (Number(pf.כמות) || 0), 0);
        const max = Math.max(1, cap - others);
        if (safeQty > max) nextQty = max;
      }
      pkg.פטיפורים = pkg.פטיפורים.map((pf, i) => i === pfIdx ? { ...pf, כמות: nextQty } : pf);
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

  const inferCategoryFromName = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('עוגה') || lower.includes('עוגת')) return 'עוגה';
    if (lower.includes('מארז')) return 'מארזים';
    return 'אחר';
  };

  const openNewProductModal = (rowIdx: number) => {
    setNewProductModal({ rowIdx });
    setNewProductName('');
    setNewProductSku('');
    setNewProductType('מוצר רגיל');
    setNewProductCategory('אחר');
    setNewProductActive(true);
  };

  const handleCreateProduct = async () => {
    const name = newProductName.trim();
    if (!name) { toast.error('שם מוצר הוא שדה חובה'); return; }
    // Check for duplicate in existing products
    if (products.some(p => p.שם_מוצר.trim() === name)) {
      toast.error(`מוצר "${name}" כבר קיים`);
      return;
    }
    setNewProductSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          שם_מוצר: name,
          sku: newProductSku.trim() || null,
          סוג_מוצר: newProductType,
          קטגוריית_מוצר: newProductCategory,
          פעיל: newProductActive,
          מחיר: 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'שגיאה');
      const { data: newProd } = await res.json();
      setProducts(prev => [...prev, newProd]);
      const rowIdx = newProductModal!.rowIdx;
      if (rowIdx === -1) {
        // Called from header — add a new row pre-filled with the new product
        setOrderItems(prev => [...prev, {
          מוצר_id: newProd.id,
          שם_מוצר: newProd.שם_מוצר,
          כמות: 1,
          מחיר_ליחידה: newProd.מחיר || 0,
          סהכ: newProd.מחיר || 0,
          הערות_לשורה: '',
          missingPrice: false,
        }]);
      } else {
        // Called from row — auto-select in the existing row
        updateProductItem(rowIdx, 'מוצר_id', newProd.id);
      }
      toast.success(`מוצר "${name}" נוצר`);
      setNewProductModal(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה ביצירת מוצר');
    } finally {
      setNewProductSaving(false);
    }
  };

  const buildPayload = (status: 'חדשה' | 'טיוטה') => ({
    לקוח: { id: selectedCustomer },
    הזמנה: {
      סטטוס_הזמנה: status,
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
  });


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Synchronous guard — blocks any second call that arrives before setLoading re-renders
    if (submittingRef.current || loading) return;
    // If an order was already created (post-save modal open), never create another
    if (savedOrderId) return;
    if (!selectedCustomer) { toast.error('יש לבחור לקוח'); return; }

    // When the active tier has no price-list entry for an item, allow the user
    // to type a manual price instead of blocking outright. We only refuse to
    // save when the price field was left empty/zero — otherwise the manual
    // value is what gets persisted to "מחיר_ליחידה" and used everywhere
    // downstream (line totals, invoice, email — none of those recompute
    // against the price list).
    const noPriceItem = orderItems.find(
      item => item.מוצר_id && item.missingPrice && (!item.מחיר_ליחידה || item.מחיר_ליחידה <= 0),
    );
    if (noPriceItem) {
      toast.error(`יש להזין מחיר ידני למוצר "${noPriceItem.שם_מוצר || ''}" — אין מחירון פעיל`);
      return;
    }

    // Block on < 20 units per item in quantity tiers
    if (effectivePriceType === 'retail_quantity' || effectivePriceType === 'business_quantity') {
      const underMinItems = orderItems.filter(item => item.מוצר_id && item.כמות < 20);
      if (underMinItems.length > 0) {
        const names = underMinItems.map(i => i.שם_מוצר || 'ללא שם').join(', ');
        toast.error(`מינימום 20 יחידות לדגם במחירון כמות — ${names}`);
        return;
      }
    }

    // Block when any package's petit-four selection exceeds the package size.
    // Packages whose size is unknown (גודל_מארז = 0) are skipped — the UI
    // shows a soft warning for those rather than blocking save.
    for (let i = 0; i < packageItems.length; i++) {
      const pkg = packageItems[i];
      const info = getCapacityInfo(sumPetitFours(pkg.פטיפורים), pkg.גודל_מארז);
      if (info.blocking) {
        toast.error(`מארז ${i + 1} (${pkg.שם_מארז || 'ללא שם'}): ${info.message} — יש להפחית ${info.overage} יחידות`);
        return;
      }
    }

    submittingRef.current = true;
    setLoading(true);
    const reqId = clientRequestIdRef.current;
    console.log('[new-order] submit started', {
      time: new Date().toISOString(),
      reqId,
      savedOrderId,
      loading,
      submittingRef: submittingRef.current,
      editingDraft: draftOrderIdRef.current,
    });
    try {
      const payload = { clientRequestId: reqId, ...buildPayload('חדשה') };

      let res: Response;
      if (draftOrderIdRef.current) {
        // Finalizing an existing draft — call finalize-draft instead of create-full
        console.log('[new-order] finalizing draft', draftOrderIdRef.current);
        res = await fetch(`/api/orders/${draftOrderIdRef.current}/finalize-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload('חדשה')),
        });
      } else {
        console.log('[new-order] calling fetch', { reqId, time: new Date().toISOString() });
        res = await fetch('/api/orders/create-full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
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
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-2" style={{ color: '#6B4A2D' }}>סוג אספקה</label>
                <DeliveryTypeCards
                  value={deliveryType}
                  onChange={t => {
                    setDeliveryType(t);
                    if (t === 'משלוח' && recipientType === 'customer' && selectedCustomerData) {
                      setRecipientName(`${selectedCustomerData.שם_פרטי} ${selectedCustomerData.שם_משפחה}`.trim());
                      setRecipientPhone(selectedCustomerData.טלפון || '');
                    }
                  }}
                />
              </div>
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
                        // Switching to "customer" means deliberately replacing
                        // any prior recipient data, so we don't preserve typed
                        // values here — that matches the existing behavior for
                        // name/phone. Saved address (migration 022) populates
                        // when present; absent values just stay empty.
                        const c = selectedCustomerData as Customer;
                        setRecipientName(`${c.שם_פרטי} ${c.שם_משפחה}`.trim());
                        setRecipientPhone(c.טלפון || '');
                        setRecipientAddress(c.כתובת || '');
                        setRecipientCity(c.עיר || '');
                        setDeliveryInstructions(c.הערות_כתובת || '');
                      } else if (opt.key === 'other') {
                        setRecipientName('');
                        setRecipientPhone('');
                        setRecipientAddress('');
                        setRecipientCity('');
                        setDeliveryInstructions('');
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
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <SectionHeader number={deliveryType === 'משלוח' ? 4 : 3} title="מוצרים" />
                {selectedCustomer && (
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full self-start"
                      style={{ backgroundColor: TIER_INFO[effectivePriceType].bg, color: TIER_INFO[effectivePriceType].color }}
                    >
                      מחירון: {TIER_INFO[effectivePriceType].label}
                    </span>
                    {effectivePriceType === 'retail_quantity' && (customerType === 'פרטי' || customerType === 'חוזר') && (
                      <span className="text-xs" style={{ color: '#7C5A1E' }}>✓ ההזמנה עומדת בתנאי אירוע/כמות</span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => openNewProductModal(-1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors hover:bg-amber-50 flex-shrink-0"
                style={{ borderColor: '#C6A77D', color: '#8B5E34', backgroundColor: '#FFF' }}
              >
                + מוצר חדש לקטלוג
              </button>
            </CardHeader>
            {orderItems.length === 0 ? (
              <div className="text-center py-4">
                <Button type="button" variant="outline" size="sm" onClick={addProductItem}>+ הוסף מוצר</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {orderItems.map((item, idx) => {
                  const retailEntry = effectivePriceType === 'retail_quantity' && item.מוצר_id
                    ? priceList.find(pl => pl.מוצר_id === item.מוצר_id && pl.price_type === 'retail')
                    : undefined;
                  const showStrikethrough = !!retailEntry && retailEntry.מחיר !== item.מחיר_ליחידה && !item.missingPrice;
                  const belowMin = (effectivePriceType === 'retail_quantity' || effectivePriceType === 'business_quantity') && item.מוצר_id && item.כמות > 0 && item.כמות < 20;
                  return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: '#FAF7F0', border: item.missingPrice ? '1px solid #FBBF24' : belowMin ? '1px solid #EF4444' : undefined }}
                  >
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Combobox
                        label="מוצר"
                        value={item.מוצר_id}
                        onChange={v => updateProductItem(idx, 'מוצר_id', v)}
                        options={(() => {
                          // Show all active regular products that the customer is
                          // allowed to purchase. We deliberately do NOT hide products
                          // that lack a price-list entry for the active tier — those
                          // still surface, with the existing missingPrice warning to
                          // block save until a price exists. Hiding them silently
                          // caused legitimate items (e.g. mini magnum) to be invisible
                          // in the create form even though they were present in edit.
                          const isBusinessCustomer = !!customerType && customerType.startsWith('עסקי');
                          // searchText holds a Hebrew-normalized version of the
                          // product name so the Combobox matches on stable text:
                          // strips geresh ׳/' / gershayim ״/", asterisks, hyphens,
                          // collapses whitespace, and applies NFC. Without this,
                          // a query like "מג" can fail to find "מיני מג'" and
                          // "מיני-מגנום" can fail to find "מיני מגנום".
                          const visible = products
                            .filter(p => p.פעיל && p.סוג_מוצר === 'מוצר רגיל')
                            .filter(p => !p.לקוחות_עסקיים_בלבד || isBusinessCustomer);
                          // Detect names that appear on more than one active row,
                          // so we can attach a base-price hint (e.g. "₪14") to the
                          // dropdown label and the user can pick the right one.
                          // Catalog duplicates are a known data issue (e.g. two
                          // "טארטלט פיצוחים" rows) — this surfaces them in the UI
                          // without any DB change.
                          const nameCounts = visible.reduce<Record<string, number>>((acc, p) => {
                            const k = String(p.שם_מוצר ?? '').trim();
                            acc[k] = (acc[k] || 0) + 1;
                            return acc;
                          }, {});
                          return visible.map(p => {
                            const k = String(p.שם_מוצר ?? '').trim();
                            const isDup = (nameCounts[k] ?? 0) > 1;
                            return {
                              value: p.id,
                              label: p.שם_מוצר,
                              searchText: normalizeSearchText(p.שם_מוצר),
                              hint: isDup ? `₪${(p.מחיר ?? 0).toFixed(2)}` : undefined,
                            };
                          });
                        })()}
                        placeholder="בחר..."
                        searchPlaceholder="חיפוש מוצר..."
                        emptyText="לא נמצאו מוצרים"
                      />
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
                        // Highlight the field when there's no price-list entry —
                        // this is exactly where the user must type a manual price.
                        className={item.missingPrice ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-200 bg-amber-50' : undefined}
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
                  {showStrikethrough && retailEntry && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#D5F0E3', color: '#1D6A3D' }}>מחיר אירוע</span>
                      <span className="text-xs" style={{ color: '#9B7A5A', textDecoration: 'line-through' }}>₪{retailEntry.מחיר.toFixed(2)}</span>
                      <span className="text-xs font-semibold" style={{ color: '#1D6A3D' }}>₪{item.מחיר_ליחידה.toFixed(2)}</span>
                    </div>
                  )}
                  {item.missingPrice && (
                    <p className="text-xs text-amber-700 mt-1.5">
                      ⚠ אין מחיר במחירון הפעיל — ניתן להזין מחיר ידנית
                    </p>
                  )}
                  {belowMin && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}>
                        מינ׳ 20
                      </span>
                      <span className="text-xs" style={{ color: '#991B1B' }}>מינימום 20 יחידות לדגם במחירון אירוע/כמות</span>
                    </div>
                  )}
                  </div>
                  );
                })}
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

                    {/* Petit-four selector — capacity-aware */}
                    {(() => {
                      const cap = pkg.גודל_מארז;
                      const info = getCapacityInfo(sumPetitFours(pkg.פטיפורים), cap);
                      const counterStyle = info.state === 'over'
                        ? { backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }
                        : info.state === 'full'
                        ? { backgroundColor: '#D5F0E3', color: '#1D6A3D', border: '1px solid #A8DCC0' }
                        : info.state === 'under'
                        ? { backgroundColor: '#FEF3C7', color: '#7C5A1E', border: '1px solid #FCD9A6' }
                        : { backgroundColor: '#EFE4D3', color: '#6B4A2D', border: '1px solid #DDD0BC' };
                      const availableTypes = petitFourTypes.filter(pf =>
                        pf.פעיל && !pkg.פטיפורים.find(x => x.פטיפור_id === pf.id),
                      );
                      return (
                        <div className="border-t pt-3" style={{ borderColor: '#EDE0CE' }}>
                          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: '#4A2F1B' }}>פטיפורים</span>
                              <span
                                className="text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                                style={counterStyle}
                              >
                                {info.message}
                              </span>
                            </div>
                            <select
                              value=""
                              onChange={e => { if (e.target.value) addPetitFour(pkgIdx, e.target.value); }}
                              disabled={availableTypes.length === 0 || info.state === 'over'}
                              className="text-xs px-3 py-1.5 rounded-full border bg-white transition-colors hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ borderColor: '#C6A77D', color: '#8B5E34' }}
                            >
                              <option value="">＋ הוסף סוג פטיפור</option>
                              {availableTypes.map(pf => (
                                <option key={pf.id} value={pf.id}>{pf.שם_פטיפור}</option>
                              ))}
                            </select>
                          </div>
                          {pkg.פטיפורים.length === 0 ? (
                            <p className="text-xs text-center py-3" style={{ color: '#9B7A5A' }}>
                              עדיין לא נבחרו סוגי פטיפורים
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" dir="rtl">
                              {pkg.פטיפורים.map((pf, pfIdx) => {
                                const others = info.selected - (Number(pf.כמות) || 0);
                                const maxForThis = cap > 0 ? Math.max(1, cap - others) : undefined;
                                return (
                                  <div
                                    key={pfIdx}
                                    className="group flex items-center gap-2 px-3 py-2 bg-white rounded-xl border transition-all hover:shadow-sm"
                                    style={{ borderColor: '#E7D2A6' }}
                                  >
                                    <span className="flex-1 text-xs font-medium truncate" style={{ color: '#2B1A10' }} title={pf.שם}>
                                      {pf.שם}
                                    </span>
                                    <input
                                      type="number"
                                      value={pf.כמות}
                                      onChange={e => updatePetitFourQty(pkgIdx, pfIdx, Number(e.target.value))}
                                      className="w-14 px-2 py-1 text-xs border rounded-lg text-center focus:outline-none focus:ring-1"
                                      style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                                      min={1}
                                      max={maxForThis}
                                      aria-label={`כמות עבור ${pf.שם}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removePetitFour(pkgIdx, pfIdx)}
                                      className="w-6 h-6 rounded-full flex items-center justify-center transition-colors text-base leading-none opacity-50 group-hover:opacity-100 hover:bg-stone-100"
                                      style={{ color: '#9B7A5A' }}
                                      title="הסר"
                                      aria-label={`הסר ${pf.שם}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}

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
                onChange={e => setPaymentStatus(e.target.value as 'ממתין' | 'שולם' | 'חלקי' | 'בארטר')}
              >
                <option value="ממתין">ממתין</option>
                <option value="שולם">שולם</option>
                <option value="חלקי">חלקי</option>
                <option value="בארטר">בארטר</option>
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
                {draftOrderIdRef.current ? 'אשר הזמנה' : 'צור הזמנה'}
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

            {/* Auto-save status indicator */}
            {autoSaveStatus !== 'idle' && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{ backgroundColor: '#F5F0FA', color: '#5B21B6', border: '1px solid #DDD6FE' }}
              >
                {autoSaveStatus === 'saving' ? (
                  <>
                    <svg className="animate-spin w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>שמירה אוטומטית...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>טיוטה נשמרה</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New product modal */}
      {newProductModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(43,26,16,0.45)', backdropFilter: 'blur(3px)' }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            style={{ direction: 'rtl', border: '1px solid #EDE0CE' }}
          >
            <div className="px-6 pt-5 pb-2 border-b" style={{ borderColor: '#EDE0CE' }}>
              <h3 className="text-base font-semibold" style={{ color: '#2B1A10' }}>הוסף מוצר חדש</h3>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>שם מוצר *</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={e => {
                    setNewProductName(e.target.value);
                    setNewProductCategory(inferCategoryFromName(e.target.value));
                  }}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1"
                  style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                  autoFocus
                  placeholder="שם המוצר"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>SKU (אופציונלי)</label>
                <input
                  type="text"
                  value={newProductSku}
                  onChange={e => setNewProductSku(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1"
                  style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                  placeholder="קוד מוצר"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>סוג מוצר</label>
                  <select
                    value={newProductType}
                    onChange={e => setNewProductType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none"
                    style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                  >
                    <option value="מוצר רגיל">מוצר רגיל</option>
                    <option value="מארז פטיפורים">מארז פטיפורים</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>קטגוריה</label>
                  <select
                    value={newProductCategory}
                    onChange={e => setNewProductCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none"
                    style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                  >
                    <option value="אחר">אחר</option>
                    <option value="עוגה">עוגה</option>
                    <option value="מארזים">מארזים</option>
                    <option value="עוגיות">עוגיות</option>
                    <option value="לחמים">לחמים</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#6B4A2D' }}>
                <input
                  type="checkbox"
                  checked={newProductActive}
                  onChange={e => setNewProductActive(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: '#8B5E34' }}
                />
                פעיל
              </label>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button
                type="button"
                onClick={handleCreateProduct}
                disabled={newProductSaving}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all"
                style={{ backgroundColor: '#8B5E34', color: '#FFFFFF', opacity: newProductSaving ? 0.7 : 1 }}
              >
                {newProductSaving ? 'יוצר...' : 'צור מוצר'}
              </button>
              <button
                type="button"
                onClick={() => setNewProductModal(null)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border"
                style={{ borderColor: '#DDD0BC', color: '#6B4A2D' }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

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
          <Button type="submit" loading={loading}>{draftOrderIdRef.current ? 'אשר' : 'צור הזמנה'}</Button>
        </div>
      </div>
    </form>
  );
}
