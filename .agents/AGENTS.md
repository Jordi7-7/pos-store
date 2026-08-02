# Project-Specific Rules - SaaS ERP/POS Backend

This project adheres strictly to Domain-Driven Design (DDD) boundaries and NestJS CQRS architecture. All agents must conform to these rules when creating, editing, or refactoring code.

---

## 1. Directory Structure

Do not put business files directly under modules roots. Group all modules under `src/modules/` and organize files as follows:
* **`src/modules/[module_name]/domain/entities/`**: All database entity files (`*.entity.ts`).
* **`src/modules/[module_name]/application/commands/`**: Business use cases that perform writes (commands). Every command folder must contain:
  - `[name].command.ts`: The plain data carrier class.
  - `[name].handler.ts`: The class implementing `ICommandHandler` with `@CommandHandler(CommandClass)`.
  - `[name].dto.ts`: The class-validator network transfer schema.
* **`src/modules/[module_name]/application/queries/`**: Use cases that perform read operations.
* **`src/modules/[module_name]/infrastructure/controllers/`**: NestJS HTTP/REST endpoints.

---

## 2. Coding Conventions

* **No Leaked DTOs**: Commands (`*.command.ts`) must never receive or contain validation DTO classes. They must take individual primitive types or simple arrays/interfaces in their constructor arguments. The controller is responsible for destructuring the validated DTO properties and passing them flatly to the Command.
* **Logging Requirement**: Every command handler must inject the native NestJS `Logger` class. Log the entry execution of the command (`this.logger.log`), warnings for expected business rule validation failures (`this.logger.warn`), and successful transaction execution.
* **Explicit Multi-tenant Isolation**: Do NOT use implicit multi-tenant filters or proxies. Every command must receive `tenantId` explicitly. All database queries, insertions, and modifications must explicitly filter by or assign `tenantId` in their criteria/entities.
