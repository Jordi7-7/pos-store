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
  │   │       ├── *.handler.ts       <-- Implementation of ICommandHandler (NestJS CQRS)
  │   │       └── *.dto.ts           <-- Validation schema (class-validator) for Network Input
  │   └── queries/                   <-- Read operations (Data queries)
  └── infrastructure/                <-- INFRASTRUCTURE LAYER (Adapters & Framework Entrypoints)
      └── controllers/               <-- NestJS controllers mapping REST payloads
          └── [module_name].controller.ts
```

---

## 2. Core Architectural Design Patterns

### A. CQRS with Decoupled Flat Commands
To strictly isolate the Application layer from Network concerns (HTTP/REST payloads), we follow a decoupled Command/DTO pattern:
1. **DTO (Infrastructure/Network)**: Receives HTTP payloads and validates inputs using decorators (`class-validator`).
2. **Command (Application)**: A pure, immutable TypeScript class. It contains only constructor parameters representing the business input.
3. **Handler (Application)**: A service decorated with `@CommandHandler(MyCommand)` that implements `ICommandHandler<MyCommand>`. It acts synchronously over the database transactions.
4. **Decoupled execution in Controllers**:
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
The application isolates data per Tenant transparently without manual query filtering:
* **AsyncLocalStorage Context**: Holds the current active request's `tenantId`.
* **Tenant Middleware**: Extracts `tenantId` from JWT claims (`tenantId`) or `x-tenant-id` HTTP header.
* **Tenant EntityManager (Proxy)**: A custom TypeORM Manager wrapper that automatically appends `tenantId` filters to queries (`find`, `findOne`, `count`, etc.).
* **Tenant Subscriber**: A database listener that automatically injects `tenantId` during entity insertion.

### C. Logging Standard
Every write operation (Command) integrates the native NestJS `Logger`:
* **Information logging (`this.logger.log`)**: Emitted when commands start execution and upon successful transaction commit.
* **Warning logging (`this.logger.warn`)**: Emitted for business validation failures (e.g. invalid credentials, insufficient inventory, non-existing relationships) alongside throwing appropriate HTTP Exceptions (`BadRequestException`, `NotFoundException`, etc.).

### D. Mobile-Friendly Authentication & RTR Session Storage
* Access tokens are short-lived JWTs.
* Refresh tokens are signed JWTs stored in a high-performance local **Redis** instance (`refresh_token:<userId>`) with a 7-day TTL.
* Tokens are rotated on every refresh exchange (Refresh Token Rotation - RTR) and deleted instantly from Redis upon Logout to invalidate sessions.
