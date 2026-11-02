import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutDashboard,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Shirt,
  Sun,
  Trash2,
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
import {
  categoryLabels,
  colors,
  createProductIllustration,
  initialMovements,
  products as seedProducts,
  sizes,
  suppliers,
  type CategoryKey,
  type Language,
  type Movement,
  type MovementType,
  type Product,
  type Supplier,
  type Variant,
} from './data'
import { translate } from './i18n'
import './App.css'

type Page = 'dashboard' | 'products' | 'movements' | 'suppliers' | 'alerts' | 'reports' | 'users'
type OrderStatus = 'Draft' | 'Sent' | 'Received'
type OrderLine = { productId: string; variantId: string; quantity: number; unitCost: number }
type PurchaseOrder = {
  id: string
  supplierId: string
  date: string
  status: OrderStatus
  lines: OrderLine[]
}
type ProductDraft = {
  id?: string
  sku: string
  nameAr: string
  nameFr: string
  category: CategoryKey
  price: string
  threshold: string
  variants: Variant[]
}
type MovementDraft = {
  productId: string
  variantId: string
  type: MovementType
  quantity: string
  direction: 'increase' | 'decrease'
  note: string
}

function getProductQuantity(product: Product, stockByVariant: Map<string, number>) {
  return product.variants.reduce((total, variant) => total + Math.max(0, stockByVariant.get(variant.id) ?? 0), 0)
}

function Modal({ title, children, onClose, closeLabel, wide = false }: {
  title: string
  children: ReactNode
  onClose: () => void
  closeLabel: string
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

const pageIcons = {
  dashboard: LayoutDashboard,
  products: Package,
  movements: ArrowLeftRight,
  suppliers: Truck,
  alerts: Bell,
  reports: Activity,
  users: UsersRound,
}

const categories = Object.keys(categoryLabels) as CategoryKey[]

const noteLabels: Record<string, Record<Language, string>> = {
  opening: { ar: 'رصيد افتتاحي', fr: 'Stock initial' },
  delivery: { ar: 'استلام شحنة', fr: 'Réception fournisseur' },
  restock: { ar: 'إعادة تزويد', fr: 'Réapprovisionnement' },
  sale: { ar: 'بيع من المتجر', fr: 'Vente en boutique' },
  transfer: { ar: 'نقل بين الفروع', fr: 'Transfert entre magasins' },
  count: { ar: 'جرد المخزون', fr: 'Comptage du stock' },
  'purchase-order': { ar: 'استلام طلب شراء', fr: 'Réception de commande' },
  manual: { ar: 'حركة يدوية', fr: 'Mouvement manuel' },
}

const rolePageAccess: Record<string, Page[]> = {
  Admin: ['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'users'],
  Storekeeper: ['dashboard', 'products', 'movements', 'suppliers', 'alerts'],
  Viewer: ['dashboard', 'products', 'alerts', 'reports'],
}

const team = [
  { name: 'Amine Gharbi', email: 'amine@maisonnova.tn', role: 'Admin', initials: 'AG', color: '#eee8df' },
  { name: 'Sami Ben Amor', email: 'sami@maisonnova.tn', role: 'Storekeeper', initials: 'SB', color: '#e1e9e3' },
  { name: 'Ines Trabelsi', email: 'ines@maisonnova.tn', role: 'Storekeeper', initials: 'IT', color: '#e9e1eb' },
  { name: 'Youssef Karray', email: 'youssef@maisonnova.tn', role: 'Viewer', initials: 'YK', color: '#e3e7ed' },
]

const categoryColors: Record<CategoryKey, string> = {
  tshirt: '#5d806e',
  jeans: '#728bab',
  dress: '#ba8b87',
  jacket: '#9b8c68',
  shoes: '#887ba2',
  accessories: '#c19b6b',
}

function signedQuantity(movement: Movement) {
  if (movement.type === 'IN') return movement.quantity
  if (movement.type === 'OUT') return -movement.quantity
  return movement.quantity * (movement.adjustmentSign ?? 1)
}

function dateKey(date: string) {
  const parsed = new Date(date)
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

function getColor(colorId: string) {
  return colors.find((color) => color.id === colorId)
}

function App() {
  const [language, setLanguage] = useState<Language>('ar')
  const [darkMode, setDarkMode] = useState(false)
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>(seedProducts)
  const [movements, setMovements] = useState<Movement[]>(initialMovements)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [colorFilter, setColorFilter] = useState('all')
  const [lowOnly, setLowOnly] = useState(false)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null)
  const [showMovementDialog, setShowMovementDialog] = useState(false)
  const [movementDraft, setMovementDraft] = useState<MovementDraft>({
    productId: seedProducts[0].id,
    variantId: seedProducts[0].variants[0].id,
    type: 'IN',
    quantity: '1',
    direction: 'increase',
    note: '',
  })
  const [showOrderDialog, setShowOrderDialog] = useState(false)
  const [orderSupplier, setOrderSupplier] = useState(suppliers[0].id)
  const [orderLines, setOrderLines] = useState<OrderLine[]>([
    { productId: seedProducts[0].id, variantId: seedProducts[0].variants[0].id, quantity: 12, unitCost: seedProducts[0].price * 0.62 },
  ])
  const [supplierTab, setSupplierTab] = useState<'suppliers' | 'orders'>('suppliers')
  const [reportPeriod, setReportPeriod] = useState('30')
  const [selectedRole, setSelectedRole] = useState('Admin')
  const [toast, setToast] = useState('')
  const [now] = useState(() => new Date())

  const t = (key: string) => translate(language, key)
  const direction = language === 'ar' ? 'rtl' : 'ltr'
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
  }, [language, direction])
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const stockByVariant = useMemo(() => {
    const stock = new Map<string, number>()
    movements.forEach((movement) => {
      stock.set(movement.variantId, (stock.get(movement.variantId) ?? 0) + signedQuantity(movement))
    })
    return stock
  }, [movements])
  const productQuantity = (product: Product) => getProductQuantity(product, stockByVariant)
  const quantityByProduct = useMemo(
    () => new Map(products.map((product) => [product.id, getProductQuantity(product, stockByVariant)])),
    [products, stockByVariant],
  )
  const productStatus = (product: Product) => {
    const quantity = quantityByProduct.get(product.id) ?? 0
    if (quantity === 0) return 'outOfStock'
    if (quantity <= product.threshold) return 'low'
    return 'inStock'
  }
  const inventoryValue = useMemo(
    () => products.reduce((sum, product) => sum + product.price * (quantityByProduct.get(product.id) ?? 0), 0),
    [products, quantityByProduct],
  )
  const lowProducts = useMemo(
    () => products.filter((product) => {
      const quantity = quantityByProduct.get(product.id) ?? 0
      return quantity === 0 || quantity <= product.threshold
    })
      .sort((a, b) => (quantityByProduct.get(a.id) ?? 0) - (quantityByProduct.get(b.id) ?? 0)),
    [products, quantityByProduct],
  )
  const currentUser = team[0].name
  const todayKey = dateKey(now.toISOString())
  const todaysMovements = movements.filter((movement) => dateKey(movement.date) === todayKey).length
  const tnd = (amount: number) =>
    `${new Intl.NumberFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount)} ${language === 'ar' ? 'د.ت' : 'TND'}`
  const formatDate = (date: string, short = false) =>
    new Intl.DateTimeFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', {
      day: '2-digit',
      month: short ? 'short' : '2-digit',
      year: short ? undefined : 'numeric',
    }).format(new Date(date))
  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const name = product.name[language].toLocaleLowerCase()
      const matchesQuery = !query || name.includes(query) || product.sku.toLocaleLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const matchesSize = sizeFilter === 'all' || product.variants.some((variant) => variant.size === sizeFilter)
      const matchesColor = colorFilter === 'all' || product.variants.some((variant) => variant.color === colorFilter)
      const quantity = quantityByProduct.get(product.id) ?? 0
      const matchesLow = !lowOnly || quantity === 0 || quantity <= product.threshold
      return matchesQuery && matchesCategory && matchesSize && matchesColor && matchesLow
    })
  }, [products, productQuery, categoryFilter, sizeFilter, colorFilter, lowOnly, language, quantityByProduct])

  const recentMovements = useMemo(() => {
    const cutoff = new Date(now.getTime())
    cutoff.setDate(cutoff.getDate() - 30)
    return movements.filter((movement) => new Date(movement.date) >= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [movements, now])

  const movementChartData = useMemo(() => {
    const days = Number(reportPeriod)
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(now.getTime())
      date.setDate(date.getDate() - (days - index - 1))
      const key = dateKey(date.toISOString())
      const dayMovements = movements.filter((movement) => dateKey(movement.date) === key)
      const incoming = dayMovements.filter((movement) => movement.type === 'IN').reduce((sum, movement) => sum + movement.quantity, 0)
      const outgoing = dayMovements.filter((movement) => movement.type === 'OUT').reduce((sum, movement) => sum + movement.quantity, 0)
        + dayMovements.filter((movement) => movement.type === 'ADJUSTMENT' && movement.adjustmentSign === -1).reduce((sum, movement) => sum + movement.quantity, 0)
      return {
        label: new Intl.DateTimeFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', { day: 'numeric', month: days === 7 ? 'short' : undefined }).format(date),
        incoming,
        outgoing,
      }
    })
  }, [movements, reportPeriod, language, now])

  const categoryChartData = useMemo(
    () => categories.map((category) => ({
      name: categoryLabels[category][language],
      value: products.filter((product) => product.category === category)
        .reduce((sum, product) => sum + product.price * (quantityByProduct.get(product.id) ?? 0), 0),
      color: categoryColors[category],
    })),
    [products, quantityByProduct, language],
  )

  const heading = {
    dashboard: ['overview', 'greetingSummary'],
    products: ['productsHeading', 'productsSubheading'],
    movements: ['movementHeading', 'movementSubheading'],
    suppliers: ['supplierHeading', 'supplierSubheading'],
    alerts: ['alertsHeading', 'alertsSubheading'],
    reports: ['reportsHeading', 'reportsSubheading'],
    users: ['usersHeading', 'usersSubheading'],
  }[activePage]

  function navigate(page: Page) {
    setActivePage(page)
    setMobileNavOpen(false)
  }

  function beginAddProduct() {
    setProductDraft({
      sku: '',
      nameAr: '',
      nameFr: '',
      category: 'tshirt',
      price: '',
      threshold: '20',
      variants: sizes.flatMap((size) => colors.slice(0, 2).map((color) => ({
        id: `new-${size}-${color.id}`,
        size,
        color: color.id,
      }))),
    })
    setShowProductDialog(true)
  }

  function beginEditProduct(product: Product) {
    setProductDraft({
      id: product.id,
      sku: product.sku,
      nameAr: product.name.ar,
      nameFr: product.name.fr,
      category: product.category,
      price: String(product.price),
      threshold: String(product.threshold),
      variants: [...product.variants],
    })
    setShowProductDialog(true)
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!productDraft) return
    if (!productDraft.nameAr.trim() || !productDraft.nameFr.trim() || !productDraft.sku.trim()
      || !productDraft.price || !productDraft.threshold || productDraft.variants.length === 0) {
      showToast(t('formRequired'))
      return
    }
    const price = Number(productDraft.price)
    const threshold = Number(productDraft.threshold)
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(threshold) || threshold < 0) {
      showToast(t('formRequired'))
      return
    }
    if (products.some((product) => product.sku.toLowerCase() === productDraft.sku.trim().toLowerCase() && product.id !== productDraft.id)) {
      showToast(t('duplicateSku'))
      return
    }
    const existing = productDraft.id ? productById.get(productDraft.id) : undefined
    const variants = productDraft.variants.map((variant) => {
      const previous = existing?.variants.find((item) => item.size === variant.size && item.color === variant.color)
      return {
        ...variant,
        id: previous?.id ?? `${productDraft.sku.trim().toUpperCase()}-${variant.size}-${variant.color}`,
      }
    })
    if (existing) {
      const removedWithStock = existing.variants.some((variant) =>
        !variants.some((next) => next.size === variant.size && next.color === variant.color)
        && (stockByVariant.get(variant.id) ?? 0) > 0,
      )
      if (removedWithStock) {
        showToast(t('variantHasStock'))
        return
      }
      setProducts((current) => current.map((product) => product.id === existing.id
        ? {
          ...product,
          sku: productDraft.sku.trim().toUpperCase(),
          name: { ar: productDraft.nameAr.trim(), fr: productDraft.nameFr.trim() },
          category: productDraft.category,
          price,
          threshold,
          variants,
        }
        : product))
    } else {
      const newProduct: Product = {
        id: `p-${Date.now()}`,
        sku: productDraft.sku.trim().toUpperCase(),
        name: { ar: productDraft.nameAr.trim(), fr: productDraft.nameFr.trim() },
        category: productDraft.category,
        price,
        threshold,
        variants,
        image: createProductIllustration(productDraft.category, '#e9e4dc', products.length),
        accent: '#e9e4dc',
      }
      setProducts((current) => [newProduct, ...current])
    }
    setShowProductDialog(false)
    setProductDraft(null)
    showToast(t('productSaved'))
  }

  function deleteProduct(product: Product) {
    if (productQuantity(product) > 0) {
      showToast(t('deleteStockError'))
      return
    }
    if (movements.some((movement) => movement.productId === product.id)) {
      showToast(t('productHasHistory'))
      return
    }
    if (!window.confirm(t('deleteProductConfirm'))) return
    setProducts((current) => current.filter((item) => item.id !== product.id))
    showToast(t('productDeleted'))
  }

  function openMovementDialog() {
    const first = products[0]
    setMovementDraft({
      productId: first.id,
      variantId: first.variants[0]?.id ?? '',
      type: 'IN',
      quantity: '1',
      direction: 'increase',
      note: '',
    })
    setShowMovementDialog(true)
  }

  function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const quantity = Number(movementDraft.quantity)
    if (!movementDraft.productId || !movementDraft.variantId || !Number.isInteger(quantity) || quantity <= 0) {
      showToast(t('positiveQuantity'))
      return
    }
    const available = stockByVariant.get(movementDraft.variantId) ?? 0
    const sign = movementDraft.type === 'OUT' || (movementDraft.type === 'ADJUSTMENT' && movementDraft.direction === 'decrease') ? -1 : 1
    if (sign < 0 && quantity > available) {
      showToast(t('insufficientStock'))
      return
    }
    const movement: Movement = {
      id: `move-${Date.now()}`,
      productId: movementDraft.productId,
      variantId: movementDraft.variantId,
      type: movementDraft.type,
      quantity,
      adjustmentSign: movementDraft.type === 'ADJUSTMENT' ? sign as 1 | -1 : undefined,
      date: new Date().toISOString(),
      user: currentUser,
      note: movementDraft.note.trim() || 'manual',
    }
    setMovements((current) => [movement, ...current])
    setShowMovementDialog(false)
    showToast(t('movementSaved'))
  }

  function openOrderDialog(product?: Product) {
    const chosenProduct = product ?? products[0]
    const chosenVariant = chosenProduct.variants[0]
    setOrderSupplier(suppliers[0].id)
    setOrderLines([{
      productId: chosenProduct.id,
      variantId: chosenVariant.id,
      quantity: product ? 12 : 12,
      unitCost: Number((chosenProduct.price * 0.62).toFixed(3)),
    }])
    setShowOrderDialog(true)
  }

  function updateOrderLine(index: number, patch: Partial<OrderLine>) {
    setOrderLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line
      const next = { ...line, ...patch }
      if (patch.productId) {
        const product = productById.get(patch.productId)
        next.variantId = product?.variants[0]?.id ?? ''
        next.unitCost = Number(((product?.price ?? 0) * 0.62).toFixed(3))
      }
      return next
    }))
  }

  function savePurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orderSupplier || orderLines.length === 0 || orderLines.some((line) =>
      !line.productId || !line.variantId || !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost) || line.unitCost <= 0,
    )) {
      showToast(t('formRequired'))
      return
    }
    const order: PurchaseOrder = {
      id: `PO-${String(orders.length + 104).padStart(4, '0')}`,
      supplierId: orderSupplier,
      date: new Date().toISOString(),
      status: 'Draft',
      lines: orderLines.map((line) => ({ ...line })),
    }
    setOrders((current) => [order, ...current])
    setSupplierTab('orders')
    setShowOrderDialog(false)
    showToast(t('orderSaved'))
  }

  function updateOrderStatus(order: PurchaseOrder, status: OrderStatus) {
    if (status === 'Received' && order.status !== 'Received') {
      const created: Movement[] = order.lines.map((line, index) => ({
        id: `po-${order.id}-${index}-${Date.now()}`,
        productId: line.productId,
        variantId: line.variantId,
        type: 'IN',
        quantity: line.quantity,
        date: new Date().toISOString(),
        user: currentUser,
        note: 'purchase-order',
      }))
      setMovements((current) => [...created, ...current])
      showToast(t('orderReceivedToast'))
    } else if (status === 'Sent') {
      showToast(t('sentToast'))
    }
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status } : item))
  }

  function exportReport(format: 'excel' | 'pdf') {
    if (format === 'pdf') {
      window.print()
      showToast(t('exportDone'))
      return
    }
    const rows = [
      [t('name'), t('sku'), t('category'), t('quantity'), t('price'), t('stockValue')],
      ...products.map((product) => [
        product.name[language],
        product.sku,
        categoryLabels[product.category][language],
        String(quantityByProduct.get(product.id) ?? 0),
        String(product.price.toFixed(3)),
        String((product.price * (quantityByProduct.get(product.id) ?? 0)).toFixed(3)),
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'maison-nova-inventory.csv'
    link.click()
    URL.revokeObjectURL(url)
    showToast(t('exportDone'))
  }

  function movementNote(key: string) {
    return noteLabels[key]?.[language] ?? key
  }

  function renderStatus(product: Product) {
    const status = productStatus(product)
    const icon = status === 'inStock' ? <CheckCircle2 size={13} /> : status === 'low' ? <Activity size={13} /> : <X size={13} />
    return <span className={`status-badge status-${status}`}>{icon}{t(status)}</span>
  }

  function productImage(product: Product, size: 'small' | 'large' = 'small') {
    return (
      <div className={`product-image ${size}`} style={{ backgroundColor: product.accent }}>
        <img src={product.image} alt={product.name[language]} loading="lazy" onError={(event) => {
          event.currentTarget.style.display = 'none'
        }} />
      </div>
    )
  }

  function renderProductRow(product: Product, includeActions = true) {
    const quantity = quantityByProduct.get(product.id) ?? 0
    return (
      <tr key={product.id}>
        <td>{productImage(product)}</td>
        <td>
          <div className="product-name-cell">
            <strong>{product.name[language]}</strong>
            <span>{product.variants.length} {t('variants')}</span>
          </div>
        </td>
        <td><span className="sku-code">{product.sku}</span></td>
        <td>{categoryLabels[product.category][language]}</td>
        <td className="number-cell">{tnd(product.price)}</td>
        <td className="number-cell"><strong>{quantity}</strong> <span className="muted">{t('pieces')}</span></td>
        <td>{renderStatus(product)}</td>
        {includeActions && (
          <td>
            <div className="row-actions">
              <button type="button" className="icon-button row-action" aria-label={t('edit')} onClick={() => beginEditProduct(product)}><Settings2 size={16} /></button>
              <button type="button" className="icon-button row-action danger-hover" aria-label={t('delete')} onClick={() => deleteProduct(product)}><Trash2 size={16} /></button>
            </div>
          </td>
        )}
      </tr>
    )
  }

  function pageContent() {
    if (activePage === 'dashboard') {
      const lowFive = lowProducts.slice(0, 5)
      return (
        <>
          <section className="welcome-strip">
            <div>
              <span className="eyebrow">{t('today')} · {formatDate(now.toISOString())}</span>
              <h1>{language === 'ar' ? 'صباح الخير، أمين' : t('greetingFr')}</h1>
              <p>{t('greetingSummary')}</p>
            </div>
            <button type="button" className="button button-dark" onClick={openMovementDialog}><Plus size={16} />{t('newMovement')}</button>
            <div className="welcome-decoration"><span /><span /><span /></div>
          </section>

          <section className="stats-grid">
            <StatCard icon={<Package size={18} />} label={t('productsCount')} value={String(products.length)} meta={`+3 ${t('fromLastMonth')}`} tone="sand" trend="up" />
            <StatCard icon={<Boxes size={18} />} label={t('stockValue')} value={tnd(inventoryValue)} meta={`+8.4% ${t('fromLastMonth')}`} tone="sage" trend="up" />
            <StatCard icon={<Activity size={18} />} label={t('lowStock')} value={String(lowProducts.length)} meta={t('needsAttention')} tone="rose" trend="neutral" />
            <StatCard icon={<ArrowLeftRight size={18} />} label={t('todaysMovements')} value={String(todaysMovements)} meta={t('thisMonth')} tone="blue" trend="up" />
          </section>

          <section className="dashboard-charts">
            <article className="panel movement-panel">
              <div className="panel-heading">
                <div><h2>{t('movementOverview')}</h2><p>{t('last30Days')}</p></div>
                <button type="button" className="select-shell select-compact"><CalendarDays size={15} /><span>{t('last30Days')}</span><ChevronDown size={14} /></button>
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot incoming" />{t('stockIn')}</span>
                <span><i className="legend-dot outgoing" />{t('stockOut')}</span>
              </div>
              <div className="chart-wrap movement-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={movementChartData.slice(-30)} barGap={5} margin={{ top: 10, right: 2, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line-soft)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'var(--surface-alt)' }} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} />
                    <Bar dataKey="incoming" name={t('stockIn')} fill="#829e89" radius={[4, 4, 0, 0]} maxBarSize={12} />
                    <Bar dataKey="outgoing" name={t('stockOut')} fill="#d9a69c" radius={[4, 4, 0, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-footnote"><span className="footnote-mark"><ArrowUpRight size={14} /></span><span>{t('total')}: <strong>{recentMovements.length}</strong> {t('dashboardChartUnits')}</span></div>
            </article>

            <article className="panel category-panel">
              <div className="panel-heading">
                <div><h2>{t('stockByCategory')}</h2><p>{t('inventoryValue')}</p></div>
                <button type="button" className="icon-button subtle-button" aria-label={t('actions')}><MoreHorizontal size={20} /></button>
              </div>
              <div className="category-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryChartData} dataKey="value" nameKey="name" innerRadius={66} outerRadius={92} paddingAngle={3} stroke="none">
                      {categoryChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => tnd(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center"><span>{t('total')}</span><strong>{tnd(inventoryValue)}</strong></div>
              </div>
              <div className="category-legend">
                {categoryChartData.map((category) => (
                  <div key={category.name}><span><i style={{ backgroundColor: category.color }} />{category.name}</span><strong>{tnd(category.value)}</strong></div>
                ))}
              </div>
            </article>
          </section>

          <section className="dashboard-bottom">
            <article className="panel low-stock-panel">
              <div className="panel-heading">
                <div><h2>{t('topLowStock')}</h2><p>{t('lowProducts')}</p></div>
                <button type="button" className="text-button" onClick={() => navigate('alerts')}>{t('seeAll')} <ChevronLeft size={15} /></button>
              </div>
              <div className="low-stock-list">
                {lowFive.length ? lowFive.map((product) => (
                  <div className="low-stock-row" key={product.id}>
                    {productImage(product)}
                    <div className="low-stock-info"><strong>{product.name[language]}</strong><span>{product.sku}</span></div>
                    <div className="low-stock-level"><div className="stock-track"><i style={{ width: `${Math.min(100, (productQuantity(product) / Math.max(1, product.threshold)) * 100)}%` }} /></div><span>{productQuantity(product)} / {product.threshold}</span></div>
                    {renderStatus(product)}
                  </div>
                )) : <EmptyState title={t('noAlerts')} detail={t('noAlertsHint')} />}
              </div>
            </article>
            <article className="panel quick-actions-panel">
              <div className="panel-heading"><div><h2>{t('quickActions')}</h2><p>{t('workspace')}</p></div></div>
              <button type="button" className="quick-action" onClick={beginAddProduct}><span className="quick-icon"><Plus size={17} /></span><span><strong>{t('addProduct')}</strong><small>{t('productsSubheading')}</small></span><ChevronRight size={17} /></button>
              <button type="button" className="quick-action" onClick={openMovementDialog}><span className="quick-icon quick-icon-blue"><ArrowLeftRight size={17} /></span><span><strong>{t('recordMovement')}</strong><small>{t('movementSubheading')}</small></span><ChevronRight size={17} /></button>
              <button type="button" className="quick-action" onClick={() => openOrderDialog()}><span className="quick-icon quick-icon-rose"><ClipboardList size={17} /></span><span><strong>{t('createOrder')}</strong><small>{t('purchaseOrders')}</small></span><ChevronRight size={17} /></button>
            </article>
          </section>
        </>
      )
    }

    if (activePage === 'products') {
      return (
        <section className="panel table-panel">
          <div className="table-toolbar">
            <div className="filter-search"><Search size={16} /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={t('searchProducts')} /></div>
            <div className="filter-controls">
              <label className="select-shell"><Filter size={14} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">{t('allCategories')}</option>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category][language]}</option>)}</select><ChevronDown size={14} /></label>
              <label className="select-shell"><select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}><option value="all">{t('allSizes')}</option>{sizes.map((size) => <option key={size}>{size}</option>)}</select><ChevronDown size={14} /></label>
              <label className="select-shell"><select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}><option value="all">{t('allColors')}</option>{colors.slice(0, 2).map((color) => <option key={color.id} value={color.id}>{color.label[language]}</option>)}</select><ChevronDown size={14} /></label>
              <label className="checkbox-filter"><input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} /><span>{t('lowOnly')}</span></label>
            </div>
            <button type="button" className="button button-primary" onClick={beginAddProduct}><Plus size={16} />{t('addNewProduct')}</button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>{t('image')}</th><th>{t('name')}</th><th>{t('sku')}</th><th>{t('category')}</th><th className="number-cell">{t('price')}</th><th className="number-cell">{t('quantity')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {filteredProducts.map((product) => renderProductRow(product))}
                {!filteredProducts.length && <tr><td colSpan={8}><EmptyState title={t('noProducts')} detail={t('noProductsHint')} action={<button type="button" className="text-button" onClick={() => { setProductQuery(''); setCategoryFilter('all'); setSizeFilter('all'); setColorFilter('all'); setLowOnly(false) }}>{t('clearFilters')}</button>} /></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span>{filteredProducts.length} {t('products').toLocaleLowerCase(language)}</span><div className="pagination"><button type="button" disabled><ChevronRight size={15} /></button><span>1</span><button type="button" disabled><ChevronLeft size={15} /></button></div></div>
        </section>
      )
    }

    if (activePage === 'movements') {
      return (
        <section className="panel table-panel">
          <div className="panel-heading movement-table-heading">
            <div><h2>{t('movementHistory')}</h2><p>{t('last30Days')} · {recentMovements.length} {t('dashboardChartUnits')}</p></div>
            <button type="button" className="button button-primary" onClick={openMovementDialog}><Plus size={16} />{t('newMovement')}</button>
          </div>
          <div className="table-scroll">
            <table className="data-table movement-table">
              <thead><tr><th>{t('date')}</th><th>{t('product')}</th><th>{t('variant')}</th><th>{t('movementType')}</th><th className="number-cell">{t('quantity')}</th><th>{t('user')}</th><th>{t('note')}</th></tr></thead>
              <tbody>
                {recentMovements.slice(0, 60).map((movement) => {
                  const product = productById.get(movement.productId)
                  const variant = product?.variants.find((item) => item.id === movement.variantId)
                  return (
                    <tr key={movement.id}>
                      <td><span className="date-primary">{formatDate(movement.date)}</span><small className="date-time">{new Intl.DateTimeFormat(language === 'ar' ? 'ar-TN' : 'fr-TN', { hour: '2-digit', minute: '2-digit' }).format(new Date(movement.date))}</small></td>
                      <td><div className="movement-product">{product && productImage(product)}<span>{product?.name[language] ?? t('notAvailable')}<small>{product?.sku}</small></span></div></td>
                      <td><span className="variant-pill">{variant?.size ?? '—'} · {getColor(variant?.color ?? '')?.label[language] ?? '—'}</span></td>
                      <td><MovementTypeBadge type={movement.type} language={language} /></td>
                      <td className={`number-cell quantity-${movement.type.toLowerCase()}`}>{movement.type === 'OUT' || (movement.type === 'ADJUSTMENT' && movement.adjustmentSign === -1) ? '−' : '+'}{movement.quantity}</td>
                      <td><span className="user-name">{movement.user}</span></td>
                      <td><span className="movement-note">{movementNote(movement.note)}</span></td>
                    </tr>
                  )
                })}
                {!recentMovements.length && <tr><td colSpan={7}><EmptyState title={t('noMovements')} detail={t('movementSubheading')} /></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )
    }

    if (activePage === 'suppliers') {
      const supplierLookup = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
      return (
        <>
          <div className="tab-toolbar">
            <div className="segmented-control">
              <button type="button" className={supplierTab === 'suppliers' ? 'active' : ''} onClick={() => setSupplierTab('suppliers')}>{t('suppliers')} <span>{suppliers.length}</span></button>
              <button type="button" className={supplierTab === 'orders' ? 'active' : ''} onClick={() => setSupplierTab('orders')}>{t('purchaseOrders')} <span>{orders.length}</span></button>
            </div>
            <button type="button" className="button button-primary" onClick={() => openOrderDialog()}><Plus size={16} />{t('newPurchaseOrder')}</button>
          </div>
          {supplierTab === 'suppliers' ? (
            <section className="supplier-grid">
              {suppliers.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} t={t} />)}
            </section>
          ) : (
            <section className="panel table-panel">
              <div className="panel-heading movement-table-heading"><div><h2>{t('purchaseOrders')}</h2><p>{orders.length} {t('purchaseOrdersShort')}</p></div></div>
              {orders.length ? <div className="table-scroll">
                <table className="data-table order-table"><thead><tr><th>{t('orderNumber')}</th><th>{t('supplier')}</th><th>{t('orderDate')}</th><th>{t('lines')}</th><th className="number-cell">{t('orderTotal')}</th><th>{t('orderStatus')}</th><th>{t('actions')}</th></tr></thead>
                  <tbody>{orders.map((order) => {
                    const supplier = supplierLookup.get(order.supplierId)
                    const value = order.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)
                    return <tr key={order.id}>
                      <td><strong className="order-id">{order.id}</strong></td>
                      <td>{supplier?.name}</td>
                      <td>{formatDate(order.date)}</td>
                      <td>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} {t('pieces')}</td>
                      <td className="number-cell">{tnd(value)}</td>
                      <td><OrderStatusBadge status={order.status} language={language} /></td>
                      <td><div className="order-actions">{order.status === 'Draft' && <button type="button" className="text-button" onClick={() => updateOrderStatus(order, 'Sent')}>{t('markSent')}</button>}{order.status !== 'Received' && <button type="button" className="button button-small button-soft" onClick={() => updateOrderStatus(order, 'Received')}><Check size={14} />{t('markReceived')}</button>}</div></td>
                    </tr>
                  })}</tbody>
                </table>
              </div> : <EmptyState title={t('noOrders')} detail={t('noOrdersHint')} action={<button type="button" className="button button-primary" onClick={() => openOrderDialog()}><Plus size={15} />{t('newPurchaseOrder')}</button>} />}
            </section>
          )}
        </>
      )
    }

    if (activePage === 'alerts') {
      const outProducts = lowProducts.filter((product) => productStatus(product) === 'outOfStock')
      const lowOnlyProducts = lowProducts.filter((product) => productStatus(product) === 'low')
      const alertList = (items: Product[], emptyTitle: string) => items.length ? (
        <div className="alert-list">{items.map((product) => (
          <div className="alert-row" key={product.id}>
            {productImage(product, 'large')}
            <div className="alert-product-info"><strong>{product.name[language]}</strong><span>{product.sku} · {categoryLabels[product.category][language]}</span><div className="stock-track"><i style={{ width: `${Math.min(100, (productQuantity(product) / Math.max(product.threshold, 1)) * 100)}%` }} /></div></div>
            <div className="alert-quantity"><strong>{productQuantity(product)}</strong><span>{t('pieces')} / {product.threshold}</span></div>
            {renderStatus(product)}
            <button type="button" className="button button-soft" onClick={() => openOrderDialog(product)}><Plus size={15} />{t('createOrderFor')}</button>
          </div>
        ))}</div>
      ) : <EmptyState title={emptyTitle} detail={t('noAlertsHint')} />
      return (
        <div className="alert-sections">
          <section className="panel alert-panel">
            <div className="panel-heading"><div><h2><span className="section-dot dot-rose" />{t('outOfStockProducts')}</h2><p>{outProducts.length} {t('products').toLocaleLowerCase(language)}</p></div><span className="alert-count alert-count-rose">{outProducts.length}</span></div>
            {alertList(outProducts, t('noAlerts'))}
          </section>
          <section className="panel alert-panel">
            <div className="panel-heading"><div><h2><span className="section-dot dot-amber" />{t('lowStockProducts')}</h2><p>{lowOnlyProducts.length} {t('products').toLocaleLowerCase(language)}</p></div><span className="alert-count alert-count-amber">{lowOnlyProducts.length}</span></div>
            {alertList(lowOnlyProducts, t('noAlerts'))}
          </section>
        </div>
      )
    }

    if (activePage === 'reports') {
      const valueData = products.map((product) => ({ ...product, quantity: quantityByProduct.get(product.id) ?? 0, value: product.price * (quantityByProduct.get(product.id) ?? 0) }))
        .sort((a, b) => b.value - a.value)
      return (
        <>
          <section className="report-stats">
            <StatCard icon={<Boxes size={18} />} label={t('inventoryValue')} value={tnd(inventoryValue)} meta={t('stockValue')} tone="sage" trend="neutral" />
            <StatCard icon={<Package size={18} />} label={t('unitsInStock')} value={String([...quantityByProduct.values()].reduce((sum, value) => sum + value, 0))} meta={t('products').toLocaleLowerCase(language)} tone="sand" trend="neutral" />
            <StatCard icon={<Activity size={18} />} label={t('productsTracked')} value={String(products.length)} meta={t('productsCount')} tone="blue" trend="neutral" />
          </section>
          <section className="panel report-panel">
            <div className="panel-heading report-heading">
              <div><h2>{t('movementReport')}</h2><p>{t('movementSubheading')}</p></div>
              <div className="report-actions">
                <label className="select-shell"><CalendarDays size={15} /><select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)}><option value="7">{t('last7Days')}</option><option value="30">{t('last30Days')}</option><option value="90">{t('last90Days')}</option></select><ChevronDown size={14} /></label>
                <button type="button" className="button button-outline" onClick={() => exportReport('excel')}><FileSpreadsheet size={16} />{t('exportExcel')}</button>
                <button type="button" className="button button-outline" onClick={() => exportReport('pdf')}><FileText size={16} />{t('exportPdf')}</button>
              </div>
            </div>
            <div className="chart-wrap report-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movementChartData} barGap={4} margin={{ top: 15, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line-soft)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={reportPeriod === '90' ? 14 : reportPeriod === '30' ? 4 : 0} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)' }} />
                  <Bar dataKey="incoming" name={t('stockIn')} fill="#829e89" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="outgoing" name={t('stockOut')} fill="#d9a69c" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel table-panel valuation-table">
            <div className="panel-heading"><div><h2>{t('valuation')}</h2><p>{t('inventoryValue')}</p></div><button type="button" className="button button-soft" onClick={() => exportReport('excel')}><Download size={15} />{t('generateReport')}</button></div>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('category')}</th><th className="number-cell">{t('quantity')}</th><th className="number-cell">{t('price')}</th><th className="number-cell">{t('stockValue')}</th></tr></thead><tbody>
              {valueData.slice(0, 10).map((product) => <tr key={product.id}><td><div className="movement-product">{productImage(product)}<strong>{product.name[language]}</strong></div></td><td><span className="sku-code">{product.sku}</span></td><td>{categoryLabels[product.category][language]}</td><td className="number-cell">{product.quantity} {t('pieces')}</td><td className="number-cell">{tnd(product.price)}</td><td className="number-cell"><strong>{tnd(product.value)}</strong></td></tr>)}
            </tbody></table></div>
          </section>
        </>
      )
    }

    const roleLabels: Record<string, string> = { Admin: t('admin'), Storekeeper: t('storekeeper'), Viewer: t('viewer') }
    return (
      <>
        <section className="panel team-panel">
          <div className="panel-heading"><div><h2>{t('users')}</h2><p>{team.length} {t('users').toLocaleLowerCase(language)}</p></div></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('role')}</th><th>{t('status')}</th></tr></thead><tbody>
            {team.map((member) => <tr key={member.email}><td><div className="team-person"><span className="avatar" style={{ background: member.color }}>{member.initials}</span><strong>{member.name}</strong></div></td><td>{member.email}</td><td><span className={`role-pill role-${member.role.toLowerCase()}`}>{roleLabels[member.role]}</span></td><td><span className="online-status"><i />{t('online')}</span></td></tr>)}
          </tbody></table></div>
        </section>
        <section className="panel access-panel">
          <div className="panel-heading access-header"><div><h2><ShieldCheck size={18} />{t('accessMatrix')}</h2><p>{t('usersSubheading')}</p></div><label className="select-shell"><UsersRound size={15} /><select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="Admin">{t('admin')}</option><option value="Storekeeper">{t('storekeeper')}</option><option value="Viewer">{t('viewer')}</option></select><ChevronDown size={14} /></label></div>
          <div className="access-table-wrap"><table className="access-table"><thead><tr><th>{t('page')}</th><th>{t('access')}</th></tr></thead><tbody>
            {(['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'users'] as Page[]).map((page) => {
              const PageIcon = pageIcons[page]
              const allowed = rolePageAccess[selectedRole].includes(page)
              return <tr key={page}><td><span className="access-page"><PageIcon size={16} />{t(page === 'suppliers' ? 'suppliersOrders' : page === 'users' ? 'usersRoles' : page)}</span></td><td><span className={`access-indicator ${allowed ? 'allowed' : 'restricted'}`}>{allowed ? <Check size={13} /> : <X size={13} />}{allowed ? t('allowed') : t('restricted')}</span></td></tr>
            })}
          </tbody></table></div>
          <div className="access-note"><CircleHelp size={15} /><span>{t('usersSubheading')}</span></div>
        </section>
      </>
    )
  }

  return (
    <div className={`app-shell ${darkMode ? 'theme-dark' : ''}`} dir={direction}>
      {mobileNavOpen && <button type="button" className="mobile-scrim" aria-label={t('close')} onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Shirt size={21} strokeWidth={1.8} /></div>
          <div><strong>NOVA<span>STOCK</span></strong><small>{t('brandSubtitle')}</small></div>
          <button type="button" className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} aria-label={t('close')}><X size={18} /></button>
        </div>
        <div className="store-switcher">
          <span className="store-avatar">N</span><span className="store-switch-copy"><strong>{t('storeName')}</strong><small>{t('storeLocation')}</small></span><ChevronDown size={15} />
        </div>
        <div className="nav-label">{t('workspace')}</div>
        <nav className="side-nav">
          {(['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'users'] as Page[]).map((page) => {
            const Icon = pageIcons[page]
            const label = t(page === 'suppliers' ? 'suppliersOrders' : page === 'users' ? 'usersRoles' : page)
            return <button type="button" key={page} className={`nav-item ${activePage === page ? 'active' : ''}`} onClick={() => navigate(page)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{page === 'alerts' && lowProducts.length > 0 && <span className="nav-count">{lowProducts.length}</span>}
            </button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="help-card"><span className="help-icon"><CircleHelp size={18} /></span><span><strong>{language === 'ar' ? 'هل تحتاج إلى مساعدة؟' : 'Besoin d’aide ?'}</strong><small>{language === 'ar' ? 'فريقنا هنا لمساعدتك' : 'Notre équipe est là'}</small></span><ChevronLeft size={15} /></button>
          <div className="profile-card"><span className="avatar profile-avatar">AG</span><span className="profile-copy"><strong>Amine Gharbi</strong><small>{t('admin')}</small></span><button type="button" className="icon-button profile-menu" aria-label={t('actions')}><MoreHorizontal size={19} /></button></div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left"><button type="button" className="icon-button mobile-menu" aria-label={t('workspace')} onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>{t('storeName')}</span><ChevronLeft size={13} /><strong>{t(activePage === 'suppliers' ? 'suppliersOrders' : activePage === 'users' ? 'usersRoles' : activePage)}</strong></div></div>
          <div className="topbar-tools">
            <label className="global-search"><Search size={16} /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') navigate('products') }} placeholder={t('globalSearch')} /><kbd>⌘ K</kbd></label>
            <span className="topbar-divider" />
            <button type="button" className="language-toggle" onClick={() => setLanguage((current) => current === 'ar' ? 'fr' : 'ar')} aria-label={t('language')}><span className={language === 'ar' ? 'selected' : ''}>ع</span><span className={language === 'fr' ? 'selected' : ''}>FR</span></button>
            <button type="button" className="icon-button theme-toggle" aria-label={darkMode ? t('lightMode') : t('darkMode')} onClick={() => setDarkMode((current) => !current)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="notification-button" aria-label={t('notifications')} onClick={() => navigate('alerts')}><Bell size={18} /><i /></button>
            <span className="topbar-divider profile-divider" />
            <span className="topbar-avatar">AG</span>
          </div>
        </header>
        <main className="main-content">
          <div className="content-heading">
            <div><h1>{activePage === 'dashboard' ? (language === 'ar' ? 'نظرة عامة' : 'Vue d’ensemble') : t(heading[0])}</h1><p>{activePage === 'dashboard' ? t('greetingSummary') : t(heading[1])}</p></div>
            {activePage !== 'dashboard' && <span className="last-updated"><span className="live-dot" />{t('today')} · {formatDate(now.toISOString())}</span>}
          </div>
          {pageContent()}
          <footer className="app-footer"><span>© 2025 NovaStock</span><span>{language === 'ar' ? 'صُنع بعناية في تونس' : 'Conçu avec soin en Tunisie'} <span className="footer-heart">♥</span></span></footer>
        </main>
      </div>

      {showProductDialog && productDraft && (
        <Modal title={productDraft.id ? t('editProduct') : t('addNewProduct')} closeLabel={t('close')} onClose={() => setShowProductDialog(false)} wide>
          <form className="modal-form" onSubmit={saveProduct}>
            <div className="form-grid">
              <label className="field"><span>{t('productNameAr')} *</span><input value={productDraft.nameAr} onChange={(event) => setProductDraft({ ...productDraft, nameAr: event.target.value })} required dir="rtl" /></label>
              <label className="field"><span>{t('productNameFr')} *</span><input value={productDraft.nameFr} onChange={(event) => setProductDraft({ ...productDraft, nameFr: event.target.value })} required dir="ltr" /></label>
              <label className="field"><span>{t('baseSku')} *</span><input value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value.toUpperCase() })} required dir="ltr" /></label>
              <label className="field"><span>{t('category')} *</span><select value={productDraft.category} onChange={(event) => setProductDraft({ ...productDraft, category: event.target.value as CategoryKey })}>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category][language]}</option>)}</select></label>
              <label className="field"><span>{t('sellPrice')} *</span><div className="input-suffix"><input type="number" step="0.001" min="0.001" value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: event.target.value })} required /><em>TND</em></div></label>
              <label className="field"><span>{t('minimumStock')} *</span><input type="number" min="0" step="1" value={productDraft.threshold} onChange={(event) => setProductDraft({ ...productDraft, threshold: event.target.value })} required /></label>
            </div>
            <div className="variant-form-heading"><div><h3>{t('chooseVariants')}</h3><p>{t('quantityFromMovements')}</p></div><span className="variant-count">{productDraft.variants.length} {t('variants')}</span></div>
            <div className="variant-grid">
              {colors.slice(0, 2).map((color) => <div className="variant-color-group" key={color.id}>
                <div className="variant-color-title"><i className="color-swatch" style={{ backgroundColor: color.hex }} />{color.label[language]}</div>
                <div className="variant-size-row">{sizes.map((size) => {
                  const variant = productDraft.variants.find((item) => item.size === size && item.color === color.id)
                  const existingStock = variant ? stockByVariant.get(variant.id) ?? 0 : 0
                  return <label className={`variant-size-option ${variant ? 'checked' : ''}`} key={`${color.id}-${size}`}>
                    <input type="checkbox" checked={Boolean(variant)} onChange={(event) => {
                      const next = event.target.checked
                        ? [...productDraft.variants, { id: `new-${size}-${color.id}`, size, color: color.id }]
                        : productDraft.variants.filter((item) => !(item.size === size && item.color === color.id))
                      setProductDraft({ ...productDraft, variants: next })
                    }} />
                    <span className="variant-size-label">{size}</span>
                    <small>{t('currentStock')}: {existingStock}</small>
                  </label>
                })}</div>
              </div>)}
            </div>
            <div className="modal-footer"><button type="button" className="button button-outline" onClick={() => setShowProductDialog(false)}>{t('cancel')}</button><button type="submit" className="button button-primary"><Check size={16} />{t('saveProduct')}</button></div>
          </form>
        </Modal>
      )}

      {showMovementDialog && (
        <Modal title={t('newMovement')} closeLabel={t('close')} onClose={() => setShowMovementDialog(false)}>
          <form className="modal-form" onSubmit={saveMovement}>
            <label className="field"><span>{t('movementType')} *</span><select value={movementDraft.type} onChange={(event) => setMovementDraft({ ...movementDraft, type: event.target.value as MovementType })}><option value="IN">{t('in')}</option><option value="OUT">{t('out')}</option><option value="ADJUSTMENT">{t('adjustment')}</option></select></label>
            <label className="field"><span>{t('product')} *</span><select value={movementDraft.productId} onChange={(event) => {
              const product = productById.get(event.target.value)
              setMovementDraft({ ...movementDraft, productId: event.target.value, variantId: product?.variants[0]?.id ?? '' })
            }}>{products.map((product) => <option key={product.id} value={product.id}>{product.name[language]} · {product.sku}</option>)}</select></label>
            <label className="field"><span>{t('variant')} *</span><select value={movementDraft.variantId} onChange={(event) => setMovementDraft({ ...movementDraft, variantId: event.target.value })}>{(productById.get(movementDraft.productId)?.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.size} · {getColor(variant.color)?.label[language]} ({t('available')}: {stockByVariant.get(variant.id) ?? 0})</option>)}</select></label>
            {movementDraft.type === 'ADJUSTMENT' && <div className="direction-toggle"><button type="button" className={movementDraft.direction === 'increase' ? 'selected' : ''} onClick={() => setMovementDraft({ ...movementDraft, direction: 'increase' })}><ArrowUpRight size={15} />{t('increase')}</button><button type="button" className={movementDraft.direction === 'decrease' ? 'selected' : ''} onClick={() => setMovementDraft({ ...movementDraft, direction: 'decrease' })}><ArrowDownRight size={15} />{t('decrease')}</button></div>}
            <label className="field"><span>{t('movementQuantity')} *</span><input type="number" min="1" step="1" value={movementDraft.quantity} onChange={(event) => setMovementDraft({ ...movementDraft, quantity: event.target.value })} required /></label>
            <label className="field"><span>{t('note')}</span><input value={movementDraft.note} onChange={(event) => setMovementDraft({ ...movementDraft, note: event.target.value })} placeholder={t('movementNote')} /></label>
            <div className="movement-modal-hint"><CircleHelp size={15} /><span>{t('quantityFromMovements')} {t('available')}: <strong>{stockByVariant.get(movementDraft.variantId) ?? 0}</strong></span></div>
            <div className="modal-footer"><button type="button" className="button button-outline" onClick={() => setShowMovementDialog(false)}>{t('cancel')}</button><button type="submit" className="button button-primary"><Check size={16} />{t('saveMovement')}</button></div>
          </form>
        </Modal>
      )}

      {showOrderDialog && (
        <Modal title={t('newPurchaseOrder')} closeLabel={t('close')} onClose={() => setShowOrderDialog(false)} wide>
          <form className="modal-form" onSubmit={savePurchaseOrder}>
            <label className="field"><span>{t('supplier')} *</span><select value={orderSupplier} onChange={(event) => setOrderSupplier(event.target.value)}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.city}</option>)}</select></label>
            <div className="variant-form-heading order-lines-heading"><div><h3>{t('orderLines')}</h3><p>{t('purchaseOrders')}</p></div><button type="button" className="button button-soft button-small" onClick={() => {
              const product = products[0]
              setOrderLines((current) => [...current, { productId: product.id, variantId: product.variants[0].id, quantity: 1, unitCost: Number((product.price * 0.62).toFixed(3)) }])
            }}><Plus size={14} />{t('addLine')}</button></div>
            <div className="order-line-list">{orderLines.map((line, index) => {
              const selectedProduct = productById.get(line.productId)
              return <div className="order-line" key={`line-${index}`}>
                <label className="field"><span>{t('product')}</span><select value={line.productId} onChange={(event) => updateOrderLine(index, { productId: event.target.value })}>{products.map((product) => <option key={product.id} value={product.id}>{product.name[language]}</option>)}</select></label>
                <label className="field"><span>{t('variant')}</span><select value={line.variantId} onChange={(event) => updateOrderLine(index, { variantId: event.target.value })}>{(selectedProduct?.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.size} · {getColor(variant.color)?.label[language]}</option>)}</select></label>
                <label className="field"><span>{t('quantity')}</span><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateOrderLine(index, { quantity: Number(event.target.value) })} /></label>
                <label className="field"><span>{t('unitCost')}</span><input type="number" min="0.001" step="0.001" value={line.unitCost} onChange={(event) => updateOrderLine(index, { unitCost: Number(event.target.value) })} /></label>
                <button type="button" className="icon-button remove-line" aria-label={t('removeLine')} disabled={orderLines.length === 1} onClick={() => setOrderLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X size={16} /></button>
              </div>
            })}</div>
            <div className="order-total-row"><span>{t('orderTotal')}</span><strong>{tnd(orderLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0))}</strong></div>
            <div className="modal-footer"><button type="button" className="button button-outline" onClick={() => setShowOrderDialog(false)}>{t('cancel')}</button><button type="submit" className="button button-primary"><Check size={16} />{t('createPurchaseOrder')}</button></div>
          </form>
        </Modal>
      )}

      {toast && <div className="toast-message"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  )
}

function StatCard({ icon, label, value, meta, tone, trend }: { icon: ReactNode; label: string; value: string; meta: string; tone: string; trend: 'up' | 'neutral' }) {
  return <article className="stat-card"><div className={`stat-icon stat-${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className={`stat-meta ${trend === 'up' ? 'meta-up' : ''}`}>{trend === 'up' && <ArrowUpRight size={13} />}{meta}</span></article>
}

function MovementTypeBadge({ type, language }: { type: MovementType; language: Language }) {
  const labels = {
    IN: language === 'ar' ? 'وارد' : 'Entrée',
    OUT: language === 'ar' ? 'صادر' : 'Sortie',
    ADJUSTMENT: language === 'ar' ? 'تسوية' : 'Ajustement',
  }
  const Icon = type === 'IN' ? ArrowDownLeft : type === 'OUT' ? ArrowUpRight : Settings2
  return <span className={`movement-type movement-${type.toLowerCase()}`}><Icon size={13} />{labels[type]}</span>
}

function OrderStatusBadge({ status, language }: { status: OrderStatus; language: Language }) {
  const labels = {
    Draft: language === 'ar' ? 'مسودة' : 'Brouillon',
    Sent: language === 'ar' ? 'مرسل' : 'Envoyée',
    Received: language === 'ar' ? 'مستلم' : 'Réceptionnée',
  }
  return <span className={`order-status order-${status.toLowerCase()}`}>{labels[status]}</span>
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Package size={21} /></span><strong>{title}</strong><p>{detail}</p>{action}</div>
}

function SupplierCard({ supplier, t }: { supplier: Supplier; t: (key: string) => string }) {
  return <article className="panel supplier-card"><div className="supplier-card-top"><span className="supplier-logo" style={{ background: supplier.color }}>{supplier.initials}</span></div><h2>{supplier.name}</h2><div className="supplier-detail"><span><Truck size={15} />{supplier.city}</span><span><Activity size={15} />{supplier.phone}</span></div><div className="supplier-card-footer"><span>{t('suppliers')}</span><span className="supplier-active"><i />{t('online')}</span></div></article>
}

export default App
