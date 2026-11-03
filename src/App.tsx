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
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
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

type Language = 'ar' | 'fr'
type Page = 'dashboard' | 'products' | 'movements' | 'suppliers' | 'alerts' | 'reports' | 'team'
type Role = 'admin' | 'storekeeper' | 'viewer'
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
  quantity: number
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
  admin: ['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'team'],
  storekeeper: ['dashboard', 'products', 'movements', 'suppliers', 'alerts'],
  viewer: ['dashboard', 'products', 'alerts', 'reports'],
}

const copy = {
  ar: {
    dashboard: 'لوحة التحكم', products: 'المنتجات', movements: 'حركات المخزون', suppliers: 'الموردون والطلبات',
    alerts: 'التنبيهات', reports: 'التقارير', team: 'المستخدمون والصلاحيات', overview: 'نظرة عامة',
    search: 'ابحث عن منتج أو رمز...', addProduct: 'إضافة منتج', newMovement: 'حركة جديدة', newOrder: 'طلب شراء جديد',
    addSupplier: 'إضافة مورد', inventory: 'المخزون', productCount: 'عدد المنتجات', inventoryValue: 'قيمة المخزون',
    lowStock: 'مخزون منخفض', todayMovements: 'حركات اليوم', units: 'قطعة', movementTrend: 'حركة المخزون',
    last30: 'آخر 30 يوماً', incoming: 'وارد', outgoing: 'صادر', valueByCategory: 'قيمة المخزون حسب الفئة',
    lowProducts: 'منتجات قاربت على النفاد', viewAll: 'عرض الكل', sku: 'رمز المنتج', product: 'المنتج',
    category: 'الفئة', price: 'السعر', quantity: 'الكمية', status: 'الحالة', actions: 'إجراءات',
    size: 'المقاس', color: 'اللون', threshold: 'حد التنبيه', variant: 'القياس واللون', filter: 'تصفية',
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
    role: 'الدور', admin: 'مدير', storekeeper: 'أمين مخزن', viewer: 'مشاهد', invite: 'دعوة مستخدم',
    inviteMember: 'إرسال دعوة', accessMatrix: 'صلاحيات الأدوار', page: 'الصفحة', allowed: 'مسموح', restricted: 'غير مسموح',
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
    generated: 'بيانات مباشرة من قاعدة البيانات', inviteEmail: 'بريد المستخدم', allSizes: 'كل المقاسات', allColors: 'كل الألوان',
    selectSupplier: 'اختر المورد', choose: 'اختر', fileIssues: 'أصلح أخطاء الملف قبل المتابعة.', stockHistoryNote: 'الكمية محسوبة من سجل الحركات.',
    chartEmpty: 'تظهر الرسوم بعد تسجيل حركات المخزون.', waitingAuth: 'جارٍ التحقق من الحساب...',
    authEmail: 'البريد الإلكتروني', authPassword: 'كلمة المرور', newPassword: 'كلمة مرور جديدة',
    confirmPassword: 'تأكيد كلمة المرور', forgotPassword: 'نسيت كلمة المرور؟', resetPassword: 'إعادة تعيين كلمة المرور',
    acceptInvite: 'قبول الدعوة', invitedEmail: 'البريد الإلكتروني المدعو', backToSignIn: 'العودة لتسجيل الدخول',
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
  },
  fr: {
    dashboard: 'Tableau de bord', products: 'Produits', movements: 'Mouvements', suppliers: 'Fournisseurs et commandes',
    alerts: 'Alertes', reports: 'Rapports', team: 'Utilisateurs et rôles', overview: 'Vue d’ensemble',
    search: 'Rechercher un produit ou SKU…', addProduct: 'Ajouter un produit', newMovement: 'Nouveau mouvement', newOrder: 'Nouvelle commande',
    addSupplier: 'Ajouter un fournisseur', inventory: 'Stock', productCount: 'Produits', inventoryValue: 'Valeur du stock',
    lowStock: 'Stock faible', todayMovements: 'Mouvements du jour', units: 'unités', movementTrend: 'Mouvements de stock',
    last30: '30 derniers jours', incoming: 'Entrées', outgoing: 'Sorties', valueByCategory: 'Valeur par catégorie',
    lowProducts: 'Produits à réapprovisionner', viewAll: 'Tout voir', sku: 'SKU', product: 'Produit',
    category: 'Catégorie', price: 'Prix', quantity: 'Quantité', status: 'Statut', actions: 'Actions',
    size: 'Taille', color: 'Couleur', threshold: 'Seuil d’alerte', variant: 'Taille et couleur', filter: 'Filtrer',
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
    role: 'Rôle', admin: 'Administrateur', storekeeper: 'Magasinier', viewer: 'Lecteur', invite: 'Inviter un membre',
    inviteMember: 'Envoyer l’invitation', accessMatrix: 'Accès par rôle', page: 'Page', allowed: 'Autorisé', restricted: 'Refusé',
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
    generated: 'Données en direct depuis la base', inviteEmail: 'E-mail du membre', allSizes: 'Toutes les tailles', allColors: 'Toutes les couleurs',
    selectSupplier: 'Choisir un fournisseur', choose: 'Choisir', fileIssues: 'Corrigez les erreurs du fichier avant de continuer.', stockHistoryNote: 'Quantité calculée depuis les mouvements.',
    chartEmpty: 'Les graphiques apparaissent après les premiers mouvements.', waitingAuth: 'Vérification du compte…',
    authEmail: 'E-mail', authPassword: 'Mot de passe', newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le mot de passe', forgotPassword: 'Mot de passe oublié ?', resetPassword: 'Réinitialiser le mot de passe',
    acceptInvite: 'Accepter l’invitation', invitedEmail: 'E-mail invité', backToSignIn: 'Retour à la connexion',
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

function Modal({ title, children, onClose, wide = false }: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
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

export default function App() {
  const [language, setLanguage] = useState<Language>('ar')
  const [darkMode, setDarkMode] = useState(false)
  const t = useCallback((key: keyof typeof copy.ar) => copy[language][key], [language])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

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
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [alerts, setAlerts] = useState<Product[]>([])
  const [team, setTeam] = useState<TeamData | null>(null)
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [loading, setLoading] = useState(true)
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
  const [productDialog, setProductDialog] = useState(false)
  const [movementDialog, setMovementDialog] = useState(false)
  const [supplierDialog, setSupplierDialog] = useState(false)
  const [orderDialog, setOrderDialog] = useState(false)
  const [importDialog, setImportDialog] = useState(false)
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null)
  const [movementDraft, setMovementDraft] = useState({ variant_id: '', type: 'IN' as MovementType, quantity: '1', adjustment_sign: 1 as -1 | 1, note: '' })
  const [supplierDraft, setSupplierDraft] = useState({ name: '', phone: '', city: '', email: '', notes: '' })
  const [orderSupplier, setOrderSupplier] = useState('')
  const [orderLines, setOrderLines] = useState<Array<{ variant_id: string; quantity: string; unit_cost_tnd: string }>>([])
  const [inviteDraft, setInviteDraft] = useState({ email: '', role: 'storekeeper' as Role })
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
      nextMovements,
      nextSupplierData,
      nextOrders,
      nextReport,
      nextTeam,
    ] = await Promise.all([
      api<DashboardData>('/dashboard'),
      api<Product[]>('/products'),
      api<Product[]>('/alerts'),
      allowed.has('movements') ? api<Movement[]>('/movements?days=90') : Promise.resolve([]),
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
    ])
    return {
      profile: nextProfile,
      dashboard: nextDashboard,
      products: nextProducts,
      alerts: nextAlerts,
      movements: nextMovements,
      suppliers: nextSupplierData,
      orders: nextOrders,
      report: nextReport,
      team: nextTeam,
    }
  }, [api, period])

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof fetchSnapshot>>) => {
    setProfile(snapshot.profile)
    setDashboard(snapshot.dashboard)
    setProducts(snapshot.products)
    setAlerts(snapshot.alerts)
    setMovements(snapshot.movements)
    setSuppliers(snapshot.suppliers)
    setOrders(snapshot.orders)
    setReport(snapshot.report)
    setTeam(snapshot.team)
    setPage((current) => snapshot.profile.allowed_pages.includes(current) ? current : 'dashboard')
  }, [])

  const refresh = useCallback(async () => {
    applySnapshot(await fetchSnapshot())
  }, [applySnapshot, fetchSnapshot])

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
        && (!lowOnly || product.quantity <= product.low_stock_threshold)
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
      variants: [{ size: 'M', color_key: 'noir', color_ar: 'أسود', color_fr: 'Noir', color_hex: '#292D32' }],
    })
    setProductDialog(true)
  }

  function beginEditProduct(product: Product) {
    setProductDraft({
      id: product.id,
      sku: product.sku,
      name_ar: product.name_ar,
      name_fr: product.name_fr,
      category: product.category,
      price_tnd: String(product.price_tnd),
      low_stock_threshold: String(product.low_stock_threshold),
      variants: product.variants.map((variant) => ({ ...variant })),
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
      variants: draft.variants.map(({ size, color_key, color_ar, color_fr, color_hex }) => ({
        size, color_key, color_ar, color_fr, color_hex,
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

  function openNewOrder(product?: Product) {
    if (!suppliers.length) {
      setPage('suppliers')
      setSupplierTab('suppliers')
      showNotice(t('noSuppliers'))
      return
    }
    setOrderSupplier(suppliers[0].id)
    const initialVariant = product?.variants[0]
    setOrderLines([{
      variant_id: initialVariant?.id ?? products[0]?.variants[0]?.id ?? '',
      quantity: product ? String(Math.max(1, product.low_stock_threshold * 2 - product.quantity)) : '1',
      unit_cost_tnd: product ? String(Number(product.price_tnd) * 0.65) : products[0] ? String(Number(products[0].price_tnd) * 0.65) : '1',
    }])
    setOrderDialog(true)
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await runAction(() => api('/purchase-orders', {
      method: 'POST',
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
    }
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
    return <main className="loading-screen" dir={direction}><div className="loading-brand"><span className="brand-mark"><Shirt size={21} /></span><strong>NovaStore</strong><p>{t('loading')}</p></div></main>
  }

  if (!isSignedIn) {
    return (
      <main className="auth-screen" dir={direction}>
        <section className="auth-copy">
          <span className="brand-mark"><Shirt size={22} /></span>
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
    return <main className="loading-screen" dir={direction}><div className="loading-brand"><span className="brand-mark"><Shirt size={21} /></span><strong>NovaStore</strong><p>{t('loading')}</p></div></main>
  }

  const formattedMoney = (value: number | string) => money(value, language)
  const movementDays = dashboard.movement_days.map((day) => ({
    ...day,
    label: new Intl.DateTimeFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', { day: 'numeric', month: 'short' }).format(new Date(`${String(day.day).slice(0, 10)}T12:00:00`)),
  }))
  const categoryData = dashboard.category_values.map((item, index) => ({
    name: categoryName(item.category, language),
    value: Number(item.value),
    color: ['#52715d', '#a97d68', '#8b9b81', '#b69b6b', '#748b9a', '#9c8293'][index % 6],
  }))
  const statusFor = (product: Product) => product.quantity === 0 ? 'outOfStock' : product.quantity <= product.low_stock_threshold ? 'low' : 'inStock'
  const statusLabel = (product: Product) => t(statusFor(product))
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

  return (
    <div className={`app-shell ${darkMode ? 'theme-dark' : ''}`} dir={direction}>
      {mobileNav && <button className="mobile-scrim" aria-label={t('close')} onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><span className="brand-mark"><Shirt size={21} /></span><span className="brand-copy"><strong>NOVA<span>STORE</span></strong><small>STOCK MANAGEMENT</small></span><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label={t('close')}><X size={18} /></button></div>
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
              {page === 'dashboard' && profile.role !== 'viewer' && <button className="button button-primary" onClick={() => openMovement()}><Plus size={16} />{t('newMovement')}</button>}
              {page === 'products' && profile.role !== 'viewer' && <>
                {profile.role === 'admin' && <button className="button button-quiet" onClick={() => setImportDialog(true)}><Download size={16} />{t('importCsv')}</button>}
                <button className="button button-primary" onClick={beginAddProduct}><Plus size={16} />{t('addProduct')}</button>
              </>}
              {page === 'movements' && profile.role !== 'viewer' && <button className="button button-primary" onClick={() => openMovement()}><Plus size={16} />{t('newMovement')}</button>}
              {page === 'suppliers' && profile.role !== 'viewer' && <button className="button button-primary" onClick={() => supplierTab === 'orders' ? openNewOrder() : setSupplierDialog(true)}><Plus size={16} />{supplierTab === 'orders' ? t('newOrder') : t('addSupplier')}</button>}
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
                  {movementDays.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={movementDays} barGap={5} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line-soft)" /><XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={4} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} /><Bar dataKey="incoming" name={t('incoming')} fill="#789681" radius={[4, 4, 0, 0]} maxBarSize={12} /><Bar dataKey="outgoing" name={t('outgoing')} fill="#d6a49a" radius={[4, 4, 0, 0]} maxBarSize={12} /></BarChart></ResponsiveContainer></div> : <EmptyState>{t('chartEmpty')}</EmptyState>}
                </article>
                <article className="panel category-panel">
                  <div className="panel-heading"><div><h2>{t('valueByCategory')}</h2><p>{t('inventoryValue')}</p></div></div>
                  {categoryData.some((item) => item.value > 0) ? <><div className="donut-area"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData.filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius={66} outerRadius={94} paddingAngle={3} stroke="none">{categoryData.filter((item) => item.value > 0).map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formattedMoney(Number(value))} /></PieChart></ResponsiveContainer></div><div className="category-legend">{categoryData.filter((item) => item.value > 0).map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}<strong>{formattedMoney(item.value)}</strong></span>)}</div></> : <EmptyState>{t('chartEmpty')}</EmptyState>}
                </article>
              </section>
              <section className="panel table-panel">
                <PanelHeading title={t('lowProducts')} subtitle={`${dashboard.low_products.length} ${t('products').toLocaleLowerCase(language)}`} action={<button className="button button-quiet" onClick={() => goTo('alerts')}>{t('viewAll')}<ArrowUpRight size={15} /></button>} />
                <ProductTable products={dashboard.low_products.slice(0, 5)} language={language} t={t} statusFor={statusFor} formattedMoney={formattedMoney} empty={t('noAlerts')} />
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
              <ProductTable products={localizedProducts} language={language} t={t} statusFor={statusFor} formattedMoney={formattedMoney} empty={t('noProducts')} actions={profile.role !== 'viewer' ? (product) => <div className="table-actions"><button className="icon-button" aria-label={t('edit')} onClick={() => beginEditProduct(product)}><FileText size={16} /></button>{profile.role === 'admin' && <button className="icon-button danger-action" aria-label={t('archive')} onClick={() => archiveProduct(product)}><X size={16} /></button>}</div> : undefined} />
              <div className="table-footnote"><span>{localizedProducts.length} / {products.length} {t('products').toLocaleLowerCase(language)}</span><span>{t('stockHistoryNote')}</span></div>
            </section>
          )}

          {page === 'movements' && (
            <section className="panel table-panel">
              <PanelHeading title={t('movements')} subtitle={`${movements.length} · ${t('last30')}`} />
              {movements.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('date')}</th><th>{t('product')}</th><th>{t('variant')}</th><th>{t('type')}</th><th className="number-cell">{t('quantity')}</th><th>{t('user')}</th><th>{t('note')}</th></tr></thead><tbody>
                {movements.map((movement) => <tr key={movement.id}><td>{dateLabel(movement.created_at, language, true)}</td><td><div className="product-cell"><span className="product-glyph"><Shirt size={17} /></span><span><strong>{language === 'ar' ? movement.name_ar : movement.name_fr}</strong><small>{movement.sku}</small></span></div></td><td>{movement.size} · {language === 'ar' ? movement.color_ar : movement.color_fr}</td><td><MovementBadge type={movement.type} sign={movement.adjustment_sign} language={language} /></td><td className="number-cell"><strong>{movement.type === 'OUT' || (movement.type === 'ADJUSTMENT' && movement.adjustment_sign === -1) ? '−' : '+'}{movement.quantity}</strong></td><td>{movement.created_by_email}</td><td>{movement.note || '—'}</td></tr>)}
              </tbody></table></div> : <EmptyState>{t('noMovements')}</EmptyState>}
            </section>
          )}

          {page === 'suppliers' && (
            <div className="page-stack">
              <div className="tabs"><button className={supplierTab === 'suppliers' ? 'active' : ''} onClick={() => setSupplierTab('suppliers')}>{t('suppliersList')} <span>{suppliers.length}</span></button><button className={supplierTab === 'orders' ? 'active' : ''} onClick={() => setSupplierTab('orders')}>{t('orders')} <span>{orders.length}</span></button></div>
              {supplierTab === 'suppliers' ? <section className="panel table-panel">
                {suppliers.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('supplier')}</th><th>{t('phone')}</th><th>{t('city')}</th><th>{t('email')}</th><th>{t('orders')}</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><div className="product-cell"><span className="supplier-avatar">{supplier.name.slice(0, 1)}</span><strong>{supplier.name}</strong></div></td><td>{supplier.phone || '—'}</td><td>{supplier.city || '—'}</td><td>{supplier.email || '—'}</td><td>{supplier.order_count}</td></tr>)}</tbody></table></div> : <EmptyState>{t('noSuppliers')}</EmptyState>}
              </section> : <section className="panel table-panel">
                {orders.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('orderNumber')}</th><th>{t('supplier')}</th><th>{t('date')}</th><th>{t('lines')}</th><th className="number-cell">{t('total')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead><tbody>
                  {orders.map((order) => <tr key={order.id}><td><strong>PO-{String(order.order_number).padStart(4, '0')}</strong></td><td>{order.supplier_name}</td><td>{dateLabel(order.created_at, language)}</td><td><div className="order-line-list">{order.lines.map((line) => <span key={line.id}>{language === 'ar' ? line.name_ar : line.name_fr} · {line.size} × {line.quantity}</span>)}</div></td><td className="number-cell">{formattedMoney(order.total_tnd)}</td><td><OrderBadge status={order.status} language={language} /></td><td>{profile.role !== 'viewer' && order.status !== 'received' && <button className="button button-quiet button-small" disabled={saving} onClick={() => changeOrderStatus(order, order.status === 'draft' ? 'sent' : 'received')}>{order.status === 'draft' ? t('send') : t('receive')}</button>}</td></tr>)}
                </tbody></table></div> : <EmptyState>{t('noOrders')}</EmptyState>}
              </section>}
            </div>
          )}

          {page === 'alerts' && (
            <section className="panel table-panel">
              <PanelHeading title={t('alerts')} subtitle={`${alerts.length} ${t('products').toLocaleLowerCase(language)}`} />
              {alerts.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('category')}</th><th className="number-cell">{t('quantity')}</th><th className="number-cell">{t('threshold')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead><tbody>{alerts.map((product) => <tr key={product.id}><td><div className="product-cell"><span className="product-glyph"><Shirt size={17} /></span><strong>{productName(product, language)}</strong></div></td><td><span className="sku-code">{product.sku}</span></td><td>{categoryName(product.category, language)}</td><td className="number-cell"><strong>{product.quantity}</strong></td><td className="number-cell">{product.low_stock_threshold}</td><td><StatusBadge status={statusFor(product)} label={statusLabel(product)} /></td><td>{profile.role !== 'viewer' && <button className="button button-quiet button-small" onClick={() => openNewOrder(product)}>{t('createOrder')}</button>}</td></tr>)}</tbody></table></div> : <EmptyState>{t('noAlerts')}</EmptyState>}
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
                {report.movement_days.length ? <div className="chart-area report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.movement_days} barGap={4} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line-soft)" /><XAxis dataKey="day" tickFormatter={(value: string) => new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar-TN' : 'fr-TN', { day: 'numeric', month: 'short' })} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={period === '365' ? 30 : period === '90' ? 10 : period === '30' ? 4 : 0} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="incoming" name={t('incoming')} fill="#789681" radius={[4, 4, 0, 0]} maxBarSize={16} /><Bar dataKey="outgoing" name={t('outgoing')} fill="#d6a49a" radius={[4, 4, 0, 0]} maxBarSize={16} /></BarChart></ResponsiveContainer></div> : <EmptyState>{t('chartEmpty')}</EmptyState>}
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
                    return <tr key={member.id}><td>{member.email}{member.id === profile.id && <span className="you-tag">{language === 'ar' ? 'أنت' : 'Vous'}</span>}</td><td><select className="role-select" value={member.role} disabled={member.id === profile.id || !isActive || saving} onChange={(event) => updateRole(member.id, event.target.value as Role)}><option value="admin">{t('admin')}</option><option value="storekeeper">{t('storekeeper')}</option><option value="viewer">{t('viewer')}</option></select></td><td><span className={`status-badge ${isActive ? 'status-inStock' : 'status-outOfStock'}`}>{t(isActive ? 'activeMember' : 'disabledMember')}</span></td><td>{dateLabel(member.created_at, language)}</td><td><div className="table-actions"><button className="button button-quiet button-small" disabled={saving || !isActive} onClick={() => void issuePasswordReset(member.id)}>{t('sendResetLink')}</button>{member.id !== profile.id && <button className={`button button-small ${isActive ? 'button-outline' : 'button-primary'}`} disabled={saving} onClick={() => void setTeamMemberActive(member, !isActive)}>{t(isActive ? 'deactivateMember' : 'reactivateMember')}</button>}</div></td></tr>
                  })}</tbody></table></div> : <EmptyState>{t('noTeam')}</EmptyState>}
                </section>
                <section className="panel invite-panel"><div className="panel-heading"><div><h2>{t('invite')}</h2><p>{t('pendingInvitations')}</p></div><span className="panel-icon"><UsersRound size={18} /></span></div>
                  <form className="form-stack" onSubmit={sendInvitation}><label>{t('inviteEmail')}<input type="email" required maxLength={254} value={inviteDraft.email} onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} /></label><label>{t('role')}<select value={inviteDraft.role} onChange={(event) => setInviteDraft({ ...inviteDraft, role: event.target.value as Role })}><option value="storekeeper">{t('storekeeper')}</option><option value="viewer">{t('viewer')}</option></select></label><button className="button button-primary" disabled={saving}><Plus size={16} />{t('inviteMember')}</button></form>
                  <div className="pending-list"><h3>{t('pendingInvitations')}</h3>{team.invitations.length ? team.invitations.map((invite) => <div className="pending-row" key={invite.id}><span>{invite.email}</span><span className="role-pill">{roleName(invite.role, language)}</span></div>) : <p className="muted-copy">—</p>}</div>
                  {invitationLink && <div className="account-link"><p>{!invitationLink.email_sent && t('emailDeliveryNote')}</p><a href={invitationLink.url} referrerPolicy="no-referrer">{invitationLink.url}</a><button className="button button-outline button-small" onClick={() => void copyAccountLink(invitationLink.url)}>{t('copyLink')}</button></div>}
                </section>
              </div>
              {passwordResetLink && <section className="panel account-link"><p>{!passwordResetLink.email_sent && t('emailDeliveryNote')}</p><a href={passwordResetLink.url} referrerPolicy="no-referrer">{passwordResetLink.url}</a><button className="button button-outline button-small" onClick={() => void copyAccountLink(passwordResetLink.url)}>{t('copyLink')}</button></section>}
              <section className="panel table-panel"><div className="panel-heading"><div><h2><ShieldCheck size={18} />{t('accessMatrix')}</h2><p>{t('role')}</p></div><select className="select-control" value={teamRoleFilter} onChange={(event) => setTeamRoleFilter(event.target.value as Role)}><option value="admin">{t('admin')}</option><option value="storekeeper">{t('storekeeper')}</option><option value="viewer">{t('viewer')}</option></select></div>
                <div className="access-grid">{(['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'team'] as Page[]).map((item) => {
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
          <div className="variant-editor-heading"><strong>{t('productVariants')}</strong><button className="button button-quiet button-small" type="button" onClick={() => setProductDraft({ ...productDraft, variants: [...productDraft.variants, { size: 'M', color_key: '', color_ar: '', color_fr: '', color_hex: '#789681' }] })}><Plus size={15} />{t('addVariant')}</button></div>
          <div className="variant-editor">{productDraft.variants.map((variant, index) => <div className="variant-form-row" key={`${variant.id ?? 'new'}-${index}`}><select aria-label={t('size')} value={variant.size} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, size: event.target.value as Size } : item) })}>{sizes.map((size) => <option key={size} value={size}>{size === 'ONE_SIZE' ? (language === 'ar' ? 'مقاس واحد' : 'Taille unique') : size}</option>)}</select><input required aria-label="Color key" placeholder="color-key" value={variant.color_key} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_key: event.target.value } : item) })} /><input required aria-label={language === 'ar' ? 'اسم اللون بالعربية' : 'Nom couleur arabe'} placeholder={language === 'ar' ? 'أسود' : 'Noir (arabe)'} value={variant.color_ar} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_ar: event.target.value } : item) })} /><input required aria-label={language === 'ar' ? 'اسم اللون بالفرنسية' : 'Nom couleur français'} placeholder="Noir" value={variant.color_fr} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_fr: event.target.value } : item) })} /><input type="color" aria-label={t('color')} value={variant.color_hex} onChange={(event) => setProductDraft({ ...productDraft, variants: productDraft.variants.map((item, row) => row === index ? { ...item, color_hex: event.target.value } : item) })} />{variant.id && <span className="variant-quantity">{variant.quantity} {t('units')}</span>}<button type="button" className="icon-button danger-action" aria-label={t('archive')} disabled={productDraft.variants.length === 1} onClick={() => setProductDraft({ ...productDraft, variants: productDraft.variants.filter((_, row) => row !== index) })}><X size={15} /></button></div>)}</div>
          <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setProductDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('save')}</button></div>
        </form>
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

      {supplierDialog && <Modal title={t('addSupplier')} onClose={() => setSupplierDialog(false)}>
        <form className="form-stack" onSubmit={saveSupplier}><label>{t('supplier')}<input required maxLength={160} value={supplierDraft.name} onChange={(event) => setSupplierDraft({ ...supplierDraft, name: event.target.value })} /></label><label>{t('phone')}<input maxLength={40} value={supplierDraft.phone} onChange={(event) => setSupplierDraft({ ...supplierDraft, phone: event.target.value })} /></label><label>{t('city')}<input maxLength={100} value={supplierDraft.city} onChange={(event) => setSupplierDraft({ ...supplierDraft, city: event.target.value })} /></label><label>{t('email')}<input type="email" value={supplierDraft.email} onChange={(event) => setSupplierDraft({ ...supplierDraft, email: event.target.value })} /></label><label>{t('notes')}<textarea rows={2} value={supplierDraft.notes} onChange={(event) => setSupplierDraft({ ...supplierDraft, notes: event.target.value })} /></label><div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setSupplierDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('save')}</button></div></form>
      </Modal>}

      {orderDialog && <Modal title={t('createPurchaseOrder')} onClose={() => setOrderDialog(false)} wide>
        <form className="form-stack" onSubmit={saveOrder}>
          <label>{t('supplier')}<select required value={orderSupplier} onChange={(event) => setOrderSupplier(event.target.value)}><option value="">{t('selectSupplier')}</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <div className="variant-editor-heading"><strong>{t('lines')}</strong><button type="button" className="button button-quiet button-small" onClick={() => setOrderLines([...orderLines, { variant_id: variantOptions[0]?.id ?? '', quantity: '1', unit_cost_tnd: String(variantOptions[0]?.price_tnd ?? '') }])}><Plus size={15} />{t('addLine')}</button></div>
          <div className="order-draft-lines">{orderLines.map((line, index) => <div className="order-draft-row" key={index}><select required value={line.variant_id} onChange={(event) => {
            const selected = variantOptions.find((variant) => variant.id === event.target.value)
            setOrderLines(orderLines.map((item, row) => row === index ? { ...item, variant_id: event.target.value, unit_cost_tnd: selected ? String((selected.price_tnd * 0.65).toFixed(3)) : item.unit_cost_tnd } : item))
          }}><option value="">{t('selectProduct')}</option>{products.map((product) => <optgroup key={product.id} label={`${product.sku} · ${productName(product, language)}`}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant, language)}</option>)}</optgroup>)}</select><input aria-label={t('quantity')} type="number" min="1" step="1" required placeholder={t('quantity')} value={line.quantity} onChange={(event) => setOrderLines(orderLines.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /><input aria-label={t('unitCost')} type="number" min="0.001" step="0.001" required placeholder={t('unitCost')} value={line.unit_cost_tnd} onChange={(event) => setOrderLines(orderLines.map((item, row) => row === index ? { ...item, unit_cost_tnd: event.target.value } : item))} /><button type="button" className="icon-button danger-action" disabled={orderLines.length === 1} onClick={() => setOrderLines(orderLines.filter((_, row) => row !== index))} aria-label={t('cancel')}><X size={15} /></button></div>)}</div>
          <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setOrderDialog(false)}>{t('cancel')}</button><button className="button button-primary" disabled={saving}>{t('create')}</button></div>
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

function ProductTable({ products, language, t, statusFor, formattedMoney, empty, actions }: {
  products: Product[]
  language: Language
  t: (key: keyof typeof copy.ar) => string
  statusFor: (product: Product) => string
  formattedMoney: (value: number | string) => string
  empty: string
  actions?: (product: Product) => ReactNode
}) {
  return products.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('category')}</th><th className="number-cell">{t('price')}</th><th className="number-cell">{t('quantity')}</th><th>{t('status')}</th>{actions && <th>{t('actions')}</th>}</tr></thead><tbody>{products.map((product) => {
    const status = statusFor(product)
    return <tr key={product.id}><td><div className="product-cell"><img className="product-image" src={productPhotos[product.category]} alt={productName(product, language)} loading="lazy" decoding="async" /><span><strong>{productName(product, language)}</strong><small>{product.variants.length} · {language === 'ar' ? 'متغيرات' : 'variantes'}</small></span></div></td><td><span className="sku-code">{product.sku}</span></td><td>{categoryName(product.category, language)}</td><td className="number-cell">{formattedMoney(product.price_tnd)}</td><td className="number-cell"><strong>{product.quantity}</strong> <span className="muted-copy">{t('units')}</span></td><td><StatusBadge status={status} label={t(status as keyof typeof copy.ar)} /></td>{actions && <td>{actions(product)}</td>}</tr>
  })}</tbody></table></div> : <EmptyState>{empty}</EmptyState>
}
