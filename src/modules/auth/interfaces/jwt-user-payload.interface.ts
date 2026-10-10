export interface JwtUserPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  roleId: string | null;
  roleName: string;
  permissions: string[];
  name: string;
  iat?: number;
  exp?: number;
}
