import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  ShoppingCart,
  ShieldCheck,
  Shirt,
  Sun,
  Truck,
  UsersRound,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const demoEmail = import.meta.env.VITE_PUBLIC_DEMO_EMAIL?.trim()
  || (import.meta.env.DEV ? 'demo@novastore.local' : '')
const demoPassword = import.meta.env.VITE_PUBLIC_DEMO_PASSWORD
  || (import.meta.env.DEV ? 'NovaStoreDemo2026!' : '')

type Language = 'ar' | 'fr'
type Page = 'dashboard' | 'products' | 'movements' | 'suppliers' | 'alerts' | 'reports' | 'team' | 'sales'
type Role = 'admin' | 'storekeeper' | 'cashier' | 'viewer'
type Category = 'tshirt' | 'jeans' | 'dress' | 'jacket' | 'shoes' | 'accessories'
type Size = 'S' | 'M' | 'L' | 'XL' | 'ONE_SIZE'
type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT'
type AuthMode = 'signin' | 'invite' | 'forgot' | 'reset'

interface Variant {
  id: string
  size: Size
  color_key: string
  color_ar: string
  color_fr: string
  color_hex: string
  low_stock_threshold: number | null
  quantity: number
}

interface StockAlert {
  id: string
  sku: string
  name_ar: string
  name_fr: string
  category: Category
  variant_id: string
  size: Size
  color_ar: string
  color_fr: string
  quantity: number
  low_stock_threshold: number
}

interface MovementPage {
  items: Movement[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}

interface Product {
  id: string
  sku: string
  name_ar: string
  name_fr: string
  category: Category
  price_tnd: number | string
  low_stock_threshold: number
  quantity: number
  variants: Variant[]
}

interface Profile {
  id: string
  email: string
  role: Role
  store: { id: string; name: string; city: string; currency: string }
  allowed_pages: Page[]
}

interface DashboardData {
  metrics: {
    product_count: number
    unit_count: number
    inventory_value: number | string
    low_count: number
    out_count: number
    today_movements: number
  }
  category_values: Array<{ category: Category; value: number | string }>
  movement_days: Array<{ day: string; incoming: number; outgoing: number }>
  low_products: Product[]
}

interface Movement {
  id: string
  type: MovementType
  quantity: number
  adjustment_sign: -1 | 1 | null
  note: string
  created_at: string
  product_id: string
  sku: string
  name_ar: string
  name_fr: string
  variant_id: string
  size: Size
  color_ar: string
  color_fr: string
  created_by_email: string
}

interface Supplier {
  id: string
  name: string
  phone: string
  city: string
  email: string | null
  notes: string
  order_count: number
}

interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
  created_at: string
}

interface Sale {
  id: string
  invoice_number: number | string
  status: 'completed' | 'cancelled'
  subtotal_tnd: number | string
  discount_tnd: number | string
  total_tnd: number | string
  created_at: string
  customer_id: string | null
  customer_name: string | null
  cashier_email: string
  payment_method: 'cash' | 'card'
}

interface SaleDetails extends Sale {
  customer_phone: string | null
  amount_tnd: number | string
  lines: Array<{
    id: string
    variant_id: string
    quantity: number
    unit_price_tnd: number | string
    line_total_tnd: number | string
    sku: string
    name_ar: string
    name_fr: string
    size: Size
    color_ar: string
    color_fr: string
  }>
}

interface PurchaseOrderLine {
  id: string
  variant_id: string
  sku: string
  name_ar: string
  name_fr: string
  size: Size
  color_ar: string
  color_fr: string
  quantity: number
  unit_cost_tnd: number | string
}

interface PurchaseOrder {
  id: string
  order_number: number
  status: 'draft' | 'sent' | 'received'
  created_at: string
  received_at: string | null
  supplier_id: string
  supplier_name: string
  lines: PurchaseOrderLine[]
  total_tnd: number | string
}

interface TeamData {
  users: Array<{ id: string; email: string; role: Role; created_at: string; disabled_at: string | null }>
  invitations: Array<{ id: string; email: string; role: Role; status: string; created_at: string }>
}

interface AccountLink {
  url: string
  email_sent: boolean
}

interface InventoryReport {
  totals: { product_count: number; unit_count: number; inventory_value: number | string }
  products: Array<Product & { value_tnd: number | string }>
  movement_days: DashboardData['movement_days']
}

interface ImportPreview {
  rows: Array<Record<string, string | number>>
  issues: Array<{ row: number; message: string }>
  product_count: number
  variant_count: number
  opening_units: number
}

interface VariantDraft {
  id?: string
  size: Size
  color_key: string
  color_ar: string
  color_fr: string
  color_hex: string
  low_stock_threshold: string
  quantity?: number
}

interface ProductDraft {
  id?: string
  sku: string
  name_ar: string
  name_fr: string
  category: Category
  price_tnd: string
  low_stock_threshold: string
  variants: VariantDraft[]
}

interface ApiFailureBody {
  error?: string
  issues?: ImportPreview['issues']
  [key: string]: unknown
}

class ApiError extends Error {
  public readonly body: unknown

  constructor(message: string, body: unknown) {
    super(message)
    this.body = body
    this.name = 'ApiError'
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return (text ? JSON.parse(text) : undefined) as T
  } catch {
    const isHtml = response.headers.get('content-type')?.includes('text/html') || /^\s*</.test(text)
    if (isHtml) {
      throw new Error('The API returned a web page instead of JSON. Start both servers with "npm.cmd run dev" and try again.')
    }
    throw new Error('The API returned an invalid response. Check the server logs and try again.')
  }
}

async function getAuthCsrfToken() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('Unable to start a secure sign-in request.')
  const body = await readJsonResponse<{ csrfToken?: string }>(response)
  if (!body.csrfToken) throw new Error('Unable to start a secure sign-in request.')
  return body.csrfToken
}

const pageIcons = {
  dashboard: LayoutDashboard,
  products: Package,
  movements: ArrowLeftRight,
  suppliers: Truck,
  alerts: AlertTriangle,
  reports: Activity,
  team: UsersRound,
  sales: ShoppingCart,
}

const categories: Category[] = ['tshirt', 'jeans', 'dress', 'jacket', 'shoes', 'accessories']
const productPhotos: Record<Category, string> = {
  tshirt: '/products/tshirt.webp',
  jeans: '/products/jeans.webp',
  dress: '/products/dress.webp',
  jacket: '/products/jacket.webp',
  shoes: '/products/shoes.webp',
  accessories: '/products/accessories.webp',
}
const sizes: Size[] = ['S', 'M', 'L', 'XL', 'ONE_SIZE']
const rolePages: Record<Role, Page[]> = {
  admin: ['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'team', 'sales'],
  storekeeper: ['dashboard', 'products', 'movements', 'suppliers', 'alerts'],
  cashier: ['dashboard', 'products', 'sales'],
  viewer: ['dashboard', 'products', 'alerts', 'reports'],
}

const copy = {
  ar: {
    dashboard: 'لوحة التحكم', products: 'المنتجات', movements: 'حركات المخزون', suppliers: 'الموردون والطلبات', sales: 'المبيعات ونقطة البيع',
    alerts: 'التنبيهات', reports: 'التقارير', team: 'المستخدمون والصلاحيات', overview: 'نظرة عامة',
    search: 'ابحث عن منتج أو رمز...', addProduct: 'إضافة منتج', newMovement: 'حركة جديدة', newOrder: 'طلب شراء جديد',
    addSupplier: 'إضافة مورد', inventory: 'المخزون', productCount: 'عدد المنتجات', inventoryValue: 'قيمة المخزون',
    lowStock: 'مخزون منخفض', todayMovements: 'حركات اليوم', units: 'قطعة', movementTrend: 'حركة المخزون',
    last30: 'آخر 30 يوماً', incoming: 'وارد', outgoing: 'صادر', valueByCategory: 'قيمة المخزون حسب الفئة',
    lowProducts: 'منتجات قاربت على النفاد', viewAll: 'عرض الكل', sku: 'رمز المنتج', product: 'المنتج',
    category: 'الفئة', price: 'السعر', quantity: 'الكمية', status: 'الحالة', actions: 'إجراءات',
    size: 'المقاس', color: 'اللون', threshold: 'حد التنبيه', variant: 'القياس واللون', filter: 'تصفية',
    variantThreshold: 'حد تنبيه المقاس/اللون (فارغ لاستخدام الحد العام)', loadMore: 'تحميل المزيد',
    movementCount: 'حركة', last90: 'آخر 90 يوماً', editOrder: 'تعديل المسودة', cancelOrder: 'إلغاء المسودة',
    confirmCancelOrder: 'إلغاء هذه المسودة؟ لا يمكن التراجع عن ذلك.', orderCancelled: 'تم إلغاء المسودة.',
    allCategories: 'كل الفئات', lowOnly: 'المخزون المنخفض فقط', inStock: 'متوفر', low: 'منخفض', outOfStock: 'نفد المخزون',
    edit: 'تعديل', archive: 'أرشفة', save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق', addVariant: 'إضافة مقاس/لون',
    arabicName: 'الاسم بالعربية', frenchName: 'الاسم بالفرنسية', selectCategory: 'اختر الفئة', noProducts: 'لا توجد منتجات بعد.',
    noMovements: 'لا توجد حركات لهذه الفترة.', noSuppliers: 'لا يوجد موردون بعد.', noOrders: 'لا توجد طلبات شراء.',
    date: 'التاريخ', type: 'النوع', user: 'المستخدم', note: 'ملاحظة', adjustment: 'تسوية', in: 'إدخال',
    out: 'إخراج', direction: 'اتجاه التسوية', increase: 'زيادة', decrease: 'نقصان', selectProduct: 'اختر المنتج',
    chooseVariant: 'اختر المقاس واللون', movementNote: 'ملاحظة اختيارية', create: 'إنشاء', supplier: 'المورد',
    phone: 'الهاتف', city: 'المدينة', email: 'البريد الإلكتروني', notes: 'ملاحظات', orders: 'طلبات الشراء',
    suppliersList: 'الموردون', draft: 'مسودة', sent: 'مرسل', received: 'مستلم', send: 'إرسال الطلب',
    receive: 'تأكيد الاستلام', lines: 'البنود', addLine: 'إضافة بند', unitCost: 'تكلفة الوحدة', total: 'الإجمالي',
    createPurchaseOrder: 'إنشاء طلب شراء', noAlerts: 'لا توجد تنبيهات مخزون.', createOrder: 'طلب شراء لهذا المنتج',
    reportPeriod: 'فترة التقرير', exportExcel: 'تصدير CSV', exportPdf: 'طباعة / PDF', valuation: 'تقييم المخزون',
    role: 'الدور', admin: 'مدير', storekeeper: 'أمين مخزن', cashier: 'بائع / أمين صندوق', viewer: 'مشاهد', invite: 'إضافة مستخدم',
    inviteMember: 'إرسال دعوة', createMember: 'إنشاء حساب', directCreate: 'إضافة مباشرة', invitationMode: 'إرسال دعوة',
    createMemberSubmit: 'إنشاء المستخدم', memberCreated: 'تم إنشاء المستخدم.', memberPassword: 'كلمة المرور الأولية',
    accessMatrix: 'صلاحيات الأدوار', page: 'الصفحة', allowed: 'مسموح', restricted: 'غير مسموح',
    pendingInvitations: 'الدعوات المعلقة', noTeam: 'لا يوجد أعضاء بعد.', roleUpdated: 'تم تحديث الدور.',
    memberStatus: 'حالة الحساب', activeMember: 'نشط', disabledMember: 'معطّل',
    deactivateMember: 'تعطيل الحساب', reactivateMember: 'إعادة تفعيل الحساب',
    confirmDeactivateMember: 'تعطيل حساب هذا المستخدم؟ سيتم إنهاء جلساته مع الاحتفاظ بسجل نشاطه.',
    memberDeactivated: 'تم تعطيل الحساب.', memberReactivated: 'تمت إعادة تفعيل الحساب.',
    importCsv: 'استيراد CSV', uploadCsv: 'اختر ملف CSV', previewImport: 'معاينة الاستيراد', commitImport: 'تأكيد الاستيراد',
    importSummary: 'ملخص الاستيراد', rows: 'صفوف', openingUnits: 'وحدات الرصيد الافتتاحي', importHelp: 'استخدم قالب CSV الموجود في مجلد imports.',
    loading: 'جارٍ تحميل البيانات...', loadError: 'تعذر تحميل البيانات', retry: 'إعادة المحاولة', signIn: 'تسجيل الدخول',
    signInHelp: 'سجّل الدخول إلى مساحة مخزون متجرك.', missingConfig: 'إعداد تسجيل الدخول غير مكتمل',
    missingConfigHelp: 'أكمل إعدادات قاعدة البيانات ومفتاح الجلسات في ملف البيئة ثم أعد تشغيل التطبيق.',
    apiError: 'تعذر إكمال الطلب.', saveSuccess: 'تم الحفظ بنجاح.', archived: 'تمت أرشفة المنتج.',
    confirmArchive: 'أرشفة هذا المنتج؟ سيبقى محفوظاً في سجل المخزون.', confirmReceive: 'تأكيد استلام جميع بنود الطلب وإضافة الكميات للمخزون؟',
    confirmImportPrompt: 'سيتم إنشاء المنتجات وحركات الأرصدة الافتتاحية. هل تريد المتابعة؟',
    orderNumber: 'رقم الطلب', receivedAt: 'تاريخ الاستلام', noReport: 'لا توجد بيانات مخزون للتقرير.',
    store: 'المتجر', logout: 'الحساب', view: 'عرض', productVariants: 'المتغيرات', totalUnits: 'إجمالي الوحدات',
    viewProduct: 'عرض المنتج', productDetails: 'تفاصيل المنتج', stockByVariant: 'المخزون حسب المقاس واللون',
    generated: 'بيانات مباشرة من قاعدة البيانات', inviteEmail: 'بريد المستخدم', allSizes: 'كل المقاسات', allColors: 'كل الألوان',
    selectSupplier: 'اختر المورد', choose: 'اختر', fileIssues: 'أصلح أخطاء الملف قبل المتابعة.', stockHistoryNote: 'الكمية محسوبة من سجل الحركات.',
    chartEmpty: 'تظهر الرسوم بعد تسجيل حركات المخزون.', waitingAuth: 'جارٍ التحقق من الحساب...',
    authEmail: 'البريد الإلكتروني', authPassword: 'كلمة المرور', newPassword: 'كلمة مرور جديدة',
    confirmPassword: 'تأكيد كلمة المرور', forgotPassword: 'نسيت كلمة المرور؟', resetPassword: 'إعادة تعيين كلمة المرور',
    acceptInvite: 'قبول الدعوة', invitedEmail: 'البريد الإلكتروني المدعو', backToSignIn: 'العودة لتسجيل الدخول',
    demoAccount: 'حساب تجريبي', demoViewer: 'مشاهد تجريبي', useDemoAccount: 'استخدام الحساب التجريبي',
    demoReadOnlyNotice: 'حساب للعرض فقط على بيئة تجريبية معزولة.',
    authFailed: 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
    passwordMismatch: 'كلمتا المرور غير متطابقتين.', passwordRequirement: 'استخدم 12 حرفاً على الأقل.',
    resetRequestHelp: 'إذا كان الحساب موجوداً، فستصل تعليمات إعادة التعيين إلى البريد المسجل.',
    resetRequestSent: 'إذا كان الحساب موجوداً، فسيتم إرسال تعليمات إعادة التعيين.',
    resetEmailUnavailable: 'إرسال البريد غير مفعّل. اطلب رابط إعادة التعيين من مدير المتجر.',
    passwordUpdated: 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.',
    invitationAccepted: 'تم قبول الدعوة. يمكنك تسجيل الدخول الآن.',
    linkInvalid: 'الرابط غير صالح أو منتهي الصلاحية.', signOut: 'تسجيل الخروج',
    copyLink: 'نسخ الرابط', linkCopied: 'تم نسخ الرابط.', inviteCreated: 'تم إنشاء الدعوة.',
    inviteSent: 'تم إرسال الدعوة بالبريد الإلكتروني.', resetLinkCreated: 'تم إنشاء رابط إعادة التعيين.',
    emailDeliveryNote: 'لم يُضبط إرسال البريد. انسخ الرابط وشاركه بأمان.',
    sendResetLink: 'إنشاء رابط إعادة تعيين',
    customers: 'العملاء', cart: 'سلة البيع', paymentMethod: 'طريقة الدفع', cash: 'نقداً', card: 'بطاقة',
    subtotal: 'المجموع الفرعي', discount: 'الخصم (د.ت)', confirmSale: 'تأكيد البيع', invoice: 'الفاتورة',
    noSales: 'لا توجد مبيعات بعد.', addToCart: 'إضافة إلى السلة', remove: 'حذف', selectCustomer: 'عميل اختياري',
    walkInCustomer: 'بيع مباشر بدون عميل', newCustomer: 'إضافة عميل', customerName: 'اسم العميل',
    saveCustomer: 'حفظ العميل', saleComplete: 'تم تسجيل البيع وإصدار الفاتورة.', address: 'العنوان',
  },
  fr: {
    dashboard: 'Tableau de bord', products: 'Produits', movements: 'Mouvements', suppliers: 'Fournisseurs et commandes', sales: 'Ventes / caisse',
    alerts: 'Alertes', reports: 'Rapports', team: 'Utilisateurs et rôles', overview: 'Vue d’ensemble',
    search: 'Rechercher un produit ou SKU…', addProduct: 'Ajouter un produit', newMovement: 'Nouveau mouvement', newOrder: 'Nouvelle commande',
    addSupplier: 'Ajouter un fournisseur', inventory: 'Stock', productCount: 'Produits', inventoryValue: 'Valeur du stock',
    lowStock: 'Stock faible', todayMovements: 'Mouvements du jour', units: 'unités', movementTrend: 'Mouvements de stock',
    last30: '30 derniers jours', incoming: 'Entrées', outgoing: 'Sorties', valueByCategory: 'Valeur par catégorie',
    lowProducts: 'Produits à réapprovisionner', viewAll: 'Tout voir', sku: 'SKU', product: 'Produit',
    category: 'Catégorie', price: 'Prix', quantity: 'Quantité', status: 'Statut', actions: 'Actions',
    size: 'Taille', color: 'Couleur', threshold: 'Seuil d’alerte', variant: 'Taille et couleur', filter: 'Filtrer',
    variantThreshold: 'Seuil variante (vide = seuil général)', loadMore: 'Charger plus',
    movementCount: 'mouvements', last90: '90 derniers jours', editOrder: 'Modifier le brouillon', cancelOrder: 'Annuler le brouillon',
    confirmCancelOrder: 'Annuler ce brouillon ? Cette action est irréversible.', orderCancelled: 'Brouillon annulé.',
    allCategories: 'Toutes les catégories', lowOnly: 'Stock faible uniquement', inStock: 'En stock', low: 'Faible', outOfStock: 'Épuisé',
    edit: 'Modifier', archive: 'Archiver', save: 'Enregistrer', cancel: 'Annuler', close: 'Fermer', addVariant: 'Ajouter une variante',
    arabicName: 'Nom en arabe', frenchName: 'Nom en français', selectCategory: 'Choisir une catégorie', noProducts: 'Aucun produit pour le moment.',
    noMovements: 'Aucun mouvement sur cette période.', noSuppliers: 'Aucun fournisseur.', noOrders: 'Aucune commande.',
    date: 'Date', type: 'Type', user: 'Utilisateur', note: 'Note', adjustment: 'Ajustement', in: 'Entrée',
    out: 'Sortie', direction: 'Sens de l’ajustement', increase: 'Augmenter', decrease: 'Diminuer', selectProduct: 'Choisir un produit',
    chooseVariant: 'Choisir taille et couleur', movementNote: 'Note facultative', create: 'Créer', supplier: 'Fournisseur',
    phone: 'Téléphone', city: 'Ville', email: 'E-mail', notes: 'Notes', orders: 'Commandes',
    suppliersList: 'Fournisseurs', draft: 'Brouillon', sent: 'Envoyée', received: 'Reçue', send: 'Envoyer',
    receive: 'Confirmer la réception', lines: 'Lignes', addLine: 'Ajouter une ligne', unitCost: 'Coût unitaire', total: 'Total',
    createPurchaseOrder: 'Créer une commande', noAlerts: 'Aucune alerte de stock.', createOrder: 'Commander ce produit',
    reportPeriod: 'Période', exportExcel: 'Exporter CSV', exportPdf: 'Imprimer / PDF', valuation: 'Valorisation du stock',
    role: 'Rôle', admin: 'Administrateur', storekeeper: 'Magasinier', cashier: 'Vendeur / Caissier', viewer: 'Lecteur', invite: 'Ajouter un utilisateur',
    inviteMember: 'Envoyer l’invitation', createMember: 'Créer le compte', directCreate: 'Créer directement', invitationMode: 'Inviter par e-mail',
    createMemberSubmit: 'Créer le compte', memberCreated: 'Utilisateur créé.', memberPassword: 'Mot de passe initial',
    accessMatrix: 'Accès par rôle', page: 'Page', allowed: 'Autorisé', restricted: 'Refusé',
    pendingInvitations: 'Invitations en attente', noTeam: 'Aucun membre.', roleUpdated: 'Rôle mis à jour.',
    memberStatus: 'État du compte', activeMember: 'Actif', disabledMember: 'Désactivé',
    deactivateMember: 'Désactiver', reactivateMember: 'Réactiver',
    confirmDeactivateMember: 'Désactiver ce compte ? Ses sessions seront révoquées, tout en conservant son historique.',
    memberDeactivated: 'Compte désactivé.', memberReactivated: 'Compte réactivé.',
    importCsv: 'Importer CSV', uploadCsv: 'Choisir un fichier CSV', previewImport: 'Prévisualiser', commitImport: 'Confirmer l’import',
    importSummary: 'Résumé de l’import', rows: 'lignes', openingUnits: 'Unités de stock initial', importHelp: 'Utilisez le modèle CSV du dossier imports.',
    loading: 'Chargement des données…', loadError: 'Impossible de charger les données', retry: 'Réessayer', signIn: 'Connexion',
    signInHelp: 'Connectez-vous à l’espace de stock de votre magasin.', missingConfig: 'Configuration de connexion incomplète',
    missingConfigHelp: 'Configurez la base de données et le secret de session dans le fichier d’environnement, puis redémarrez.',
    apiError: 'La requête a échoué.', saveSuccess: 'Enregistré.', archived: 'Produit archivé.',
    confirmArchive: 'Archiver ce produit ? Il restera dans l’historique du stock.', confirmReceive: 'Confirmer la réception et ajouter les quantités au stock ?',
    confirmImportPrompt: 'Les produits et mouvements de stock initial seront créés. Continuer ?',
    orderNumber: 'Commande', receivedAt: 'Date de réception', noReport: 'Aucune donnée d’inventaire.',
    store: 'Magasin', logout: 'Compte', view: 'Voir', productVariants: 'Variantes', totalUnits: 'Unités en stock',
    viewProduct: 'Voir le produit', productDetails: 'Détails du produit', stockByVariant: 'Stock par taille et couleur',
    generated: 'Données en direct depuis la base', inviteEmail: 'E-mail du membre', allSizes: 'Toutes les tailles', allColors: 'Toutes les couleurs',
    selectSupplier: 'Choisir un fournisseur', choose: 'Choisir', fileIssues: 'Corrigez les erreurs du fichier avant de continuer.', stockHistoryNote: 'Quantité calculée depuis les mouvements.',
    chartEmpty: 'Les graphiques apparaissent après les premiers mouvements.', waitingAuth: 'Vérification du compte…',
    authEmail: 'E-mail', authPassword: 'Mot de passe', newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le mot de passe', forgotPassword: 'Mot de passe oublié ?', resetPassword: 'Réinitialiser le mot de passe',
    acceptInvite: 'Accepter l’invitation', invitedEmail: 'E-mail invité', backToSignIn: 'Retour à la connexion',
    demoAccount: 'Compte de démonstration', demoViewer: 'Lecteur démo', useDemoAccount: 'Utiliser ce compte démo',
    demoReadOnlyNotice: 'Compte en lecture seule sur un environnement de démonstration isolé.',
    authFailed: 'Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.',
    passwordMismatch: 'Les mots de passe ne correspondent pas.', passwordRequirement: 'Utilisez au moins 12 caractères.',
    resetRequestHelp: 'Si le compte existe, les instructions seront envoyées à son adresse e-mail.',
    resetRequestSent: 'Si le compte existe, les instructions de réinitialisation seront envoyées.',
    resetEmailUnavailable: 'L’envoi d’e-mails n’est pas activé. Demandez un lien à l’administrateur du magasin.',
    passwordUpdated: 'Mot de passe modifié. Vous pouvez vous connecter.',
    invitationAccepted: 'Invitation acceptée. Vous pouvez vous connecter.',
    linkInvalid: 'Ce lien est invalide ou expiré.', signOut: 'Déconnexion',
    copyLink: 'Copier le lien', linkCopied: 'Lien copié.', inviteCreated: 'Invitation créée.',
    inviteSent: 'Invitation envoyée par e-mail.', resetLinkCreated: 'Lien de réinitialisation créé.',
    emailDeliveryNote: 'L’envoi d’e-mails n’est pas configuré. Copiez et partagez le lien de façon sécurisée.',
    sendResetLink: 'Créer un lien de réinitialisation',
    customers: 'Clients', cart: 'Panier', paymentMethod: 'Mode de paiement', cash: 'Espèces', card: 'Carte',
    subtotal: 'Sous-total', discount: 'Remise (TND)', confirmSale: 'Confirmer la vente', invoice: 'Facture',
    noSales: 'Aucune vente pour le moment.', addToCart: 'Ajouter au panier', remove: 'Retirer', selectCustomer: 'Client (facultatif)',
    walkInCustomer: 'Vente sans client', newCustomer: 'Ajouter un client', customerName: 'Nom du client',
    saveCustomer: 'Enregistrer le client', saleComplete: 'Vente enregistrée et facture créée.', address: 'Adresse',
  },
} as const

const categoryText: Record<Category, { ar: string; fr: string }> = {
  tshirt: { ar: 'تيشيرتات', fr: 'T-shirts' },
  jeans: { ar: 'جينز', fr: 'Jeans' },
  dress: { ar: 'فساتين', fr: 'Robes' },
  jacket: { ar: 'سترات', fr: 'Vestes' },
  shoes: { ar: 'أحذية', fr: 'Chaussures' },
  accessories: { ar: 'إكسسوارات', fr: 'Accessoires' },
}

function categoryName(category: Category, language: Language) {
  return categoryText[category][language]
}

function roleName(role: Role, language: Language) {
  const values: Record<Role, { ar: string; fr: string }> = {
    admin: { ar: 'مدير', fr: 'Administrateur' },
    storekeeper: { ar: 'أمين مخزن', fr: 'Magasinier' },
    cashier: { ar: 'بائع / أمين صندوق', fr: 'Vendeur / Caissier' },
    viewer: { ar: 'مشاهد', fr: 'Lecteur' },
  }
  return values[role][language]
}

function productName(product: Pick<Product, 'name_ar' | 'name_fr'>, language: Language) {
  return language === 'ar' ? product.name_ar : product.name_fr
}

function money(value: number | string, language: Language) {
  const amount = Number(value)
  return `${new Intl.NumberFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number.isFinite(amount) ? amount : 0)} ${language === 'ar' ? 'د.ت' : 'TND'}`
}

function dateLabel(value: string, language: Language, withTime = false) {
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(dateValue))
}

function variantLabel(variant: Pick<Variant, 'size' | 'color_ar' | 'color_fr'>, language: Language) {
  return `${variant.size === 'ONE_SIZE' ? (language === 'ar' ? 'مقاس واحد' : 'Taille unique') : variant.size} · ${language === 'ar' ? variant.color_ar : variant.color_fr}`
}

function Modal({ title, children, onClose, wide = false, className = '' }: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  className?: string
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={`modal-card ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div><h2>{title}</h2></div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state"><Package size={22} /><p>{children}</p></div>
}

function BrandMark() {
  return <span className="brand-mark"><img src="/novastore-mark.svg" alt="" /></span>
}

export default function App() {
  const [language, setLanguage] = useState<Language>('ar')
  const [darkMode, setDarkMode] = useState(false)
  const t = useCallback((key: keyof typeof copy.ar) => copy[language][key], [language])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])
  useEffect(() => {
    // Ignore automated bots/crawlers (like LinkedIn or Facebook link preview scrapers)
    if (navigator.webdriver) return;

    const alreadyNotified = sessionStorage.getItem('novastore_visit_sent');
    if (alreadyNotified) return;

    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: window.location.pathname,
        referrer: document.referrer || 'Direct / Social Post',
      }),
    })
      .then((res) => {
        if (res.ok) {
          sessionStorage.setItem('novastore_visit_sent', 'true');
        }
      })
      .catch(() => {
        // Silently catch errors so it never disrupts the user experience
      });
  }, []);
  return (
    <AuthenticatedApp
      language={language}
      setLanguage={setLanguage}
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      t={t}
    />
  )
}

function AuthenticatedApp({ language, setLanguage, darkMode, setDarkMode, t }: {
  language: Language
  setLanguage: (language: Language) => void
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
  t: (key: keyof typeof copy.ar) => string
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ email: string } | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    if (window.location.pathname === '/invite') return 'invite'
    if (window.location.pathname === '/reset-password') return 'reset'
    return 'signin'
  })
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [invitationLink, setInvitationLink] = useState<AccountLink | null>(null)
  const [passwordResetLink, setPasswordResetLink] = useState<AccountLink | null>(null)
  const [authToken, setAuthToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [authTokenValid, setAuthTokenValid] = useState(Boolean(authToken))
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<SaleDetails | null>(null)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [team, setTeam] = useState<TeamData | null>(null)
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [loading, setLoading] = useState(true)
  const [movementPage, setMovementPage] = useState(1)
  const [movementHasMore, setMovementHasMore] = useState(false)
  const [movementTotal, setMovementTotal] = useState(0)
  const [loadingMoreMovements, setLoadingMoreMovements] = useState(false)
  const [today] = useState(() => new Date())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [colorFilter, setColorFilter] = useState('all')
  const [lowOnly, setLowOnly] = useState(false)
  const [period, setPeriod] = useState('30')
  const [supplierTab, setSupplierTab] = useState<'suppliers' | 'orders'>('suppliers')
  const [orderEditingId, setOrderEditingId] = useState<string | null>(null)
  const [productDialog, setProductDialog] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [movementDialog, setMovementDialog] = useState(false)
  const [supplierDialog, setSupplierDialog] = useState(false)
  const [orderDialog, setOrderDialog] = useState(false)
  const [importDialog, setImportDialog] = useState(false)
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null)
  const [movementDraft, setMovementDraft] = useState({ variant_id: '', type: 'IN' as MovementType, quantity: '1', adjustment_sign: 1 as -1 | 1, note: '' })
  const [supplierDraft, setSupplierDraft] = useState({ name: '', phone: '', city: '', email: '', notes: '' })
  const [customerDraft, setCustomerDraft] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [customerDialog, setCustomerDialog] = useState(false)
  const [basket, setBasket] = useState<Array<{ variant_id: string; quantity: number }>>([])
  const [posVariantId, setPosVariantId] = useState('')
  const [posQuantity, setPosQuantity] = useState('1')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [salePaymentMethod, setSalePaymentMethod] = useState<'cash' | 'card'>('cash')
  const [saleDiscount, setSaleDiscount] = useState('0')
  const [orderSupplier, setOrderSupplier] = useState('')
  const [orderLines, setOrderLines] = useState<Array<{ variant_id: string; quantity: string; unit_cost_tnd: string }>>([])
  const [teamFormMode, setTeamFormMode] = useState<'create' | 'invite'>('create')
  const [inviteDraft, setInviteDraft] = useState({ email: '', role: 'storekeeper' as Role })
  const [memberDraft, setMemberDraft] = useState({ email: '', password: '', passwordConfirm: '', role: 'storekeeper' as Role })
  const [csv, setCsv] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importError, setImportError] = useState('')
  const [teamRoleFilter, setTeamRoleFilter] = useState<Role>('admin')

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    const body = await readJsonResponse<unknown>(response)
    if (!response.ok) {
      const failure = body && typeof body === 'object' ? body as ApiFailureBody : {}
      const message = failure.error
        ?? failure.issues?.[0]?.message
        ?? t('apiError')
      throw new ApiError(message, body)
    }
    return body as T
  }, [t])

  useEffect(() => {
    if (authToken) window.history.replaceState(null, '', window.location.pathname)
  }, [authToken])

  function changeAuthMode(mode: AuthMode) {
    setAuthMode(mode)
    setAuthError('')
    setAuthNotice('')
    if (mode === 'signin' || mode === 'forgot') {
      window.history.replaceState(null, '', '/')
    }
  }

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    try {
      const csrfToken = await getAuthCsrfToken()
      const response = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
        },
        body: new URLSearchParams({
          csrfToken,
          email: authEmail.trim().toLowerCase(),
          password: authPassword,
          callbackUrl: window.location.origin,
        }),
      })
      const result = await readJsonResponse<{ url?: string }>(response)
      if (!response.ok || !result.url || new URL(result.url, window.location.origin).searchParams.has('error')) {
        throw new Error(t('authFailed'))
      }
      const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin' })
      const session = await readJsonResponse<{ user?: { email?: string | null } } | null>(sessionResponse)
      if (!sessionResponse.ok || !session?.user) throw new Error(t('authFailed'))
      setCurrentUser({ email: session.user.email || authEmail.trim().toLowerCase() })
      setIsSignedIn(true)
      setAuthPassword('')
      setAuthNotice('')
      window.history.replaceState(null, '', '/')
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : t('authFailed'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function submitInvitationAcceptance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authTokenValid) {
      setAuthError(t('linkInvalid'))
      return
    }
    if (authPassword !== authPasswordConfirm) {
      setAuthError(t('passwordMismatch'))
      return
    }
    setAuthBusy(true)
    setAuthError('')
    try {
      await api('/public/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token: authToken, email: authEmail, password: authPassword }),
      })
      setAuthPassword('')
      setAuthPasswordConfirm('')
      setAuthToken('')
      setAuthTokenValid(false)
      setAuthNotice(t('invitationAccepted'))
      window.history.replaceState(null, '', '/')
      setAuthMode('signin')
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function submitPasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError('')
    try {
      const result = await api<{ message: string; email_enabled?: boolean }>('/public/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email: authEmail }),
      })
      setAuthNotice(result.email_enabled === false ? t('resetEmailUnavailable') : t('resetRequestSent'))
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authTokenValid) {
      setAuthError(t('linkInvalid'))
      return
    }
    if (authPassword !== authPasswordConfirm) {
      setAuthError(t('passwordMismatch'))
      return
    }
    setAuthBusy(true)
    setAuthError('')
    try {
      await api('/public/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ token: authToken, password: authPassword }),
      })
      setAuthPassword('')
      setAuthPasswordConfirm('')
      setAuthToken('')
      setAuthTokenValid(false)
      setAuthNotice(t('passwordUpdated'))
      window.history.replaceState(null, '', '/')
      setAuthMode('signin')
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    setAuthBusy(true)
    setError('')
    try {
      const csrfToken = await getAuthCsrfToken()
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1',
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: window.location.origin }),
      })
      if (!response.ok) throw new Error(t('apiError'))
      setIsSignedIn(false)
      setCurrentUser(null)
      setProfile(null)
      setDashboard(null)
      setLoading(true)
      setAuthMode('signin')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function copyAccountLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      showNotice(t('linkCopied'))
    } catch {
      setError(t('apiError'))
    }
  }

  useEffect(() => {
    let active = true
    void fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('apiError'))
        return readJsonResponse<{ user?: { email?: string | null } } | null>(response)
      })
      .then((session) => {
        if (!active) return
        const email = session?.user?.email
        setCurrentUser(email ? { email } : null)
        setIsSignedIn(Boolean(session?.user))
      })
      .catch((caught: unknown) => {
        if (active) setAuthError(caught instanceof Error ? caught.message : t('apiError'))
      })
      .finally(() => {
        if (active) setIsLoaded(true)
      })
    return () => { active = false }
  }, [t])

  const fetchSnapshot = useCallback(async () => {
    const nextProfile = await api<Profile>('/me')
    const allowed = new Set(nextProfile.allowed_pages)
    const [
      nextDashboard,
      nextProducts,
      nextAlerts,
      nextMovementPage,
      nextSupplierData,
      nextOrders,
      nextReport,
      nextTeam,
      nextCustomers,
      nextSales,
    ] = await Promise.all([
      api<DashboardData>('/dashboard'),
      api<Product[]>('/products'),
      api<StockAlert[]>('/alerts'),
      allowed.has('movements') ? api<MovementPage>('/movements?days=90&page=1') : Promise.resolve({
        items: [], page: 1, page_size: 50, total: 0, has_more: false,
      }),
      allowed.has('suppliers')
        ? api<Supplier[]>('/suppliers')
        : Promise.resolve([]),
      allowed.has('suppliers')
        ? api<PurchaseOrder[]>('/purchase-orders')
        : Promise.resolve([]),
      allowed.has('reports')
        ? api<InventoryReport>(`/reports/inventory?days=${period}`)
        : Promise.resolve(null),
      nextProfile.role === 'admin'
        ? api<TeamData>('/team')
        : Promise.resolve(null),
      allowed.has('sales') ? api<Customer[]>('/customers') : Promise.resolve([]),
      allowed.has('sales') ? api<Sale[]>('/sales') : Promise.resolve([]),
    ])
    return {
      profile: nextProfile,
      dashboard: nextDashboard,
      products: nextProducts,
      alerts: nextAlerts,
      movements: nextMovementPage.items,
      movementPage: nextMovementPage.page,
      movementHasMore: nextMovementPage.has_more,
      movementTotal: nextMovementPage.total,
      suppliers: nextSupplierData,
      orders: nextOrders,
      report: nextReport,
      team: nextTeam,
      customers: nextCustomers,
      sales: nextSales,
    }
  }, [api, period])

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof fetchSnapshot>>) => {
    setProfile(snapshot.profile)
    setDashboard(snapshot.dashboard)
    setProducts(snapshot.products)
    setAlerts(snapshot.alerts)
    setMovements(snapshot.movements)
    setMovementPage(snapshot.movementPage)
    setMovementHasMore(snapshot.movementHasMore)
    setMovementTotal(snapshot.movementTotal)
    setSuppliers(snapshot.suppliers)
    setOrders(snapshot.orders)
    setReport(snapshot.report)
    setTeam(snapshot.team)
    setCustomers(snapshot.customers)
    setSales(snapshot.sales)
    setPage((current) => snapshot.profile.allowed_pages.includes(current) ? current : 'dashboard')
  }, [])

  const refresh = useCallback(async () => {
    applySnapshot(await fetchSnapshot())
  }, [applySnapshot, fetchSnapshot])

  async function loadMoreMovements() {
    if (loadingMoreMovements || !movementHasMore) return
    setLoadingMoreMovements(true)
    setError('')
    try {
      const next = await api<MovementPage>(`/movements?days=90&page=${movementPage + 1}`)
      setMovements((current) => [...current, ...next.items])
      setMovementPage(next.page)
      setMovementHasMore(next.has_more)
      setMovementTotal(next.total)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setLoadingMoreMovements(false)
    }
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let active = true
    const load = async () => {
      try {
        const snapshot = await fetchSnapshot()
        if (active) applySnapshot(snapshot)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : t('apiError'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [isLoaded, isSignedIn, fetchSnapshot, applySnapshot, t])

  const direction = language === 'ar' ? 'rtl' : 'ltr'
  const pageTitle = t(page)
  const localizedProducts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const name = productName(product, language).toLocaleLowerCase()
      return (!term || name.includes(term) || product.sku.toLocaleLowerCase().includes(term))
        && (categoryFilter === 'all' || product.category === categoryFilter)
        && (sizeFilter === 'all' || product.variants.some((variant) => variant.size === sizeFilter))
        && (colorFilter === 'all' || product.variants.some((variant) => variant.color_key === colorFilter))
        && (!lowOnly || product.variants.some((variant) =>
          variant.quantity <= (variant.low_stock_threshold ?? product.low_stock_threshold),
        ))
    })
  }, [products, query, language, categoryFilter, sizeFilter, colorFilter, lowOnly])

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  async function runAction(action: () => Promise<unknown>, success = t('saveSuccess')) {
    setSaving(true)
    setError('')
    try {
      await action()
      await refresh()
      showNotice(success)
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('apiError')
      setError(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  function beginAddProduct() {
    setProductDraft({
      sku: '',
      name_ar: '',
      name_fr: '',
      category: 'tshirt',
      price_tnd: '',
      low_stock_threshold: '10',
      variants: [{ size: 'M', color_key: 'noir', color_ar: 'أسود', color_fr: 'Noir', color_hex: '#292D32', low_stock_threshold: '' }],
    })
    setProductDialog(true)
  }

  function beginEditProduct(product: Product) {
    setSelectedProduct(null)
    setProductDraft({
      id: product.id,
      sku: product.sku,
      name_ar: product.name_ar,
      name_fr: product.name_fr,
      category: product.category,
      price_tnd: String(product.price_tnd),
      low_stock_threshold: String(product.low_stock_threshold),
      variants: product.variants.map((variant) => ({
        ...variant,
        low_stock_threshold: variant.low_stock_threshold === null ? '' : String(variant.low_stock_threshold),
      })),
    })
    setProductDialog(true)
  }

  function productPayload(draft: ProductDraft) {
    return {
      sku: draft.sku,
      name_ar: draft.name_ar,
      name_fr: draft.name_fr,
      category: draft.category,
      price_tnd: Number(draft.price_tnd),
      low_stock_threshold: Number(draft.low_stock_threshold),
      variants: draft.variants.map(({ size, color_key, color_ar, color_fr, color_hex, low_stock_threshold }) => ({
        size, color_key, color_ar, color_fr, color_hex,
        low_stock_threshold: low_stock_threshold === '' ? null : Number(low_stock_threshold),
      })),
    }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!productDraft) return
    const saved = await runAction(
      () => api(productDraft.id ? `/products/${productDraft.id}` : '/products', {
        method: productDraft.id ? 'PUT' : 'POST',
        body: JSON.stringify(productPayload(productDraft)),
      }),
    )
    if (saved) {
      setProductDialog(false)
      setProductDraft(null)
    }
  }

  async function archiveProduct(product: Product) {
    if (!window.confirm(t('confirmArchive'))) return
    await runAction(() => api(`/products/${product.id}`, { method: 'DELETE' }), t('archived'))
  }

  function openMovement(product?: Product, variant?: Variant) {
    setMovementDraft({
      variant_id: variant?.id ?? product?.variants[0]?.id ?? products[0]?.variants[0]?.id ?? '',
      type: 'IN',
      quantity: '1',
      adjustment_sign: 1,
      note: '',
    })
    setMovementDialog(true)
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await runAction(() => api('/movements', {
      method: 'POST',
      body: JSON.stringify({
        ...movementDraft,
        quantity: Number(movementDraft.quantity),
        adjustment_sign: movementDraft.type === 'ADJUSTMENT' ? movementDraft.adjustment_sign : undefined,
      }),
    }))
    if (saved) setMovementDialog(false)
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await runAction(() => api('/suppliers', { method: 'POST', body: JSON.stringify(supplierDraft) }))
    if (saved) {
      setSupplierDialog(false)
      setSupplierDraft({ name: '', phone: '', city: '', email: '', notes: '' })
    }
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let createdCustomer: Customer | undefined
    const saved = await runAction(async () => {
      createdCustomer = await api<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify(customerDraft),
      })
    }, t('saveCustomer'))
    if (saved && createdCustomer) {
      setSaleCustomerId(createdCustomer.id)
      setCustomerDialog(false)
      setCustomerDraft({ name: '', phone: '', email: '', address: '', notes: '' })
    }
  }

  function addPosLine() {
    const selected = variantOptions.find((variant) => variant.id === posVariantId)
    const quantity = Number(posQuantity)
    if (!selected || !Number.isInteger(quantity) || quantity < 1) return
    const existingQuantity = basket.find((line) => line.variant_id === selected.id)?.quantity ?? 0
    if (existingQuantity + quantity > selected.quantity) {
      setError(t('outOfStock'))
      return
    }
    setError('')
    setBasket((current) => {
      const existing = current.find((line) => line.variant_id === selected.id)
      return existing
        ? current.map((line) => line.variant_id === selected.id ? { ...line, quantity: line.quantity + quantity } : line)
        : [...current, { variant_id: selected.id, quantity }]
    })
  }

  async function saveSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await runAction(() => api('/sales', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: saleCustomerId || null,
        discount_tnd: Number(saleDiscount),
        payment_method: salePaymentMethod,
        lines: basket,
      }),
    }), t('saleComplete'))
    if (saved) {
      setBasket([])
      setSaleCustomerId('')
      setSaleDiscount('0')
    }
  }

  async function openInvoice(saleId: string) {
    setError('')
    try {
      setSelectedInvoice(await api<SaleDetails>(`/sales/${saleId}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('apiError'))
    }
  }

  function openNewOrder(product?: Product, variant?: Variant) {
    if (!suppliers.length) {
      setPage('suppliers')
      setSupplierTab('suppliers')
      showNotice(t('noSuppliers'))
      return
    }
    setOrderEditingId(null)
    setOrderSupplier(suppliers[0].id)
    const initialVariant = variant ?? product?.variants[0]
    setOrderLines([{
      variant_id: initialVariant?.id ?? products[0]?.variants[0]?.id ?? '',
      quantity: product && initialVariant
        ? String(Math.max(1, (initialVariant.low_stock_threshold ?? product.low_stock_threshold) * 2 - initialVariant.quantity))
        : '1',
      unit_cost_tnd: product ? String(Number(product.price_tnd) * 0.65) : products[0] ? String(Number(products[0].price_tnd) * 0.65) : '1',
    }])
    setOrderDialog(true)
  }

  function openEditOrder(order: PurchaseOrder) {
    setOrderEditingId(order.id)
    setOrderSupplier(order.supplier_id)
    setOrderLines(order.lines.map((line) => ({
      variant_id: line.variant_id,
      quantity: String(line.quantity),
      unit_cost_tnd: String(line.unit_cost_tnd),
    })))
    setOrderDialog(true)
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await runAction(() => api(orderEditingId ? `/purchase-orders/${orderEditingId}` : '/purchase-orders', {
      method: orderEditingId ? 'PUT' : 'POST',
      body: JSON.stringify({
        supplier_id: orderSupplier,
        lines: orderLines.map((line) => ({
          variant_id: line.variant_id,
          quantity: Number(line.quantity),
          unit_cost_tnd: Number(line.unit_cost_tnd),
        })),
      }),
    }))
    if (saved) {
      setSupplierTab('orders')
      setOrderDialog(false)
      setOrderEditingId(null)
    }
  }

  async function cancelPurchaseOrder(order: PurchaseOrder) {
    if (!window.confirm(t('confirmCancelOrder'))) return
    await runAction(() => api(`/purchase-orders/${order.id}`, { method: 'DELETE' }), t('orderCancelled'))
  }

  async function changeOrderStatus(order: PurchaseOrder, status: 'sent' | 'received') {
    if (status === 'received' && !window.confirm(t('confirmReceive'))) return
    await runAction(() => api(`/purchase-orders/${order.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }), status === 'received' ? t('received') : t('sent'))
  }

  async function sendInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setInvitationLink(null)
    try {
      const result = await api<{ invitation_url: string; email_sent: boolean }>('/team/invitations', {
        method: 'POST',
        body: JSON.stringify(inviteDraft),
      })
      setInvitationLink({ url: result.invitation_url, email_sent: result.email_sent })
      await refresh()
      showNotice(result.email_sent ? t('inviteSent') : t('inviteCreated'))
      setInviteDraft({ email: '', role: 'storekeeper' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setSaving(false)
    }
  }

  async function createTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (memberDraft.password !== memberDraft.passwordConfirm) {
      setError(t('passwordMismatch'))
      return
    }
    setSaving(true)
    setError('')
    setInvitationLink(null)
    try {
      await api('/team', {
        method: 'POST',
        body: JSON.stringify({
          email: memberDraft.email,
          password: memberDraft.password,
          role: memberDraft.role,
        }),
      })
      await refresh()
      showNotice(t('memberCreated'))
      setMemberDraft({ email: '', password: '', passwordConfirm: '', role: 'storekeeper' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setSaving(false)
    }
  }

  async function updateRole(userId: string, role: Role) {
    await runAction(() => api(`/team/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }), t('roleUpdated'))
  }

  async function setTeamMemberActive(member: TeamData['users'][number], isActive: boolean) {
    if (!isActive && !window.confirm(t('confirmDeactivateMember'))) return
    await runAction(
      () => api(isActive ? `/team/${member.id}/status` : `/team/${member.id}`, {
        method: isActive ? 'PATCH' : 'DELETE',
        ...(isActive ? { body: JSON.stringify({ is_active: true }) } : {}),
      }),
      isActive ? t('memberReactivated') : t('memberDeactivated'),
    )
  }

  async function issuePasswordReset(userId: string) {
    setSaving(true)
    setError('')
    setPasswordResetLink(null)
    try {
      const result = await api<{ reset_url: string; email_sent: boolean }>(`/team/${userId}/password-reset`, {
        method: 'POST',
      })
      setPasswordResetLink({ url: result.reset_url, email_sent: result.email_sent })
      showNotice(t('resetLinkCreated'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('apiError'))
    } finally {
      setSaving(false)
    }
  }

  async function previewCsv(file: File | undefined) {
    setImportPreview(null)
    setImportError('')
    setCsv('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError(t('fileIssues'))
      return
    }
    const content = await file.text()
    setCsv(content)
    try {
      const preview = await api<ImportPreview>('/import/preview', {
        method: 'POST',
        body: JSON.stringify({ csv: content }),
      })
      setImportPreview(preview)
    } catch (caught) {
      if (caught instanceof ApiError && caught.body && typeof caught.body === 'object' && 'issues' in caught.body) {
        setImportPreview(caught.body as ImportPreview)
      } else {
        setImportError(caught instanceof Error ? caught.message : t('apiError'))
      }
    }
  }

  async function commitCsv() {
    if (!csv || !importPreview || importPreview.issues.length) return
    if (!window.confirm(t('confirmImportPrompt'))) return
    const saved = await runAction(() => api('/import/commit', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }))
    if (saved) {
      setImportDialog(false)
      setImportPreview(null)
      setCsv('')
    }
  }

  function exportInventory() {
    if (!report) return
    const inventoryRows = [
      [t('sku'), t('product'), t('category'), t('quantity'), t('price'), t('inventoryValue')],
      ...report.products.map((product) => [
        product.sku,
        productName(product, language),
        categoryName(product.category, language),
        String(product.quantity),
        Number(product.price_tnd).toFixed(3),
        Number(product.value_tnd).toFixed(3),
      ]),
    ]
    const movementRows = [
      [],
      [t('movementTrend')],
      [t('date'), t('incoming'), t('outgoing')],
      ...report.movement_days.map((day) => [dateLabel(String(day.day).slice(0, 10), language), String(day.incoming), String(day.outgoing)]),
    ]
    const rows = [...inventoryRows, ...movementRows]
    const content = `\uFEFF${rows.map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'novastore-inventory.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function goTo(next: Page) {
    if (!profile?.allowed_pages.includes(next)) return
    setPage(next)
    setMobileNav(false)
  }

  const authHeading = authMode === 'signin'
    ? t('signIn')
    : authMode === 'invite'
      ? t('acceptInvite')
      : authMode === 'forgot'
        ? t('forgotPassword')
        : t('resetPassword')

  if (!isLoaded) {
    return <main className="loading-screen" dir={direction}><div className="loading-brand"><BrandMark /><strong>NovaStore</strong><p>{t('loading')}</p></div></main>
  }

  if (!isSignedIn) {
    return (
      <main className="auth-screen" dir={direction}>
        <section className="auth-copy">
          <BrandMark />
          <p className="eyebrow">NOVASTORE · STOCK INTELLIGENCE</p>
          <h1>{language === 'ar' ? 'إدارة مخزونك، ببساطة.' : 'Votre stock, en toute clarté.'}</h1>
          <p>{t('signInHelp')}</p>
          <button className="button button-outline" onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}>
            {language === 'ar' ? 'Français' : 'العربية'}
          </button>
        </section>
        <section className="auth-form">
          <div className="auth-form-heading">
            <h2>{authHeading}</h2>
            <p>{authMode === 'forgot' ? t('resetRequestHelp') : t('signInHelp')}</p>
          </div>
          {authError && <div className="inline-alert" role="alert"><AlertTriangle size={16} /><span>{authError}</span></div>}
          {authNotice && <div className="toast auth-toast"><Check size={16} />{authNotice}</div>}
          {authMode === 'signin' && <form className="form-stack auth-fields" onSubmit={submitSignIn}>
            <label>{t('authEmail')}<input autoComplete="email" type="email" required maxLength={254} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>
            <label>{t('authPassword')}<input autoComplete="current-password" type="password" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
            <button className="button button-primary" disabled={authBusy}>{t('signIn')}</button>
            <button type="button" className="button button-quiet auth-link" onClick={() => changeAuthMode('forgot')}>{t('forgotPassword')}</button>
          </form>}
          {demoEmail && demoPassword && authMode === 'signin' && <aside className="demo-account">
            <div className="demo-account-heading"><strong>{t('demoAccount')}</strong><span>{t('demoViewer')}</span></div>
            <p>{t('authEmail')}: {demoEmail}</p>
            <p>{t('authPassword')}: {demoPassword}</p>
            <small>{t('demoReadOnlyNotice')}</small>
            <button type="button" className="button button-outline" onClick={() => {
              setAuthEmail(demoEmail)
              setAuthPassword(demoPassword)
              setAuthError('')
            }}>{t('useDemoAccount')}</button>
          </aside>}
          {authMode === 'invite' && <form className="form-stack auth-fields" onSubmit={submitInvitationAcceptance}>
            <label>{t('invitedEmail')}<input autoComplete="email" type="email" required maxLength={254} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>
            <label>{t('newPassword')}<input autoComplete="new-password" type="password" required minLength={12} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
            <label>{t('confirmPassword')}<input autoComplete="new-password" type="password" required minLength={12} value={authPasswordConfirm} onChange={(event) => setAuthPasswordConfirm(event.target.value)} /></label>
            <small className="auth-hint">{t('passwordRequirement')}</small>
            <button className="button button-primary" disabled={authBusy || !authTokenValid}>{t('acceptInvite')}</button>
          </form>}
          {authMode === 'forgot' && <form className="form-stack auth-fields" onSubmit={submitPasswordResetRequest}>
            <label>{t('authEmail')}<input autoComplete="email" type="email" required maxLength={254} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>
            <button className="button button-primary" disabled={authBusy}>{t('sendResetLink')}</button>
            <button type="button" className="button button-quiet auth-link" onClick={() => changeAuthMode('signin')}>{t('backToSignIn')}</button>
          </form>}
          {authMode === 'reset' && <form className="form-stack auth-fields" onSubmit={submitPasswordReset}>
            <label>{t('newPassword')}<input autoComplete="new-password" type="password" required minLength={12} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
            <label>{t('confirmPassword')}<input autoComplete="new-password" type="password" required minLength={12} value={authPasswordConfirm} onChange={(event) => setAuthPasswordConfirm(event.target.value)} /></label>
            <small className="auth-hint">{t('passwordRequirement')}</small>
            <button className="button button-primary" disabled={authBusy || !authTokenValid}>{t('resetPassword')}</button>
          </form>}
          {authMode !== 'signin' && authMode !== 'forgot' && !authTokenValid && !authError && <div className="inline-alert" role="alert"><AlertTriangle size={16} /><span>{t('linkInvalid')}</span></div>}
        </section>
      </main>
    )
  }

  if (error && !profile) {
    return <main className="loading-screen" dir={direction}><section className="error-card"><AlertTriangle size={24} /><h1>{t('loadError')}</h1><p>{error}</p><div className="modal-actions"><button className="button button-primary" onClick={() => {
      setError('')
      setLoading(true)
      refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('apiError'))).finally(() => setLoading(false))
    }}>{t('retry')}</button><button className="button button-outline" disabled={authBusy} onClick={() => void signOut()}>{t('signOut')}</button></div></section></main>
  }

  if (loading || !profile || !dashboard) {
    return <main className="loading-screen" dir={direction}><div className="loading-brand"><BrandMark /><strong>NovaStore</strong><p>{t('loading')}</p></div></main>
  }

  const formattedMoney = (value: number | string) => money(value, language)
  const movementDays = dashboard.movement_days.map((day) => ({
    ...day,
    label: new Intl.DateTimeFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', { day: 'numeric', month: 'short' }).format(new Date(`${String(day.day).slice(0, 10)}T12:00:00`)),
  }))
  const categoryData = dashboard.category_values.map((item, index) => ({
    name: categoryName(item.category, language),
    value: Number(item.value),
    color: ['#167c8a', '#a97d68', '#58a69a', '#b69b6b', '#748b9a', '#9c8293'][index % 6],
  }))
  const statusFor = (product: Product) => product.quantity === 0
    ? 'outOfStock'
    : product.variants.some((variant) => variant.quantity <= (variant.low_stock_threshold ?? product.low_stock_threshold))
      ? 'low'
      : 'inStock'
  const variantOptions = products.flatMap((product) => product.variants.map((variant) => ({
    ...variant,
    product_id: product.id,
    product_name: productName(product, language),
    sku: product.sku,
    price_tnd: Number(product.price_tnd),
  })))
  const colorOptions = Array.from(new Map(products.flatMap((product) => product.variants.map((variant) => [variant.color_key, {
    key: variant.color_key, ar: variant.color_ar, fr: variant.color_fr,
  }]))).values())
  const allowedPages = profile.allowed_pages
  const canManageStock = profile.role === 'admin' || profile.role === 'storekeeper'
  const basketTotal = basket.reduce((sum, line) => {
    const variant = variantOptions.find((option) => option.id === line.variant_id)
    return sum + (variant?.price_tnd ?? 0) * line.quantity
  }, 0)

  return (
    <div className={`app-shell ${darkMode ? 'theme-dark' : ''} ${selectedInvoice ? 'print-invoice-active' : ''}`} dir={direction}>
      {mobileNav && <button className="mobile-scrim" aria-label={t('close')} onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><BrandMark /><span className="brand-copy"><strong>NOVA<span>STORE</span></strong><small>GESTION DE STOCK</small></span><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label={t('close')}><X size={18} /></button></div>
        <div className="store-card"><span className="store-avatar">{profile.store.name.slice(0, 1)}</span><span><strong>{profile.store.name}</strong><small>{profile.store.city}, Tunisia</small></span><ChevronDown size={15} /></div>
        <p className="nav-caption">{t('inventory')}</p>
        <nav className="side-nav">
          {allowedPages.map((item) => {
            const Icon = pageIcons[item]
            return <button key={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => goTo(item)}>
              <Icon size={17} strokeWidth={1.8} /><span>{t(item)}</span>
              {item === 'alerts' && alerts.length > 0 && <span className="nav-badge">{alerts.length}</span>}
            </button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={17} /><span>{t('generated')}</span></div>
          <div className="profile-row"><span className="avatar-initial">{(currentUser?.email ?? profile.email).slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{currentUser?.email ?? profile.email}</strong><small>{roleName(profile.role, language)}</small></span><button className="icon-button" aria-label={t('signOut')} title={t('signOut')} disabled={authBusy} onClick={() => void signOut()}><LogOut size={15} /></button></div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label={t('dashboard')} onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>{profile.store.name}</span><span className="crumb-separator">/</span><strong>{pageTitle}</strong></div></div>
          <div className="topbar-actions">
            <button className="topbar-control language-control" onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}>{language === 'ar' ? 'FR' : 'عربي'}</button>
            <button className="icon-button" aria-label="Theme" onClick={() => setDarkMode(!darkMode)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <span className="topbar-divider" />
            <span className="topbar-role">{roleName(profile.role, language)}</span>
            <button className="button button-quiet button-small" disabled={authBusy} onClick={() => void signOut()}><LogOut size={15} />{t('signOut')}</button>
          </div>
        </header>

        <main className="main-content">
          <div className="page-heading">
            <div><span className="eyebrow">{t('generated')}</span><h1>{page === 'dashboard' ? t('overview') : pageTitle}</h1></div>
            <div className="page-heading-actions">
              {page === 'dashboard' && canManageStock && <button className="button button-primary" onClick={() => openMovement()}><Plus size={16} />{t('newMovement')}</button>}
              {page === 'sales' && <button className="button button-primary" onClick={() => setCustomerDialog(true)}><Plus size={16} />{t('newCustomer')}</button>}
              {page === 'products' && canManageStock && <>
                {profile.role === 'admin' && <button className="button button-quiet" onClick={() => setImportDialog(true)}><Download size={16} />{t('importCsv')}</button>}
                <button className="button button-primary" onClick={beginAddProduct}><Plus size={16} />{t('addProduct')}</button>
              </>}
              {page === 'movements' && canManageStock && <button className="button button-primary" onClick={() => openMovement()}><Plus size={16} />{t('newMovement')}</button>}
              {page === 'suppliers' && canManageStock && <button className="button button-primary" onClick={() => supplierTab === 'orders' ? openNewOrder() : setSupplierDialog(true)}><Plus size={16} />{supplierTab === 'orders' ? t('newOrder') : t('addSupplier')}</button>}
            </div>
          </div>

          {error && <div className="inline-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label={t('close')}><X size={16} /></button></div>}
          {notice && <div className="toast"><Check size={16} />{notice}</div>}

          {page === 'dashboard' && (
            <div className="page-stack">
              <section className="welcome-panel">
                <div><span className="eyebrow">{dateLabel(today.toISOString(), language)}</span><h2>{language === 'ar' ? `مرحباً، ${currentUser?.email ?? ''}` : `Bonjour, ${currentUser?.email ?? ''}`}</h2><p>{language === 'ar' ? 'إليك ملخص المخزون وحركة متجرك.' : 'Voici le résumé du stock et de l’activité de votre magasin.'}</p></div>
                <span className="welcome-mark"><Boxes size={37} /></span>
              </section>
              <section className="stats-grid">
                <StatCard icon={<Package size={18} />} label={t('productCount')} value={String(dashboard.metrics.product_count)} tone="sand" />
                <StatCard icon={<Boxes size={18} />} label={t('inventoryValue')} value={formattedMoney(dashboard.metrics.inventory_value)} tone="sage" />
                <StatCard icon={<AlertTriangle size={18} />} label={t('lowStock')} value={String(dashboard.metrics.low_count)} meta={`${dashboard.metrics.out_count} ${t('outOfStock').toLowerCase()}`} tone="rose" />
                <StatCard icon={<ArrowLeftRight size={18} />} label={t('todayMovements')} value={String(dashboard.metrics.today_movements)} tone="blue" />
              </section>
              <section className="dashboard-grid">
                <article className="panel chart-panel">
                  <div className="panel-heading"><div><h2>{t('movementTrend')}</h2><p>{t('last30')}</p></div><div className="legend"><span><i className="legend-dot green" />{t('incoming')}</span><span><i className="legend-dot rose" />{t('outgoing')}</span></div></div>
                  {movementDays.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={movementDays} barGap={5} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line-soft)" /><XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={4} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} /><Bar dataKey="incoming" name={t('incoming')} fill="#238a98" radius={[4, 4, 0, 0]} maxBarSize={12} /><Bar dataKey="outgoing" name={t('outgoing')} fill="#d6a49a" radius={[4, 4, 0, 0]} maxBarSize={12} /></BarChart></ResponsiveContainer></div> : <EmptyState>{t('chartEmpty')}</EmptyState>}
                </article>
                <article className="panel category-panel">
                  <div className="panel-heading"><div><h2>{t('valueByCategory')}</h2><p>{t('inventoryValue')}</p></div></div>
                  {categoryData.some((item) => item.value > 0) ? <><div className="donut-area"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData.filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius={66} outerRadius={94} paddingAngle={3} stroke="none">{categoryData.filter((item) => item.value > 0).map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formattedMoney(Number(value))} /></PieChart></ResponsiveContainer></div><div className="category-legend">{categoryData.filter((item) => item.value > 0).map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}<strong>{formattedMoney(item.value)}</strong></span>)}</div></> : <EmptyState>{t('chartEmpty')}</EmptyState>}
                </article>
              </section>
              <section className="panel table-panel">
                <PanelHeading title={t('lowProducts')} subtitle={`${dashboard.low_products.length} ${t('products').toLocaleLowerCase(language)}`} action={<button className="button button-quiet" onClick={() => goTo('alerts')}>{t('viewAll')}<ArrowUpRight size={15} /></button>} />
                <ProductTable products={dashboard.low_products.slice(0, 5)} language={language} t={t} statusFor={statusFor} formattedMoney={formattedMoney} empty={t('noAlerts')} onView={setSelectedProduct} />
              </section>
            </div>
          )}

          {page === 'products' && (
            <section className="panel table-panel">
              <div className="filter-toolbar">
                <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} /></label>
                <label className="filter-select"><span>{t('category')}</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">{t('allCategories')}</option>{categories.map((category) => <option value={category} key={category}>{categoryName(category, language)}</option>)}</select></label>
                <label className="filter-select"><span>{t('size')}</span><select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}><option value="all">{t('allSizes')}</option>{sizes.map((size) => <option key={size}>{size}</option>)}</select></label>
                <label className="filter-select"><span>{t('color')}</span><select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}><option value="all">{t('allColors')}</option>{colorOptions.map((color) => <option key={color.key} value={color.key}>{language === 'ar' ? color.ar : color.fr}</option>)}</select></label>
                <label className="low-filter"><input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} />{t('lowOnly')}</label>
              </div>
              <ProductTable products={localizedProducts} language={language} t={t} statusFor={statusFor} formattedMoney={formattedMoney} empty={t('noProducts')} onView={setSelectedProduct} actions={canManageStock ? (product) => <div className="table-actions"><button className="icon-button" aria-label={t('edit')} onClick={() => beginEditProduct(product)}><FileText size={16} /></button>{profile.role === 'admin' && <button className="icon-button danger-action" aria-label={t('archive')} onClick={() => archiveProduct(product)}><X size={16} /></button>}</div> : undefined} />
              <div className="table-footnote"><span>{localizedProducts.length} / {products.length} {t('products').toLocaleLowerCase(language)}</span><span>{t('stockHistoryNote')}</span></div>
            </section>
          )}

          {page === 'sales' && (
            <div className="page-stack">
              <section className="panel table-panel">
                <PanelHeading title={t('cart')} subtitle={t('products')} />
                <form className="form-stack" onSubmit={saveSale}>
                  <div className="filter-toolbar">
                    <label className="filter-select"><span>{t('variant')}</span><select required aria-label={t('variant')} value={posVariantId} onChange={(event) => setPosVariantId(event.target.value)}><option value="">{t('selectProduct')}</option>{products.map((product) => <optgroup key={product.id} label={`${product.sku} · ${productName(product, language)}`}>{product.variants.map((variant) => <option key={variant.id} value={variant.id} disabled={variant.quantity === 0}>{variantLabel(variant, language)} · {variant.quantity} {t('units')} · {formattedMoney(product.price_tnd)}</option>)}</optgroup>)}</select></label>
                    <label className="filter-select"><span>{t('quantity')}</span><input aria-label={t('quantity')} type="number" min="1" step="1" value={posQuantity} onChange={(event) => setPosQuantity(event.target.value)} /></label>
                    <button className="button button-outline" type="button" onClick={addPosLine}><Plus size={15} />{t('addToCart')}</button>
                  </div>
                  {basket.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('variant')}</th><th>{t('quantity')}</th><th className="number-cell">{t('total')}</th><th>{t('actions')}</th></tr></thead><tbody>
                    {basket.map((line) => {
                      const variant = variantOptions.find((option) => option.id === line.variant_id)
                      if (!variant) return null
                      return <tr key={line.variant_id}><td>{variant.product_name} <small>{variant.sku}</small></td><td>{variantLabel(variant, language)}</td><td><input aria-label={`${t('quantity')} ${variant.sku}`} type="number" min="1" max={variant.quantity} value={line.quantity} onChange={(event) => {
                        const nextQuantity = Number(event.target.value)
                        if (Number.isInteger(nextQuantity) && nextQuantity >= 1) {
                          setBasket((current) => current.map((item) => item.variant_id === line.variant_id
                            ? { ...item, quantity: Math.min(nextQuantity, variant.quantity) }
                            : item))
                        }
                      }} /></td><td className="number-cell">{formattedMoney(variant.price_tnd * line.quantity)}</td><td><button className="button button-quiet button-small danger-action" type="button" aria-label={`${t('remove')} ${variant.sku}`} onClick={() => setBasket((current) => current.filter((item) => item.variant_id !== line.variant_id))}>{t('remove')}</button></td></tr>
                    })}
                  </tbody></table></div> : <EmptyState>{t('noProducts')}</EmptyState>}
                  <div className="filter-toolbar">
                    <label className="filter-select"><span>{t('customers')}</span><select value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}><option value="">{t('walkInCustomer')}</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>
                    <button className="button button-quiet" type="button" onClick={() => setCustomerDialog(true)}><Plus size={15} />{t('newCustomer')}</button>
                    <label className="filter-select"><span>{t('discount')}</span><input type="number" min="0" max={basketTotal} step="0.001" value={saleDiscount} onChange={(event) => setSaleDiscount(event.target.value)} /></label>
                    <label className="filter-select"><span>{t('paymentMethod')}</span><select value={salePaymentMethod} onChange={(event) => setSalePaymentMethod(event.target.value as 'cash' | 'card')}><option value="cash">{t('cash')}</option><option value="card">{t('card')}</option></select></label>
                  </div>
                  <div className="panel-heading"><strong>{t('subtotal')}: {formattedMoney(basketTotal)}</strong><strong>{t('total')}: {formattedMoney(Math.max(0, basketTotal - Number(saleDiscount || 0)))}</strong></div>
                  <div className="modal-actions"><button className="button button-primary" disabled={saving || basket.length === 0}>{t('confirmSale')}</button></div>
                </form>
              </section>
              <section className="panel table-panel"><PanelHeading title={t('sales')} subtitle={`${sales.length} ${t('sales').toLocaleLowerCase(language)}`} />
                {sales.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('invoice')}</th><th>{t('date')}</th><th>{t('customers')}</th><th>{t('user')}</th><th>{t('paymentMethod')}</th><th className="number-cell">{t('total')}</th><th>{t('actions')}</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><strong>INV-{String(sale.invoice_number).padStart(6, '0')}</strong></td><td>{dateLabel(sale.created_at, language, true)}</td><td>{sale.customer_name ?? t('walkInCustomer')}</td><td>{sale.cashier_email}</td><td>{t(sale.payment_method)}</td><td className="number-cell"><strong>{formattedMoney(sale.total_tnd)}</strong></td><td><button className="button button-quiet button-small" onClick={() => void openInvoice(sale.id)}>{t('invoice')}</button></td></tr>)}</tbody></table></div> : <EmptyState>{t('noSales')}</EmptyState>}
              </section>
            </div>
          )}

          {page === 'movements' && (
            <section className="panel table-panel">
              <PanelHeading title={t('movements')} subtitle={`${movements.length} / ${movementTotal} ${t('movementCount')} · ${t('last90')}`} />
              {movements.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('date')}</th><th>{t('product')}</th><th>{t('variant')}</th><th>{t('type')}</th><th className="number-cell">{t('quantity')}</th><th>{t('user')}</th><th>{t('note')}</th></tr></thead><tbody>
                {movements.map((movement) => <tr key={movement.id}><td>{dateLabel(movement.created_at, language, true)}</td><td><div className="product-cell"><span className="product-glyph"><Shirt size={17} /></span><span><strong>{language === 'ar' ? movement.name_ar : movement.name_fr}</strong><small>{movement.sku}</small></span></div></td><td>{movement.size} · {language === 'ar' ? movement.color_ar : movement.color_fr}</td><td><MovementBadge type={movement.type} sign={movement.adjustment_sign} language={language} /></td><td className="number-cell"><strong>{movement.type === 'OUT' || (movement.type === 'ADJUSTMENT' && movement.adjustment_sign === -1) ? '−' : '+'}{movement.quantity}</strong></td><td>{movement.created_by_email}</td><td>{movement.note || '—'}</td></tr>)}
              </tbody></table></div> : <EmptyState>{t('noMovements')}</EmptyState>}
              {movementHasMore && <div className="table-footnote"><button className="button button-outline" disabled={loadingMoreMovements} onClick={() => void loadMoreMovements()}>{loadingMoreMovements ? t('loading') : t('loadMore')}</button></div>}
            </section>
          )}

          {page === 'suppliers' && (
            <div className="page-stack">
              <div className="tabs"><button className={supplierTab === 'suppliers' ? 'active' : ''} onClick={() => setSupplierTab('suppliers')}>{t('suppliersList')} <span>{suppliers.length}</span></button><button className={supplierTab === 'orders' ? 'active' : ''} onClick={() => setSupplierTab('orders')}>{t('orders')} <span>{orders.length}</span></button></div>
              {supplierTab === 'suppliers' ? <section className="panel table-panel">
                {suppliers.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('supplier')}</th><th>{t('phone')}</th><th>{t('city')}</th><th>{t('email')}</th><th>{t('orders')}</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><div className="product-cell"><span className="supplier-avatar">{supplier.name.slice(0, 1)}</span><strong>{supplier.name}</strong></div></td><td>{supplier.phone || '—'}</td><td>{supplier.city || '—'}</td><td>{supplier.email || '—'}</td><td>{supplier.order_count}</td></tr>)}</tbody></table></div> : <EmptyState>{t('noSuppliers')}</EmptyState>}
              </section> : <section className="panel table-panel">
                {orders.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('orderNumber')}</th><th>{t('supplier')}</th><th>{t('date')}</th><th>{t('lines')}</th><th className="number-cell">{t('total')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead><tbody>
                  {orders.map((order) => <tr key={order.id}><td><strong>PO-{String(order.order_number).padStart(4, '0')}</strong></td><td>{order.supplier_name}</td><td>{dateLabel(order.created_at, language)}</td><td><div className="order-line-list">{order.lines.map((line) => <span key={line.id}>{language === 'ar' ? line.name_ar : line.name_fr} · {line.size} × {line.quantity}</span>)}</div></td><td className="number-cell">{formattedMoney(order.total_tnd)}</td><td><OrderBadge status={order.status} language={language} /></td><td>{profile.role !== 'viewer' && order.status === 'draft' && <div className="table-actions"><button className="button button-quiet button-small" disabled={saving} onClick={() => openEditOrder(order)}>{t('editOrder')}</button><button className="button button-quiet button-small danger-action" disabled={saving} onClick={() => void cancelPurchaseOrder(order)}>{t('cancelOrder')}</button><button className="button button-quiet button-small" disabled={saving} onClick={() => changeOrderStatus(order, 'sent')}>{t('send')}</button></div>}{profile.role !== 'viewer' && order.status === 'sent' && <button className="button button-quiet button-small" disabled={saving} onClick={() => changeOrderStatus(order, 'received')}>{t('receive')}</button>}</td></tr>)}
                </tbody></table></div> : <EmptyState>{t('noOrders')}</EmptyState>}
              </section>}
            </div>
          )}

          {page === 'alerts' && (
            <section className="panel table-panel">
              <PanelHeading title={t('alerts')} subtitle={`${alerts.length} ${t('variant').toLocaleLowerCase(language)}`} />
              {alerts.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('variant')}</th><th className="number-cell">{t('quantity')}</th><th className="number-cell">{t('threshold')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead><tbody>{alerts.map((alert) => <tr key={alert.variant_id}><td><div className="product-cell"><span className="product-glyph"><Shirt size={17} /></span><strong>{language === 'ar' ? alert.name_ar : alert.name_fr}</strong></div></td><td><span className="sku-code">{alert.sku}</span></td><td>{alert.size} · {language === 'ar' ? alert.color_ar : alert.color_fr}</td><td className="number-cell"><strong>{alert.quantity}</strong></td><td className="number-cell">{alert.low_stock_threshold}</td><td><StatusBadge status={alert.quantity === 0 ? 'out' : 'low'} label={alert.quantity === 0 ? t('outOfStock') : t('low')} /></td><td>{profile.role !== 'viewer' && <button className="button button-quiet button-small" onClick={() => {
                const product = products.find((item) => item.id === alert.id)
                const variant = product?.variants.find((item) => item.id === alert.variant_id)
                if (product && variant) openNewOrder(product, variant)
              }}>{t('createOrder')}</button>}</td></tr>)}</tbody></table></div> : <EmptyState>{t('noAlerts')}</EmptyState>}
            </section>
          )}

          {page === 'reports' && report && (
            <div className="page-stack">
              <section className="stats-grid report-stats">
                <StatCard icon={<Boxes size={18} />} label={t('inventoryValue')} value={formattedMoney(report.totals.inventory_value)} tone="sage" />
                <StatCard icon={<Package size={18} />} label={t('totalUnits')} value={String(report.totals.unit_count)} tone="sand" />
                <StatCard icon={<Activity size={18} />} label={t('productCount')} value={String(report.totals.product_count)} tone="blue" />
              </section>
              <section className="panel chart-panel report-panel">
                <div className="panel-heading"><div><h2>{t('movementTrend')}</h2><p>{t('reportPeriod')}</p></div><div className="report-actions"><select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="7">7</option><option value="30">30</option><option value="90">90</option><option value="365">365</option></select><button className="button button-outline" onClick={exportInventory}><FileSpreadsheet size={16} />{t('exportExcel')}</button><button className="button button-outline" onClick={() => window.print()}><FileText size={16} />{t('exportPdf')}</button></div></div>
                {report.movement_days.length ? <div className="chart-area report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.movement_days} barGap={4} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line-soft)" /><XAxis dataKey="day" tickFormatter={(value: string) => new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar-TN' : 'fr-TN', { day: 'numeric', month: 'short' })} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={period === '365' ? 30 : period === '90' ? 10 : period === '30' ? 4 : 0} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="incoming" name={t('incoming')} fill="#238a98" radius={[4, 4, 0, 0]} maxBarSize={16} /><Bar dataKey="outgoing" name={t('outgoing')} fill="#d6a49a" radius={[4, 4, 0, 0]} maxBarSize={16} /></BarChart></ResponsiveContainer></div> : <EmptyState>{t('chartEmpty')}</EmptyState>}
              </section>
              <section className="panel table-panel"><PanelHeading title={t('valuation')} subtitle={t('inventoryValue')} action={<button className="button button-quiet" onClick={exportInventory}><Download size={15} />{t('exportExcel')}</button>} />
                {report.products.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('category')}</th><th className="number-cell">{t('quantity')}</th><th className="number-cell">{t('price')}</th><th className="number-cell">{t('inventoryValue')}</th></tr></thead><tbody>{report.products.map((product) => <tr key={product.id}><td><strong>{productName(product, language)}</strong></td><td><span className="sku-code">{product.sku}</span></td><td>{categoryName(product.category, language)}</td><td className="number-cell">{product.quantity} {t('units')}</td><td className="number-cell">{formattedMoney(product.price_tnd)}</td><td className="number-cell"><strong>{formattedMoney(product.value_tnd)}</strong></td></tr>)}</tbody></table></div> : <EmptyState>{t('noReport')}</EmptyState>}
              </section>
            </div>
          )}

          {page === 'team' && team && profile.role === 'admin' && (
            <div className="page-stack">
              <div className="team-grid">
                <section className="panel table-panel"><PanelHeading title={t('team')} subtitle={`${team.users.length} ${t('team').toLocaleLowerCase(language)}`} />
                  {team.users.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('email')}</th><th>{t('role')}</th><th>{t('memberStatus')}</th><th>{t('date')}</th><th>{t('actions')}</th></tr></thead><tbody>{team.users.map((member) => {
                    const isActive = !member.disabled_at
                    return <tr key={member.id}><td>{member.email}{member.id === profile.id && <span className="you-tag">{language === 'ar' ? 'أنت' : 'Vous'}</span>}</td><td><select className="role-select" value={member.role} disabled={member.id === profile.id || !isActive || saving} onChange={(event) => updateRole(member.id, event.target.value as Role)}><option value="admin">{t('admin')}</option><option value="storekeeper">{t('storekeeper')}</option><option value="cashier">{t('cashier')}</option><option value="viewer">{t('viewer')}</option></select></td><td><span className={`status-badge ${isActive ? 'status-inStock' : 'status-outOfStock'}`}>{t(isActive ? 'activeMember' : 'disabledMember')}</span></td><td>{dateLabel(member.created_at, language)}</td><td><div className="table-actions"><button className="button button-quiet button-small" disabled={saving || !isActive} onClick={() => void issuePasswordReset(member.id)}>{t('sendResetLink')}</button>{member.id !== profile.id && <button className={`button button-small ${isActive ? 'button-outline' : 'button-primary'}`} disabled={saving} onClick={() => void setTeamMemberActive(member, !isActive)}>{t(isActive ? 'deactivateMember' : 'reactivateMember')}</button>}</div></td></tr>
                  })}</tbody></table></div> : <EmptyState>{t('noTeam')}</EmptyState>}
                </section>
                <section className="panel invite-panel"><div className="panel-heading"><div><h2>{t('invite')}</h2><p>{t('pendingInvitations')}</p></div><span className="panel-icon"><UsersRound size={18} /></span></div>
                  <div className="table-actions">
                    <button type="button" className={`button button-small ${teamFormMode === 'create' ? 'button-primary' : 'button-outline'}`} aria-pressed={teamFormMode === 'create'} onClick={() => setTeamFormMode('create')}>{t('directCreate')}</button>
                    <button type="button" className={`button button-small ${teamFormMode === 'invite' ? 'button-primary' : 'button-outline'}`} aria-pressed={teamFormMode === 'invite'} onClick={() => setTeamFormMode('invite')}>{t('invitationMode')}</button>
                  </div>
                  {teamFormMode === 'create'
                    ? <form className="form-stack" onSubmit={createTeamMember}>
                      <label>{t('inviteEmail')}<input type="email" required maxLength={254} value={memberDraft.email} onChange={(event) => setMemberDraft({ ...memberDraft, email: event.target.value })} /></label>
                      <label>{t('memberPassword')}<input type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={memberDraft.password} onChange={(event) => setMemberDraft({ ...memberDraft, password: event.target.value })} /></label>
                      <label>{t('confirmPassword')}<input type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={memberDraft.passwordConfirm} onChange={(event) => setMemberDraft({ ...memberDraft, passwordConfirm: event.target.value })} /></label>
                      <label>{t('role')}<select value={memberDraft.role} onChange={(event) => setMemberDraft({ ...memberDraft, role: event.target.value as Role })}><option value="admin">{t('admin')}</option><option value="storekeeper">{t('storekeeper')}</option><option value="cashier">{t('cashier')}</option><option value="viewer">{t('viewer')}</option></select></label>
                      <button className="button button-primary" disabled={saving}><Plus size={16} />{t('createMemberSubmit')}</button>
                    </form>
                    : <form className="form-stack" onSubmit={sendInvitation}>
                      <label>{t('inviteEmail')}<input type="email" required maxLength={254} value={inviteDraft.email} onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} /></label>
                      <label>{t('role')}<select value={inviteDraft.role} onChange={(event) => setInviteDraft({ ...inviteDraft, role: event.target.value as Role })}><option value="storekeeper">{t('storekeeper')}</option><option value="cashier">{t('cashier')}</option><option value="viewer">{t('viewer')}</option></select></label>
                      <button className="button button-primary" disabled={saving}><Plus size={16} />{t('inviteMember')}</button>
                    </form>}
                  <div className="pending-list"><h3>{t('pendingInvitations')}</h3>{team.invitations.length ? team.invitations.map((invite) => <div className="pending-row" key={invite.id}><span>{invite.email}</span><span className="role-pill">{roleName(invite.role, language)}</span></div>) : <p className="muted-copy">—</p>}</div>
                  {teamFormMode === 'invite' && invitationLink && <div className="account-link"><p>{!invitationLink.email_sent && t('emailDeliveryNote')}</p><a href={invitationLink.url} referrerPolicy="no-referrer">{invitationLink.url}</a><button className="button button-outline button-small" onClick={() => void copyAccountLink(invitationLink.url)}>{t('copyLink')}</button></div>}
                </section>
              </div>
              {passwordResetLink && <section className="panel account-link"><p>{!passwordResetLink.email_sent && t('emailDeliveryNote')}</p><a href={passwordResetLink.url} referrerPolicy="no-referrer">{passwordResetLink.url}</a><button className="button button-outline button-small" onClick={() => void copyAccountLink(passwordResetLink.url)}>{t('copyLink')}</button></section>}
              <section className="panel table-panel"><div className="panel-heading"><div><h2><ShieldCheck size={18} />{t('accessMatrix')}</h2><p>{t('role')}</p></div><select className="select-control" value={teamRoleFilter} onChange={(event) => setTeamRoleFilter(event.target.value as Role)}><option value="admin">{t('admin')}</option><option value="storekeeper">{t('storekeeper')}</option><option value="cashier">{t('cashier')}</option><option value="viewer">{t('viewer')}</option></select></div>
                <div className="access-grid">{(['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'team', 'sales'] as Page[]).map((item) => {
                  const Icon = pageIcons[item]
                  const allowed = rolePages[teamRoleFilter].includes(item)
                  return <div className="access-item" key={item}><span><Icon size={16} />{t(item)}</span><span className={`access-indicator ${allowed ? 'allowed' : 'restricted'}`}>{allowed ? <Check size={13} /> : <X size={13} />}{allowed ? t('allowed') : t('restricted')}</span></div>
                })}</div>
              </section>
            </div>
          )}
        </main>
      </div>

      {productDialog && productDraft && <Modal title={productDraft.id ? t('edit') : t('addProduct')} onClose={() => setProductDialog(false)} wide>
        <form className="form-stack" onSubmit={saveProduct}>
          <div className="form-grid"><label>{t('sku')}<input required maxLength={64} value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} /></label><label>{t('selectCategory')}<select value={productDraft.category} onChange={(event) => setProductDraft({ ...productDraft, category: event.target.value as Category })}>{categories.map((category) => <option key={category} value={category}>{categoryName(category, language)}</option>)}</select></label><label>{t('arabicName')}<input required maxLength={180} value={productDraft.name_ar} onChange={(event) => setProductDraft({ ...productDraft, name_ar: event.target.value })} /></label><label>{t('frenchName')}<input required maxLength={180} value={productDraft.name_fr} onChange={(event) => setProductDraft({ ...productDraft, name_fr: event.target.value })} /></label><label>{t('price')} · TND<input type="number" min="0.001" step="0.001" required value={productDraft.price_tnd} onChange={(event) => setProductDraft({ ...productDraft, price_tnd: event.target.value })} /></label><label>{t('threshold')}<input type="number" min="0" step="1" required value={productDraft.low_stock_threshold} onChange={(event) => setProductDraft({ ...productDraft, low_stock_threshold: event.target.value })} /></label></div>
          <div className="variant-editor-heading"><strong>{t('productVariants')}</strong><button className="button button-quiet button-small" type="button" onClick={() => setProductDraft({ ...productDraft, variants: [...productDraft.variants, { size: 'M', color_key: '', color_ar: '', color_fr: '', color_hex: '#789681', low_stock_threshold: '' }] })}><Plus size={15} />{t('addVariant')}</button></div>
          <div className="variant-editor">{productDraft.variants.map((variant, index) => <div className="variant-form-row" key={`${variant.id ?? 'new'}-${index}`}><select aria-label={t('size')} value={variant.size} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, size: event.target.value as Size } : item) })}>{sizes.map((size) => <option key={size} value={size}>{size === 'ONE_SIZE' ? (language === 'ar' ? 'مقاس واحد' : 'Taille unique') : size}</option>)}</select><input required aria-label="Color key" placeholder="color-key" value={variant.color_key} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_key: event.target.value } : item) })} /><input required aria-label={language === 'ar' ? 'اسم اللون بالعربية' : 'Nom couleur arabe'} placeholder={language === 'ar' ? 'أسود' : 'Noir (arabe)'} value={variant.color_ar} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_ar: event.target.value } : item) })} /><input required aria-label={language === 'ar' ? 'اسم اللون بالفرنسية' : 'Nom couleur français'} placeholder="Noir" value={variant.color_fr} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_fr: event.target.value } : item) })} /><input type="color" aria-label={t('color')} value={variant.color_hex} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_hex: event.target.value } : item) })} /><input type="number" min="0" step="1" aria-label={`${t('variantThreshold')} ${variant.size} ${variant.color_key}`} placeholder={productDraft.low_stock_threshold} value={variant.low_stock_threshold} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, low_stock_threshold: event.target.value } : item) })} />{variant.id && <span className="variant-quantity">{variant.quantity} {t('units')}</span>}<button type="button" className="icon-button danger-action" aria-label={t('archive')} disabled={productDraft.variants.length === 1} onClick={() => setProductDraft({ ...productDraft, variants: productDraft.variants.filter((_, row) => row !== index) })}><X size={15} /></button></div>)}</div>
          <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setProductDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('save')}</button></div>
        </form>
      </Modal>}
      {selectedProduct && <Modal title={`${t('viewProduct')} · ${productName(selectedProduct, language)}`} onClose={() => setSelectedProduct(null)} wide>
        <div className="product-detail">
          <section className="product-detail-summary">
            <img className="product-detail-image" src={productPhotos[selectedProduct.category]} alt={productName(selectedProduct, language)} />
            <div className="product-detail-heading">
              <span className="sku-code">{selectedProduct.sku}</span>
              <h3>{productName(selectedProduct, language)}</h3>
              <StatusBadge status={statusFor(selectedProduct)} label={t(statusFor(selectedProduct) as keyof typeof copy.ar)} />
            </div>
          </section>
          <section className="product-detail-facts" aria-label={t('productDetails')}>
            <div><span>{t('category')}</span><strong>{categoryName(selectedProduct.category, language)}</strong></div>
            <div><span>{t('price')}</span><strong>{formattedMoney(selectedProduct.price_tnd)}</strong></div>
            <div><span>{t('totalUnits')}</span><strong>{selectedProduct.quantity} {t('units')}</strong></div>
            <div><span>{t('threshold')}</span><strong>{selectedProduct.low_stock_threshold} {t('units')}</strong></div>
          </section>
          <section className="product-detail-variants">
            <h3>{t('stockByVariant')}</h3>
            <div className="table-scroll"><table className="data-table">
              <thead><tr><th>{t('variant')}</th><th className="number-cell">{t('quantity')}</th><th className="number-cell">{t('threshold')}</th><th>{t('status')}</th></tr></thead>
              <tbody>{selectedProduct.variants.map((variant) => {
                const threshold = variant.low_stock_threshold ?? selectedProduct.low_stock_threshold
                const variantStatus = variant.quantity === 0 ? 'outOfStock' : variant.quantity <= threshold ? 'low' : 'inStock'
                return <tr key={variant.id}>
                  <td><span className="product-variant-color"><i style={{ backgroundColor: variant.color_hex }} />{variantLabel(variant, language)}</span></td>
                  <td className="number-cell"><strong>{variant.quantity}</strong> {t('units')}</td>
                  <td className="number-cell">{threshold} {t('units')}</td>
                  <td><StatusBadge status={variantStatus} label={t(variantStatus)} /></td>
                </tr>
              })}</tbody>
            </table></div>
          </section>
          <div className="modal-actions product-detail-actions">
            {canManageStock && <>
              <button className="button button-outline" onClick={() => { const product = selectedProduct; setSelectedProduct(null); beginEditProduct(product) }}><FileText size={15} />{t('edit')}</button>
              <button className="button button-outline" onClick={() => { const product = selectedProduct; setSelectedProduct(null); openMovement(product) }}><ArrowLeftRight size={15} />{t('newMovement')}</button>
              {profile.allowed_pages.includes('suppliers') && <button className="button button-primary" onClick={() => { const product = selectedProduct; setSelectedProduct(null); openNewOrder(product) }}><Truck size={15} />{t('createOrder')}</button>}
            </>}
            <button className="button button-quiet" onClick={() => setSelectedProduct(null)}>{t('close')}</button>
          </div>
        </div>
      </Modal>}

      {movementDialog && <Modal title={t('newMovement')} onClose={() => setMovementDialog(false)}>
        <form className="form-stack" onSubmit={saveMovement}>
          <label>{t('variant')}<select required value={movementDraft.variant_id} onChange={(event) => setMovementDraft({ ...movementDraft, variant_id: event.target.value })}><option value="">{t('chooseVariant')}</option>{products.map((product) => <optgroup key={product.id} label={`${product.sku} · ${productName(product, language)}`}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant, language)} · {variant.quantity} {t('units')}</option>)}</optgroup>)}</select></label>
          <label>{t('type')}<select value={movementDraft.type} onChange={(event) => setMovementDraft({ ...movementDraft, type: event.target.value as MovementType })}><option value="IN">{t('in')}</option><option value="OUT">{t('out')}</option><option value="ADJUSTMENT">{t('adjustment')}</option></select></label>
          {movementDraft.type === 'ADJUSTMENT' && <label>{t('direction')}<select value={movementDraft.adjustment_sign} onChange={(event) => setMovementDraft({ ...movementDraft, adjustment_sign: Number(event.target.value) as -1 | 1 })}><option value={1}>{t('increase')}</option><option value={-1}>{t('decrease')}</option></select></label>}
          <label>{t('quantity')}<input type="number" min="1" step="1" required value={movementDraft.quantity} onChange={(event) => setMovementDraft({ ...movementDraft, quantity: event.target.value })} /></label>
          <label>{t('movementNote')}<textarea maxLength={500} rows={3} value={movementDraft.note} onChange={(event) => setMovementDraft({ ...movementDraft, note: event.target.value })} /></label>
          <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setMovementDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('create')}</button></div>
        </form>
      </Modal>}

      {customerDialog && <Modal title={t('newCustomer')} onClose={() => setCustomerDialog(false)}>
        <form className="form-stack" onSubmit={saveCustomer}>
          <label>{t('customerName')}<input required maxLength={160} value={customerDraft.name} onChange={(event) => setCustomerDraft({ ...customerDraft, name: event.target.value })} /></label>
          <label>{t('phone')}<input maxLength={40} value={customerDraft.phone} onChange={(event) => setCustomerDraft({ ...customerDraft, phone: event.target.value })} /></label>
          <label>{t('email')}<input type="email" maxLength={254} value={customerDraft.email} onChange={(event) => setCustomerDraft({ ...customerDraft, email: event.target.value })} /></label>
          <label>{t('address')}<input maxLength={500} value={customerDraft.address} onChange={(event) => setCustomerDraft({ ...customerDraft, address: event.target.value })} /></label>
          <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setCustomerDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('saveCustomer')}</button></div>
        </form>
      </Modal>}

      {selectedInvoice && <Modal
        title={`${t('invoice')} INV-${String(selectedInvoice.invoice_number).padStart(6, '0')}`}
        onClose={() => setSelectedInvoice(null)}
        wide
        className="invoice-dialog"
      >
        <div className="invoice-print">
          <div className="invoice-heading"><h2>{profile.store.name}</h2><strong>INV-{String(selectedInvoice.invoice_number).padStart(6, '0')}</strong></div>
          <p>{t('date')}: {dateLabel(selectedInvoice.created_at, language, true)}</p>
          <p>{t('customers')}: {selectedInvoice.customer_name ?? t('walkInCustomer')}{selectedInvoice.customer_phone ? ` · ${selectedInvoice.customer_phone}` : ''}</p>
          <p>{t('user')}: {selectedInvoice.cashier_email}</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('variant')}</th><th>{t('quantity')}</th><th className="number-cell">{t('price')}</th><th className="number-cell">{t('total')}</th></tr></thead><tbody>
            {selectedInvoice.lines.map((line) => <tr key={line.id}><td>{language === 'ar' ? line.name_ar : line.name_fr}<small>{line.sku}</small></td><td>{line.size} · {language === 'ar' ? line.color_ar : line.color_fr}</td><td>{line.quantity}</td><td className="number-cell">{formattedMoney(line.unit_price_tnd)}</td><td className="number-cell">{formattedMoney(line.line_total_tnd)}</td></tr>)}
          </tbody></table></div>
          <div className="invoice-totals"><p>{t('subtotal')}: <strong>{formattedMoney(selectedInvoice.subtotal_tnd)}</strong></p><p>{t('discount')}: <strong>{formattedMoney(selectedInvoice.discount_tnd)}</strong></p><p>{t('total')}: <strong>{formattedMoney(selectedInvoice.total_tnd)}</strong></p><p>{t('paymentMethod')}: <strong>{t(selectedInvoice.payment_method)}</strong></p></div>
        </div>
        <div className="modal-actions invoice-print-actions"><button className="button button-primary" onClick={() => window.print()}><FileText size={15} />{t('exportPdf')}</button><button className="button button-quiet" onClick={() => setSelectedInvoice(null)}>{t('close')}</button></div>
      </Modal>}

      {supplierDialog && <Modal title={t('addSupplier')} onClose={() => setSupplierDialog(false)}>
        <form className="form-stack" onSubmit={saveSupplier}><label>{t('supplier')}<input required maxLength={160} value={supplierDraft.name} onChange={(event) => setSupplierDraft({ ...supplierDraft, name: event.target.value })} /></label><label>{t('phone')}<input maxLength={40} value={supplierDraft.phone} onChange={(event) => setSupplierDraft({ ...supplierDraft, phone: event.target.value })} /></label><label>{t('city')}<input maxLength={100} value={supplierDraft.city} onChange={(event) => setSupplierDraft({ ...supplierDraft, city: event.target.value })} /></label><label>{t('email')}<input type="email" value={supplierDraft.email} onChange={(event) => setSupplierDraft({ ...supplierDraft, email: event.target.value })} /></label><label>{t('notes')}<textarea rows={2} value={supplierDraft.notes} onChange={(event) => setSupplierDraft({ ...supplierDraft, notes: event.target.value })} /></label><div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setSupplierDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('save')}</button></div></form>
      </Modal>}

      {orderDialog && <Modal title={orderEditingId ? t('editOrder') : t('createPurchaseOrder')} onClose={() => { setOrderDialog(false); setOrderEditingId(null) }} wide>
        <form className="form-stack" onSubmit={saveOrder}>
          <label>{t('supplier')}<select required value={orderSupplier} onChange={(event) => setOrderSupplier(event.target.value)}><option value="">{t('selectSupplier')}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <div className="variant-editor-heading"><strong>{t('lines')}</strong><button type="button" className="button button-quiet button-small" onClick={() => setOrderLines([...orderLines, { variant_id: variantOptions[0]?.id ?? '', quantity: '1', unit_cost_tnd: String(variantOptions[0]?.price_tnd ?? '') }])}><Plus size={15} />{t('addLine')}</button></div>
          <div className="order-draft-lines">{orderLines.map((line, index) => <div className="order-draft-row" key={index}><select required value={line.variant_id} onChange={(event) => {
            const selected = variantOptions.find((variant) => variant.id === event.target.value)
            setOrderLines(orderLines.map((item, row) => row === index ? { ...item, variant_id: event.target.value, unit_cost_tnd: selected ? String((selected.price_tnd * 0.65).toFixed(3)) : item.unit_cost_tnd } : item))
          }}><option value="">{t('selectProduct')}</option>{products.map((product) => <optgroup key={product.id} label={`${product.sku} · ${productName(product, language)}`}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant, language)}</option>)}</optgroup>)}</select><input aria-label={t('quantity')} type="number" min="1" step="1" required placeholder={t('quantity')} value={line.quantity} onChange={(event) => setOrderLines(orderLines.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /><input aria-label={t('unitCost')} type="number" min="0.001" step="0.001" required placeholder={t('unitCost')} value={line.unit_cost_tnd} onChange={(event) => setOrderLines(orderLines.map((item, row) => row === index ? { ...item, unit_cost_tnd: event.target.value } : item))} /><button type="button" className="icon-button danger-action" disabled={orderLines.length === 1} onClick={() => setOrderLines(orderLines.filter((_, row) => row !== index))} aria-label={t('cancel')}><X size={15} /></button></div>)}</div>
          <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => { setOrderDialog(false); setOrderEditingId(null) }}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{orderEditingId ? t('save') : t('create')}</button></div>
        </form>
      </Modal>}

      {importDialog && <Modal title={t('importCsv')} onClose={() => setImportDialog(false)} wide>
        <div className="import-content"><p>{t('importHelp')}</p><label className="file-drop"><FileSpreadsheet size={24} /><strong>{t('uploadCsv')}</strong><span>CSV · 2 MB max</span><input type="file" accept=".csv,text/csv" onChange={(event) => previewCsv(event.target.files?.[0])} /></label>
          {importError && <div className="inline-alert"><AlertTriangle size={16} />{importError}</div>}
          {importPreview && <div className="preview-summary"><h3>{t('importSummary')}</h3><div className="summary-chips"><span>{importPreview.product_count} {t('products').toLowerCase()}</span><span>{importPreview.variant_count} {t('rows')}</span><span>{importPreview.opening_units} {t('openingUnits')}</span></div>{importPreview.issues.length > 0 && <ul className="issue-list">{importPreview.issues.slice(0, 12).map((issue, index) => <li key={`${issue.row}-${index}`}>{issue.row}: {issue.message}</li>)}</ul>}</div>}
          <div className="modal-actions"><button className="button button-outline" onClick={() => setImportDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={!importPreview || importPreview.issues.length > 0 || !importPreview.rows.length || saving} onClick={commitCsv}>{t('commitImport')}</button></div>
        </div>
      </Modal>}
    </div>
  )
}

function StatCard({ icon, label, value, meta, tone }: {
  icon: ReactNode
  label: string
  value: string
  meta?: string
  tone: 'sand' | 'sage' | 'rose' | 'blue'
}) {
  return <article className={`stat-card tone-${tone}`}><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><strong className="stat-value">{value}</strong>{meta && <span className="stat-meta">{meta}</span>}</article>
}

function PanelHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`status-badge status-${status}`}>{label}</span>
}

function OrderBadge({ status, language }: { status: PurchaseOrder['status']; language: Language }) {
  const values: Record<PurchaseOrder['status'], { ar: string; fr: string }> = {
    draft: { ar: 'مسودة', fr: 'Brouillon' },
    sent: { ar: 'مرسل', fr: 'Envoyée' },
    received: { ar: 'مستلم', fr: 'Reçue' },
  }
  return <span className={`order-badge order-${status}`}>{values[status][language]}</span>
}

function MovementBadge({ type, sign, language }: { type: MovementType; sign: -1 | 1 | null; language: Language }) {
  const incoming = type === 'IN' || (type === 'ADJUSTMENT' && sign === 1)
  const outgoing = type === 'OUT' || (type === 'ADJUSTMENT' && sign === -1)
  const label = type === 'ADJUSTMENT'
    ? (language === 'ar' ? 'تسوية' : 'Ajustement')
    : type === 'IN'
      ? (language === 'ar' ? 'وارد' : 'Entrée')
      : (language === 'ar' ? 'صادر' : 'Sortie')
  const Icon = incoming ? ArrowDownLeft : outgoing ? ArrowUpRight : ArrowLeftRight
  return <span className={`movement-badge ${incoming ? 'movement-in' : outgoing ? 'movement-out' : ''}`}><Icon size={13} />{label}</span>
}

function ProductTable({ products, language, t, statusFor, formattedMoney, empty, actions, onView }: {
  products: Product[]
  language: Language
  t: (key: keyof typeof copy.ar) => string
  statusFor: (product: Product) => string
  formattedMoney: (value: number | string) => string
  empty: string
  actions?: (product: Product) => ReactNode
  onView: (product: Product) => void
}) {
  return products.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('category')}</th><th className="number-cell">{t('price')}</th><th className="number-cell">{t('quantity')}</th><th>{t('status')}</th>{actions && <th>{t('actions')}</th>}</tr></thead><tbody>{products.map((product) => {
    const status = statusFor(product)
    return <tr key={product.id}><td><button type="button" className="product-cell product-cell-button" aria-label={`${t('viewProduct')}: ${productName(product, language)}`} onClick={() => onView(product)}><img className="product-image" src={productPhotos[product.category]} alt={productName(product, language)} loading="lazy" decoding="async" /><span><strong>{productName(product, language)}</strong><small>{product.variants.length} · {language === 'ar' ? 'متغيرات' : 'variantes'}</small></span><Eye className="product-view-icon" size={15} /></button></td><td><span className="sku-code">{product.sku}</span></td><td>{categoryName(product.category, language)}</td><td className="number-cell">{formattedMoney(product.price_tnd)}</td><td className="number-cell"><strong>{product.quantity}</strong> <span className="muted-copy">{t('units')}</span></td><td><StatusBadge status={status} label={t(status as keyof typeof copy.ar)} /></td>{actions && <td>{actions(product)}</td>}</tr>
  })}</tbody></table></div> : <EmptyState>{empty}</EmptyState>
}
