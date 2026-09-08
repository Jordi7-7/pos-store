export const APP_PERMISSIONS = {
  // --- VISTAS / MÓDULOS ---
  VIEW_DASHBOARD: 'view:dashboard',
  VIEW_POS: 'view:pos',
  VIEW_SALES: 'view:sales',
  VIEW_PRODUCTS: 'view:products',
  VIEW_PURCHASES: 'view:purchases',
  VIEW_CUSTOMERS: 'view:customers',
  VIEW_CASH_SESSIONS: 'view:cash_sessions',
  VIEW_REPORTS: 'view:reports',
  VIEW_USERS: 'view:users',
  VIEW_MEDIA: 'view:media',
  VIEW_SETTINGS: 'view:settings',

  // --- ACCIONES OPERATIVAS ---
  // POS y Ventas
  POS_APPLY_DISCOUNT: 'action:pos.apply_discount',
  SALES_REFUND: 'action:sales.refund',
  SALES_CANCEL: 'action:sales.cancel',

  // Catálogo e Inventario
  PRODUCTS_CREATE: 'action:products.create',
  PRODUCTS_EDIT: 'action:products.edit',
  PRODUCTS_DELETE: 'action:products.delete',
  PRODUCTS_IMPORT: 'action:products.import',
  PRODUCTS_ADJUST_STOCK: 'action:products.adjust_stock',

  // Compras
  PURCHASES_CREATE: 'action:purchases.create',

  // Cajas y Egresos
  CASH_OPEN_CLOSE: 'action:cash.open_close',
  CASH_CREATE_EXPENSE: 'action:cash.create_expense',

  // Clientes
  CUSTOMERS_CREATE: 'action:customers.create',
  CUSTOMERS_EDIT: 'action:customers.edit',
  CUSTOMERS_DELETE: 'action:customers.delete',

  // Gestión de Usuarios y Roles
  USERS_MANAGE: 'action:users.manage',
  ROLES_MANAGE: 'action:roles.manage',

  // Reportes
  REPORTS_EXPORT: 'action:reports.export',
} as const;

export type AppPermission = (typeof APP_PERMISSIONS)[keyof typeof APP_PERMISSIONS];

export interface PermissionDefinition {
  code: AppPermission;
  label: string;
  description: string;
  module: string;
  isDangerous?: boolean;
}

export const PERMISSION_MODULES = [
  { id: 'pos', label: 'Punto de Venta (POS)' },
  { id: 'sales', label: 'Ventas e Historial' },
  { id: 'products', label: 'Catálogo e Inventario' },
  { id: 'purchases', label: 'Compras y Proveedores' },
  { id: 'cash', label: 'Cajas y Egresos' },
  { id: 'customers', label: 'Clientes' },
  { id: 'reports', label: 'Reportes y Analíticas' },
  { id: 'users', label: 'Personal y Roles' },
  { id: 'system', label: 'Sistema y Configuración' },
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // POS
  {
    code: APP_PERMISSIONS.VIEW_POS,
    label: 'Acceso a Terminal POS',
    description: 'Permite abrir el terminal de punto de venta y registrar tickets.',
    module: 'pos',
  },
  {
    code: APP_PERMISSIONS.POS_APPLY_DISCOUNT,
    label: 'Aplicar Descuentos en POS',
    description: 'Permite otorgar descuentos porcentuales o de monto fijo a los productos.',
    module: 'pos',
  },

  // Ventas
  {
    code: APP_PERMISSIONS.VIEW_SALES,
    label: 'Ver Historial de Ventas',
    description: 'Permite consultar el listado y detalle de comprobantes emitidos.',
    module: 'sales',
  },
  {
    code: APP_PERMISSIONS.SALES_REFUND,
    label: 'Reembolsos y Devoluciones',
    description: 'Permite procesar notas de crédito o devoluciones de productos.',
    module: 'sales',
    isDangerous: true,
  },
  {
    code: APP_PERMISSIONS.SALES_CANCEL,
    label: 'Anular Ventas',
    description: 'Permite anular ventas emitidas y devolver stock automáticamente.',
    module: 'sales',
    isDangerous: true,
  },

  // Productos
  {
    code: APP_PERMISSIONS.VIEW_PRODUCTS,
    label: 'Ver Catálogo de Productos',
    description: 'Permite consultar artículos, códigos, precios y existencias.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_CREATE,
    label: 'Crear Productos',
    description: 'Permite registrar nuevos productos en el catálogo.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_EDIT,
    label: 'Editar Productos',
    description: 'Permite modificar nombres, categorías y precios (incluyendo mayoreo).',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_DELETE,
    label: 'Eliminar Productos',
    description: 'Permite retirar o desactivar productos del catálogo.',
    module: 'products',
    isDangerous: true,
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_IMPORT,
    label: 'Importación Masiva Excel',
    description: 'Permite subir archivos Excel para creación o actualización masiva.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_ADJUST_STOCK,
    label: 'Ajuste Manual de Inventario',
    description: 'Permite sumar o restar existencias directamente sin orden de compra.',
    module: 'products',
    isDangerous: true,
  },

  // Compras
  {
    code: APP_PERMISSIONS.VIEW_PURCHASES,
    label: 'Ver Compras y Mercancía',
    description: 'Permite consultar compras realizadas a proveedores.',
    module: 'purchases',
  },
  {
    code: APP_PERMISSIONS.PURCHASES_CREATE,
    label: 'Registrar Ingresos de Mercancía',
    description: 'Permite cargar órdenes de compra e ingresar stock al costo.',
    module: 'purchases',
  },

  // Cajas
  {
    code: APP_PERMISSIONS.VIEW_CASH_SESSIONS,
    label: 'Ver Historial de Cajas',
    description: 'Permite consultar arqueos de caja y cierres de turno anteriores.',
    module: 'cash',
  },
  {
    code: APP_PERMISSIONS.CASH_OPEN_CLOSE,
    label: 'Abrir y Cerrar Caja',
    description: 'Permite iniciar turno con monto inicial y ejecutar el cuadre de caja.',
    module: 'cash',
  },
  {
    code: APP_PERMISSIONS.CASH_CREATE_EXPENSE,
    label: 'Registrar Gastos / Caja Chica',
    description: 'Permite asentar retiros de dinero de la caja para gastos menores.',
    module: 'cash',
  },

  // Clientes
  {
    code: APP_PERMISSIONS.VIEW_CUSTOMERS,
    label: 'Directorio de Clientes',
    description: 'Permite consultar el listado de clientes registrados.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_CREATE,
    label: 'Registrar Clientes',
    description: 'Permite crear nuevos clientes con su información fiscal.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_EDIT,
    label: 'Editar Clientes',
    description: 'Permite modificar datos de contacto o fiscales de clientes.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_DELETE,
    label: 'Eliminar Clientes',
    description: 'Permite dar de baja o eliminar clientes del sistema.',
    module: 'customers',
    isDangerous: true,
  },

  // Reportes
  {
    code: APP_PERMISSIONS.VIEW_DASHBOARD,
    label: 'Ver Panel Dashboard',
    description: 'Permite ver los indicadores gráficos y métricas del día.',
    module: 'reports',
  },
  {
    code: APP_PERMISSIONS.VIEW_REPORTS,
    label: 'Ver Reportes y Utilidades',
    description: 'Permite consultar analíticas financieras, márgenes y reportes de inventario.',
    module: 'reports',
  },
  {
    code: APP_PERMISSIONS.REPORTS_EXPORT,
    label: 'Exportar Reportes a Excel',
    description: 'Permite descargar la información de utilidades y movimientos a archivos.',
    module: 'reports',
  },

  // Personal
  {
    code: APP_PERMISSIONS.VIEW_USERS,
    label: 'Ver Personal y Usuarios',
    description: 'Permite listar los colaboradores y empleados del negocio.',
    module: 'users',
  },
  {
    code: APP_PERMISSIONS.USERS_MANAGE,
    label: 'Administrar Usuarios',
    description: 'Permite crear nuevos usuarios, cambiar contraseñas, PINs o desactivarlos.',
    module: 'users',
    isDangerous: true,
  },
  {
    code: APP_PERMISSIONS.ROLES_MANAGE,
    label: 'Administrar Roles y Permisos',
    description: 'Permite crear o editar roles y asignarles los permisos del sistema.',
    module: 'users',
    isDangerous: true,
  },

  // Sistema
  {
    code: APP_PERMISSIONS.VIEW_MEDIA,
    label: 'Galería Multimedia',
    description: 'Permite ver y gestionar la galería de fotos.',
    module: 'system',
  },
  {
    code: APP_PERMISSIONS.VIEW_SETTINGS,
    label: 'Configuración de Negocio',
    description: 'Permite modificar datos fiscales, sucursales y parámetros generales.',
    module: 'system',
    isDangerous: true,
  },
];
