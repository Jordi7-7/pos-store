export const APP_PERMISSIONS = {
  // =========================================================================
  // 1. VISTAS Y PANTALLAS DE INTERFAZ (Frontend & Mobile UI Routing)
  // =========================================================================
  VIEW_DASHBOARD: 'view:dashboard',
  VIEW_POS: 'view:pos',
  VIEW_SALES: 'view:sales',
  VIEW_PRODUCTS: 'view:products',
  VIEW_CATEGORIES: 'view:categories',
  VIEW_ATTRIBUTES: 'view:attributes',
  VIEW_PURCHASES: 'view:purchases',
  VIEW_SUPPLIERS: 'view:suppliers',
  VIEW_CASH_SESSIONS: 'view:cash_sessions',
  VIEW_CASH_REGISTERS: 'view:cash_registers',
  VIEW_CUSTOMERS: 'view:customers',
  VIEW_USERS: 'view:users',
  VIEW_ROLES: 'view:roles',
  VIEW_BRANCHES: 'view:branches',
  VIEW_SETTINGS: 'view:settings',
  VIEW_MEDIA: 'view:media',
  VIEW_REPORTS: 'view:reports',

  // =========================================================================
  // 2. ACCIONES DE CONSULTA / LECTURA (Backend API GET Endpoints)
  // =========================================================================
  DASHBOARD_GET: 'action:dashboard.get',
  SALES_GET: 'action:sales.get',
  PRODUCTS_GET: 'action:products.get',
  CATEGORIES_GET: 'action:categories.get',
  ATTRIBUTES_GET: 'action:attributes.get',
  PURCHASES_GET: 'action:purchases.get',
  SUPPLIERS_GET: 'action:suppliers.get',
  CASH_SESSIONS_GET: 'action:cash_sessions.get',
  CASH_REGISTERS_GET: 'action:cash_registers.get',
  CUSTOMERS_GET: 'action:customers.get',
  USERS_GET: 'action:users.get',
  ROLES_GET: 'action:roles.get',
  BRANCHES_GET: 'action:branches.get',
  SETTINGS_GET: 'action:settings.get',
  MEDIA_GET: 'action:media.get',
  REPORTS_GET: 'action:reports.get',

  // =========================================================================
  // 3. ACCIONES OPERATIVAS Y DE MUTACIÓN (POST, PUT, DELETE, ETC.)
  // =========================================================================
  // Punto de Venta (POS)
  POS_SELL: 'action:pos.sell',
  POS_APPLY_DISCOUNT: 'action:pos.apply_discount',

  // Ventas
  SALES_REFUND: 'action:sales.refund',

  // Catálogo e Inventario
  PRODUCTS_CREATE: 'action:products.create',
  PRODUCTS_EDIT: 'action:products.edit',
  PRODUCTS_DELETE: 'action:products.delete',
  PRODUCTS_ADJUST_STOCK: 'action:products.adjust_stock',
  PRODUCTS_IMPORT: 'action:products.import',
  PRODUCTS_PRINT_BARCODES: 'action:products.print_barcodes',

  // Categorías
  CATEGORIES_CREATE: 'action:categories.create',
  CATEGORIES_EDIT: 'action:categories.edit',
  CATEGORIES_DELETE: 'action:categories.delete',

  // Atributos y Opciones
  ATTRIBUTES_CREATE: 'action:attributes.create',
  ATTRIBUTES_EDIT: 'action:attributes.edit',
  ATTRIBUTES_DELETE: 'action:attributes.delete',

  // Compras y Mercancía
  PURCHASES_CREATE: 'action:purchases.create',
  PURCHASES_IMPORT: 'action:purchases.import',
  PURCHASES_CANCEL: 'action:purchases.cancel',

  // Proveedores
  SUPPLIERS_CREATE: 'action:suppliers.create',
  SUPPLIERS_EDIT: 'action:suppliers.edit',
  SUPPLIERS_DELETE: 'action:suppliers.delete',

  // Cajas y Turnos
  CASH_OPEN_CLOSE: 'action:cash.open_close',
  CASH_CREATE_EXPENSE: 'action:cash.create_expense',

  // Cajas Registradoras Físicas
  CASH_REGISTERS_CREATE: 'action:cash_registers.create',
  CASH_REGISTERS_EDIT: 'action:cash_registers.edit',
  CASH_REGISTERS_ASSIGN_USERS: 'action:cash_registers.assign_users',

  // Clientes
  CUSTOMERS_CREATE: 'action:customers.create',
  CUSTOMERS_EDIT: 'action:customers.edit',
  CUSTOMERS_DELETE: 'action:customers.delete',

  // Personal y Usuarios
  USERS_CREATE: 'action:users.create',
  USERS_EDIT: 'action:users.edit',
  USERS_DELETE: 'action:users.delete',

  // Roles y Permisos
  ROLES_CREATE: 'action:roles.create',
  ROLES_EDIT: 'action:roles.edit',
  ROLES_DELETE: 'action:roles.delete',

  // Sucursales
  BRANCHES_CREATE: 'action:branches.create',
  BRANCHES_EDIT: 'action:branches.edit',

  // Configuración del Negocio
  SETTINGS_EDIT: 'action:settings.edit',

  // Galería Multimedia
  MEDIA_UPLOAD: 'action:media.upload',
  MEDIA_DELETE: 'action:media.delete',

  // Reportes
  REPORTS_EXPORT: 'action:reports.export',

  // Aliases de compatibilidad transitoria
  ROLES_MANAGE: 'action:roles.edit',
  BRANCHES_MANAGE: 'action:branches.edit',
  USERS_MANAGE: 'action:users.edit',
  CASH_REGISTERS_MANAGE: 'action:cash_registers.edit',
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
  { id: 'products', label: 'Catálogo de Productos' },
  { id: 'categories', label: 'Categorías de Productos' },
  { id: 'attributes', label: 'Atributos y Variantes' },
  { id: 'purchases', label: 'Compras y Mercancía' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'cash', label: 'Cajas y Turnos' },
  { id: 'cash_registers', label: 'Cajas Registradoras' },
  { id: 'customers', label: 'Clientes' },
  { id: 'users', label: 'Personal y Colaboradores' },
  { id: 'roles', label: 'Roles y Permisos' },
  { id: 'branches', label: 'Sucursales' },
  { id: 'settings', label: 'Configuración de Empresa' },
  { id: 'media', label: 'Galería Multimedia' },
  { id: 'reports', label: 'Reportes y Analíticas' },
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // 1. POS
  {
    code: APP_PERMISSIONS.VIEW_POS,
    label: 'Acceso a Pantalla POS',
    description: 'Permite abrir e interactuar con el terminal de punto de venta.',
    module: 'pos',
  },
  {
    code: APP_PERMISSIONS.POS_SELL,
    label: 'Cobrar y Emitir Ventas',
    description: 'Permite procesar tickets de venta y asentar cobros en el terminal POS.',
    module: 'pos',
  },
  {
    code: APP_PERMISSIONS.POS_APPLY_DISCOUNT,
    label: 'Aplicar Descuentos en POS',
    description: 'Permite otorgar descuentos porcentuales o de monto fijo en los comprobantes.',
    module: 'pos',
  },

  // 2. Ventas
  {
    code: APP_PERMISSIONS.VIEW_SALES,
    label: 'Acceso a Pantalla de Ventas',
    description: 'Permite ver la sección del historial de ventas en el menú principal.',
    module: 'sales',
  },
  {
    code: APP_PERMISSIONS.SALES_GET,
    label: 'Obtener y Leer Ventas',
    description: 'Permite cargar, buscar y revisar el listado y detalle de comprobantes y facturas.',
    module: 'sales',
  },
  {
    code: APP_PERMISSIONS.SALES_REFUND,
    label: 'Devoluciones y Reembolsos',
    description: 'Permite emitir devoluciones, notas de crédito o anular comprobantes de venta.',
    module: 'sales',
    isDangerous: true,
  },

  // 3. Productos
  {
    code: APP_PERMISSIONS.VIEW_PRODUCTS,
    label: 'Acceso a Pantalla de Productos',
    description: 'Permite ver la sección del catálogo e inventario en el menú principal.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_GET,
    label: 'Obtener y Buscar Productos',
    description: 'Permite buscar artículos, consultar variantes, precios y existencias en inventario.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_CREATE,
    label: 'Crear Productos',
    description: 'Permite registrar nuevos artículos simples o variables en el inventario.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_EDIT,
    label: 'Editar Productos',
    description: 'Permite modificar nombres, descripciones y precios de venta (PVP y Mayoreo).',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_DELETE,
    label: 'Eliminar Productos',
    description: 'Permite retirar o desactivar productos y variantes del catálogo.',
    module: 'products',
    isDangerous: true,
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_ADJUST_STOCK,
    label: 'Ajuste Manual de Inventario',
    description: 'Permite sumar o restar existencias físicas directamente sin orden de compra.',
    module: 'products',
    isDangerous: true,
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_IMPORT,
    label: 'Importación Masiva Excel',
    description: 'Permite cargar productos y existencias masivas mediante plantillas de Excel.',
    module: 'products',
  },
  {
    code: APP_PERMISSIONS.PRODUCTS_PRINT_BARCODES,
    label: 'Imprimir Códigos de Barra',
    description: 'Permite generar e imprimir etiquetas para rotulado en impresora térmica.',
    module: 'products',
  },

  // 4. Categorías
  {
    code: APP_PERMISSIONS.VIEW_CATEGORIES,
    label: 'Acceso a Pantalla de Categorías',
    description: 'Permite ver la pantalla de categorías y familias en la navegación.',
    module: 'categories',
  },
  {
    code: APP_PERMISSIONS.CATEGORIES_GET,
    label: 'Obtener Categorías',
    description: 'Permite cargar la lista de categorías y familias de productos.',
    module: 'categories',
  },
  {
    code: APP_PERMISSIONS.CATEGORIES_CREATE,
    label: 'Crear Categorías',
    description: 'Permite dar de alta nuevas familias o categorías de productos.',
    module: 'categories',
  },
  {
    code: APP_PERMISSIONS.CATEGORIES_EDIT,
    label: 'Editar Categorías',
    description: 'Permite modificar el nombre o jerarquía de las categorías existentes.',
    module: 'categories',
  },
  {
    code: APP_PERMISSIONS.CATEGORIES_DELETE,
    label: 'Eliminar Categorías',
    description: 'Permite eliminar categorías que no tengan artículos asociados.',
    module: 'categories',
    isDangerous: true,
  },

  // 5. Atributos
  {
    code: APP_PERMISSIONS.VIEW_ATTRIBUTES,
    label: 'Acceso a Pantalla de Atributos',
    description: 'Permite ver la sección de atributos de variantes en el menú.',
    module: 'attributes',
  },
  {
    code: APP_PERMISSIONS.ATTRIBUTES_GET,
    label: 'Obtener Atributos y Opciones',
    description: 'Permite cargar las opciones de tallas, colores, materiales y variantes.',
    module: 'attributes',
  },
  {
    code: APP_PERMISSIONS.ATTRIBUTES_CREATE,
    label: 'Crear Atributos y Opciones',
    description: 'Permite definir nuevos tipos de atributos y agregar valores de opciones.',
    module: 'attributes',
  },
  {
    code: APP_PERMISSIONS.ATTRIBUTES_EDIT,
    label: 'Editar Atributos',
    description: 'Permite modificar nombres de atributos y etiquetas de valores.',
    module: 'attributes',
  },
  {
    code: APP_PERMISSIONS.ATTRIBUTES_DELETE,
    label: 'Eliminar Atributos',
    description: 'Permite borrar atributos no enlazados a variantes activas.',
    module: 'attributes',
    isDangerous: true,
  },

  // 6. Compras
  {
    code: APP_PERMISSIONS.VIEW_PURCHASES,
    label: 'Acceso a Pantalla de Compras',
    description: 'Permite ver la sección de compras y recepción de mercadería en el menú.',
    module: 'purchases',
  },
  {
    code: APP_PERMISSIONS.PURCHASES_GET,
    label: 'Obtener y Leer Compras',
    description: 'Permite cargar y revisar el historial de órdenes de compra a proveedores.',
    module: 'purchases',
  },
  {
    code: APP_PERMISSIONS.PURCHASES_CREATE,
    label: 'Registrar Compras',
    description: 'Permite asentar facturas de compra e ingresar mercadería al costo.',
    module: 'purchases',
  },
  {
    code: APP_PERMISSIONS.PURCHASES_IMPORT,
    label: 'Importación Masiva de Compras',
    description: 'Permite cargar entradas masivas de stock desde planillas Excel.',
    module: 'purchases',
  },
  {
    code: APP_PERMISSIONS.PURCHASES_CANCEL,
    label: 'Anular Órdenes de Compra',
    description: 'Permite cancelar ingresos de compra erróneos y revertir los lotes generados.',
    module: 'purchases',
    isDangerous: true,
  },

  // 7. Proveedores
  {
    code: APP_PERMISSIONS.VIEW_SUPPLIERS,
    label: 'Acceso a Pantalla de Proveedores',
    description: 'Permite ver el directorio de proveedores en el menú.',
    module: 'suppliers',
  },
  {
    code: APP_PERMISSIONS.SUPPLIERS_GET,
    label: 'Obtener Proveedores',
    description: 'Permite cargar y listar la información de contacto de proveedores comerciales.',
    module: 'suppliers',
  },
  {
    code: APP_PERMISSIONS.SUPPLIERS_CREATE,
    label: 'Crear Proveedores',
    description: 'Permite dar de alta nuevos proveedores con su información fiscal.',
    module: 'suppliers',
  },
  {
    code: APP_PERMISSIONS.SUPPLIERS_EDIT,
    label: 'Editar Proveedores',
    description: 'Permite modificar datos de contacto, teléfonos y domicilios de proveedores.',
    module: 'suppliers',
  },
  {
    code: APP_PERMISSIONS.SUPPLIERS_DELETE,
    label: 'Eliminar Proveedores',
    description: 'Permite dar de baja proveedores del catálogo.',
    module: 'suppliers',
    isDangerous: true,
  },

  // 8. Cajas y Turnos
  {
    code: APP_PERMISSIONS.VIEW_CASH_SESSIONS,
    label: 'Acceso a Pantalla de Cajas y Turnos',
    description: 'Permite ver el historial de arqueos y sesiones de caja en el menú.',
    module: 'cash',
  },
  {
    code: APP_PERMISSIONS.CASH_SESSIONS_GET,
    label: 'Obtener Sesiones y Turnos',
    description: 'Permite cargar y revisar arqueos de caja, reportes Z y egresos de turnos.',
    module: 'cash',
  },
  {
    code: APP_PERMISSIONS.CASH_OPEN_CLOSE,
    label: 'Abrir y Cerrar Caja',
    description: 'Permite iniciar turno de cobro con base inicial y ejecutar el cuadre de caja.',
    module: 'cash',
  },
  {
    code: APP_PERMISSIONS.CASH_CREATE_EXPENSE,
    label: 'Registrar Egresos / Gastos',
    description: 'Permite registrar retiros de dinero para gastos menores de caja chica.',
    module: 'cash',
  },

  // 9. Cajas Registradoras Físicas
  {
    code: APP_PERMISSIONS.VIEW_CASH_REGISTERS,
    label: 'Acceso a Pantalla de Cajas Registradoras',
    description: 'Permite ver la lista de terminales y puntos de cobro en el menú.',
    module: 'cash_registers',
  },
  {
    code: APP_PERMISSIONS.CASH_REGISTERS_GET,
    label: 'Obtener Cajas Registradoras',
    description: 'Permite cargar los puntos de cobro físicos configurados por sucursal.',
    module: 'cash_registers',
  },
  {
    code: APP_PERMISSIONS.CASH_REGISTERS_CREATE,
    label: 'Crear Cajas Registradoras',
    description: 'Permite dar de alta nuevos terminales de cobro físico.',
    module: 'cash_registers',
  },
  {
    code: APP_PERMISSIONS.CASH_REGISTERS_EDIT,
    label: 'Editar Cajas Registradoras',
    description: 'Permite modificar nombres, códigos correlativos o activar/desactivar cajas.',
    module: 'cash_registers',
  },
  {
    code: APP_PERMISSIONS.CASH_REGISTERS_ASSIGN_USERS,
    label: 'Asignar Cajeros a Cajas',
    description: 'Permite autorizar qué cajeros y personal tienen acceso a operar cada caja.',
    module: 'cash_registers',
    isDangerous: true,
  },

  // 10. Clientes
  {
    code: APP_PERMISSIONS.VIEW_CUSTOMERS,
    label: 'Acceso a Pantalla de Clientes',
    description: 'Permite ver el directorio de clientes en el menú principal.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_GET,
    label: 'Obtener y Buscar Clientes',
    description: 'Permite cargar y buscar la información de clientes registrados.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_CREATE,
    label: 'Crear Clientes',
    description: 'Permite registrar nuevos clientes con RUC, cédula o datos de contacto.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_EDIT,
    label: 'Editar Clientes',
    description: 'Permite modificar teléfonos, correos o direcciones de clientes.',
    module: 'customers',
  },
  {
    code: APP_PERMISSIONS.CUSTOMERS_DELETE,
    label: 'Eliminar Clientes',
    description: 'Permite retirar clientes de la base de datos.',
    module: 'customers',
    isDangerous: true,
  },

  // 11. Personal y Colaboradores
  {
    code: APP_PERMISSIONS.VIEW_USERS,
    label: 'Acceso a Pantalla de Personal',
    description: 'Permite ver la sección de gestión de colaboradores y empleados en el menú.',
    module: 'users',
  },
  {
    code: APP_PERMISSIONS.USERS_GET,
    label: 'Obtener Personal y Usuarios',
    description: 'Permite cargar el listado de colaboradores y empleados registrados en la tienda.',
    module: 'users',
  },
  {
    code: APP_PERMISSIONS.USERS_CREATE,
    label: 'Crear Empleados',
    description: 'Permite crear nuevos usuarios con su rol, contraseña y PIN inicial.',
    module: 'users',
  },
  {
    code: APP_PERMISSIONS.USERS_EDIT,
    label: 'Editar Empleados',
    description: 'Permite modificar datos, resetear contraseñas, regenerar PINs o cambiar sucursales.',
    module: 'users',
  },
  {
    code: APP_PERMISSIONS.USERS_DELETE,
    label: 'Desactivar / Dar de Baja',
    description: 'Permite inhabilitar el acceso de un empleado al sistema.',
    module: 'users',
    isDangerous: true,
  },

  // 12. Roles y Permisos
  {
    code: APP_PERMISSIONS.VIEW_ROLES,
    label: 'Acceso a Pantalla de Roles',
    description: 'Permite ver la pestaña de roles y permisos dentro de Personal.',
    module: 'roles',
  },
  {
    code: APP_PERMISSIONS.ROLES_GET,
    label: 'Obtener Roles y Permisos',
    description: 'Permite cargar los roles creados y revisar qué permisos tienen habilitados.',
    module: 'roles',
  },
  {
    code: APP_PERMISSIONS.ROLES_CREATE,
    label: 'Crear Roles',
    description: 'Permite configurar nuevos perfiles o roles de seguridad personalizados.',
    module: 'roles',
  },
  {
    code: APP_PERMISSIONS.ROLES_EDIT,
    label: 'Configurar Matriz de Permisos',
    description: 'Permite modificar nombres y editar el conjunto de permisos de cada rol.',
    module: 'roles',
    isDangerous: true,
  },
  {
    code: APP_PERMISSIONS.ROLES_DELETE,
    label: 'Eliminar Roles',
    description: 'Permite borrar roles personalizados que no contengan usuarios asignados.',
    module: 'roles',
    isDangerous: true,
  },

  // 13. Sucursales
  {
    code: APP_PERMISSIONS.VIEW_BRANCHES,
    label: 'Acceso a Pantalla de Sucursales',
    description: 'Permite ver la lista de locales y almacenes en la configuración.',
    module: 'branches',
  },
  {
    code: APP_PERMISSIONS.BRANCHES_GET,
    label: 'Obtener Sucursales',
    description: 'Permite cargar los locales, almacenes y puntos de venta del negocio.',
    module: 'branches',
  },
  {
    code: APP_PERMISSIONS.BRANCHES_CREATE,
    label: 'Crear Sucursales',
    description: 'Permite dar de alta nuevas sucursales o almacenes de la empresa.',
    module: 'branches',
  },
  {
    code: APP_PERMISSIONS.BRANCHES_EDIT,
    label: 'Editar Sucursales',
    description: 'Permite modificar nombre, dirección o estado operativo de una sucursal.',
    module: 'branches',
    isDangerous: true,
  },

  // 14. Configuración
  {
    code: APP_PERMISSIONS.VIEW_SETTINGS,
    label: 'Acceso a Pantalla de Configuración',
    description: 'Permite ver la sección de configuración de la empresa en el menú.',
    module: 'settings',
  },
  {
    code: APP_PERMISSIONS.SETTINGS_GET,
    label: 'Obtener Configuración de Negocio',
    description: 'Permite cargar los datos de empresa, razón social, RUC y parámetros generales.',
    module: 'settings',
  },
  {
    code: APP_PERMISSIONS.SETTINGS_EDIT,
    label: 'Modificar Configuración de Negocio',
    description: 'Permite cambiar razón social, RUC, logo, moneda o zona horaria.',
    module: 'settings',
    isDangerous: true,
  },

  // 15. Multimedia
  {
    code: APP_PERMISSIONS.VIEW_MEDIA,
    label: 'Acceso a Pantalla Multimedia',
    description: 'Permite ver la galería de imágenes en el menú principal.',
    module: 'media',
  },
  {
    code: APP_PERMISSIONS.MEDIA_GET,
    label: 'Obtener Galería de Fotos',
    description: 'Permite cargar y explorar las fotos e imágenes guardadas de los artículos.',
    module: 'media',
  },
  {
    code: APP_PERMISSIONS.MEDIA_UPLOAD,
    label: 'Subir Imágenes',
    description: 'Permite cargar fotos al bucket de almacenamiento en la nube.',
    module: 'media',
  },
  {
    code: APP_PERMISSIONS.MEDIA_DELETE,
    label: 'Eliminar Imágenes',
    description: 'Permite borrar archivos multimedia que no estén asignados a productos.',
    module: 'media',
    isDangerous: true,
  },

  // 16. Reportes y Analíticas
  {
    code: APP_PERMISSIONS.VIEW_DASHBOARD,
    label: 'Acceso a Pantalla Dashboard',
    description: 'Permite ver el panel de resumen con indicadores y gráficos del día.',
    module: 'reports',
  },
  {
    code: APP_PERMISSIONS.DASHBOARD_GET,
    label: 'Obtener Métricas del Dashboard',
    description: 'Permite cargar los gráficos en tiempo real, KPIs y productos más vendidos.',
    module: 'reports',
  },
  {
    code: APP_PERMISSIONS.VIEW_REPORTS,
    label: 'Acceso a Pantalla de Reportes',
    description: 'Permite ver el menú y pantallas de reportes y utilidades financieras.',
    module: 'reports',
  },
  {
    code: APP_PERMISSIONS.REPORTS_GET,
    label: 'Obtener Reportes Financieros',
    description: 'Permite cargar reportes de ventas, costo de ventas y existencias valuadas.',
    module: 'reports',
  },
  {
    code: APP_PERMISSIONS.REPORTS_EXPORT,
    label: 'Exportar Reportes',
    description: 'Permite descargar información financiera e inventarios a archivos Excel o CSV.',
    module: 'reports',
  },
];
