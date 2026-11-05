# Architectural Blueprint - SaaS ERP/POS Backend

This document describes the DDD and CQRS architecture implemented for the SaaS ERP/POS backend. It serves as a blueprint for extending the project or spinning up similar systems.

---

## 1. Directory Structure (DDD Layout)

All business modules reside under `src/modules/` and are organized into three distinct architectural layers to separate concerns:

```
src/modules/[module_name]/
  ├── domain/                        <-- DOMAIN LAYER (Pure Business Logic)
  │   └── entities/                  <-- TypeORM database entities
  │       └── [entity].entity.ts
  ├── application/                   <-- APPLICATION LAYER (Use Cases & Business Workflows)
  │   ├── commands/                  <-- Write operations (Mutations)
  │   │   └── [command_name]/
  │   │       ├── *.command.ts       <-- Plain TypeScript class with flat parameters
  │   │       └── *.handler.ts       <-- Implementation of ICommandHandler (NestJS CQRS)
  │   └── queries/                   <-- Read operations (Data queries)
  └── infrastructure/                <-- INFRASTRUCTURE LAYER (Adapters & Framework Entrypoints)
      ├── controllers/               <-- NestJS controllers mapping REST payloads
      │   └── [module_name].controller.ts
      └── dtos/                      <-- Validation schemas (class-validator) for Network Input
          └── *.dto.ts
```

---

## 2. Core Architectural Design Patterns

### A. CQRS with Decoupled Flat Commands
To strictly isolate the Application layer from Network concerns (HTTP/REST payloads), we follow a decoupled Command/DTO pattern:
1. **DTO (Infrastructure/Network)**: Receives HTTP payloads and validates inputs using decorators (`class-validator`).
2. **Command (Application)**: A pure, immutable TypeScript class. It contains only constructor parameters representing the business input.
3. **Handler (Application)**: A service decorated with `@CommandHandler(MyCommand)` that implements `ICommandHandler<MyCommand>`. It acts synchronously over the database transactions.
4. **Input types**: when a command needs a structured input, it declares its own interface next to the command (`UpdateUserInput`). Application code never imports from `infrastructure/dtos`; `src/architecture.spec.ts` enforces this.
5. **Decoupled execution in Controllers**:
   ```typescript
   @Post()
   async process(@Body() dto: ProcessSaleDto) {
     return this.commandBus.execute(
       new ProcessSaleCommand(
         dto.branchId,
         dto.cashSessionId,
         dto.customerId,
         dto.items,
         dto.payments
       )
     );
   }
   ```

### B. Multi-Tenant Isolation
Tenant isolation is **explicit**. There is no request-scoped context and no automatic query filtering:
* **Source of truth**: controllers read `tenantId` from the verified JWT with `@CurrentUser('tenantId')`. It is never accepted from the request body, query string or headers.
* **Commands and queries**: every one that touches tenant data receives `tenantId` as a constructor argument.
* **Queries to the database**: every handler filters by `tenantId` itself (`where: { id, tenantId }`).
* **Child tables without `tenant_id`** (`product_stocks`, `sale_items`, `sale_payments`, `refund_items`, `purchase_order_items`, `cash_sessions`, `attribute_values`) must be reached through a parent that is filtered by tenant.
* **Foreign ids from the client** (branches, users, roles) must be validated against the tenant before use. See `src/common/security/tenant-ownership.ts`.

### C. Logging Standard
Every write operation (Command) integrates the native NestJS `Logger`:
* **Information logging (`this.logger.log`)**: Emitted when commands start execution and upon successful transaction commit.
* **Warning logging (`this.logger.warn`)**: Emitted for business validation failures (e.g. invalid credentials, insufficient inventory, non-existing relationships) alongside throwing appropriate HTTP Exceptions (`BadRequestException`, `NotFoundException`, etc.).

### D. Mobile-Friendly Authentication & RTR Session Storage
* Access tokens are short-lived JWTs.
* Refresh tokens are signed JWTs stored in a high-performance local **Redis** instance (`refresh_token:<userId>`) with a 7-day TTL.
* Tokens are rotated on every refresh exchange (Refresh Token Rotation - RTR) and deleted instantly from Redis upon Logout to invalidate sessions.
